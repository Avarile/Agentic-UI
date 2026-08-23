// The wire format into the scene's two shapes.
//
// `__fixtures__/snapshot.json` is a real 28-module payload, written by
// `packages/api/src/systemCore/capture.manual.spec.ts` from the live cluster
// through the real assembler. So what is asserted here is the actual contract
// between the two packages rather than a restatement of it — including the
// awkward parts a hand-written fixture would smooth over: a controller whose
// health is null, discovered ids that were never legal module ids, and channels
// that resolved to nothing because the metric is not scraped.

import type { SystemCoreSnapshotResponse, SystemCoreModule } from 'librechat-data-provider';
import snapshotFixture from './__fixtures__/snapshot.json';
import { STATUS, STATUS_KEYS } from '../../data/status';
import { verify, groupFields } from '../../data/schema';
import { readingsOf, catalogOf, hasCatalog, NO_READINGS } from '../adapt';
import { boundSpeed, boundLevel, boundOpacity, effectiveStatus } from '../bind';

const snapshot = snapshotFixture as unknown as SystemCoreSnapshotResponse;

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Read from the schema rather than restated, so the assertion cannot drift from
// the bound it is checking.
const SPEED_MIN = groupFields('motion').speed.min as number;
const SPEED_MAX = groupFields('motion').speed.max as number;

function moduleOf(id: string): SystemCoreModule {
  const found = snapshot.modules.find((m) => m.id === id);
  if (found == null) {
    throw new Error(`no module ${id} in the fixture`);
  }
  return found;
}

/** A snapshot with one module replaced, for the malformed-payload cases. */
function withModule(over: Partial<SystemCoreModule>): SystemCoreSnapshotResponse {
  return {
    ...snapshot,
    modules: [{ ...moduleOf('mongo'), ...over } as SystemCoreModule],
  };
}

describe('the fixture', () => {
  it('is a real snapshot, not a sketch of one', () => {
    expect(snapshot.configured).toBe(true);
    expect(snapshot.modules).toHaveLength(28);
    expect(snapshot.catalogRevision.length).toBeGreaterThan(0);
    expect(snapshot.errors).toEqual([]);
  });
});

describe('readingsOf', () => {
  const readings = readingsOf(snapshot);

  it('keys a reading by module id, one per module', () => {
    expect(readings.size).toBe(snapshot.modules.length);
    for (const m of snapshot.modules) {
      expect(readings.has(m.id)).toBe(true);
    }
  });

  it('carries the status the server resolved, always a key the palette knows', () => {
    for (const [, reading] of readings) {
      expect(STATUS_KEYS).toContain(reading.status);
    }
  });

  it('reads the one genuinely failing probe as a fault', () => {
    const failing = [...readings].filter(([, r]) => r.status === 'fault');
    expect(failing).toHaveLength(1);
    expect(failing[0][0]).toMatch(/^probe\./);
  });

  it('does not call a module without a scrape target "down"', () => {
    // The app's own pod has no `up` series — cAdvisor sees it, nothing scrapes
    // it. "Nothing to be down" must not render as "down".
    const librechat = moduleOf('librechat');
    expect(librechat.target).toBeNull();
    expect(readings.get('librechat')?.up).toBe(true);
    expect(readings.get('librechat')?.status).toBe('running');
  });

  it('reports up faithfully for a module that does have a target', () => {
    expect(moduleOf('mongo').target?.up).toBe(true);
    expect(readings.get('mongo')?.up).toBe(true);
    expect(
      readingsOf(withModule({ target: { ...moduleOf('mongo').target!, up: false } })).get('mongo')
        ?.up,
    ).toBe(false);
  });

  it('keeps an absent reading null rather than zero', () => {
    // The controller reports no health channels at all — both of its channels are
    // activity. Zero would draw it as unwell.
    expect(moduleOf('controller').health).toBeNull();
    expect(readings.get('controller')?.health).toBeNull();
    // Read off the fixture rather than written as a literal: this is a live CPU
    // measurement, and pinning the magnitude would assert the cluster's load
    // instead of the fact that the reading carries it through unchanged.
    expect(readings.get('controller')?.load).toBe(moduleOf('controller').load);
    expect(readings.get('controller')?.load).not.toBeNull();
  });

  it('marks a discovered module as overflow and a catalogued one as not', () => {
    for (const [id, reading] of readings) {
      expect(reading.overflow).toBe(moduleOf(id).origin === 'discovered');
    }
    expect([...readings.values()].some((r) => r.overflow)).toBe(false);
  });

  it('is the shared empty map when there is nothing to report', () => {
    // Identity matters: the scene's build memo keys on it, so a fresh Map per
    // render would rebuild every strip.
    expect(readingsOf(undefined)).toBe(NO_READINGS);
    expect(readingsOf({ ...snapshot, configured: false })).toBe(NO_READINGS);
    expect(readingsOf({ ...snapshot, modules: [] })).toBe(NO_READINGS);
  });

  it('drops a non-finite number rather than letting it reach the scene', () => {
    const hostile = readingsOf(withModule({ health: NaN, load: Infinity, rate: -Infinity })).get(
      'mongo',
    );
    expect(hostile?.health).toBeNull();
    expect(hostile?.load).toBeNull();
    expect(hostile?.rate).toBeNull();
  });

  it('skips a module with no usable id instead of keying on one', () => {
    const readings = readingsOf(withModule({ id: '' }));
    expect(readings.size).toBe(0);
  });
});

describe('catalogOf', () => {
  const { modules, errors } = catalogOf(snapshot);

  it('turns every snapshot module into one the schema accepts', () => {
    expect(errors).toEqual([]);
    expect(modules).toHaveLength(snapshot.modules.length);
    // The schema's own validator, not a restatement of it: a module that passes
    // this is one the panel can edit and serialize losslessly.
    expect(verify(modules, { statuses: STATUS_KEYS })).toEqual([]);
  });

  it('gives every module an id the schema will keep', () => {
    for (const module of modules) {
      expect(module.id).toMatch(ID_RE);
    }
    expect(new Set(modules.map((m) => m.id)).size).toBe(modules.length);
  });

  it('carries the server placement through to geometry and motion', () => {
    const mongo = modules.find((m) => m.id === 'mongo');
    const placement = moduleOf('mongo').placement;
    expect(mongo?.geometry.radius).toBe(placement.radius);
    expect(mongo?.geometry.y).toBe(placement.y);
    expect(mongo?.geometry.arc).toBe(placement.arc);
    expect(mongo?.motion.speed).toBe(placement.speed);
    expect(mongo?.layout.order).toBe(placement.order);
  });

  it('leaves phase unset so the stack does not line up on load', () => {
    // null means "pick one at load time". A server-chosen angle would start every
    // strip in the same place.
    for (const module of modules) {
      expect(module.motion.phase).toBeNull();
    }
  });

  it('seeds the authored telemetry floor from the reading', () => {
    // This is what makes `telemetry` load-bearing: with the feed off, the module
    // still has something to say about itself.
    const mongo = modules.find((m) => m.id === 'mongo');
    expect(mongo?.telemetry.health).toBe(moduleOf('mongo').health);
    expect(mongo?.telemetry.progress).toBe(moduleOf('mongo').load);
  });

  it('carries the group and tags, which the panel groups its list by', () => {
    const mongo = modules.find((m) => m.id === 'mongo');
    expect(mongo?.meta.group).toBe(moduleOf('mongo').group);
    expect(mongo?.meta.tags).toEqual(moduleOf('mongo').tags);
    expect(mongo?.meta.description.length).toBeGreaterThan(0);
  });

  it('carries dependsOn, so the scene can draw a relationship', () => {
    const librechat = modules.find((m) => m.id === 'librechat');
    expect(librechat?.links.dependsOn).toEqual(moduleOf('librechat').dependsOn);
    expect(librechat?.links.dependsOn.length).toBeGreaterThan(0);
  });

  it('preserves the controller as the controller', () => {
    expect(modules.find((m) => m.id === 'controller')?.status).toBe('controller');
  });

  it('is deterministic — the same snapshot yields the same modules', () => {
    // The scene keys a strip's rotation by id, so an order that wobbled between
    // reconciles would restart animations.
    expect(JSON.stringify(catalogOf(snapshot))).toBe(JSON.stringify(catalogOf(snapshot)));
  });

  it('is empty when the feed is off, rather than throwing', () => {
    expect(catalogOf(undefined)).toEqual({ modules: [], errors: [] });
    expect(catalogOf({ ...snapshot, configured: false })).toEqual({ modules: [], errors: [] });
  });

  it('substitutes a status the palette does not know instead of dropping the module', () => {
    // Losing a module because a newer server grew a status this build does not
    // have is a worse failure than drawing it in the wrong colour for a release.
    // Written against 'degraded' originally, which has since become real — so the
    // case is not hypothetical, and the substitution is what carried the scene
    // across that change without dropping a module.
    const { modules, errors } = catalogOf(withModule({ status: 'quarantined' } as never));
    expect(errors).toEqual([]);
    expect(modules[0].status).toBe('init');
  });

  it('keeps a status this build does know', () => {
    const { modules, errors } = catalogOf(withModule({ status: 'degraded' }));
    expect(errors).toEqual([]);
    expect(modules[0].status).toBe('degraded');
  });

  it('reports a module the schema refuses instead of silently omitting it', () => {
    const { modules, errors } = catalogOf(
      withModule({ placement: { ...moduleOf('mongo').placement, radius: 500 } }),
    );
    expect(modules).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('mongo');
  });

  it('refuses a duplicate id rather than giving two strips one rotation', () => {
    const mongo = moduleOf('mongo');
    const { modules, errors } = catalogOf({ ...snapshot, modules: [mongo, mongo] });
    expect(modules).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('duplicate');
  });
});

describe('hasCatalog', () => {
  it('is true only for a configured snapshot with modules in it', () => {
    expect(hasCatalog(snapshot)).toBe(true);
    expect(hasCatalog(undefined)).toBe(false);
    expect(hasCatalog({ ...snapshot, configured: false })).toBe(false);
    expect(hasCatalog({ ...snapshot, modules: [] })).toBe(false);
  });
});

// The whole client-side chain on a real payload: 28 modules through adapt and
// then through the binding layer, which is what the scene actually does. The unit
// tests either side of this use synthetic readings; this is the only place the two
// halves meet over data nobody invented.
describe('the binding layer over a real snapshot', () => {
  const { modules } = catalogOf(snapshot);
  const readings = readingsOf(snapshot);
  const pairs = modules.map((m) => ({ m, live: readings.get(m.id) ?? null }));

  it('has a reading for every module it produced', () => {
    expect(pairs.every((p) => p.live != null)).toBe(true);
    expect(pairs).toHaveLength(28);
  });

  it('resolves every module to a status the palette can draw', () => {
    // The codomain guarantee that bounds the material registry, asserted over
    // real statuses rather than generated ones.
    for (const { m, live } of pairs) {
      expect(STATUS[effectiveStatus(m, live)]).toBeDefined();
    }
  });

  it('draws the amber the server resolved, now that the palette has one', () => {
    // Asserted as a transformation, not as a fact about the cluster. An earlier
    // version required the snapshot to actually contain a degraded module, and it
    // passed only until those services recovered — which is the same trap as
    // pinning a live magnitude. What must hold is that a degraded reading survives
    // the trip, whether or not anything is degraded right now.
    const [{ m }] = pairs;
    const degraded = { ...pairs[0].live!, status: 'degraded' };
    expect(STATUS.degraded).toBeDefined();
    expect(effectiveStatus({ ...m, status: 'running' }, degraded)).toBe('degraded');

    // And whatever the cluster happens to be doing, every degraded module in the
    // snapshot got there through health rather than through staleness — which is
    // what separates amber from the blue of not knowing.
    for (const { live } of pairs.filter((p) => p.live?.status === 'degraded')) {
      expect(live?.stale).toBe(false);
      expect(live?.health).not.toBeNull();
      expect(live?.health as number).toBeLessThan(0.67);
    }
  });

  it('keeps every bound speed inside the schema range', () => {
    const min = SPEED_MIN;
    const max = SPEED_MAX;
    for (const { m, live } of pairs) {
      const speed = boundSpeed(m, live);
      expect(Number.isFinite(speed)).toBe(true);
      expect(speed).toBeGreaterThanOrEqual(min);
      expect(speed).toBeLessThanOrEqual(max);
      // Direction is the arrangement's, not the cluster's.
      expect(Math.sign(speed)).toBe(Math.sign(m.motion.speed));
    }
  });

  it('never raises a module above its authored loudness', () => {
    for (const { m, live } of pairs) {
      expect(boundLevel(m, live)).toBeLessThanOrEqual(m.audio.level);
    }
  });

  it('adds at most one opacity value across the whole scene', () => {
    // The registry key space: with nothing stale the authored set is untouched,
    // and a stale scene collapses onto one shared ghost rather than fanning out.
    const current = new Set(pairs.map(({ m, live }) => boundOpacity(m, live)));
    const authored = new Set(modules.map((m) => m.appearance.opacity));
    expect(current).toEqual(authored);

    const stale = new Set(pairs.map(({ m, live }) => boundOpacity(m, { ...live!, stale: true })));
    expect(stale.size).toBe(1);
  });
});
