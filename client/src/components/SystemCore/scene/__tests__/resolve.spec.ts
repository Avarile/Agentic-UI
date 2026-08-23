// The one place a Module becomes numbers for the scene.
//
// Most of what resolve.ts does is delegate to ../live/bind.ts, which has its own
// suite. What is worth pinning here is the seam itself: that a reading reaches
// the spec at all, and that the absence of one leaves the authored arrangement
// exactly as it was — the feature-off path most deployments are on.

import type { SystemCoreChannel } from 'librechat-data-provider';
import type { Reading } from '../../live/bind';
import { loadFixture } from '../../data/fixture';
import { stripSpec, newRuntime } from '../resolve';

const MODULE = loadFixture().modules[0];
const RUNTIME = newRuntime(MODULE, 0);

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

function reading(over: Partial<Reading> = {}): Reading {
  return {
    status: 'running',
    up: true,
    health: 0.9,
    load: 0.4,
    rate: 52,
    stale: false,
    overflow: false,
    channels: [],
    ...over,
  };
}

describe('stripSpec', () => {
  it('carries no readout when the poll is off', () => {
    // Null, not an empty string: the strip skips the mesh entirely rather than
    // drawing an empty window, and the label cache is never asked for anything.
    expect(stripSpec(MODULE, RUNTIME, null).ticker).toBeNull();
  });

  it('carries no readout when a module reported nothing that resolved', () => {
    const spec = stripSpec(MODULE, RUNTIME, reading({ channels: [] }));
    expect(spec.ticker).toBeNull();
  });

  it('turns the resolved channels into a line for the band', () => {
    const spec = stripSpec(
      MODULE,
      RUNTIME,
      reading({ channels: [channel({ label: 'Commands', raw: 53.43 })] }),
    );
    expect(spec.ticker).toContain('Commands 53.4/s');
  });

  it('leaves the authored arrangement alone whether or not there is a reading', () => {
    // The whole point of keeping the two layers apart: geometry, labels and
    // visibility are composition, and the cluster does not get a say in them.
    const off = stripSpec(MODULE, RUNTIME, null);
    const on = stripSpec(MODULE, RUNTIME, reading({ channels: [channel()] }));
    for (const key of ['radius', 'y', 'arcDeg', 'band', 'label', 'visible'] as const) {
      expect(on[key]).toEqual(off[key]);
    }
  });
});
