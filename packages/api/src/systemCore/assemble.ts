// Query results into a snapshot. Pure: no clock of its own, no I/O, no config
// reading — everything it needs arrives as an argument, which is what makes it
// testable against response bodies captured verbatim from a real Prometheus.
//
// The `up` query is the spine. It is the set of things that exist, so every row
// of it must end up either inside a catalogue module (as its target, or claimed
// by it, or expanded into it) or as a discovered module. A row that fell through
// silently would be a service missing from the picture, which is the one failure
// an operations view must never have.

import type {
  SystemCoreModule,
  SystemCoreChannel,
  SystemCoreErrorCode,
  SystemCoreQueryError,
  SystemCoreChannelState,
  SystemCoreSnapshotResponse,
} from 'librechat-data-provider';
import type { CatalogEntry, ChannelBinding, LabelMatch, SeriesReduce } from './catalog';
import type { SystemCoreQueryId } from './queries';
import type { SystemCoreConfig } from './config';
import { CATALOG, MAX_OVERFLOW, revisionOf, placementFor, overflowPlacement } from './catalog';
import {
  normalize,
  stateFor,
  channelRaw,
  isFaultLevel,
  deriveHealth,
  deriveStatus,
  channelValue,
} from './scale';

/** One sample as Prometheus returns it. Labels are always strings. */
export interface PromSample {
  metric: Record<string, string>;
  /** [unix seconds, value as a string] */
  value: [number, string];
}

export type QueryOutcome =
  | { readonly ok: true; readonly series: PromSample[] }
  | { readonly ok: false; readonly code: SystemCoreErrorCode; readonly message: string };

export type QueryResults = ReadonlyMap<SystemCoreQueryId, QueryOutcome>;

/** The client's ID_RE rejects ':' and '/', which real instance labels are full of. */
export function slug(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '');
  return cleaned.length > 0 ? cleaned : 'unknown';
}

function numeric(sample: PromSample): number | null {
  const n = Number(sample.value[1]);
  return Number.isFinite(n) ? n : null;
}

function seriesOf(results: QueryResults, id: SystemCoreQueryId): PromSample[] | null {
  const outcome = results.get(id);
  if (outcome == null || !outcome.ok) {
    return null;
  }
  return outcome.series;
}

function failed(results: QueryResults, id: SystemCoreQueryId): boolean {
  const outcome = results.get(id);
  return outcome == null || !outcome.ok;
}

/** Which label a bound module pins its channels to. */
interface Binding {
  label: 'instance' | 'pod';
  value: string;
}

function matches(sample: PromSample, match: LabelMatch, bound: Binding | null): boolean {
  const m = sample.metric;
  if (match.signal != null && m.sc !== match.signal) {
    return false;
  }
  if (match.job != null && m.job !== match.job) {
    return false;
  }
  if (match.namespace != null && m.namespace !== match.namespace) {
    return false;
  }
  if (match.pod != null && m.pod !== match.pod) {
    return false;
  }
  if (match.podPrefix != null && !(m.pod ?? '').startsWith(match.podPrefix)) {
    return false;
  }
  if (match.instance != null && m.instance !== match.instance) {
    return false;
  }
  // An expanded module pins every one of its channels to its own label value,
  // so ten probes read ten different rows out of one query.
  if (bound != null && match[bound.label] == null && m[bound.label] !== bound.value) {
    return false;
  }
  return true;
}

function reduceValues(values: number[], how: SeriesReduce): number | null {
  if (values.length === 0) {
    return null;
  }
  switch (how) {
    case 'first':
      return values[0];
    case 'count':
      return values.length;
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    default:
      return null;
  }
}

/** A module in the making, before its channels and placement are resolved. */
interface Pending {
  entry: CatalogEntry;
  id: string;
  label: string;
  bound: Binding | null;
  /** The module's own `up` row, when it has one. */
  target: PromSample | null;
}

function findTarget(up: PromSample[] | null, match: LabelMatch | null): PromSample | null {
  if (up == null || match == null) {
    return null;
  }
  for (const s of up) {
    if (matches(s, match, null)) {
      return s;
    }
  }
  return null;
}

function seriesKey(sample: PromSample): string {
  return (sample.metric.job ?? '') + ' ' + (sample.metric.instance ?? '');
}

/**
 * Resolves one channel.
 *
 * A failed query and an empty result are different outcomes and stay different:
 * 'error' means we could not ask, 'missing' means the answer is that there is no
 * such series. Only 'ok' carries a number.
 */
function resolveChannel(
  binding: ChannelBinding,
  results: QueryResults,
  pending: Pending,
): SystemCoreChannel {
  const queryFailed = failed(results, binding.select.query);
  // A `self` match on a module with no `up` row of its own resolves to nothing.
  // Without this the match narrows to {} — which matches *every* row — and
  // `reduce` would hand back some unrelated target's reading as this module's.
  const selfless = binding.select.match.self === true && pending.target == null;
  const series = selfless ? null : seriesOf(results, binding.select.query);

  let raw: number | null = null;
  if (series != null) {
    const match =
      binding.select.match.self === true && pending.target != null
        ? { job: pending.target.metric.job, instance: pending.target.metric.instance }
        : binding.select.match;
    const values: number[] = [];
    for (const s of series) {
      if (!matches(s, match, pending.bound)) {
        continue;
      }
      const n = numeric(s);
      if (n != null) {
        values.push(n);
      }
    }
    raw = reduceValues(values, binding.select.reduce);
  }

  const value = normalize(binding.scale, raw);
  const state: SystemCoreChannelState = stateFor(queryFailed, value);
  return {
    id: binding.id,
    label: binding.label,
    state,
    polarity: binding.polarity,
    value: state === 'ok' ? value : null,
    raw: state === 'ok' ? raw : null,
    unit: binding.unit,
    source: binding.select.query,
  };
}

function buildModule(
  pending: Pending,
  results: QueryResults,
  config: SystemCoreConfig,
  index: number,
  count: number,
): SystemCoreModule {
  const channels = pending.entry.channels.map((b) => resolveChannel(b, results, pending));

  const ageSeries = seriesOf(results, 'scrapeAge');
  let scrapeAgeSeconds: number | null = null;
  if (pending.target != null && ageSeries != null) {
    const key = seriesKey(pending.target);
    for (const s of ageSeries) {
      if (seriesKey(s) === key) {
        scrapeAgeSeconds = numeric(s);
        break;
      }
    }
  }
  const stale = scrapeAgeSeconds != null && scrapeAgeSeconds > config.staleAfterSeconds;

  const health = deriveHealth(channels);
  const criticalFault = pending.entry.channels.some(
    (b, i) => b.critical === true && isFaultLevel(channels[i].value),
  );
  const anyResolved = channels.some((c) => c.state === 'ok');
  const anyErrored = channels.some((c) => c.state === 'error');
  const up = pending.target == null ? null : numeric(pending.target) === 1;

  return {
    id: pending.id,
    label: pending.label,
    status: deriveStatus({
      authored: pending.entry.authoredStatus,
      isController: pending.entry.isController === true,
      up,
      stale,
      health,
      anyResolved,
      anyErrored,
      criticalFault,
    }),
    origin: 'catalog',
    health,
    load: channelValue(channels, 'load'),
    rate: channelRaw(channels, 'throughput'),
    placement: placementFor(pending.entry, index, count, pending.id, pending.bound != null),
    channels,
    staleness: { scrapeAgeSeconds, stale },
    description: pending.entry.description,
    group: pending.entry.group,
    tags: [...pending.entry.tags],
    dependsOn: [...pending.entry.dependsOn],
    target:
      pending.target == null
        ? null
        : {
            job: pending.target.metric.job ?? '',
            instance: pending.target.metric.instance ?? '',
            namespace: pending.target.metric.namespace ?? null,
            pod: pending.target.metric.pod ?? null,
            up: up === true,
          },
  };
}

/** The catalogue, expanded into the modules it actually produces. */
function expandCatalog(results: QueryResults): Pending[] {
  const up = seriesOf(results, 'up');
  const out: Pending[] = [];

  for (const entry of CATALOG) {
    const expand = entry.expand;
    if (expand == null) {
      out.push({
        entry,
        id: entry.id,
        label: entry.label,
        bound: null,
        target: findTarget(up, entry.target),
      });
      continue;
    }
    const series = seriesOf(results, expand.query);
    if (series == null) {
      continue;
    }
    // Sorted so ids and order are identical between snapshots. The scene keys a
    // strip's rotation by id, so an unstable id restarts its animation.
    const values = [...new Set(series.map((s) => s.metric[expand.label] ?? ''))]
      .filter((v) => v.length > 0)
      .sort();
    for (const value of values.slice(0, expand.max)) {
      out.push({
        entry,
        id: entry.id + '.' + slug(value),
        label: value,
        bound: { label: expand.label, value },
        target: null,
      });
    }
  }
  return out;
}

/** Every `up` row that a catalogue module accounts for. */
function claimedKeys(pending: readonly Pending[], results: QueryResults): Set<string> {
  const up = seriesOf(results, 'up');
  const claimed = new Set<string>();
  if (up == null) {
    return claimed;
  }
  for (const p of pending) {
    if (p.target != null) {
      claimed.add(seriesKey(p.target));
    }
    for (const claim of p.entry.claims ?? []) {
      for (const s of up) {
        if (matches(s, claim, null)) {
          claimed.add(seriesKey(s));
        }
      }
    }
    // An expanded module's own rows belong to it even though it has no target.
    if (p.bound != null) {
      for (const s of up) {
        if (s.metric[p.bound.label] === p.bound.value) {
          claimed.add(seriesKey(s));
        }
      }
    }
  }
  return claimed;
}

const OVERFLOW_DESCRIPTION = 'A scrape target with no catalogue entry.';
const OVERFLOW_ORDER = 1000;

function buildOverflow(
  results: QueryResults,
  claimed: Set<string>,
  errors: SystemCoreQueryError[],
): SystemCoreModule[] {
  const up = seriesOf(results, 'up');
  if (up == null) {
    return [];
  }
  const unclaimed = up
    .filter((s) => !claimed.has(seriesKey(s)))
    .sort((a, b) => seriesKey(a).localeCompare(seriesKey(b)));

  if (unclaimed.length > MAX_OVERFLOW) {
    errors.push({
      source: 'up',
      code: 'truncated',
      message: unclaimed.length + ' unrecognised targets; showing the first ' + MAX_OVERFLOW,
    });
  }

  const taken = new Set<string>();
  const out: SystemCoreModule[] = [];
  unclaimed.slice(0, MAX_OVERFLOW).forEach((s, i) => {
    const job = s.metric.job ?? 'unknown';
    const instance = s.metric.instance ?? 'unknown';
    const base = 'auto.' + slug(job) + '.' + slug(instance);
    let id = base;
    let n = 2;
    while (taken.has(id)) {
      id = base + '-' + n;
      n += 1;
    }
    taken.add(id);

    const isUp = numeric(s) === 1;
    out.push({
      id,
      label: instance,
      status: isUp ? 'running' : 'fault',
      origin: 'discovered',
      health: isUp ? 1 : 0,
      load: null,
      rate: null,
      placement: overflowPlacement(i, OVERFLOW_ORDER + i),
      channels: [
        {
          id: 'availability',
          label: 'Reachable',
          state: 'ok',
          polarity: 'health',
          value: isUp ? 1 : 0,
          raw: isUp ? 1 : 0,
          unit: 'boolean',
          source: 'up',
        },
      ],
      staleness: { scrapeAgeSeconds: null, stale: false },
      description: OVERFLOW_DESCRIPTION,
      group: 'overflow',
      tags: ['discovered'],
      dependsOn: [],
      target: {
        job,
        instance,
        namespace: s.metric.namespace ?? null,
        pod: s.metric.pod ?? null,
        up: isUp,
      },
    });
  });
  return out;
}

export interface AssembleInput {
  results: QueryResults;
  config: SystemCoreConfig;
  /** Passed in rather than read, so a snapshot is reproducible in a test. */
  collectedAtMs: number;
}

export function assembleSnapshot(input: AssembleInput): SystemCoreSnapshotResponse {
  const { results, config, collectedAtMs } = input;

  const errors: SystemCoreQueryError[] = [];
  for (const [id, outcome] of results) {
    if (!outcome.ok) {
      errors.push({ source: id, code: outcome.code, message: outcome.message });
    }
  }

  const pending = expandCatalog(results);
  const count = pending.length;
  const modules = pending.map((p, i) => buildModule(p, results, config, i, count));
  const overflow = buildOverflow(results, claimedKeys(pending, results), errors);
  // Built once and used for both the revision and the payload, so the fingerprint
  // can never describe a different list from the one that is sent.
  const all = [...modules, ...overflow];

  return {
    configured: true,
    collectedAt: new Date(collectedAtMs).toISOString(),
    cacheAgeMs: 0,
    nextPollMs: config.cacheTtlMs,
    scrapeIntervalSeconds: config.scrapeIntervalSeconds,
    catalogRevision: revisionOf(all),
    modules: all,
    errors,
  };
}

/** The response when nothing is configured. No upstream traffic was involved. */
export function unconfiguredSnapshot(
  reason: 'unset' | 'invalid_url',
  collectedAtMs: number,
): SystemCoreSnapshotResponse {
  return {
    configured: false,
    reason,
    collectedAt: new Date(collectedAtMs).toISOString(),
    cacheAgeMs: 0,
    nextPollMs: 0,
    scrapeIntervalSeconds: 0,
    // No modules, so no revision. Inert either way: the client only reads this
    // when `configured` is true.
    catalogRevision: revisionOf([]),
    modules: [],
    errors: [],
  };
}

export type { SystemCoreErrorCode };
