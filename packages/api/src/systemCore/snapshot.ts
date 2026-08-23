// The one entry point: a snapshot, or the reason there isn't one.
//
// THE SIGNATURE IS THE SECURITY BOUNDARY
// --------------------------------------
// `getSystemCoreSnapshot()` takes no parameters. There is therefore no argument
// through which a request field could reach a PromQL expression, which makes
// "the client cannot influence the query" a fact about the types rather than a
// validation step that could be skipped. The handler above it reads nothing off
// the request except the authenticated user, and never imports ./queries.
//
// COST
// ----
// Fifteen upstream calls per snapshot — a compile-time constant that does not
// grow with the number of modules or the number of people watching. A TTL cache
// plus a single in-flight promise means N simultaneous viewers produce one set of
// those fifteen, so upstream load is 15 / cacheTtlMs regardless of demand.
//
// Instant queries only. /api/v1/query_range is never called, so the classic way
// to melt a Prometheus (a long range at a fine step) is unreachable from here.
//
// WHY THIS ALWAYS RESOLVES
// -----------------------
// A failed query yields an error entry, not a rejection. React Query treats a
// non-2xx as an error and discards the body, which would throw away the good
// nine tenths of a partial snapshot; so partial failure is data, and the caller
// gets a whole typed payload describing exactly what is broken.

import { logger } from '@librechat/data-schemas';
import type { SystemCoreSnapshotResponse } from 'librechat-data-provider';
import type { PromSample, QueryOutcome, SystemCoreErrorCode } from './assemble';
import type { SystemCoreQueryId } from './queries';
import type { SystemCoreConfig } from './config';
import { assembleSnapshot, unconfiguredSnapshot } from './assemble';
import { getSystemCoreConfig } from './config';
import { QUERIES } from './queries';

/** Concurrent upstream requests. Three waves for fifteen queries. */
const CONCURRENCY = 6;

/** Leaves Prometheus a moment to abandon the evaluation before we hang up. */
const SERVER_TIMEOUT_MARGIN_MS = 500;

interface PromQueryResponse {
  status?: string;
  error?: string;
  data?: {
    resultType?: string;
    result?: PromSample[];
  };
}

function isSampleArray(value: unknown): value is PromSample[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((row) => {
    const r = row as PromSample;
    return (
      r != null &&
      typeof r === 'object' &&
      typeof r.metric === 'object' &&
      Array.isArray(r.value) &&
      r.value.length === 2
    );
  });
}

function classify(err: unknown): { code: SystemCoreErrorCode; message: string } {
  if (err instanceof Error && err.name === 'TimeoutError') {
    return { code: 'timeout', message: 'the query timed out' };
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return { code: 'timeout', message: 'the query was aborted' };
  }
  // Deliberately does not include the message from the underlying error: it can
  // carry the host and port, and this string is returned to a browser.
  return { code: 'unreachable', message: 'could not reach Prometheus' };
}

/** One instant query. Never throws — every failure becomes an outcome. */
async function runQuery(config: SystemCoreConfig, expr: string): Promise<QueryOutcome> {
  // Relative, not '/api/v1/query': getSystemCoreConfig guarantees baseUrl ends
  // in a slash, so this preserves a path prefix instead of discarding it.
  const url = new URL('api/v1/query', config.baseUrl);
  const serverTimeout = Math.max(
    1,
    Math.floor((config.timeoutMs - SERVER_TIMEOUT_MARGIN_MS) / 1000),
  );
  const body = new URLSearchParams({ query: expr, timeout: `${serverTimeout}s` });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!response.ok) {
      return {
        ok: false,
        code: 'upstream_error',
        message: `Prometheus answered ${response.status}`,
      };
    }

    const parsed = (await response.json()) as PromQueryResponse;
    if (parsed.status !== 'success') {
      return { ok: false, code: 'bad_response', message: 'the query was rejected' };
    }
    const result = parsed.data?.result;
    // An absent metric is a success with an empty result, not an error. Keeping
    // those apart is what lets a channel report 'missing' rather than 'error'.
    if (result == null) {
      return { ok: true, series: [] };
    }
    if (!isSampleArray(result)) {
      return { ok: false, code: 'bad_response', message: 'unexpected result shape' };
    }
    return { ok: true, series: result };
  } catch (err) {
    return { ok: false, ...classify(err) };
  }
}

/** Runs the whole registry, at most `CONCURRENCY` at a time. */
async function runAll(config: SystemCoreConfig): Promise<Map<SystemCoreQueryId, QueryOutcome>> {
  const out = new Map<SystemCoreQueryId, QueryOutcome>();
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= QUERIES.length) {
        return;
      }
      const def = QUERIES[index];
      out.set(def.id, await runQuery(config, def.expr));
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, QUERIES.length) }, () => worker()));
  return out;
}

interface Cached {
  snapshot: SystemCoreSnapshotResponse;
  atMs: number;
}

/**
 * In-process rather than the shared cache, deliberately.
 *
 * This is ephemeral derived data of a few tens of kilobytes that would have to be
 * serialized on every hit, and per-replica caching only multiplies upstream load
 * by the replica count — which at 15 queries per 25s is nothing. If a deployment
 * ever ran dozens of replicas, moving this behind Keyv is the upgrade, and the
 * zero-argument signature above means nothing else has to change.
 */
let cached: Cached | null = null;
let lastGood: Cached | null = null;
let inflight: Promise<SystemCoreSnapshotResponse> | null = null;

function served(entry: Cached, nowMs: number): SystemCoreSnapshotResponse {
  return { ...entry.snapshot, cacheAgeMs: Math.max(0, nowMs - entry.atMs) };
}

/**
 * Every query failed, so we learned nothing rather than learning bad news.
 *
 * Read off the outcomes rather than counted out of `snapshot.errors`, because
 * that array also carries the `truncated` notice from the overflow lane — so
 * fourteen dead queries plus one truncation would have counted as fifteen and
 * sent a perfectly good snapshot down the serve-stale path.
 */
function everyQueryFailed(results: ReadonlyMap<SystemCoreQueryId, QueryOutcome>): boolean {
  if (results.size === 0) {
    return false;
  }
  for (const outcome of results.values()) {
    if (outcome.ok) {
      return false;
    }
  }
  return true;
}

function markStale(snapshot: SystemCoreSnapshotResponse): SystemCoreSnapshotResponse {
  return {
    ...snapshot,
    modules: snapshot.modules.map((m) => ({
      ...m,
      staleness: { ...m.staleness, stale: true },
    })),
  };
}

async function refresh(config: SystemCoreConfig): Promise<SystemCoreSnapshotResponse> {
  const collectedAtMs = Date.now();
  const results = await runAll(config);
  const snapshot = assembleSnapshot({ results, config, collectedAtMs });
  const allFailed = everyQueryFailed(results);

  // A scene that goes dark on one dropped packet is worse than one showing
  // forty-second-old data and saying so.
  if (allFailed && lastGood != null) {
    const age = collectedAtMs - lastGood.atMs;
    if (age <= config.staleMaxMs) {
      logger.warn(
        `[systemCore] all upstream queries failed; serving a snapshot ${Math.round(age / 1000)}s old`,
      );
      return {
        ...markStale(served(lastGood, collectedAtMs)),
        errors: [...snapshot.errors],
      };
    }
  }

  cached = { snapshot, atMs: collectedAtMs };
  if (!allFailed) {
    lastGood = cached;
  }
  return snapshot;
}

/**
 * The current snapshot.
 *
 * Takes no arguments, and must keep taking no arguments — see the header.
 */
export async function getSystemCoreSnapshot(): Promise<SystemCoreSnapshotResponse> {
  const nowMs = Date.now();
  const resolved = getSystemCoreConfig();
  if (!resolved.ok) {
    // Not configured means no upstream traffic at all, not a request that fails.
    return unconfiguredSnapshot(resolved.reason, nowMs);
  }
  const { config } = resolved;

  if (cached != null && nowMs - cached.atMs < config.cacheTtlMs) {
    return served(cached, nowMs);
  }
  // The coalescing: everyone who asks during a refresh gets that refresh.
  if (inflight != null) {
    return inflight;
  }
  inflight = refresh(config).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Test-only: forget the cache so a spec can start from a known state. */
export function resetSystemCoreSnapshotCache(): void {
  cached = null;
  lastGood = null;
  inflight = null;
}
