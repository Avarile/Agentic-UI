// Invariants over the catalogue.
//
// The load-bearing group is the placement bounds. The client's `normalize()`
// silently rejects a module whose geometry falls outside the ranges declared in
// `client/src/components/SystemCore/data/schema.ts`, so a catalogue entry that
// drifts out of range does not throw anywhere — it just quietly stops appearing
// in the scene. These are those ranges, restated, because this package cannot
// import from the client.

import {
  CATALOG,
  CATALOG_BY_ID,
  MAX_OVERFLOW,
  catalogShape,
  placementFor,
  overflowPlacement,
  speedFor,
  speedBand,
} from './catalog';
import type { SystemCorePlacement } from 'librechat-data-provider';
import type { CatalogEntry } from './catalog';
import { QUERIES, queryById } from './queries';

/** `ID_RE` from the client's schema.ts. An id it rejects is a module it drops. */
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The inclusive bounds `SPEC` declares for each placement field.
 *
 * Kept as one table so a drift shows up as a single failing row rather than as a
 * scattering of magic numbers.
 */
const BOUNDS = {
  radius: { min: 0.01, max: 8 },
  y: { min: -8, max: 8 },
  arc: { min: 1, max: 360 },
  band: { min: 0.002, max: 2 },
  speed: { min: -10, max: 10 },
  level: { min: 0, max: 1 },
  hz: { min: 20, max: 400 },
  lane: { min: 0, max: 4 },
} as const;

/** The mainframe's cap rings. The curated ladder has to stay inside them. */
const FRAME_Y = 1.55;

/**
 * Every way a placement falls outside what the client's schema will accept.
 *
 * Returns the violations rather than asserting them, so a failure names all of
 * them at once — with the field and the offending number — instead of stopping
 * at whichever bound happened to trip first.
 */
function violations(where: string, placement: SystemCorePlacement): string[] {
  const found: string[] = [];
  const check = (field: string, value: number | null, bounds: { min: number; max: number }) => {
    if (value == null) {
      return;
    }
    if (!Number.isFinite(value)) {
      found.push(`${where}: ${field} is not finite (${value})`);
      return;
    }
    if (value < bounds.min || value > bounds.max) {
      found.push(`${where}: ${field}=${value} outside ${bounds.min}..${bounds.max}`);
    }
  };

  check('radius', placement.radius, BOUNDS.radius);
  check('y', placement.y, BOUNDS.y);
  check('arc', placement.arc, BOUNDS.arc);
  check('band', placement.band, BOUNDS.band);
  check('speed', placement.speed, BOUNDS.speed);
  check('level', placement.level, BOUNDS.level);
  check('hz', placement.hz, BOUNDS.hz);
  check('lane', placement.lane, BOUNDS.lane);
  check('order', placement.order, { min: -1e9, max: 1e9 });

  if (placement.lane != null && !Number.isInteger(placement.lane)) {
    found.push(`${where}: lane=${placement.lane} is not an integer`);
  }
  return found;
}

describe('identity', () => {
  it('gives every entry an id the client will accept', () => {
    for (const entry of CATALOG) {
      expect(entry.id).toMatch(ID_RE);
    }
  });

  it('has unique ids, and indexes all of them', () => {
    const ids = CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CATALOG_BY_ID.size).toBe(CATALOG.length);
    for (const entry of CATALOG) {
      expect(CATALOG_BY_ID.get(entry.id)).toBe(entry);
    }
  });

  it('gives every entry a label, a group and a description', () => {
    for (const entry of CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.group.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('orders entries uniquely and ascending, so the panel list is deterministic', () => {
    const orders = CATALOG.map((e) => e.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect([...orders]).toEqual([...orders].sort((a, b) => a - b));
  });

  it('points every dependsOn at an entry that exists', () => {
    for (const entry of CATALOG) {
      for (const dep of entry.dependsOn) {
        expect(CATALOG_BY_ID.has(dep)).toBe(true);
      }
    }
  });

  it('has exactly one controller, and only it claims the controller status', () => {
    const controllers = CATALOG.filter((e) => e.isController === true);
    expect(controllers).toHaveLength(1);
    expect(controllers[0].authoredStatus).toBe('controller');
    for (const entry of CATALOG) {
      if (entry.isController !== true) {
        expect(entry.authoredStatus).not.toBe('controller');
      }
    }
  });
});

describe('placement', () => {
  it('keeps every curated module inside the schema ranges, at any catalogue size', () => {
    // Three sizes, because `y` is derived from index and count: the degenerate
    // one, today's, and one large enough to stand in for a cluster that grew a
    // lot of probes.
    const found: string[] = [];
    for (const count of [1, CATALOG.length, 80]) {
      for (let index = 0; index < count; index += 1) {
        const entry = CATALOG[Math.min(index, CATALOG.length - 1)];
        found.push(
          ...violations(`${entry.id} at ${index}/${count}`, placementFor(entry, index, count)),
        );
      }
    }
    expect(found).toEqual([]);
  });

  it('keeps the curated ladder inside the mainframe cap rings', () => {
    for (let index = 0; index < CATALOG.length; index += 1) {
      const placement = placementFor(CATALOG[index], index, CATALOG.length);
      expect(Math.abs(placement.y)).toBeLessThanOrEqual(FRAME_Y);
    }
  });

  it('descends the ladder monotonically', () => {
    const plain = CATALOG.filter((e) => e.isController !== true);
    let previous = Infinity;
    plain.forEach((entry, index) => {
      const { y } = placementFor(entry, index, plain.length);
      expect(y).toBeLessThanOrEqual(previous);
      previous = y;
    });
  });

  it('sits the single-module case at the top rather than dividing by zero', () => {
    const placement = placementFor(CATALOG[1], 0, 1);
    expect(Number.isFinite(placement.y)).toBe(true);
  });

  it('gives the controller its own ring, wherever it lands in the list', () => {
    const controller = CATALOG.find((e) => e.isController === true) as CatalogEntry;
    const first = placementFor(controller, 0, CATALOG.length);
    const later = placementFor(controller, 7, 400);
    expect(first).toEqual(later);
    expect(first.order).toBe(controller.order);
    // Wide, slow and outside the stack: the centre reads as the frame, not as a
    // module in it.
    expect(first.radius).toBeGreaterThan(2);
  });

  it('keeps every overflow slot inside the schema ranges, up to the hard cap', () => {
    // Note this ladder is allowed *outside* the mainframe frame, unlike the
    // curated one: at the cap it reaches y ≈ -6.1, well below the scene. That is
    // deliberate — the overflow lane is a safety valve, and 64 unrecognised
    // targets is already a misconfiguration worth noticing.
    const found: string[] = [];
    for (let index = 0; index < MAX_OVERFLOW; index += 1) {
      found.push(...violations(`overflow ${index}`, overflowPlacement(index, 1_000 + index)));
    }
    expect(found).toEqual([]);
  });

  it('stacks overflow downward and alternates its direction', () => {
    const first = overflowPlacement(0, 1_000);
    const second = overflowPlacement(1, 1_001);
    expect(second.y).toBeLessThan(first.y);
    expect(Math.sign(second.speed)).toBe(-Math.sign(first.speed));
  });

  it('rounds y to three places, so a placement is stable under a re-serialize', () => {
    for (let index = 0; index < CATALOG.length; index += 1) {
      const { y } = placementFor(CATALOG[index], index, CATALOG.length);
      expect(y).toBe(Math.round(y * 1000) / 1000);
    }
  });
});

describe('channel bindings', () => {
  const bindings = CATALOG.flatMap((entry) => entry.channels.map((c) => ({ entry, c })));

  it('name a query that exists', () => {
    for (const { c } of bindings) {
      expect(queryById(c.select.query)).toBeDefined();
    }
  });

  it('only ask for a signal the named bundle actually declares', () => {
    // A typo here is invisible at runtime: the match finds nothing and the
    // channel reads 'missing' forever, exactly as it would for a metric that is
    // genuinely not scraped.
    for (const { entry, c } of bindings) {
      const signal = c.select.match.signal;
      if (signal == null) {
        continue;
      }
      const def = queryById(c.select.query);
      expect(def?.shape).toBe('bundle');
      expect(def?.signals ?? []).toContain(signal);
      expect(`${entry.id}/${c.id}`).toBeTruthy();
    }
  });

  it('never ask a labelled query for a signal', () => {
    for (const { c } of bindings) {
      if (queryById(c.select.query)?.shape === 'labelled') {
        expect(c.select.match.signal).toBeUndefined();
      }
    }
  });

  it('give each entry distinct channel ids', () => {
    // `channelValue` takes the first ok match by id, so a duplicate would make
    // which reading reaches the panel depend on declaration order.
    for (const entry of CATALOG) {
      const ids = entry.channels.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('only mark a health channel as critical', () => {
    // A critical activity channel would make the module fault for being idle.
    for (const { c } of bindings) {
      if (c.critical === true) {
        expect(c.polarity).toBe('health');
      }
    }
  });

  it('carry a well-formed scale rule', () => {
    for (const { c } of bindings) {
      const scale = c.scale;
      if (scale.kind === 'linear' || scale.kind === 'log') {
        expect(scale.max).toBeGreaterThan(0);
      }
      if (scale.kind === 'band') {
        expect(scale.good).not.toBe(scale.bad);
      }
    }
  });

  it('give every channel a label and a unit', () => {
    for (const { c } of bindings) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.unit.length).toBeGreaterThan(0);
    }
  });

  it('only resolve `self` on an entry that has a target to resolve against', () => {
    // Without a target the match narrows to {}, which matches every row — so
    // this entry would read some unrelated service's number as its own.
    for (const { entry, c } of bindings) {
      if (c.select.match.self === true) {
        expect(entry.target).not.toBeNull();
      }
    }
  });
});

describe('the registry earns its keep', () => {
  /** Query ids the catalogue reaches, by a binding or by an expansion. */
  function referenced(): Set<string> {
    const used = new Set<string>();
    for (const entry of CATALOG) {
      for (const c of entry.channels) {
        used.add(c.select.query);
      }
      if (entry.expand != null) {
        used.add(entry.expand.query);
      }
    }
    return used;
  }

  it('reads every query it pays for', () => {
    // Each query is an HTTP round trip on every refresh. One nothing reads is a
    // fifteenth of the upstream budget spent on nothing at all.
    const used = referenced();
    const consumedByTheAssembler = new Set(['scrapeAge']);
    const orphans = QUERIES.map((q) => q.id).filter(
      (id) => !used.has(id) && !consumedByTheAssembler.has(id),
    );
    expect(orphans).toEqual([]);
  });

  it('reads every bundle signal it declares', () => {
    const asked = new Set<string>();
    for (const entry of CATALOG) {
      for (const c of entry.channels) {
        if (c.select.match.signal != null) {
          asked.add(`${c.select.query}/${c.select.match.signal}`);
        }
      }
    }
    const orphans: string[] = [];
    for (const def of QUERIES) {
      for (const signal of def.signals ?? []) {
        if (!asked.has(`${def.id}/${signal}`)) {
          orphans.push(`${def.id}/${signal}`);
        }
      }
    }
    expect(orphans).toEqual([]);
  });

  it('uses scrapeAge, even though no binding names it', () => {
    // Asserted rather than assumed, because the exemption above is what lets
    // that query escape the orphan check.
    expect(QUERIES.some((q) => q.id === 'scrapeAge')).toBe(true);
  });
});

describe('expansion', () => {
  it('is bounded, and expands on a query that exists', () => {
    for (const entry of CATALOG) {
      const expand = entry.expand;
      if (expand == null) {
        continue;
      }
      expect(queryById(expand.query)).toBeDefined();
      expect(expand.max).toBeGreaterThan(0);
      expect(expand.max).toBeLessThanOrEqual(MAX_OVERFLOW);
      expect(['instance', 'pod']).toContain(expand.label);
      // An expanded entry's own id is a prefix, never a module of its own, so it
      // must not also claim to be a target.
      expect(entry.target).toBeNull();
    }
  });

  it('caps discovery well below anything that could flood the scene', () => {
    expect(MAX_OVERFLOW).toBe(64);
  });
});

describe('catalogShape', () => {
  it('is stable across calls', () => {
    expect(catalogShape()).toBe(catalogShape());
  });

  it('mentions every entry, so an added or removed module changes it', () => {
    const shape = catalogShape();
    for (const entry of CATALOG) {
      expect(shape).toContain(entry.id);
    }
  });

  it('is built only from things a sample cannot change', () => {
    // The client keys its reconcile on this. If a reading could move it, every
    // poll would rebuild the module list and the scene would restart its
    // animation twice a minute.
    const shape = catalogShape();
    for (const entry of CATALOG) {
      expect(shape).toContain(`${entry.id}:${entry.order}:${entry.radius}`);
    }
  });
});

describe('speedFor', () => {
  it('keeps every module inside the declared band', () => {
    // Read off `speedBand` rather than asserting a period in seconds. How fast the
    // scene should turn is an aesthetic call made looking at a real screen, and it
    // has already been retuned once; what a test can usefully hold is that every
    // module lands inside whatever band the constants currently declare, so a
    // hand-authored outlier cannot produce a strip that laps the stack.
    const { slowest, fastest } = speedBand();
    for (const entry of CATALOG) {
      if (entry.isController === true) {
        continue;
      }
      const speed = Math.abs(speedFor(entry.id, entry.speed, false));
      expect(speed).toBeGreaterThanOrEqual(slowest);
      expect(speed).toBeLessThanOrEqual(fastest);
    }
  });

  it('turns the centre ring slower than anything it frames', () => {
    // The controller is the frame the stack sits inside, not a module competing
    // with it, so it gets its own slower gain. Asserted as a relationship rather
    // than a number: the two gains can be retuned independently, but the centre
    // must never end up racing the things around it.
    const controller = CATALOG.find((e) => e.isController === true) as CatalogEntry;
    const centre = Math.abs(speedFor(controller.id, controller.speed, false, true));

    expect(centre).toBeLessThanOrEqual(speedBand().fastest);
    expect(centre).toBeLessThan(Math.abs(speedFor(controller.id, controller.speed, false)));
    // And slower than the busiest curated module the catalogue can produce.
    const fastestOther = Math.max(
      ...CATALOG.filter((e) => e.isController !== true).map((e) =>
        Math.abs(speedFor(e.id, e.speed, false)),
      ),
    );
    expect(centre).toBeLessThan(fastestOther);
  });

  it('keeps the direction the catalogue authored', () => {
    for (const entry of CATALOG) {
      expect(Math.sign(speedFor(entry.id, entry.speed, false))).toBe(Math.sign(entry.speed));
    }
  });

  it('keeps the catalogue in both directions, so the stack never synchronises', () => {
    const speeds = CATALOG.map((e) => speedFor(e.id, e.speed, false));
    expect(speeds.filter((s) => s < 0).length).toBeGreaterThan(3);
    expect(speeds.filter((s) => s > 0).length).toBeGreaterThan(3);
  });

  it('is deterministic, because a strip keyed by id must not change speed', () => {
    // A speed that moved between snapshots would be a visible stutter on every
    // poll, and `Math.random` here would do exactly that.
    for (const entry of CATALOG) {
      expect(speedFor(entry.id, entry.speed, true)).toBe(speedFor(entry.id, entry.speed, true));
    }
  });

  it('gives each expanded instance its own speed and direction', () => {
    // The most visible half of the bug: `placementFor` varied `y` per probe but
    // copied `speed` off the entry, so ten blackbox probes came out as ten rings
    // turning in lockstep — the single clearest way to make a scene look dead.
    const ids = Array.from({ length: 10 }, (_u, i) => `probe.endpoint-${i}`);
    const speeds = ids.map((id) => speedFor(id, 0.09, true));

    expect(new Set(speeds).size).toBe(speeds.length);
    expect(speeds.some((s) => s < 0)).toBe(true);
    expect(speeds.some((s) => s > 0)).toBe(true);
    const { slowest, fastest } = speedBand();
    for (const speed of speeds) {
      expect(Math.abs(speed)).toBeGreaterThanOrEqual(slowest);
      expect(Math.abs(speed)).toBeLessThanOrEqual(fastest);
    }
  });

  it('holds a hand-authored outlier inside the band', () => {
    // A stray large value must not produce a strip that laps the whole stack, and a
    // stray tiny one must not produce a strip that never moves.
    const { slowest, fastest } = speedBand();
    expect(Math.abs(speedFor('x', 40, false))).toBe(fastest);
    expect(Math.abs(speedFor('x', 0.0001, false))).toBe(slowest);
  });

  it('scales the whole scene by one dial', () => {
    // The gain is proportional, so retuning it moves every module together and
    // preserves the spread that stops the stack synchronising. This is what makes
    // "halve everything" a one-constant change rather than 19 edits.
    const ratios = CATALOG.filter((e) => e.isController !== true).map(
      (e) => Math.abs(speedFor(e.id, e.speed, false)) / Math.abs(e.speed),
    );
    const withinBand = CATALOG.filter(
      (e) => e.isController !== true && Math.abs(e.speed) > 0.04 && Math.abs(e.speed) < 0.15,
    );
    expect(withinBand.length).toBeGreaterThan(5);
    expect(new Set(ratios.map((r) => r.toFixed(2))).size).toBeLessThanOrEqual(3);
  });

  it('stays inside the schema bounds for every entry', () => {
    for (const entry of CATALOG) {
      for (const expanded of [true, false]) {
        const speed = speedFor(entry.id, entry.speed, expanded);
        expect(speed).toBeGreaterThanOrEqual(BOUNDS.speed.min);
        expect(speed).toBeLessThanOrEqual(BOUNDS.speed.max);
      }
    }
  });
});

describe('placement carries the computed speed', () => {
  it('gives two instances of one expanded entry different speeds', () => {
    const probe = CATALOG.find((e) => e.expand != null) as CatalogEntry;
    const a = placementFor(probe, 0, 12, 'probe.one', true);
    const b = placementFor(probe, 1, 12, 'probe.two', true);
    expect(a.speed).not.toBe(b.speed);
  });

  it('gives one curated entry the same speed wherever it lands', () => {
    const mongo = CATALOG.find((e) => e.id === 'mongo') as CatalogEntry;
    expect(placementFor(mongo, 3, 28, 'mongo', false).speed).toBe(
      placementFor(mongo, 9, 40, 'mongo', false).speed,
    );
  });

  it('keeps the overflow lane alternating rather than hashed', () => {
    // The alternation is the signal for a row of unrecognised targets, so it is
    // deliberately not scrambled per instance the way probes are.
    const first = overflowPlacement(0, 1_000);
    const second = overflowPlacement(1, 1_001);
    expect(Math.sign(second.speed)).toBe(-Math.sign(first.speed));
    expect(Math.abs(first.speed)).toBe(Math.abs(second.speed));
  });
});
