// The binding layer's two guarantees:
//
//   1. effectiveStatus() only ever returns a key of STATUS. That is what bounds
//      the material registry's key space, so it is asserted directly against
//      hostile input rather than trusted.
//   2. boundSpeed() stays inside the schema's own range. Bound values never pass
//      through normalize(), so this test is the only thing standing between a
//      bad reading and a stack turning at 40 rev/s.
//
// Both read their expectations out of ../data/{status,schema} rather than
// restating them, so the assertions cannot drift from the definitions.

import type { Reading } from '../bind';
import type { Module } from '../../data/schema';
import { STATUS_KEYS } from '../../data/status';
import { groupFields, blankModule } from '../../data/schema';
import {
  ratio,
  BINDINGS,
  boundLevel,
  boundSpeed,
  statusGain,
  statusColor,
  boundOpacity,
  effectiveStatus,
  effectiveHealth,
  effectiveProgress,
} from '../bind';

const SPEED = groupFields('motion').speed;

function mod(over: Partial<Module> = {}): Module {
  return { ...blankModule('m', 'running'), ...over } as Module;
}

function reading(over: Partial<Reading> = {}): Reading {
  return {
    status: 'running',
    up: true,
    health: 1,
    load: 0,
    rate: 0,
    stale: false,
    overflow: false,
    ...over,
  };
}

/** Statuses no palette entry exists for, which must never reach a material. */
const UNKNOWN_STATUSES = ['warning', 'DOWN', '', 'controller ', 'proto__', '__proto__'];

/** Values that have historically broken numeric handling somewhere. */
const HOSTILE = [
  NaN,
  Infinity,
  -Infinity,
  0,
  -0,
  -1,
  1,
  1.5,
  -1e308,
  1e308,
  Number.MIN_VALUE,
  Number.EPSILON,
];

describe('effectiveStatus', () => {
  it('returns the authored status untouched when there is no reading', () => {
    // The feature-off contract: an unconfigured deployment must be a no-op.
    for (const status of STATUS_KEYS) {
      expect(effectiveStatus(mod({ status }), null)).toBe(status);
    }
  });

  it('only ever returns a key of STATUS, whatever the reading holds', () => {
    const keys = new Set(STATUS_KEYS);
    for (const authored of STATUS_KEYS) {
      for (const status of [...STATUS_KEYS, ...UNKNOWN_STATUSES]) {
        for (const health of [...HOSTILE, null]) {
          for (const up of [true, false]) {
            for (const stale of [true, false]) {
              const out = effectiveStatus(
                mod({ status: authored }),
                reading({ status, up, stale, health: health as number | null }),
              );
              // The codomain guarantee the material registry depends on.
              expect(keys.has(out)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('treats the controller as an identity, not a health readout', () => {
    // Asserted against a server that disagrees, because the centre ring being
    // white is a fact about the composition rather than about the cluster.
    const controller = mod({ status: 'controller' });
    expect(effectiveStatus(controller, reading({ status: 'fault', up: false, health: 0 }))).toBe(
      'controller',
    );
    expect(effectiveStatus(controller, reading({ status: 'loading', stale: true }))).toBe(
      'controller',
    );
  });

  it('draws the status the server resolved, not one re-derived from health', () => {
    // The server sees which channels are critical; mean health does not. A root
    // filesystem at 96% faults there while averaging out to "degraded" here, and
    // the red is the reading that matters.
    expect(effectiveStatus(mod(), reading({ status: 'fault', health: 0.5 }))).toBe('fault');
    expect(effectiveStatus(mod(), reading({ status: 'loading', health: 1 }))).toBe('loading');
    expect(effectiveStatus(mod(), reading({ status: 'running', health: 0 }))).toBe('running');
  });

  it('falls back to the authored status for a status the palette does not know', () => {
    // Defence for the registry: an unrecognised key would otherwise become an
    // unbounded entry in the material cache.
    for (const status of UNKNOWN_STATUSES) {
      expect(effectiveStatus(mod({ status: 'init' }), reading({ status }))).toBe('init');
    }
  });

  it('does not treat an inherited Object property as a status', () => {
    // STATUS is a plain object literal, so `STATUS['constructor']` is truthy
    // without 'constructor' being a status at all.
    expect(effectiveStatus(mod({ status: 'init' }), reading({ status: 'constructor' }))).toBe(
      'init',
    );
    expect(effectiveStatus(mod({ status: 'init' }), reading({ status: 'toString' }))).toBe('init');
  });
});

describe('statusColor / statusGain', () => {
  it('resolves every known status', () => {
    for (const key of STATUS_KEYS) {
      expect(Number.isInteger(statusColor(key))).toBe(true);
      expect(statusGain(key)).toBeGreaterThan(0);
    }
  });

  it('falls back rather than returning undefined for an unknown status', () => {
    expect(statusColor('nonsense')).toBe(0xffffff);
    expect(statusGain('nonsense')).toBe(1);
  });
});

describe('boundSpeed', () => {
  it('returns the authored speed when there is no reading', () => {
    const m = mod({ motion: { speed: 0.13, phase: null, lane: null } } as Partial<Module>);
    expect(boundSpeed(m, null)).toBe(0.13);
    expect(boundSpeed(m, reading({ rate: null }))).toBe(0.13);
    expect(boundSpeed(m, reading({ rate: NaN }))).toBe(0.13);
  });

  it('stays inside the schema range for every hostile rate', () => {
    const min = SPEED.min as number;
    const max = SPEED.max as number;
    for (const speed of [-0.15, -0.01, 0.08, 1, -1]) {
      for (const rate of HOSTILE) {
        const m = mod({ motion: { speed, phase: null, lane: null } } as Partial<Module>);
        const out = boundSpeed(m, reading({ rate }));
        expect(Number.isFinite(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(min);
        expect(out).toBeLessThanOrEqual(max);
      }
    }
  });

  it('keeps the authored direction', () => {
    const fwd = mod({ motion: { speed: 0.1, phase: null, lane: null } } as Partial<Module>);
    const rev = mod({ motion: { speed: -0.1, phase: null, lane: null } } as Partial<Module>);
    expect(boundSpeed(fwd, reading({ rate: 50 }))).toBeGreaterThan(0);
    expect(boundSpeed(rev, reading({ rate: 50 }))).toBeLessThan(0);
  });

  it('leaves a module authored at rest at rest', () => {
    // Math.sign(0) is 0, so a deliberately parked strip stays parked however
    // busy its service gets.
    const parked = mod({ motion: { speed: 0, phase: null, lane: null } } as Partial<Module>);
    expect(boundSpeed(parked, reading({ rate: 5000 }))).toBe(0);
  });

  it('never goes slower as throughput rises', () => {
    const m = mod({ motion: { speed: 0.4, phase: null, lane: null } } as Partial<Module>);
    const rates = [0, 1, 3.2, 4.9, 52.9, 500, 3073];
    const speeds = rates.map((r) => boundSpeed(m, reading({ rate: r })));
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1]);
    }
  });

  it('is strictly faster with more throughput, until the ceiling', () => {
    // Non-decreasing overall but flat at the top, and the flat part is the point:
    // the factor is capped so one very busy module cannot become the only thing on
    // screen that visibly turns. Anything past the cap is the same speed.
    const m = mod({ motion: { speed: 0.4, phase: null, lane: null } } as Partial<Module>);
    const below = [0, 1, 3.2, 4.9, 52.9].map((r) => boundSpeed(m, reading({ rate: r })));
    for (let i = 1; i < below.length; i++) {
      expect(below[i]).toBeGreaterThan(below[i - 1]);
    }
    expect(boundSpeed(m, reading({ rate: 3073 }))).toBe(boundSpeed(m, reading({ rate: 500 })));
  });

  it('separates the cluster’s real throughputs into distinct speeds', () => {
    // Live values measured off the cluster: apiserver, mongo, mysql, pg, redis, at
    // an authored speed in the range the catalogue actually emits. Five different
    // services must not all read as turning at the same rate.
    const m = mod({ motion: { speed: 0.4, phase: null, lane: null } } as Partial<Module>);
    const seen = new Set(
      [3.2, 4.89, 3.12, 6.14, 52.9].map((r) => boundSpeed(m, reading({ rate: r }))),
    );
    expect(seen.size).toBe(5);
  });

  it('stays within a modest band of the authored speed', () => {
    // The regression that made this a bug report: the rate used to *replace* the
    // authored magnitude, so redis at 52 ops/s landed on 0.561 while its
    // neighbours sat near 0.05 — one strip turning, the rest apparently stopped.
    const authored = 0.4;
    const m = mod({ motion: { speed: authored, phase: null, lane: null } } as Partial<Module>);
    for (const rate of [0, 1, 50, 500, 100000]) {
      const out = boundSpeed(m, reading({ rate }));
      expect(Math.abs(out)).toBeGreaterThanOrEqual(authored * 0.8);
      expect(Math.abs(out)).toBeLessThanOrEqual(authored * 1.6);
    }
  });

  it('keeps the authored spread, so two modules never converge', () => {
    // The authored value is what stops the scene synchronising. Two modules an
    // octave apart in authored speed stay an octave apart under the same load.
    const slow = mod({ motion: { speed: 0.2, phase: null, lane: null } } as Partial<Module>);
    const fast = mod({ motion: { speed: 0.6, phase: null, lane: null } } as Partial<Module>);
    for (const rate of [0, 5, 50, 500]) {
      const a = boundSpeed(slow, reading({ rate }));
      const b = boundSpeed(fast, reading({ rate }));
      // A band rather than an exact 3: the result is rounded to three decimals so
      // an unchanged sample produces an unchanged number, and that rounding moves
      // the ratio very slightly. What matters is that the gap survives at all.
      expect(b / a).toBeGreaterThan(2.9);
      expect(b / a).toBeLessThan(3.1);
    }
  });

  it('is stable across a duplicate sample', () => {
    // The client polls faster than Prometheus scrapes, so identical samples are
    // routine and must produce an identical number or every tick looks new.
    const m = mod({ motion: { speed: 0.1, phase: null, lane: null } } as Partial<Module>);
    expect(boundSpeed(m, reading({ rate: 52.896296296 }))).toBe(
      boundSpeed(m, reading({ rate: 52.896296296 })),
    );
  });

  it('treats a negative rate as zero rather than reversing', () => {
    const m = mod({ motion: { speed: 0.1, phase: null, lane: null } } as Partial<Module>);
    expect(boundSpeed(m, reading({ rate: -50 }))).toBe(boundSpeed(m, reading({ rate: 0 })));
  });
});

describe('ratio', () => {
  it('clamps a finite number into 0..1', () => {
    expect(ratio(0.5)).toBe(0.5);
    expect(ratio(-1)).toBe(0);
    expect(ratio(2)).toBe(1);
    expect(ratio(1e308)).toBe(1);
  });

  it('maps every non-finite input to null rather than clamping it', () => {
    // Infinity is corrupt data, not maximum health. Clamping it to 1 would let
    // a broken reading claim a perfectly healthy module; null means "unknown",
    // which falls back to the authored status instead.
    expect(ratio(null)).toBeNull();
    expect(ratio(undefined)).toBeNull();
    expect(ratio(NaN)).toBeNull();
    expect(ratio(Infinity)).toBeNull();
    expect(ratio(-Infinity)).toBeNull();
  });
});

describe('telemetry fallbacks', () => {
  it('uses the authored telemetry when there is no live value', () => {
    const m = mod();
    m.telemetry.health = 0.8;
    m.telemetry.progress = 0.25;
    expect(effectiveHealth(m, null)).toBe(0.8);
    expect(effectiveProgress(m, null)).toBe(0.25);
    expect(effectiveHealth(m, reading({ health: null }))).toBe(0.8);
    expect(effectiveProgress(m, reading({ load: null }))).toBe(0.25);
  });

  it('prefers the live value when there is one', () => {
    const m = mod();
    m.telemetry.health = 0.8;
    expect(effectiveHealth(m, reading({ health: 0.1 }))).toBe(0.1);
  });

  it('is null when neither side has a value', () => {
    expect(effectiveHealth(mod(), null)).toBeNull();
    expect(effectiveProgress(mod(), null)).toBeNull();
  });
});

describe('boundOpacity', () => {
  it('passes the authored opacity through while the sample is current', () => {
    const m = mod();
    m.appearance.opacity = 0.4;
    expect(boundOpacity(m, null)).toBe(0.4);
    expect(boundOpacity(m, reading())).toBe(0.4);
  });

  it('ghosts a stale module to a fixed value', () => {
    const m = mod();
    m.appearance.opacity = 0.4;
    expect(boundOpacity(m, reading({ stale: true }))).toBe(0.3);
  });

  it('ghosts to the same value whatever the module was authored at', () => {
    // The codomain guarantee for opacity, which is part of the material key: one
    // constant adds one registry entry per colour, where a dim proportional to
    // the authored value would add one per distinct authored opacity.
    const seen = new Set<number | null>();
    for (const authored of [null, 0, 0.15, 0.4, 0.55, 1]) {
      const m = mod();
      m.appearance.opacity = authored;
      seen.add(boundOpacity(m, reading({ stale: true })));
    }
    expect(seen.size).toBe(1);
  });

  it('recovers the authored opacity when the sample comes back', () => {
    const m = mod();
    m.appearance.opacity = 0.4;
    expect(boundOpacity(m, reading({ stale: true }))).toBe(0.3);
    expect(boundOpacity(m, reading({ stale: false }))).toBe(0.4);
  });

  it('leaves an unset opacity unset while current, so the material key is unchanged', () => {
    const m = mod();
    m.appearance.opacity = null;
    expect(boundOpacity(m, reading())).toBeNull();
  });
});

describe('BINDINGS', () => {
  it('addresses paths that exist in the schema', () => {
    // A typo here would silently leave a field editable and let a hand edit
    // fight the poll, which is the exact failure the lock exists to prevent.
    for (const path of Object.keys(BINDINGS)) {
      const parts = path.split('.');
      if (parts.length === 1) {
        expect(blankModule('m', 'running')).toHaveProperty(parts[0]);
        continue;
      }
      expect(groupFields(parts[0])).toHaveProperty(parts[1]);
    }
  });

  it('names a real Reading channel for every path', () => {
    const channels = new Set(Object.keys(reading()));
    for (const b of Object.values(BINDINGS)) {
      expect(channels.has(b.channel)).toBe(true);
    }
  });
});

describe('boundLevel', () => {
  /** A module authored at a known level. */
  function atLevel(level: number): Module {
    const m = mod();
    m.audio.level = level;
    return m;
  }

  it('returns the authored level when there is nothing to go on', () => {
    expect(boundLevel(atLevel(0.7), null)).toBe(0.7);
    expect(boundLevel(atLevel(0.7), reading({ health: null }))).toBe(0.7);
    expect(boundLevel(atLevel(0.7), reading({ health: NaN }))).toBe(0.7);
  });

  it('never exceeds the authored level', () => {
    // The safety property. audio.ts notes that overlapping voices sum, so the
    // arrangement's loudness has to be a ceiling the cluster cannot push past —
    // otherwise a degrading cluster becomes an alarm nobody can sit next to.
    for (const authored of [0, 0.25, 0.5, 0.7, 1]) {
      for (const health of [...HOSTILE, null]) {
        const out = boundLevel(atLevel(authored), reading({ health: health as number | null }));
        expect(out).toBeLessThanOrEqual(authored);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(out)).toBe(true);
      }
    }
  });

  it('is loudest at full health and quietest at none', () => {
    const m = atLevel(1);
    expect(boundLevel(m, reading({ health: 1 }))).toBe(1);
    expect(boundLevel(m, reading({ health: 0 }))).toBe(0.4);
  });

  it('goes quieter as health falls, never louder', () => {
    const m = atLevel(1);
    let previous = Infinity;
    for (const health of [1, 0.8, 0.6, 0.4, 0.2, 0]) {
      const out = boundLevel(m, reading({ health }));
      expect(out).toBeLessThanOrEqual(previous);
      previous = out;
    }
  });

  it('leaves a silent module silent', () => {
    // Level 0 is how a module is deliberately muted; health must not un-mute it.
    for (const health of [0, 0.5, 1]) {
      expect(boundLevel(atLevel(0), reading({ health }))).toBe(0);
    }
  });

  it('is stable across a duplicate sample', () => {
    // A duplicate poll tick must not write a new AudioParam target.
    const m = atLevel(0.7);
    expect(boundLevel(m, reading({ health: 0.8123456 }))).toBe(
      boundLevel(m, reading({ health: 0.8123456 })),
    );
  });
});
