// The one entry point: caching, coalescing, partial failure and serve-stale.
//
// `fetch` is the single mocked boundary, which is the one CLAUDE.md names
// explicitly — an external HTTP API. Everything below it is the real config
// parsing, the real query registry and the real assembler, so what these
// assertions pin is the behaviour, not a rehearsal of it.
//
// `Date.now` is stubbed rather than the timers faked, because the code under
// test also creates real `AbortSignal.timeout` handles and faking those buys
// nothing but a class of confusing hangs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSystemCoreSnapshot, resetSystemCoreSnapshotCache } from './snapshot';
import { QUERIES } from './queries';

interface PromBody {
  status: string;
  data?: { result?: Array<{ metric: Record<string, string>; value: [number, string] }> };
}

const live: Record<string, PromBody> = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'live.json'), 'utf8'),
);

/** Every expression the registry will ever send, for the injection assertions. */
const LEGAL_EXPRESSIONS = new Set(QUERIES.map((q) => q.expr));
const BY_EXPRESSION = new Map(QUERIES.map((q) => [q.expr, q.id]));

const URL_VAR = 'SYSTEM_CORE_PROMETHEUS_URL';
const BASE = 'http://prometheus.infra.svc.cluster.local:9090';

const realFetch = global.fetch;
let now = 1_766_000_000_000;

/** The bodies of every request made so far, in order. */
function sentExpressions(): string[] {
  const mock = global.fetch as unknown as jest.Mock;
  return mock.mock.calls.map((call) => {
    const init = call[1] as { body?: string };
    return new URLSearchParams(init.body ?? '').get('query') ?? '';
  });
}

function fetchOk() {
  return jest.fn((_url: unknown, init?: { body?: string }) => {
    const expr = new URLSearchParams(init?.body ?? '').get('query') ?? '';
    const id = BY_EXPRESSION.get(expr);
    const body: PromBody = id != null ? live[id] : { status: 'success', data: { result: [] } };
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });
  });
}

beforeEach(() => {
  now = 1_766_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  process.env[URL_VAR] = BASE;
  resetSystemCoreSnapshotCache();
  global.fetch = fetchOk() as unknown as typeof fetch;
});

afterEach(() => {
  delete process.env[URL_VAR];
  delete process.env.SYSTEM_CORE_CACHE_TTL_MS;
  delete process.env.SYSTEM_CORE_STALE_MAX_MS;
  delete process.env.SYSTEM_CORE_TIMEOUT_MS;
  resetSystemCoreSnapshotCache();
  global.fetch = realFetch;
});

function fetchCount(): number {
  return (global.fetch as unknown as jest.Mock).mock.calls.length;
}

describe('when nothing is configured', () => {
  it('makes no upstream request at all', async () => {
    delete process.env[URL_VAR];
    const snapshot = await getSystemCoreSnapshot();

    expect(snapshot.configured).toBe(false);
    expect(snapshot.reason).toBe('unset');
    // Not "a request that fails" — a feature that is off.
    expect(fetchCount()).toBe(0);
  });

  it('makes no upstream request for a malformed URL either', async () => {
    process.env[URL_VAR] = 'prometheus:9090';
    const snapshot = await getSystemCoreSnapshot();

    expect(snapshot.configured).toBe(false);
    expect(snapshot.reason).toBe('invalid_url');
    expect(fetchCount()).toBe(0);
  });
});

describe('the request', () => {
  it('is a POST of a form body to the instant-query endpoint', async () => {
    await getSystemCoreSnapshot();
    const mock = global.fetch as unknown as jest.Mock;
    const [url, init] = mock.mock.calls[0];

    expect(String(url)).toBe(`${BASE}/api/v1/query`);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    // POST because the bundle expressions run to hundreds of characters, which
    // is where URL-length limits and proxy logs start to matter.
    expect(typeof init.body).toBe('string');
  });

  it('preserves a path prefix on the configured base', async () => {
    process.env[URL_VAR] = 'http://gateway.example.test/prom';
    resetSystemCoreSnapshotCache();
    await getSystemCoreSnapshot();

    const mock = global.fetch as unknown as jest.Mock;
    expect(String(mock.mock.calls[0][0])).toBe('http://gateway.example.test/prom/api/v1/query');
  });

  it('asks Prometheus to give up slightly before we hang up', async () => {
    process.env.SYSTEM_CORE_TIMEOUT_MS = '5000';
    resetSystemCoreSnapshotCache();
    await getSystemCoreSnapshot();

    const mock = global.fetch as unknown as jest.Mock;
    const timeout = new URLSearchParams(mock.mock.calls[0][1].body).get('timeout');
    // Abandoning an evaluation nobody is listening for is the whole point.
    expect(timeout).toBe('4s');
  });

  it('sends every expression in the registry, and nothing else, exactly once', async () => {
    await getSystemCoreSnapshot();
    const sent = sentExpressions();

    expect(sent).toHaveLength(QUERIES.length);
    expect(new Set(sent).size).toBe(QUERIES.length);
    for (const expr of sent) {
      expect(LEGAL_EXPRESSIONS.has(expr)).toBe(true);
    }
  });

  it('never sends a range query', async () => {
    await getSystemCoreSnapshot();
    const mock = global.fetch as unknown as jest.Mock;
    for (const [url, init] of mock.mock.calls) {
      expect(String(url)).not.toContain('query_range');
      expect(init.body).not.toContain('step=');
      expect(init.body).not.toContain('start=');
    }
  });
});

describe('caching and coalescing', () => {
  it('collapses simultaneous callers into one set of queries', async () => {
    // Ten admins watching produces the upstream load of one.
    const snapshots = await Promise.all(Array.from({ length: 10 }, () => getSystemCoreSnapshot()));

    expect(fetchCount()).toBe(QUERIES.length);
    for (const snapshot of snapshots) {
      expect(snapshot.modules.length).toBeGreaterThan(0);
    }
  });

  it('serves a second caller inside the TTL from memory', async () => {
    await getSystemCoreSnapshot();
    const before = fetchCount();
    now += 1_000;
    const snapshot = await getSystemCoreSnapshot();

    expect(fetchCount()).toBe(before);
    expect(snapshot.cacheAgeMs).toBe(1_000);
  });

  it('refreshes once the TTL has passed', async () => {
    await getSystemCoreSnapshot();
    now += 25_001;
    const snapshot = await getSystemCoreSnapshot();

    expect(fetchCount()).toBe(QUERIES.length * 2);
    expect(snapshot.cacheAgeMs).toBe(0);
  });

  it('honours a configured TTL', async () => {
    process.env.SYSTEM_CORE_CACHE_TTL_MS = '10000';
    resetSystemCoreSnapshotCache();
    await getSystemCoreSnapshot();
    now += 9_000;
    await getSystemCoreSnapshot();
    expect(fetchCount()).toBe(QUERIES.length);

    now += 2_000;
    await getSystemCoreSnapshot();
    expect(fetchCount()).toBe(QUERIES.length * 2);
  });

  it('reports the served age truthfully, never as a negative', async () => {
    await getSystemCoreSnapshot();
    now -= 5_000;
    expect((await getSystemCoreSnapshot()).cacheAgeMs).toBe(0);
  });

  it('starts from nothing after a reset', async () => {
    await getSystemCoreSnapshot();
    resetSystemCoreSnapshotCache();
    await getSystemCoreSnapshot();
    expect(fetchCount()).toBe(QUERIES.length * 2);
  });
});

describe('upstream failure', () => {
  it('turns a non-2xx into an error entry rather than a rejection', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    ) as unknown as typeof fetch;

    const snapshot = await getSystemCoreSnapshot();
    expect(snapshot.errors).toHaveLength(QUERIES.length);
    expect(snapshot.errors[0].code).toBe('upstream_error');
    expect(snapshot.errors[0].message).toContain('503');
  });

  it('treats a rejected query as bad_response, not as unreachable', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'error', errorType: 'bad_data' }),
      }),
    ) as unknown as typeof fetch;

    const snapshot = await getSystemCoreSnapshot();
    expect(snapshot.errors[0].code).toBe('bad_response');
  });

  it('rejects a result of the wrong shape', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'success', data: { result: ['nonsense'] } }),
      }),
    ) as unknown as typeof fetch;

    const snapshot = await getSystemCoreSnapshot();
    expect(snapshot.errors[0].code).toBe('bad_response');
  });

  it('reads an absent result as an empty one, not as a failure', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'success' }),
      }),
    ) as unknown as typeof fetch;

    const snapshot = await getSystemCoreSnapshot();
    expect(snapshot.errors).toEqual([]);
  });

  it('says nothing about the host when it cannot be reached', async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new Error(`connect ECONNREFUSED ${BASE}`)),
    ) as unknown as typeof fetch;

    const snapshot = await getSystemCoreSnapshot();
    // This string reaches a browser. The host and port must not ride along.
    for (const error of snapshot.errors) {
      expect(error.code).toBe('unreachable');
      expect(error.message).toBe('could not reach Prometheus');
      expect(error.message).not.toContain('prometheus.infra');
      expect(error.message).not.toContain('9090');
    }
  });

  it('classifies a timeout as a timeout', async () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    global.fetch = jest.fn(() => Promise.reject(timeout)) as unknown as typeof fetch;

    expect((await getSystemCoreSnapshot()).errors[0].code).toBe('timeout');
  });
});

describe('serve-stale', () => {
  async function primeThenBreak() {
    await getSystemCoreSnapshot();
    now += 40_000;
    global.fetch = jest.fn(() => Promise.reject(new Error('down'))) as unknown as typeof fetch;
    return getSystemCoreSnapshot();
  }

  it('serves the last good snapshot rather than letting the scene go dark', async () => {
    const snapshot = await primeThenBreak();

    expect(snapshot.modules.length).toBeGreaterThan(0);
    expect(snapshot.cacheAgeMs).toBe(40_000);
    expect(snapshot.errors).toHaveLength(QUERIES.length);
  });

  it('flags every module in it as stale, so nothing reads as live', async () => {
    const snapshot = await primeThenBreak();
    for (const module of snapshot.modules) {
      expect(module.staleness.stale).toBe(true);
    }
  });

  it('stops serving it once it is older than the limit', async () => {
    process.env.SYSTEM_CORE_STALE_MAX_MS = '30000';
    resetSystemCoreSnapshotCache();
    await getSystemCoreSnapshot();
    now += 40_000;
    global.fetch = jest.fn(() => Promise.reject(new Error('down'))) as unknown as typeof fetch;

    const snapshot = await getSystemCoreSnapshot();
    // Past the limit the honest answer is "nothing resolved", which the client
    // draws as unknown rather than as forty-second-old news.
    expect(snapshot.cacheAgeMs).toBe(0);
    for (const module of snapshot.modules) {
      for (const channel of module.channels) {
        expect(channel.state).toBe('error');
      }
    }
  });

  it('has nothing to serve when the very first refresh fails', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('down'))) as unknown as typeof fetch;
    const snapshot = await getSystemCoreSnapshot();

    expect(snapshot.configured).toBe(true);
    expect(snapshot.modules.length).toBeGreaterThan(0);
    for (const module of snapshot.modules) {
      if (module.status !== 'controller') {
        expect(module.status).toBe('loading');
      }
    }
  });

  it('recovers to live data on the next successful refresh', async () => {
    await primeThenBreak();
    now += 30_000;
    global.fetch = fetchOk() as unknown as typeof fetch;

    const snapshot = await getSystemCoreSnapshot();
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.cacheAgeMs).toBe(0);
    expect(snapshot.modules.some((m) => m.staleness.stale)).toBe(false);
  });

  it('does not mistake a truncation notice for a dead Prometheus', async () => {
    // The bug this pins: `errors` also carries the overflow lane's `truncated`
    // entry, so counting it against the query total made fourteen dead queries
    // plus one truncation look like a total outage — and sent a snapshot that
    // had perfectly good `up` data down the serve-stale path instead.
    await getSystemCoreSnapshot();
    now += 30_000;

    const extra = Array.from({ length: 200 }, (_unused, i) => ({
      metric: { __name__: 'up', job: 'mystery', instance: `10.9.9.${i}:9999` },
      value: [1_766_000_000, '1'],
    }));
    global.fetch = jest.fn((_url: unknown, init?: { body?: string }) => {
      const expr = new URLSearchParams(init?.body ?? '').get('query') ?? '';
      if (BY_EXPRESSION.get(expr) === 'up') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'success', data: { result: extra } }),
        });
      }
      return Promise.reject(new Error('down'));
    }) as unknown as typeof fetch;

    const snapshot = await getSystemCoreSnapshot();
    expect(snapshot.errors.some((e) => e.code === 'truncated')).toBe(true);
    // The new snapshot, not the stale one: these modules came from `up`.
    expect(snapshot.cacheAgeMs).toBe(0);
    expect(snapshot.modules.filter((m) => m.origin === 'discovered')).toHaveLength(64);
  });
});

describe('partial failure', () => {
  it('keeps the queries that worked and marks only the one that did not', async () => {
    global.fetch = jest.fn((_url: unknown, init?: { body?: string }) => {
      const expr = new URLSearchParams(init?.body ?? '').get('query') ?? '';
      const id = BY_EXPRESSION.get(expr);
      if (id === 'sqlBundle') {
        return Promise.reject(new Error('down'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(id != null ? live[id] : { status: 'success' }),
      });
    }) as unknown as typeof fetch;

    const snapshot = await getSystemCoreSnapshot();
    expect(snapshot.errors).toHaveLength(1);
    expect(snapshot.errors[0].source).toBe('sqlBundle');
    const mongo = snapshot.modules.find((m) => m.id === 'mongo');
    expect(mongo?.channels.find((c) => c.id === 'availability')?.state).toBe('ok');
    expect(mongo?.channels.find((c) => c.id === 'throughput')?.state).toBe('error');
  });

  it('is remembered as good, so it is available to serve stale later', async () => {
    global.fetch = jest.fn((_url: unknown, init?: { body?: string }) => {
      const expr = new URLSearchParams(init?.body ?? '').get('query') ?? '';
      const id = BY_EXPRESSION.get(expr);
      if (id === 'sqlBundle') {
        return Promise.reject(new Error('down'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(id != null ? live[id] : { status: 'success' }),
      });
    }) as unknown as typeof fetch;

    await getSystemCoreSnapshot();
    now += 30_000;
    global.fetch = jest.fn(() => Promise.reject(new Error('down'))) as unknown as typeof fetch;

    const snapshot = await getSystemCoreSnapshot();
    expect(snapshot.cacheAgeMs).toBe(30_000);
    expect(snapshot.modules.every((m) => m.staleness.stale)).toBe(true);
  });
});
