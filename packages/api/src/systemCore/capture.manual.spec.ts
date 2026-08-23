// Captures the fixtures that assemble.spec.ts runs against, from a real Prometheus.
//
// Excluded from normal runs by jest.config.mjs' `\.manual\.spec\.` ignore
// pattern: it needs a live cluster, so it is a tool rather than a test. Run it
// deliberately, when the catalogue or the query registry changes shape:
//
//   cd packages/api
//   SYSTEM_CORE_PROMETHEUS_URL=http://192.168.0.103:30990 \
//     npx jest --testPathIgnorePatterns=/node_modules/ capture.manual
//
// WHY CAPTURE RATHER THAN HAND-WRITE
// ----------------------------------
// The expressions come from ./queries, so the fixture cannot drift from the
// registry the way a transcribed one would, and the response envelopes are
// whatever Prometheus really sends rather than what we assumed it sends. Every
// correctness trap the design found — an absent metric answering 200 with an
// empty result, `up` disagreeing with `probe_success`, a label that is not a
// legal module id — is in the fixture as a fact rather than as a guess.
//
// WHY REDACT
// ----------
// The raw capture is a map of someone's internal network: LAN addresses, and the
// hostnames of every probed public endpoint. The specs need the *shape* of those
// labels — the colon in `host:9100` and the slashes in `https://…` are exactly
// what the slug tests exist for — and nothing at all needs the real names. So
// each distinct value is swapped for a pseudonym of identical form, and the raw
// capture is written outside the repository for eyeballing and then thrown away.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { QUERIES } from './queries';
import { assembleSnapshot } from './assemble';
import type { QueryOutcome } from './assemble';
import type { SystemCoreConfig } from './config';
import type { SystemCoreQueryId } from './queries';

interface PromBody {
  status: string;
  data?: {
    resultType?: string;
    result?: Array<{ metric: Record<string, string>; value: [number, string] }>;
  };
  error?: string;
  errorType?: string;
}

const FIXTURE_DIR = join(__dirname, '__fixtures__');
const RAW_DIR = process.env.SYSTEM_CORE_RAW_DIR ?? '/tmp';

/**
 * Where the client's own fixture goes.
 *
 * `adapt.spec.ts` over in the client runs against a whole assembled snapshot,
 * and it is written from here for the same reason the Prometheus bodies are: a
 * 28-module payload transcribed by hand drifts from the assembler the first time
 * a channel is added, and drifts silently. The direction of the write is
 * deliberate — the client cannot import from this package, and the wire contract
 * is the only thing the two share.
 */
const CLIENT_FIXTURE_DIR = join(
  __dirname,
  '../../../../client/src/components/SystemCore/live/__tests__/__fixtures__',
);

/** Fixed, so a re-capture diffs as data rather than as a new timestamp. */
const FIXTURE_COLLECTED_AT_MS = Date.parse('2026-08-23T12:00:00.000Z');

const FIXTURE_CONFIG: SystemCoreConfig = {
  baseUrl: new URL('http://prometheus.infra.svc.cluster.local:9090/'),
  timeoutMs: 5_000,
  cacheTtlMs: 25_000,
  scrapeIntervalSeconds: 30,
  staleAfterSeconds: 90,
  staleMaxMs: 300_000,
};

/** Stable pseudonyms, assigned in first-seen order so a re-capture is diffable. */
function makeRedactor() {
  const seen = new Map<string, string>();
  let ipN = 10;
  let hostN = 1;

  return function redact(value: string): string {
    const existing = seen.get(value);
    if (existing != null) {
      return existing;
    }
    let replacement = value;

    // https://real.example.com  →  https://endpoint-1.example.test
    const url = /^(https?:\/\/)([^/:]+)(.*)$/.exec(value);
    if (url != null) {
      replacement = `${url[1]}endpoint-${hostN}.example.test${url[3]}`;
      hostN += 1;
    } else {
      // 192.168.0.103:30990  →  10.0.0.10:30990   (port and colon preserved)
      const hostPort = /^(\d{1,3}(?:\.\d{1,3}){3})(:\d+)?$/.exec(value);
      if (hostPort != null) {
        replacement = `10.0.0.${ipN}${hostPort[2] ?? ''}`;
        ipN += 1;
      }
    }

    seen.set(value, replacement);
    return replacement;
  };
}

/** Only the labels that can name a real host. Job, namespace and pod stay: they
 *  are generic infrastructure words, and the catalogue matches on them. */
const SENSITIVE_LABELS = ['instance', 'container_label_org_label_schema_url'];

async function runQuery(base: string, expr: string): Promise<PromBody> {
  const response = await fetch(new URL('api/v1/query', base.endsWith('/') ? base : `${base}/`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ query: expr }).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  return (await response.json()) as PromBody;
}

describe('systemCore live capture', () => {
  it('writes __fixtures__/live.json from the query registry', async () => {
    const base = process.env.SYSTEM_CORE_PROMETHEUS_URL;
    if (base == null || base.trim().length === 0) {
      throw new Error('set SYSTEM_CORE_PROMETHEUS_URL to the Prometheus to capture from');
    }

    const raw: Partial<Record<SystemCoreQueryId, PromBody>> = {};
    for (const def of QUERIES) {
      raw[def.id] = await runQuery(base, def.expr);
    }

    mkdirSync(RAW_DIR, { recursive: true });
    writeFileSync(join(RAW_DIR, 'systemCore.raw.json'), JSON.stringify(raw, null, 2));

    const redact = makeRedactor();
    const redacted: Partial<Record<SystemCoreQueryId, PromBody>> = {};
    for (const def of QUERIES) {
      const body = raw[def.id];
      if (body == null) {
        continue;
      }
      redacted[def.id] = {
        ...body,
        data: {
          ...body.data,
          result: (body.data?.result ?? []).map((row) => {
            const metric = { ...row.metric };
            for (const label of SENSITIVE_LABELS) {
              if (metric[label] != null) {
                metric[label] = redact(metric[label]);
              }
            }
            return { metric, value: row.value };
          }),
        },
      };
    }

    mkdirSync(FIXTURE_DIR, { recursive: true });
    writeFileSync(join(FIXTURE_DIR, 'live.json'), `${JSON.stringify(redacted, null, 2)}\n`);

    // Assembled from the *redacted* bodies, not from a live getSystemCoreSnapshot()
    // call. Going through the real assembler keeps the client's fixture a genuine
    // payload; going through the redacted bodies is what keeps the internal
    // hostnames out of a file that gets committed. Taking the snapshot live would
    // reintroduce every one of them.
    const results = new Map<SystemCoreQueryId, QueryOutcome>();
    for (const def of QUERIES) {
      results.set(def.id, { ok: true, series: redacted[def.id]?.data?.result ?? [] });
    }
    const snapshot = assembleSnapshot({
      results,
      config: FIXTURE_CONFIG,
      collectedAtMs: FIXTURE_COLLECTED_AT_MS,
    });

    mkdirSync(CLIENT_FIXTURE_DIR, { recursive: true });
    writeFileSync(
      join(CLIENT_FIXTURE_DIR, 'snapshot.json'),
      `${JSON.stringify(snapshot, null, 2)}\n`,
    );

    for (const def of QUERIES) {
      expect(redacted[def.id]).toBeDefined();
    }
    // The fixture the client commits must carry no real hostname.
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/avarile/i);
    expect(serialized).toContain('example.test');
  }, 120_000);
});

// The end-to-end check the fixtures cannot make. Everything else in this feature
// is tested against captured bodies; this is the only assertion that the config
// parsing, the fifteen real HTTP calls, the catalogue matching and the assembler
// compose into a usable snapshot against a Prometheus that is actually running.
describe('systemCore against a live Prometheus', () => {
  it('resolves a whole snapshot with an empty overflow lane', async () => {
    const { getSystemCoreSnapshot, resetSystemCoreSnapshotCache } = await import('./snapshot');
    resetSystemCoreSnapshotCache();

    const started = Date.now();
    const snapshot = await getSystemCoreSnapshot();
    const elapsedMs = Date.now() - started;

    const discovered = snapshot.modules.filter((m) => m.origin === 'discovered');
    const byStatus = snapshot.modules.reduce<Record<string, number>>((acc, m) => {
      acc[m.status] = (acc[m.status] ?? 0) + 1;
      return acc;
    }, {});

    console.log(
      [
        `modules       ${snapshot.modules.length}`,
        `statuses      ${JSON.stringify(byStatus)}`,
        `discovered    ${discovered.map((m) => m.id).join(', ') || '(none)'}`,
        `errors        ${JSON.stringify(snapshot.errors)}`,
        `wall clock    ${elapsedMs}ms for ${QUERIES.length} queries`,
      ].join('\n'),
    );

    expect(snapshot.configured).toBe(true);
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.modules.length).toBeGreaterThan(20);
    // Every scrape target is claimed by the catalogue, so nothing is showing up
    // as an anonymous ring. This is the assertion that goes stale first when the
    // cluster grows, and it is meant to.
    expect(discovered).toEqual([]);
    // Every module resolved at least one channel, so none of them is a catalogue
    // entry pointing at a metric that no longer exists.
    for (const module of snapshot.modules) {
      expect(module.channels.some((c) => c.state === 'ok')).toBe(true);
    }
  }, 60_000);
});
