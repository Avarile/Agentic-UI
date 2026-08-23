// The assembler, against response bodies captured from a real Prometheus.
//
// __fixtures__/live.json was produced by capture.manual.spec.ts running the
// expressions out of ./queries against the live cluster, so the envelopes here
// are what Prometheus really sends rather than what we assumed it sends. Its
// hostnames are pseudonyms of the same *form* as the originals, which is the
// part that matters: the colon in `10.0.0.16:9216` and the slashes in
// `https://endpoint-1.example.test` are precisely what the id-slugging exists
// for.
//
// The headline assertion is 'accounts for every scrape target': on a cluster
// whose catalogue is complete the overflow lane is empty, and a target silently
// falling out of the picture is the one failure an operations view must not have.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SystemCoreModule } from 'librechat-data-provider';
import type { PromSample, QueryOutcome, QueryResults } from './assemble';
import type { SystemCoreQueryId } from './queries';
import type { SystemCoreConfig } from './config';
import { assembleSnapshot, unconfiguredSnapshot, slug } from './assemble';
import { CATALOG, MAX_OVERFLOW } from './catalog';
import { QUERIES } from './queries';

interface PromBody {
  status: string;
  data?: { result?: PromSample[] };
}

const live: Record<string, PromBody> = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'live.json'), 'utf8'),
);

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const COLLECTED_AT_MS = 1_766_000_000_000;

const config: SystemCoreConfig = {
  baseUrl: new URL('http://prometheus.infra.svc.cluster.local:9090/'),
  timeoutMs: 5_000,
  cacheTtlMs: 25_000,
  scrapeIntervalSeconds: 30,
  staleAfterSeconds: 90,
  staleMaxMs: 300_000,
};

function rowsOf(id: SystemCoreQueryId): PromSample[] {
  return (live[id]?.data?.result ?? []).map((row) => ({
    metric: { ...row.metric },
    value: [row.value[0], row.value[1]],
  }));
}

function resultsFrom(
  overrides: Partial<Record<SystemCoreQueryId, QueryOutcome>> = {},
): QueryResults {
  const map = new Map<SystemCoreQueryId, QueryOutcome>();
  for (const def of QUERIES) {
    map.set(def.id, { ok: true, series: rowsOf(def.id) });
  }
  for (const [id, outcome] of Object.entries(overrides)) {
    map.set(id as SystemCoreQueryId, outcome as QueryOutcome);
  }
  return map;
}

function assemble(overrides: Partial<Record<SystemCoreQueryId, QueryOutcome>> = {}) {
  return assembleSnapshot({
    results: resultsFrom(overrides),
    config,
    collectedAtMs: COLLECTED_AT_MS,
  });
}

const failure: QueryOutcome = {
  ok: false,
  code: 'unreachable',
  message: 'could not reach Prometheus',
};

function moduleById(modules: SystemCoreModule[], id: string): SystemCoreModule {
  const found = modules.find((m) => m.id === id);
  if (found == null) {
    throw new Error(`no module ${id}; got ${modules.map((m) => m.id).join(', ')}`);
  }
  return found;
}

function channelOf(module: SystemCoreModule, id: string) {
  const found = module.channels.find((c) => c.id === id);
  if (found == null) {
    throw new Error(`no channel ${id} on ${module.id}`);
  }
  return found;
}

describe('the fixture itself', () => {
  it('covers the whole registry', () => {
    for (const def of QUERIES) {
      expect(live[def.id]?.status).toBe('success');
    }
  });

  it('carries the two situations the design found the hard way', () => {
    // An absent metric answers 200 with an empty result — not an error.
    expect(rowsOf('appBundle')).toHaveLength(0);
    // And `up` disagrees with `probe_success`: every blackbox exporter answered,
    // but one of the endpoints it probed did not.
    const probes = rowsOf('probeSuccess');
    expect(probes.filter((r) => r.value[1] === '0')).toHaveLength(1);
    for (const row of rowsOf('up').filter((r) => r.metric.job === 'blackbox-http')) {
      expect(row.value[1]).toBe('1');
    }
  });
});

describe('a healthy cluster', () => {
  const snapshot = assemble();

  it('reports itself configured, with the server pacing the client', () => {
    expect(snapshot.configured).toBe(true);
    expect(snapshot.reason).toBeUndefined();
    expect(snapshot.collectedAt).toBe(new Date(COLLECTED_AT_MS).toISOString());
    expect(snapshot.cacheAgeMs).toBe(0);
    expect(snapshot.nextPollMs).toBe(config.cacheTtlMs);
    expect(snapshot.scrapeIntervalSeconds).toBe(30);
    expect(snapshot.errors).toEqual([]);
  });

  it('accounts for every scrape target, leaving the overflow lane empty', () => {
    // The resting condition. Anything here means a real service is showing up as
    // an anonymous ring instead of as itself.
    const discovered = snapshot.modules.filter((m) => m.origin === 'discovered');
    expect(discovered.map((m) => m.id)).toEqual([]);
  });

  it('emits one module per catalogue entry, plus one per probed endpoint', () => {
    const probeCount = rowsOf('probeSuccess').length;
    const expanded = CATALOG.filter((e) => e.expand != null).length;
    expect(snapshot.modules).toHaveLength(CATALOG.length - expanded + probeCount);
  });

  it('gives every module an id the client will accept, and no duplicates', () => {
    const ids = snapshot.modules.map((m) => m.id);
    for (const id of ids) {
      expect(id).toMatch(ID_RE);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the centre white whatever it reads', () => {
    expect(moduleById(snapshot.modules, 'controller').status).toBe('controller');
  });

  it('reads the cluster-wide pod count on the centre ring', () => {
    // 37 running pods across eleven namespaces, summed from a namespaced series.
    // Summed from the fixture rather than asserted as a literal: the number of
    // running pods is the cluster's business and changes without warning.
    const expected = rowsOf('podsRunning').reduce((sum, r) => sum + Number(r.value[1]), 0);
    expect(channelOf(moduleById(snapshot.modules, 'controller'), 'connections').raw).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('only ever reports a status it can point at a reason for', () => {
    // A property rather than a measurement. Asserting that a given service is
    // green would be asserting the cluster's health, which changes on its own and
    // would make this suite fail for reasons that are nothing to do with the
    // code. What has to hold is that nothing is *unexplained*: a module reads
    // amber or red only when a signal says so.
    for (const module of snapshot.modules) {
      if (module.status === 'controller' || module.status === 'running') {
        continue;
      }
      const reason =
        module.target?.up === false ||
        module.staleness.stale ||
        (module.health != null && module.health < 0.67) ||
        module.channels.every((c) => c.state !== 'ok');
      expect({ id: module.id, status: module.status, reason }).toEqual({
        id: module.id,
        status: module.status,
        reason: true,
      });
    }
  });

  it('resolves the curated datastores against a real target', () => {
    for (const id of ['mongo', 'mysql', 'pgvector', 'redis', 'prometheus', 'minio']) {
      const module = moduleById(snapshot.modules, id);
      expect(module.origin).toBe('catalog');
      expect(module.target).not.toBeNull();
      expect(module.channels.some((c) => c.state === 'ok')).toBe(true);
    }
  });

  it('resolves a datastore through its exporter pod', () => {
    const mongo = moduleById(snapshot.modules, 'mongo');
    expect(mongo.target?.job).toBe('kubernetes-pods');
    expect(mongo.target?.pod).toMatch(/^mongo-/);
    expect(mongo.target?.up).toBe(true);
    expect(channelOf(mongo, 'throughput').state).toBe('ok');
    // From the fixture, not a literal: mongo's op rate moves constantly.
    expect(channelOf(mongo, 'throughput').raw).toBe(
      Number(rowsOf('sqlBundle').find((r) => r.metric.sc === 'mongoOps')?.value[1]),
    );
    // cAdvisor reaches the same pod without an exporter of its own.
    expect(channelOf(mongo, 'load').state).toBe('ok');
    expect(channelOf(mongo, 'saturation').state).toBe('ok');
  });

  it('normalizes every reading into 0..1, or leaves it null', () => {
    for (const module of snapshot.modules) {
      for (const channel of module.channels) {
        if (channel.state === 'ok') {
          expect(channel.value).not.toBeNull();
          expect(channel.value as number).toBeGreaterThanOrEqual(0);
          expect(channel.value as number).toBeLessThanOrEqual(1);
        } else {
          // Never 0 for absent: an idle gauge and a missing one must not look
          // the same to whoever is reading the scene.
          expect(channel.value).toBeNull();
          expect(channel.raw).toBeNull();
        }
      }
      if (module.health != null) {
        expect(module.health).toBeGreaterThanOrEqual(0);
        expect(module.health).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never names an expression or a URL in a channel source', () => {
    // `source` is rendered in the panel. A PromQL string there would leak the
    // catalogue, and a URL would leak the topology.
    const ids = new Set<string>(QUERIES.map((q) => q.id));
    for (const module of snapshot.modules) {
      for (const channel of module.channels) {
        expect(ids.has(channel.source)).toBe(true);
      }
    }
  });

  it('is byte-identical when assembled twice from the same input', () => {
    // The client keys a strip's rotation by module id, so an id or an order that
    // wobbled between snapshots would restart the animation on every poll.
    expect(JSON.stringify(assemble())).toBe(JSON.stringify(assemble()));
  });
});

describe('probe expansion', () => {
  const snapshot = assemble();
  const probes = snapshot.modules.filter((m) => m.id.startsWith('probe.'));

  it('becomes one module per probed endpoint', () => {
    expect(probes).toHaveLength(rowsOf('probeSuccess').length);
    expect(new Set(probes.map((m) => m.id)).size).toBe(probes.length);
  });

  it('slugifies an instance label into a legal id', () => {
    for (const probe of probes) {
      expect(probe.id).toMatch(ID_RE);
      // The raw label is not a legal id — that is the whole point.
      expect(probe.label).toContain('://');
      expect(probe.id).not.toContain('/');
      expect(probe.id).not.toContain(':');
    }
  });

  it('pins each probe to its own row rather than to whichever came first', () => {
    const values = probes.map((p) => channelOf(p, 'availability').raw);
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it('faults the endpoint that answered 502 while its exporter was fine', () => {
    const failing = probes.filter((p) => channelOf(p, 'availability').raw === 0);
    expect(failing).toHaveLength(1);
    expect(failing[0].status).toBe('fault');
    // And leaves the other nine alone.
    expect(probes.filter((p) => p.status === 'fault')).toHaveLength(1);
  });

  it('orders probes deterministically, whatever order Prometheus returned them in', () => {
    const forwards = assemble().modules.filter((m) => m.id.startsWith('probe.'));
    const reversed = assembleSnapshot({
      results: resultsFrom({
        probeSuccess: { ok: true, series: rowsOf('probeSuccess').reverse() },
      }),
      config,
      collectedAtMs: COLLECTED_AT_MS,
    }).modules.filter((m) => m.id.startsWith('probe.'));
    expect(reversed.map((m) => m.id)).toEqual(forwards.map((m) => m.id));
  });

  it('emits no probe modules at all when the expansion query failed', () => {
    // We do not know what endpoints exist, so inventing them would be worse
    // than leaving them out.
    const snapshot = assemble({ probeSuccess: failure });
    expect(snapshot.modules.filter((m) => m.id.startsWith('probe.'))).toHaveLength(0);
  });
});

describe('a metric that is not scraped', () => {
  it('reads missing, not error, and not zero', () => {
    // appBundle's selectors match nothing today, so the query succeeds with an
    // empty result. These channels light up the day a scrape job appears, with
    // no change here and none on the cluster.
    const librechat = moduleById(assemble().modules, 'librechat');
    for (const id of ['throughput', 'errors', 'connections']) {
      expect(channelOf(librechat, id).state).toBe('missing');
      expect(channelOf(librechat, id).raw).toBeNull();
    }
  });

  it('leaves the channels that do resolve alone', () => {
    const librechat = moduleById(assemble().modules, 'librechat');
    expect(channelOf(librechat, 'availability').state).toBe('ok');
    expect(channelOf(librechat, 'load').state).toBe('ok');
    expect(channelOf(librechat, 'saturation').state).toBe('ok');
    expect(librechat.status).toBe('running');
  });
});

describe('a target that is down', () => {
  function withMongoDown() {
    return assemble({
      up: {
        ok: true,
        series: rowsOf('up').map((row) =>
          (row.metric.pod ?? '').startsWith('mongo')
            ? { metric: row.metric, value: [row.value[0], '0'] as [number, string] }
            : row,
        ),
      },
    });
  }

  it('faults that module and only that module', () => {
    const snapshot = withMongoDown();
    expect(moduleById(snapshot.modules, 'mongo').status).toBe('fault');
    expect(moduleById(snapshot.modules, 'mongo').target?.up).toBe(false);
    expect(moduleById(snapshot.modules, 'mysql').status).toBe('running');
  });

  it('outranks whatever its other channels still report', () => {
    // The exporter keeps answering for a moment after the thing it describes
    // stops; "we cannot reach it" is the more useful of the two facts.
    const mongo = moduleById(withMongoDown().modules, 'mongo');
    expect(channelOf(mongo, 'throughput').state).toBe('ok');
    expect(mongo.status).toBe('fault');
  });
});

describe('a stale scrape', () => {
  it('reads loading rather than as a live number', () => {
    const stale = assemble({
      scrapeAge: {
        ok: true,
        series: rowsOf('scrapeAge').map((row) =>
          (row.metric.pod ?? '').startsWith('mongo')
            ? { metric: row.metric, value: [row.value[0], '600'] as [number, string] }
            : row,
        ),
      },
    });
    const mongo = moduleById(stale.modules, 'mongo');
    expect(mongo.staleness.scrapeAgeSeconds).toBe(600);
    expect(mongo.staleness.stale).toBe(true);
    expect(mongo.status).toBe('loading');
  });

  it('is not stale inside three scrape intervals', () => {
    const snapshot = assemble();
    for (const module of snapshot.modules) {
      if (module.staleness.scrapeAgeSeconds != null) {
        expect(module.staleness.scrapeAgeSeconds).toBeLessThan(config.staleAfterSeconds);
        expect(module.staleness.stale).toBe(false);
      }
    }
  });
});

describe('one query failing', () => {
  const snapshot = assemble({ sqlBundle: failure });

  it('errors exactly the channels bound to it', () => {
    for (const [id, channels] of [
      ['mongo', ['throughput', 'connections']],
      ['mysql', ['throughput', 'connections']],
      ['pgvector', ['throughput', 'connections']],
    ] as const) {
      for (const channel of channels) {
        expect(channelOf(moduleById(snapshot.modules, id), channel).state).toBe('error');
      }
    }
  });

  it('leaves every other channel on the same modules working', () => {
    const mongo = moduleById(snapshot.modules, 'mongo');
    expect(channelOf(mongo, 'availability').state).toBe('ok');
    expect(channelOf(mongo, 'load').state).toBe('ok');
    expect(mongo.status).toBe('running');
  });

  it('leaves unrelated modules untouched', () => {
    expect(moduleById(snapshot.modules, 'redis').status).toBe('running');
    expect(channelOf(moduleById(snapshot.modules, 'redis'), 'throughput').state).toBe('ok');
  });

  it('reports the failure once, naming the query and never the expression', () => {
    expect(snapshot.errors).toEqual([
      { source: 'sqlBundle', code: 'unreachable', message: 'could not reach Prometheus' },
    ]);
  });
});

describe('every query failing', () => {
  const snapshot = assemble(
    Object.fromEntries(QUERIES.map((q) => [q.id, failure])) as Partial<
      Record<SystemCoreQueryId, QueryOutcome>
    >,
  );

  it('still returns the whole arrangement, so the scene does not go dark', () => {
    expect(snapshot.modules.length).toBeGreaterThan(0);
    expect(snapshot.errors).toHaveLength(QUERIES.length);
  });

  it('reads loading, not init — a total outage is not a fresh install', () => {
    // 'init' is the green status. Painting an unreachable cluster in it would
    // say the opposite of the truth.
    for (const module of snapshot.modules) {
      if (module.status === 'controller') {
        continue;
      }
      expect(module.status).toBe('loading');
    }
  });

  it('marks every channel as error, with no value at all', () => {
    for (const module of snapshot.modules) {
      for (const channel of module.channels) {
        expect(channel.state).toBe('error');
        expect(channel.value).toBeNull();
        expect(channel.raw).toBeNull();
      }
      expect(module.health).toBeNull();
      expect(module.target).toBeNull();
    }
  });

  it('discovers nothing, because it learned nothing', () => {
    expect(snapshot.modules.filter((m) => m.origin === 'discovered')).toHaveLength(0);
  });
});

describe('discovery', () => {
  function withExtraTargets(count: number, job = 'mystery-job') {
    const extra: PromSample[] = Array.from({ length: count }, (_unused, i) => ({
      metric: { __name__: 'up', job, instance: `10.9.9.${i}:9999` },
      value: [1_766_000_000, '1'] as [number, string],
    }));
    return assemble({ up: { ok: true, series: [...rowsOf('up'), ...extra] } });
  }

  it('turns an unrecognised target into a discovered module', () => {
    const snapshot = withExtraTargets(1);
    const discovered = snapshot.modules.filter((m) => m.origin === 'discovered');
    expect(discovered).toHaveLength(1);
    expect(discovered[0].id).toBe('auto.mystery-job.10.9.9.0-9999');
    expect(discovered[0].group).toBe('overflow');
    expect(discovered[0].tags).toEqual(['discovered']);
    expect(discovered[0].status).toBe('running');
    expect(discovered[0].label).toBe('10.9.9.0:9999');
  });

  it('slugifies the id while leaving the label readable', () => {
    const discovered = withExtraTargets(1).modules.filter((m) => m.origin === 'discovered')[0];
    expect(discovered.id).toMatch(ID_RE);
    expect(discovered.id).not.toContain(':');
    expect(discovered.label).toContain(':');
  });

  it('faults a discovered target that is down', () => {
    const snapshot = assemble({
      up: {
        ok: true,
        series: [
          ...rowsOf('up'),
          {
            metric: { __name__: 'up', job: 'mystery-job', instance: 'ghost:1234' },
            value: [1_766_000_000, '0'] as [number, string],
          },
        ],
      },
    });
    const discovered = snapshot.modules.filter((m) => m.origin === 'discovered');
    expect(discovered[0].status).toBe('fault');
    expect(discovered[0].health).toBe(0);
  });

  it('caps discovery and says so, rather than emitting thousands of strips', () => {
    const snapshot = withExtraTargets(200);
    const discovered = snapshot.modules.filter((m) => m.origin === 'discovered');
    expect(discovered).toHaveLength(MAX_OVERFLOW);
    expect(snapshot.errors).toHaveLength(1);
    expect(snapshot.errors[0]).toMatchObject({ source: 'up', code: 'truncated' });
    expect(snapshot.errors[0].message).toContain('200');
  });

  it('does not discover an exporter a catalogue entry already claims', () => {
    // kubernetes-cadvisor is its own scrape target, absorbed by kube-nodes. Its
    // whole reason to exist is that it would otherwise stand next to the kubelet
    // as a second anonymous ring describing the same thing.
    const ids = assemble().modules.map((m) => m.id);
    expect(ids.some((id) => id.includes('cadvisor'))).toBe(false);
  });

  it('places discovered modules where they cannot shift a curated one', () => {
    const base = assemble().modules.filter((m) => m.origin === 'catalog');
    const withExtras = withExtraTargets(5).modules.filter((m) => m.origin === 'catalog');
    expect(withExtras.map((m) => m.placement)).toEqual(base.map((m) => m.placement));
  });
});

describe('slug', () => {
  it.each([
    ['10.42.0.31:9100', '10.42.0.31-9100'],
    ['https://foo.example.test', 'https-foo.example.test'],
    // An underscore is legal in the client's ID_RE, so it survives; the colon is
    // the only character here that has to go.
    ['host_name:80', 'host_name-80'],
    ['already-legal.id', 'already-legal.id'],
  ])('turns %p into %p', (raw, expected) => {
    expect(slug(raw)).toBe(expected);
    expect(slug(raw)).toMatch(ID_RE);
  });

  it('strips a leading character the client would reject', () => {
    expect(slug('...leading')).toBe('leading');
    expect(slug('-dash')).toBe('dash');
  });

  it('never returns something unusable as an id', () => {
    for (const raw of ['', '...', '///', '---', ':::']) {
      expect(slug(raw)).toBe('unknown');
      expect(slug(raw)).toMatch(ID_RE);
    }
  });
});

describe('unconfiguredSnapshot', () => {
  it('says why, and carries nothing else', () => {
    const snapshot = unconfiguredSnapshot('unset', COLLECTED_AT_MS);
    expect(snapshot.configured).toBe(false);
    expect(snapshot.reason).toBe('unset');
    expect(snapshot.modules).toEqual([]);
    expect(snapshot.errors).toEqual([]);
    expect(snapshot.nextPollMs).toBe(0);
    expect(snapshot.scrapeIntervalSeconds).toBe(0);
    expect(snapshot.collectedAt).toBe(new Date(COLLECTED_AT_MS).toISOString());
  });

  it('distinguishes a missing setting from a broken one', () => {
    expect(unconfiguredSnapshot('invalid_url', COLLECTED_AT_MS).reason).toBe('invalid_url');
  });

  it('still reports the catalogue revision, so the client can prime itself', () => {
    expect(unconfiguredSnapshot('unset', COLLECTED_AT_MS).catalogRevision.length).toBeGreaterThan(
      0,
    );
  });
});
