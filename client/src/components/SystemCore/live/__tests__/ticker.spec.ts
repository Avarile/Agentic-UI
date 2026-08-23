// The formatter, and the rounding that keeps the label cache bounded.
//
// The headline case is 'rounds every unit'. A ticker string is a cache key in
// ../../scene/labels.ts — one canvas, one texture and one material per distinct
// string — so a value that varies continuously asks for a fresh rasterisation on
// every poll, for every module. Rounding is what makes a quiet module produce a
// byte-identical string tick after tick. Nothing else guards that.

import type { SystemCoreUnit, SystemCoreChannel } from 'librechat-data-provider';
import { format, tickerOf, SEPARATOR } from '../ticker';

function channel(over: Partial<SystemCoreChannel> = {}): SystemCoreChannel {
  return {
    id: 'throughput',
    label: 'Commands',
    state: 'ok',
    polarity: 'activity',
    value: 0.5,
    raw: 53.43,
    unit: 'per_second',
    source: 'kvBundle',
    ...over,
  };
}

/** Every unit the wire can carry, so a new one cannot be added without a case. */
const UNITS: SystemCoreUnit[] = [
  'ratio',
  'bytes',
  'seconds',
  'days',
  'count',
  'cores',
  'per_second',
  'boolean',
];

describe('format', () => {
  it('reads each unit in its own terms', () => {
    expect(format(0.6808, 'ratio')).toBe('68%');
    expect(format(37, 'count')).toBe('37');
    expect(format(55.8, 'days')).toBe('56d');
    expect(format(53.43, 'per_second')).toBe('53.4/s');
    expect(format(0.0396, 'cores')).toBe('0.04 cores');
    expect(format(1, 'boolean')).toBe('yes');
    expect(format(0, 'boolean')).toBe('no');
  });

  it('steps bytes up to a unit a person reads', () => {
    expect(format(512, 'bytes')).toBe('512 B');
    expect(format(20_480, 'bytes')).toBe('20.5 KB');
    expect(format(137_957_376, 'bytes')).toBe('138 MB');
    expect(format(345_843_458_048, 'bytes')).toBe('345.8 GB');
  });

  it('reads a sub-second latency in milliseconds and a long one in seconds', () => {
    // probe_duration lives between 1ms and 1s, where seconds rounds to "0".
    expect(format(0.0093, 'seconds')).toBe('9ms');
    expect(format(1.46, 'seconds')).toBe('1.5s');
  });

  it('rounds every unit, so an unchanged module yields an unchanged string', () => {
    // THE CACHE PROPERTY. A value and the same value plus a millionth must format
    // identically, or ../../scene/labels.ts rasterises a fresh canvas per module
    // per poll — the unbounded-codomain failure ../bind.ts exists to prevent.
    for (const unit of UNITS) {
      const raw = 53.43;
      expect(format(raw + 1e-6, unit)).toBe(format(raw, unit));
    }
  });

  it('handles zero and negative values without producing junk', () => {
    for (const unit of UNITS) {
      expect(typeof format(0, unit)).toBe('string');
      expect(format(0, unit)).not.toContain('NaN');
      expect(format(-1, unit)).not.toContain('NaN');
    }
  });
});

describe('tickerOf', () => {
  it('names every reading and separates them', () => {
    const line = tickerOf([
      channel({ label: 'Availability', unit: 'boolean', raw: 1 }),
      channel({ label: 'Commands', unit: 'per_second', raw: 53.43 }),
    ]);
    expect(line).toContain('Availability yes');
    expect(line).toContain('Commands 53.4/s');
    expect(line).toContain(SEPARATOR);
  });

  it('ends with the separator, so a tiled loop has no seam', () => {
    // The band's texture repeats. Without this the last reading would run
    // straight into the first.
    expect(tickerOf([channel()])?.endsWith(SEPARATOR)).toBe(true);
  });

  it('skips a channel that did not resolve', () => {
    const line = tickerOf([
      channel({ label: 'Commands', raw: 53.43 }),
      channel({ label: 'HTTP requests', state: 'missing', raw: null, value: null }),
      channel({ label: 'Server errors', state: 'error', raw: null, value: null }),
    ]);
    expect(line).toContain('Commands');
    expect(line).not.toContain('HTTP requests');
    expect(line).not.toContain('Server errors');
  });

  it('is null when nothing resolved, rather than an empty band of separators', () => {
    expect(tickerOf([])).toBeNull();
    expect(tickerOf([channel({ state: 'missing', raw: null, value: null })])).toBeNull();
  });

  it('uses the raw value rather than the normalized one', () => {
    // `value` has been through scale.ts and is 0..1 for everything, which is right
    // for driving an appearance and useless for telling somebody what is going on.
    const line = tickerOf([
      channel({ label: 'Bytes stored', unit: 'bytes', raw: 1e9, value: 0.5 }),
    ]);
    expect(line).toContain('1 GB');
    expect(line).not.toContain('0.5');
  });
});
