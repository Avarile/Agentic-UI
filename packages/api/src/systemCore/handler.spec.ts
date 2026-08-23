// The HTTP edge.
//
// The assertion this file exists for is 'ignores everything on the request': a
// query string, a body and path params are all populated with things that would
// be dangerous if they reached PromQL, and the outgoing expressions are compared
// byte for byte against a clean run. That is the observable form of the design's
// central claim — that `getSystemCoreSnapshot()` taking no arguments makes
// client influence over the query impossible rather than merely disallowed.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { createSystemCoreHandlers } from './handler';
import { resetSystemCoreSnapshotCache } from './snapshot';
import { QUERIES } from './queries';

interface PromBody {
  status: string;
  data?: { result?: Array<{ metric: Record<string, string>; value: [number, string] }> };
}

const live: Record<string, PromBody> = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'live.json'), 'utf8'),
);

const BY_EXPRESSION = new Map(QUERIES.map((q) => [q.expr, q.id]));
const URL_VAR = 'SYSTEM_CORE_PROMETHEUS_URL';
const realFetch = global.fetch;

interface MockRes {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  set: jest.Mock;
  status: jest.Mock;
  json: jest.Mock;
}

function mockRes() {
  const res: MockRes = {
    statusCode: 0,
    body: undefined,
    headers: {},
    set: jest.fn((name: string, value: string) => {
      res.headers[name] = value;
      return res;
    }),
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data: unknown) => {
      res.body = data;
      return res;
    }),
  };
  return res as Partial<Response> as Response & MockRes;
}

/** A request carrying everything an attacker would try to smuggle through. */
function hostileReq() {
  return {
    user: { id: 'u1', role: 'ADMIN' },
    query: {
      query: 'up or on() vector(1)',
      expr: '{__name__=~".+"}',
      step: '1s',
      start: '0',
    },
    params: { id: 'drop', query: 'count({__name__=~".+"})' },
    body: { query: 'ALL THE SERIES', expr: 'node_cpu_seconds_total' },
    headers: { 'x-prometheus-query': 'up' },
  } as unknown as Request;
}

function cleanReq() {
  return { user: { id: 'u1', role: 'ADMIN' } } as unknown as Request;
}

function sentExpressions(): string[] {
  const mock = global.fetch as unknown as jest.Mock;
  return mock.mock.calls.map(
    (call) => new URLSearchParams((call[1] as { body?: string }).body ?? '').get('query') ?? '',
  );
}

beforeEach(() => {
  process.env[URL_VAR] = 'http://prometheus.infra.svc.cluster.local:9090';
  resetSystemCoreSnapshotCache();
  global.fetch = jest.fn((_url: unknown, init?: { body?: string }) => {
    const expr = new URLSearchParams(init?.body ?? '').get('query') ?? '';
    const id = BY_EXPRESSION.get(expr);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(id != null ? live[id] : { status: 'success', data: { result: [] } }),
    });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  delete process.env[URL_VAR];
  resetSystemCoreSnapshotCache();
  global.fetch = realFetch;
});

describe('getSnapshot', () => {
  it('answers 200 with the snapshot', async () => {
    const res = mockRes();
    await createSystemCoreHandlers().getSnapshot(cleanReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { configured: boolean; modules: unknown[] };
    expect(body.configured).toBe(true);
    expect(body.modules.length).toBeGreaterThan(0);
  });

  it('answers 200 — not 404 — when the feature is not configured', async () => {
    // A deliberate divergence from admin/langfuse.ts. React Query treats a
    // non-2xx as an error and discards the body, so the state has to travel in
    // the payload rather than in the status code.
    delete process.env[URL_VAR];
    const res = mockRes();
    await createSystemCoreHandlers().getSnapshot(cleanReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ configured: false, reason: 'unset' });
  });

  it('answers 200 even when every upstream query failed', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('down'))) as unknown as typeof fetch;
    const res = mockRes();
    await createSystemCoreHandlers().getSnapshot(cleanReq(), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as { errors: unknown[] }).errors).toHaveLength(QUERIES.length);
  });

  it('forbids every cache between here and the browser', async () => {
    const res = mockRes();
    await createSystemCoreHandlers().getSnapshot(cleanReq(), res);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
});

describe('the request cannot reach the query', () => {
  async function expressionsFor(req: Request): Promise<string[]> {
    resetSystemCoreSnapshotCache();
    (global.fetch as unknown as jest.Mock).mockClear();
    await createSystemCoreHandlers().getSnapshot(req, mockRes());
    return sentExpressions();
  }

  it('sends byte-identical expressions for a clean and a hostile request', async () => {
    const clean = await expressionsFor(cleanReq());
    const hostile = await expressionsFor(hostileReq());

    expect(hostile).toEqual(clean);
    expect(hostile).toHaveLength(QUERIES.length);
  });

  it('sends nothing that did not come out of the registry', async () => {
    const legal = new Set(QUERIES.map((q) => q.expr));
    for (const expr of await expressionsFor(hostileReq())) {
      expect(legal.has(expr)).toBe(true);
    }
  });

  it('never echoes a request field into an outgoing body', async () => {
    const sent = (await expressionsFor(hostileReq())).join('\n');
    for (const smuggled of ['vector(1)', '{__name__=~".+"}', 'ALL THE SERIES', 'count(', 'drop']) {
      expect(sent).not.toContain(smuggled);
    }
  });

  it('still answers 200 for a hostile request rather than rejecting it', async () => {
    // There is nothing to reject: the fields are not read, so they are not
    // input. Returning 400 here would imply they were.
    const res = mockRes();
    await createSystemCoreHandlers().getSnapshot(hostileReq(), res);
    expect(res.statusCode).toBe(200);
  });
});

describe('getAvailability', () => {
  it('is enabled because reaching here means the capability check passed', async () => {
    const res = mockRes();
    await createSystemCoreHandlers().getAvailability(cleanReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ configured: true, enabled: true });
  });

  it('stays enabled with no feed configured, so the fixture scene is reachable', async () => {
    // The regression this pins: returning `enabled: configured` hid the entry
    // point on every deployment without a Prometheus — most of them — and with it
    // the example-data scene that is meant to be the fallback.
    delete process.env[URL_VAR];
    const res = mockRes();
    await createSystemCoreHandlers().getAvailability(cleanReq(), res);

    expect(res.body).toEqual({ configured: false, enabled: true });
  });

  it('reports a malformed URL as unconfigured without withdrawing the feature', async () => {
    process.env[URL_VAR] = 'prometheus:9090';
    const res = mockRes();
    await createSystemCoreHandlers().getAvailability(cleanReq(), res);

    expect(res.body).toEqual({ configured: false, enabled: true });
  });

  it('moves its two fields independently', async () => {
    // Authorization is not observable here — an unauthorized caller is stopped by
    // the router and never reaches this handler. What is observable is that
    // `configured` tracks the feed while `enabled` does not.
    delete process.env[URL_VAR];
    const off = mockRes();
    await createSystemCoreHandlers().getAvailability(cleanReq(), off);

    process.env[URL_VAR] = 'http://prometheus.infra.svc.cluster.local:9090';
    const on = mockRes();
    await createSystemCoreHandlers().getAvailability(cleanReq(), on);

    const offBody = off.body as { configured: boolean; enabled: boolean };
    const onBody = on.body as { configured: boolean; enabled: boolean };
    expect(offBody.configured).toBe(false);
    expect(onBody.configured).toBe(true);
    expect(offBody.enabled).toBe(onBody.enabled);
  });

  it('makes no upstream request to answer', async () => {
    await createSystemCoreHandlers().getAvailability(cleanReq(), mockRes());
    expect((global.fetch as unknown as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('is not cached, so revoking access takes effect on the next reload', async () => {
    const res = mockRes();
    await createSystemCoreHandlers().getAvailability(cleanReq(), res);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
});

describe('when the snapshot builder itself throws', () => {
  afterEach(() => {
    jest.dontMock('./snapshot');
    jest.dontMock('@librechat/data-schemas');
    jest.resetModules();
  });

  it('answers 500 and logs, because that means a defect rather than a sick cluster', async () => {
    // getSystemCoreSnapshot turns every upstream failure into data, so the only
    // way to arrive here is a bug — which is worth a 500 and a log line, unlike
    // an unreachable Prometheus.
    jest.resetModules();
    const error = jest.fn();
    jest.doMock('@librechat/data-schemas', () => ({ logger: { error, warn: jest.fn() } }));
    jest.doMock('./snapshot', () => ({
      getSystemCoreSnapshot: () => Promise.reject(new Error('boom')),
      resetSystemCoreSnapshotCache: jest.fn(),
    }));

    const { createSystemCoreHandlers: fresh } = await import('./handler');
    const res = mockRes();
    await fresh().getSnapshot(cleanReq(), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'Internal Server Error' });
    expect(error).toHaveBeenCalled();
  });
});
