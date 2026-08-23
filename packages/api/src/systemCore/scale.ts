// Raw upstream numbers into 0..1, and channels into a status.
//
// Pure and free of I/O on purpose: this is the arithmetic worth testing, and
// none of it should need a Prometheus to exercise.
//
// The rule running through all of it: absent is not zero. A query that returned
// no series and a gauge that genuinely reads zero mean opposite things to
// someone looking at the scene, so `null` is carried all the way through rather
// than coerced at the first opportunity.

import type {
  SystemCoreStatus,
  SystemCoreChannel,
  SystemCoreChannelState,
} from 'librechat-data-provider';

/** How a raw value becomes 0..1. */
export type ScaleRule =
  /** Already a ratio; clamp only. */
  | { readonly kind: 'ratio' }
  /** Linear against a ceiling. */
  | { readonly kind: 'linear'; readonly max: number }
  /** Logarithmic against a ceiling — for rates spanning decades. */
  | { readonly kind: 'log'; readonly max: number }
  /** Non-zero becomes 1, or 0 when inverted. */
  | { readonly kind: 'bool'; readonly invert?: boolean }
  /**
   * Interpolates between a good and a bad reading, in either direction, so
   * "56 days of certificate left" and "28% of the disk used" both land the right
   * way up without a separate inverted variant.
   */
  | { readonly kind: 'band'; readonly good: number; readonly bad: number };

/** Health at or below this reads as a fault. Mirrors the client's threshold. */
const FAULT_BELOW = 0.34;
/** Below this is degraded but not down. */
const DEGRADED_BELOW = 0.67;

function clamp01(v: number): number {
  if (v < 0) {
    return 0;
  }
  if (v > 1) {
    return 1;
  }
  // `v === 0` catches -0, which `v < 0` does not. A band whose reading sits
  // exactly on `bad` divides to -0, and while that serializes as 0 it is not
  // `Object.is`-equal to it, so it would quietly break any identity comparison
  // downstream — including the ones the client leans on to skip GPU writes.
  return v === 0 ? 0 : v;
}

/**
 * Normalizes one reading, or null if it cannot be normalized.
 *
 * Non-finite input yields null rather than a clamped extreme: Infinity is
 * corrupt data, not a maximal measurement, and letting it read as 1.0 would let
 * a broken exporter report a perfectly healthy service.
 */
export function normalize(rule: ScaleRule, raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) {
    return null;
  }
  switch (rule.kind) {
    case 'ratio':
      return clamp01(raw);
    case 'linear':
      return rule.max === 0 ? null : clamp01(raw / rule.max);
    case 'log': {
      if (rule.max <= 0) {
        return null;
      }
      const span = Math.log1p(rule.max);
      return span === 0 ? null : clamp01(Math.log1p(Math.max(0, raw)) / span);
    }
    case 'bool': {
      const on = raw !== 0;
      return (rule.invert === true ? !on : on) ? 1 : 0;
    }
    case 'band': {
      const { good, bad } = rule;
      if (good === bad) {
        return null;
      }
      return clamp01((raw - bad) / (good - bad));
    }
    default:
      return null;
  }
}

/**
 * Aggregate health: the mean of the health-polarity channels that resolved.
 *
 * Activity channels are excluded deliberately — a busy service is not an unwell
 * one, and folding throughput into health would make the scene report load as
 * illness.
 */
export function deriveHealth(channels: readonly SystemCoreChannel[]): number | null {
  let sum = 0;
  let n = 0;
  for (const c of channels) {
    if (c.polarity !== 'health' || c.state !== 'ok' || c.value == null) {
      continue;
    }
    sum += c.value;
    n += 1;
  }
  return n === 0 ? null : sum / n;
}

/** The first value of a given channel id that resolved, or null. */
export function channelValue(channels: readonly SystemCoreChannel[], id: string): number | null {
  for (const c of channels) {
    if (c.id === id && c.state === 'ok') {
      return c.value;
    }
  }
  return null;
}

/** The first raw value of a given channel id that resolved, or null. */
export function channelRaw(channels: readonly SystemCoreChannel[], id: string): number | null {
  for (const c of channels) {
    if (c.id === id && c.state === 'ok') {
      return c.raw;
    }
  }
  return null;
}

export interface StatusInput {
  /** The module's own authored status, used when there is nothing to say. */
  authored: SystemCoreStatus;
  /** True when the module represents the centre of the composition. */
  isController: boolean;
  /** null when the module has no `up` target of its own. */
  up: boolean | null;
  stale: boolean;
  health: number | null;
  /** Whether any channel at all resolved. Distinguishes 'never yet' from 'fine'. */
  anyResolved: boolean;
  /** Whether any channel's query did not come back. 'We could not ask' is not 'nothing to say'. */
  anyErrored: boolean;
  /** Whether a channel marked critical came back below the fault floor. */
  criticalFault: boolean;
}

/**
 * The status a module should carry.
 *
 * Ordered by how much each condition actually tells us. A target that is
 * definitively down outranks a stale sample, because "we cannot reach it" is
 * more informative than "we have not looked recently".
 */
export function deriveStatus(input: StatusInput): SystemCoreStatus {
  if (input.isController) {
    return 'controller';
  }
  if (input.up === false) {
    return 'fault';
  }
  if (input.criticalFault) {
    return 'fault';
  }
  if (input.stale) {
    return 'loading';
  }
  if (!input.anyResolved) {
    // Nothing resolved, and the two reasons for that are not the same thing.
    // Every query erroring means Prometheus itself is unreachable, and painting
    // that as 'init' would light a total outage up in the green of a service
    // that has only just been catalogued. 'loading' is the scene's word for
    // "we do not know", which is exactly the truth here.
    if (input.anyErrored) {
      return 'loading';
    }
    // Catalogued but never yet seen. Not a fault — it may simply be new.
    return 'init';
  }
  if (input.health == null) {
    return input.authored;
  }
  if (input.health < FAULT_BELOW) {
    return 'fault';
  }
  if (input.health < DEGRADED_BELOW) {
    // Amber: we asked, we got an answer, and the answer is not good. Distinct
    // from 'loading' above, which is the colour of not knowing — a stale scrape
    // or an unreachable Prometheus. Conflating the two spent a release telling
    // operators that a half-sick service was merely being fetched.
    return 'degraded';
  }
  return 'running';
}

/** Whether a normalized health reading is low enough to be a fault. */
export function isFaultLevel(value: number | null): boolean {
  return value != null && value < FAULT_BELOW;
}

/** The channel state implied by an outcome and a resolved value. */
export function stateFor(queryFailed: boolean, value: number | null): SystemCoreChannelState {
  if (queryFailed) {
    return 'error';
  }
  return value == null ? 'missing' : 'ok';
}
