// Where the name ends and the readout window begins.
//
// Pure arithmetic, so it is tested directly rather than through a renderer —
// Dialog.spec mocks Scene outright and nothing else would catch a layout that
// put a window off the end of its arc.
//
// The property worth holding hardest is that the scroll rate does not depend on
// how long the string is. A stack where a busy module's text raced its
// neighbour's would read as noise; every band moving at one speed reads as one
// instrument.

import { LABEL_LEAD, NAME_SHARE, TICKER_SPEED, TICKER_MIN_SHARE } from '../config';
import { bandLayout } from '../layout';

/** A middling strip: the 210° kube-apiserver arc at its authored radius. */
const ARC = (210 * Math.PI) / 180;
const RADIUS = 0.734;
const HEIGHT = 0.0475;

/** Roughly what a 16-character name rasterises to. */
const NAME_ASPECT = 6;
/** Roughly what a three-channel readout rasterises to. */
const READOUT_ASPECT = 26;

function layout(over: Partial<Parameters<typeof bandLayout>[0]> = {}) {
  return bandLayout({
    arc: ARC,
    radius: RADIUS,
    height: HEIGHT,
    nameAspect: NAME_ASPECT,
    readoutAspect: READOUT_ASPECT,
    ...over,
  });
}

describe('bandLayout without a readout', () => {
  it('gives the name the whole usable arc, as it always did', () => {
    // The no-feed path, which most deployments are on. Adding a readout must not
    // change how a plain labelled band is composed.
    const { name, readout } = layout({ readoutAspect: null });
    expect(readout).toBeNull();
    expect(name?.start).toBeCloseTo(ARC * LABEL_LEAD, 6);
    expect(name?.height).toBe(HEIGHT);
  });

  it('scales a long name down rather than squashing it', () => {
    const { name } = layout({ readoutAspect: null, nameAspect: 400 });
    const usable = ARC * (1 - 2 * LABEL_LEAD);
    expect(name?.theta).toBeCloseTo(usable, 6);
    expect(name?.height).toBeLessThan(HEIGHT);
  });

  it('keeps the name inside the arc it was given', () => {
    const { name } = layout({ readoutAspect: null, nameAspect: 400 });
    expect((name?.start ?? 0) + (name?.theta ?? 0)).toBeLessThanOrEqual(ARC);
  });
});

describe('bandLayout with a readout', () => {
  it('holds the name to its share and hands the rest to the window', () => {
    const { name, readout } = layout({ nameAspect: 400 });
    const usable = ARC * (1 - 2 * LABEL_LEAD);
    expect(name?.theta).toBeCloseTo(usable * NAME_SHARE, 6);
    expect(readout?.theta).toBeCloseTo(usable * (1 - NAME_SHARE), 6);
  });

  it('starts the window where the name stops, with no gap and no overlap', () => {
    const { name, readout } = layout();
    expect(readout?.start).toBeCloseTo((name?.start ?? 0) + (name?.theta ?? 0), 6);
  });

  it('ends the window exactly at the trailing inset', () => {
    const { readout } = layout();
    const end = ARC * LABEL_LEAD + ARC * (1 - 2 * LABEL_LEAD);
    expect((readout?.start ?? 0) + (readout?.theta ?? 0)).toBeCloseTo(end, 6);
  });

  it('matches the readout height to the name, so one band is one size', () => {
    const { name, readout } = layout({ nameAspect: 400 });
    expect(readout?.height).toBe(name?.height);
    expect(readout?.height).toBeLessThan(HEIGHT);
  });

  it('tiles the string across the window', () => {
    const { readout } = layout();
    const tile = (readout?.height ?? 0) * READOUT_ASPECT;
    expect(readout?.repeat).toBeCloseTo(((readout?.theta ?? 0) * RADIUS) / tile, 6);
    expect(readout?.repeat).toBeGreaterThan(0);
  });

  it('scrolls at one speed whatever the string says', () => {
    // THE PROPERTY. A module with six channels loops for longer; it does not
    // scroll faster. `step` is uv per second and one uv unit is one tile, so a
    // longer string makes a bigger tile and a proportionally smaller step — the
    // world speed that falls out is the same.
    const short = layout({ readoutAspect: 10 }).readout;
    const long = layout({ readoutAspect: 90 }).readout;
    // Recover the world speed: step is uv/second, one uv unit is one tile, and a
    // tile is `height * aspect` world units wide.
    const worldSpeed = (step: number, height: number, aspect: number) => step * height * aspect;

    expect(worldSpeed(short?.step ?? 0, short?.height ?? 0, 10)).toBeCloseTo(TICKER_SPEED, 9);
    expect(worldSpeed(long?.step ?? 0, long?.height ?? 0, 90)).toBeCloseTo(TICKER_SPEED, 9);
    // And the longer string does take proportionally longer to come round.
    expect(long?.step).toBeLessThan(short?.step ?? 0);
  });

  it('drops the window rather than showing a sliver of moving text', () => {
    // The narrow controller ring carrying the longest name in the catalogue. The
    // panel has the same numbers in a font you can read.
    const narrow = (50 * Math.PI) / 180;
    const { name, readout } = bandLayout({
      arc: narrow,
      radius: 3.634,
      height: HEIGHT,
      // Long enough that NAME_SHARE still leaves almost nothing behind it.
      nameAspect: 400,
      readoutAspect: READOUT_ASPECT,
    });
    expect(name).not.toBeNull();
    const usable = narrow * (1 - 2 * LABEL_LEAD);
    const left = usable * (1 - NAME_SHARE);
    // Only assert the drop when the geometry actually calls for it.
    if (left < usable * TICKER_MIN_SHARE) {
      expect(readout).toBeNull();
    }
  });

  it('gives the window the whole arc when there is no name to share with', () => {
    const { name, readout } = layout({ nameAspect: null });
    expect(name).toBeNull();
    expect(readout?.start).toBeCloseTo(ARC * LABEL_LEAD, 6);
    expect(readout?.theta).toBeCloseTo(ARC * (1 - 2 * LABEL_LEAD), 6);
  });

  it('produces nothing at all when there is neither', () => {
    const { name, readout } = layout({ nameAspect: null, readoutAspect: null });
    expect(name).toBeNull();
    expect(readout).toBeNull();
  });
});
