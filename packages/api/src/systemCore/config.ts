// Where the System Core feed points, and how hard it may push.
//
// One switch: SYSTEM_CORE_PROMETHEUS_URL. Unset means the feature is off, and
// off means no upstream traffic at all — not a disabled flag with a live URL
// behind it, because a single value cannot disagree with itself.
//
// The URL is operator configuration at the same trust level as MONGO_URI, so it
// deliberately does NOT go through `isSSRFTarget` (../auth/domain.ts). That
// validator exists to stop *user-supplied* URLs reaching internal
// infrastructure; here reaching internal infrastructure is the entire point, and
// running it through the denylist would break the feature three ways over — the
// in-cluster hostname is literally `prometheus`, `.svc.cluster.local` is caught
// by the `.local` rule, and the resolved address is cluster-private. The same
// reasoning and the same shape of validation as `getRumProxyTargetBaseUrl`
// (../rum/proxy.ts), which points at an internal OTLP collector for the same
// reason.

export type SystemCoreUnconfiguredReason = 'unset' | 'invalid_url';

export interface SystemCoreConfig {
  readonly baseUrl: URL;
  /** Per-query wall clock budget. */
  readonly timeoutMs: number;
  /** How long a snapshot is served before the upstream queries are re-run. */
  readonly cacheTtlMs: number;
  /** Prometheus' own scrape_interval, reported to the client so it can pace itself. */
  readonly scrapeIntervalSeconds: number;
  /** A sample older than this is not to be trusted. */
  readonly staleAfterSeconds: number;
  /** How long a last-good snapshot may be served after a total failure. */
  readonly staleMaxMs: number;
}

export type SystemCoreConfigResult =
  | { readonly ok: true; readonly config: SystemCoreConfig }
  | { readonly ok: false; readonly reason: SystemCoreUnconfiguredReason };

/**
 * Kept at or below the scrape interval so a refresh cannot systematically land
 * between scrapes and skip a sample, and high enough that any number of
 * simultaneous viewers still collapse to well under one upstream query a second.
 */
const DEFAULT_CACHE_TTL_MS = 25_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_SCRAPE_INTERVAL_SECONDS = 30;
const DEFAULT_STALE_MAX_MS = 300_000;

/** Three scrape intervals: past this, jitter cannot explain the silence. */
const STALE_INTERVALS = 3;

const CACHE_TTL_BOUNDS = { min: 5_000, max: 300_000 } as const;
const TIMEOUT_BOUNDS = { min: 500, max: 30_000 } as const;
const SCRAPE_INTERVAL_BOUNDS = { min: 5, max: 600 } as const;
const STALE_MAX_BOUNDS = { min: 0, max: 3_600_000 } as const;

function clampedInt(
  raw: string | undefined,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  // Blank is absent, not zero. `Number('')` is 0, which is finite, so without
  // this an empty variable would clamp to the floor rather than fall back —
  // SYSTEM_CORE_TIMEOUT_MS="" would quietly buy a 500ms budget instead of 5s,
  // from a line that reads as though it sets nothing at all.
  const trimmed = raw?.trim();
  if (trimmed == null || trimmed.length === 0) {
    return fallback;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.trunc(parsed)));
}

/**
 * A usable base URL, or undefined.
 *
 * Credentials, a query string and a fragment are all rejected rather than
 * stripped: each of them means the value was not what the operator thought it
 * was, and guessing at their intent is worse than refusing to start the feature.
 */
function parseBaseUrl(raw: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.username || url.password || url.search || url.hash) {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return undefined;
  }
  // Normalized to end in a slash so callers can resolve 'api/v1/query' against
  // it as a relative reference. Without the slash, `new URL('/api/v1/query',
  // base)` silently discards a path prefix, so a Prometheus published under
  // `https://host/prom` would be queried at `https://host/api/v1/query` and 404
  // on every single request with nothing in the config obviously wrong.
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }
  return url;
}

export function getSystemCoreConfig(env: NodeJS.ProcessEnv = process.env): SystemCoreConfigResult {
  const raw = env.SYSTEM_CORE_PROMETHEUS_URL?.trim();
  if (!raw) {
    return { ok: false, reason: 'unset' };
  }
  const baseUrl = parseBaseUrl(raw);
  if (!baseUrl) {
    return { ok: false, reason: 'invalid_url' };
  }

  const scrapeIntervalSeconds = clampedInt(
    env.SYSTEM_CORE_SCRAPE_INTERVAL_SECONDS,
    DEFAULT_SCRAPE_INTERVAL_SECONDS,
    SCRAPE_INTERVAL_BOUNDS,
  );

  return {
    ok: true,
    config: {
      baseUrl,
      timeoutMs: clampedInt(env.SYSTEM_CORE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, TIMEOUT_BOUNDS),
      cacheTtlMs: clampedInt(env.SYSTEM_CORE_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS, CACHE_TTL_BOUNDS),
      scrapeIntervalSeconds,
      staleAfterSeconds: scrapeIntervalSeconds * STALE_INTERVALS,
      staleMaxMs: clampedInt(env.SYSTEM_CORE_STALE_MAX_MS, DEFAULT_STALE_MAX_MS, STALE_MAX_BOUNDS),
    },
  };
}

/** Whether the feed is configured at all, without building the whole config. */
export function isSystemCoreConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getSystemCoreConfig(env).ok;
}
