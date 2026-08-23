// The arithmetic, and the status truth table.
//
// The scaling cases use the numbers the live cluster actually returned (see
// __fixtures__/live.json) rather than round ones, because the interesting
// question about `band` and `log` is what they do to a real reading, not what
// they do to 0.5.

import type { SystemCoreChannel } from 'librechat-data-provider';
import type { ScaleRule } from './scale';
import {
  normalize,
  stateFor,
  isFaultLevel,
  deriveHealth,
  deriveStatus,
  channelRaw,
  channelValue,
} from './scale';

function channel(over: Partial<SystemCoreChannel> = {}): SystemCoreChannel {
  return {
    id: 'load',
    label: 'CPU',
    state: 'ok',
    polarity: 'health',
    value: 1,
    raw: 1,
    unit: 'ratio',
    source: 'up',
    ...over,
  };
}

describe('normalize', () => {
  it.each<[string, ScaleRule, number, number]>([
    ['node cpu, already a ratio', { kind: 'ratio' }, 0.039768518518547236, 0.039768518518547236],
    ['node memory, already a ratio', { kind: 'ratio' }, 0.6466202050684475, 0.6466202050684475],
    ['load average against 8 cores', { kind: 'linear', max: 8 }, 0.21, 0.02625],
    [
      'apiserver 3.14 req/s on a log to 200',
      { kind: 'log', max: 200 },
      3.1444444444444444,
      0.26809,
    ],
    ['redis 52 ops/s on a log to 5000', { kind: 'log', max: 5000 }, 52.05555555555556, 0.46626],
    ['mongo connections against 200', { kind: 'linear', max: 200 }, 9, 0.045],
    ['minio health as a flag', { kind: 'bool' }, 1, 1],
    ['no unavailable replicas, inverted', { kind: 'bool', invert: true }, 0, 1],
    ['one unavailable replica, inverted', { kind: 'bool', invert: true }, 1, 0],
    ['28% of the root disk used', { kind: 'band', good: 0.5, bad: 0.95 }, 0.2782959549546682, 1],
    ['78% of the root disk used', { kind: 'band', good: 0.5, bad: 0.95 }, 0.78, 0.3778],
    ['56 days of certificate left', { kind: 'band', good: 60, bad: 7 }, 56.1, 0.9264],
    ['a 381ms probe', { kind: 'band', good: 0.1, bad: 1 }, 0.381, 0.6878],
  ])('scales %s', (_what, rule, raw, expected) => {
    expect(normalize(rule, raw)).toBeCloseTo(expected, 4);
  });

  it.each<[string, number | null]>([
    ['null', null],
    ['NaN', NaN],
    ['positive infinity', Infinity],
    ['negative infinity', -Infinity],
  ])('reports %s as null rather than as a number', (_what, raw) => {
    // Infinity is corrupt data, not a maximal measurement. Clamping it to 1
    // would let a broken exporter report perfect health.
    for (const rule of [
      { kind: 'ratio' },
      { kind: 'linear', max: 10 },
      { kind: 'log', max: 10 },
      { kind: 'bool' },
      { kind: 'band', good: 1, bad: 0 },
    ] as ScaleRule[]) {
      expect(normalize(rule, raw)).toBeNull();
    }
  });

  it('clamps into 0..1 from either side', () => {
    expect(normalize({ kind: 'ratio' }, -0.5)).toBe(0);
    expect(normalize({ kind: 'ratio' }, 1.5)).toBe(1);
    expect(normalize({ kind: 'linear', max: 10 }, 1e308)).toBe(1);
    expect(normalize({ kind: 'linear', max: 10 }, -5)).toBe(0);
    expect(normalize({ kind: 'band', good: 60, bad: 7 }, 1e6)).toBe(1);
    expect(normalize({ kind: 'band', good: 60, bad: 7 }, -1e6)).toBe(0);
  });

  it('never returns a NaN, whatever the rule and the reading', () => {
    const rules: ScaleRule[] = [
      { kind: 'ratio' },
      { kind: 'linear', max: 8 },
      { kind: 'linear', max: 0 },
      { kind: 'log', max: 200 },
      { kind: 'log', max: 0 },
      { kind: 'log', max: -1 },
      { kind: 'bool' },
      { kind: 'bool', invert: true },
      { kind: 'band', good: 0.5, bad: 0.95 },
      { kind: 'band', good: 3, bad: 3 },
    ];
    const raws = [0, -0, 1, -1, 0.5, 1e-300, 1e308, -1e308, 42, 1_000_000];
    for (const rule of rules) {
      for (const raw of raws) {
        const out = normalize(rule, raw);
        if (out !== null) {
          expect(Number.isFinite(out)).toBe(true);
          expect(out).toBeGreaterThanOrEqual(0);
          expect(out).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('refuses a degenerate rule rather than dividing by zero', () => {
    expect(normalize({ kind: 'linear', max: 0 }, 5)).toBeNull();
    expect(normalize({ kind: 'log', max: 0 }, 5)).toBeNull();
    expect(normalize({ kind: 'log', max: -1 }, 5)).toBeNull();
    expect(normalize({ kind: 'band', good: 3, bad: 3 }, 3)).toBeNull();
  });

  it('floors a negative reading before taking a log', () => {
    expect(normalize({ kind: 'log', max: 200 }, -5)).toBe(0);
  });

  it('treats any non-zero as true, including a negative', () => {
    expect(normalize({ kind: 'bool' }, -1)).toBe(1);
    expect(normalize({ kind: 'bool' }, 0)).toBe(0);
    expect(normalize({ kind: 'bool' }, -0)).toBe(0);
  });

  it('reads a band the same way in both directions', () => {
    // The whole reason `band` has no inverted twin: "more is better" and "less
    // is better" are the same rule with good and bad swapped.
    const moreIsBetter: ScaleRule = { kind: 'band', good: 60, bad: 7 };
    const lessIsBetter: ScaleRule = { kind: 'band', good: 0.1, bad: 1 };
    expect(normalize(moreIsBetter, 60)).toBe(1);
    expect(normalize(moreIsBetter, 7)).toBe(0);
    expect(normalize(lessIsBetter, 0.1)).toBe(1);
    // Object.is-equal to +0, not to -0: a reading sitting exactly on `bad`
    // divides to a negative zero, and the clamp is what canonicalizes it.
    expect(normalize(lessIsBetter, 1)).toBe(0);
    expect(Object.is(normalize(lessIsBetter, 1), 0)).toBe(true);
  });

  it('is monotonic in the reading, for every scale that should be', () => {
    for (const rule of [
      { kind: 'ratio' },
      { kind: 'linear', max: 100 },
      { kind: 'log', max: 100 },
      { kind: 'band', good: 100, bad: 0 },
    ] as ScaleRule[]) {
      let previous = -1;
      for (const raw of [0, 1, 5, 20, 50, 99, 100, 200]) {
        const out = normalize(rule, raw);
        expect(out).not.toBeNull();
        expect(out as number).toBeGreaterThanOrEqual(previous);
        previous = out as number;
      }
    }
  });
});

describe('deriveHealth', () => {
  it('averages the health channels that resolved', () => {
    expect(
      deriveHealth([
        channel({ polarity: 'health', value: 1 }),
        channel({ polarity: 'health', value: 0.5 }),
      ]),
    ).toBe(0.75);
  });

  it('ignores activity channels entirely', () => {
    // A busy service is not an unwell one. Folding throughput into health would
    // make the scene report load as illness.
    expect(
      deriveHealth([
        channel({ polarity: 'health', value: 1 }),
        channel({ polarity: 'activity', value: 0 }),
      ]),
    ).toBe(1);
  });

  it('ignores channels that did not resolve', () => {
    expect(
      deriveHealth([
        channel({ polarity: 'health', value: 1 }),
        channel({ polarity: 'health', state: 'error', value: null }),
        channel({ polarity: 'health', state: 'missing', value: null }),
      ]),
    ).toBe(1);
  });

  it('is null when nothing to average, rather than zero', () => {
    expect(deriveHealth([])).toBeNull();
    expect(deriveHealth([channel({ polarity: 'activity', value: 1 })])).toBeNull();
    expect(deriveHealth([channel({ state: 'error', value: null })])).toBeNull();
    // The distinction that matters: "no health signal" must not read as "zero
    // health", or an unmonitored service looks like a dead one.
    expect(deriveHealth([channel({ value: 0 })])).toBe(0);
  });
});

describe('channelValue and channelRaw', () => {
  const channels = [
    channel({ id: 'load', state: 'error', value: null, raw: null }),
    channel({ id: 'load', value: 0.25, raw: 2.5 }),
    channel({ id: 'throughput', value: 0.5, raw: 52 }),
  ];

  it('skips a channel that did not resolve and takes the first that did', () => {
    expect(channelValue(channels, 'load')).toBe(0.25);
    expect(channelRaw(channels, 'load')).toBe(2.5);
  });

  it('returns the raw reading unscaled, for the panel readout', () => {
    expect(channelRaw(channels, 'throughput')).toBe(52);
    expect(channelValue(channels, 'throughput')).toBe(0.5);
  });

  it('is null for an id that is not there', () => {
    expect(channelValue(channels, 'latency')).toBeNull();
    expect(channelRaw(channels, 'latency')).toBeNull();
  });
});

describe('stateFor', () => {
  it('separates could-not-ask from nothing-to-say', () => {
    expect(stateFor(true, null)).toBe('error');
    expect(stateFor(true, 0.5)).toBe('error');
    expect(stateFor(false, null)).toBe('missing');
    expect(stateFor(false, 0)).toBe('ok');
    expect(stateFor(false, 0.5)).toBe('ok');
  });
});

describe('isFaultLevel', () => {
  it('is false for an absent reading', () => {
    expect(isFaultLevel(null)).toBe(false);
  });

  it('trips below a third', () => {
    expect(isFaultLevel(0)).toBe(true);
    expect(isFaultLevel(0.33)).toBe(true);
    expect(isFaultLevel(0.34)).toBe(false);
    expect(isFaultLevel(1)).toBe(false);
  });
});

describe('deriveStatus', () => {
  const base = {
    authored: 'running',
    isController: false,
    up: true,
    stale: false,
    health: 1,
    anyResolved: true,
    anyErrored: false,
    criticalFault: false,
  } as const;

  it('is controller for the centre, whatever it reads', () => {
    // Identity, not health: the centre ring is white because of what it is.
    expect(deriveStatus({ ...base, isController: true })).toBe('controller');
    expect(deriveStatus({ ...base, isController: true, up: false, health: 0 })).toBe('controller');
    expect(deriveStatus({ ...base, isController: true, stale: true })).toBe('controller');
  });

  it('is fault when the target is definitively down', () => {
    expect(deriveStatus({ ...base, up: false })).toBe('fault');
  });

  it('ranks down above stale, because it says more', () => {
    expect(deriveStatus({ ...base, up: false, stale: true })).toBe('fault');
  });

  it('is fault when a critical channel bottoms out', () => {
    expect(deriveStatus({ ...base, criticalFault: true })).toBe('fault');
  });

  it('is loading when the sample is stale', () => {
    expect(deriveStatus({ ...base, stale: true })).toBe('loading');
  });

  it('is loading — not init — when nothing resolved because nothing could be asked', () => {
    // The bug this pins: during a total outage every channel errors, and
    // returning 'init' would paint the whole scene in the green of a service
    // that has only just been catalogued.
    expect(deriveStatus({ ...base, anyResolved: false, anyErrored: true, health: null })).toBe(
      'loading',
    );
  });

  it('is init when nothing resolved and nothing failed either', () => {
    // Catalogued, asked about, genuinely not being scraped yet.
    expect(deriveStatus({ ...base, anyResolved: false, anyErrored: false, health: null })).toBe(
      'init',
    );
  });

  it('falls back to the authored status when there is no health signal', () => {
    expect(deriveStatus({ ...base, health: null, authored: 'running' })).toBe('running');
    expect(deriveStatus({ ...base, health: null, authored: 'init' })).toBe('init');
  });

  it.each([
    [0, 'fault'],
    [0.33, 'fault'],
    [0.34, 'degraded'],
    [0.5, 'degraded'],
    [0.66, 'degraded'],
    [0.67, 'running'],
    [1, 'running'],
  ])('maps health %f to %s', (health, expected) => {
    expect(deriveStatus({ ...base, health })).toBe(expected);
  });

  it('only ever returns a status the scene knows how to draw', () => {
    // Restated rather than imported: this package cannot reach the client's
    // data/status.ts, which is the real definition. The client asserts the same
    // closure against its own STATUS_KEYS, so the two cannot silently diverge —
    // a status added there and not here fails that test instead of this one.
    const known = new Set(['running', 'degraded', 'fault', 'init', 'loading', 'controller']);
    for (const isController of [true, false]) {
      for (const up of [true, false, null]) {
        for (const stale of [true, false]) {
          for (const anyResolved of [true, false]) {
            for (const anyErrored of [true, false]) {
              for (const criticalFault of [true, false]) {
                for (const health of [null, 0, 0.5, 1, NaN]) {
                  expect(
                    known.has(
                      deriveStatus({
                        authored: 'running',
                        isController,
                        up,
                        stale,
                        health,
                        anyResolved,
                        anyErrored,
                        criticalFault,
                      }),
                    ),
                  ).toBe(true);
                }
              }
            }
          }
        }
      }
    }
  });
});
