// The label cache's sharing and its release.
//
// Same shape and same reasoning as ./materials.spec.ts, and it exists for the
// same reason: this is a cache of GPU resources fed by a poll, so what has to be
// tested is that it shares what it should and frees what it should not. Real
// THREE materials and real canvases throughout — `jest-canvas-mock` gives
// `getContext('2d')` a working 2D context (client/test/setupTests.js), so the
// rasteriser under test actually runs. dispose() is spied on rather than
// replaced, so the real release still happens.
//
// The load-bearing case is 'keys a readout by module as well as by text'. The
// ticker is scrolled by writing `map.offset.x` once per frame from whichever
// strip owns the mesh; two strips handed one texture would advance it twice a
// frame and scroll at double speed. Nothing else in the repo would catch that.

import * as THREE from 'three';
import { MAX_LABELS, LabelFactory } from '../labels';

/** The two numbers the factory wants from a GPU. */
const ANISOTROPY = 4;
/** Generous, so the fit-to-texture clamp is out of the way unless a test wants it. */
const MAX_TEXTURE = 16_384;

function factory(maxTexture = MAX_TEXTURE): LabelFactory {
  return new LabelFactory(ANISOTROPY, maxTexture);
}

describe('LabelFactory sharing', () => {
  it('hands the same instance back for the same name', () => {
    const labels = factory();
    const a = labels.get('redis');
    const b = labels.get('redis');
    // Identity, not equality: R3F compares the material prop by reference, so
    // this is what makes a duplicate poll tick cost zero GPU writes.
    expect(b).toBe(a);
    expect(labels.size).toBe(1);
  });

  it('separates distinct names', () => {
    const labels = factory();
    labels.get('redis');
    labels.get('mongo');
    expect(labels.size).toBe(2);
  });

  it('keys a readout by module as well as by text', () => {
    // Two modules whose readings happen to format identically must not share a
    // texture: the scroll is a per-frame write to `offset.x` by the owning strip,
    // and a shared texture is advanced once per sharer.
    const labels = factory();
    const same = 'CPU 3%';
    const a = labels.ticker('redis', same);
    const b = labels.ticker('mongo', same);
    expect(b).not.toBe(a);
    expect(b.map).not.toBe(a.map);
    expect(labels.size).toBe(2);
  });

  it('still shares a readout with itself across a rebuild', () => {
    const labels = factory();
    const a = labels.ticker('redis', 'CPU 3%');
    const b = labels.ticker('redis', 'CPU 3%');
    expect(b).toBe(a);
    expect(labels.size).toBe(1);
  });

  it('keeps a name and a readout of the same text apart', () => {
    const labels = factory();
    const name = labels.get('redis');
    const ticker = labels.ticker('redis', 'redis');
    expect(ticker).not.toBe(name);
    expect(labels.size).toBe(2);
  });

  it('tiles a readout and clamps a name', () => {
    // The property the scroll depends on. A name must keep the default clamp, or
    // a window wider than the text would repeat it.
    const labels = factory();
    expect(labels.ticker('redis', 'CPU 3%').map?.wrapS).toBe(THREE.RepeatWrapping);
    expect(labels.get('redis').map?.wrapS).toBe(THREE.ClampToEdgeWrapping);
  });

  it('leaves the aspect ratio on the material, for the strip to size from', () => {
    const labels = factory();
    const aspect = labels.get('redis').userData.aspect as number;
    expect(typeof aspect).toBe('number');
    expect(aspect).toBeGreaterThan(0);
  });
});

describe('LabelFactory texture bound', () => {
  // A readout runs to a hundred characters, which at the rasteriser's type size
  // is a canvas several thousand pixels wide. WebGL2 only guarantees 2048, and
  // past the limit the upload fails and the band renders blank. Nothing else in
  // the scene produces a texture whose width is driven by data.
  const LONG =
    'Availability yes || Operations 4.9/s || Connections 12 || ' +
    'CPU 0.04 cores || Memory used 138 MB || Root filesystem free 71% || ';

  function widthOf(mat: THREE.MeshBasicMaterial): number {
    return (mat.map?.image as HTMLCanvasElement).width;
  }

  it('rasterises a long readout inside the limit the GPU declares', () => {
    const small = factory(512);
    const width = widthOf(small.ticker('redis', LONG));
    expect(width).toBeLessThanOrEqual(512);
  });

  it('leaves a string that already fits completely alone', () => {
    const roomy = widthOf(factory(16_384).get('redis'));
    const tight = widthOf(factory(512).get('redis'));
    // A module name is short; the clamp must not touch it on either machine.
    expect(tight).toBe(roomy);
  });

  it('keeps the aspect ratio when it scales, so the layout does not move', () => {
    // The whole reason scaling is acceptable: the mesh takes its world height
    // from the layout and its extent from this ratio, so a smaller canvas costs
    // sharpness and nothing else. A clamp that changed the ratio would silently
    // resize every readout window.
    const roomy = factory(16_384).ticker('redis', LONG).userData.aspect as number;
    const clamped = factory(512).ticker('redis', LONG).userData.aspect as number;
    // Relative, not absolute: a canvas has integer dimensions, so a heavily
    // scaled one cannot hold the ratio exactly. A per-cent or two moves one tile
    // of a scrolling readout by less than a pixel; what would matter is a clamp
    // that changed the ratio by a visible fraction.
    expect(Math.abs(clamped - roomy) / roomy).toBeLessThan(0.03);
  });
});

describe('LabelFactory.sweep', () => {
  it('keeps the cache bounded when the string space is not', () => {
    // The failure this guards, and the reason the sweep was added: a live value
    // printed on a band is a cache key, so an unquantised one asks for a fresh
    // canvas and texture on every poll, for every module, for ever.
    const labels = factory();
    for (let i = 0; i < 300; i++) {
      labels.ticker('redis', `CPU ${i}%`);
      labels.sweep();
    }
    // Two generations of grace means at most the last two builds survive.
    expect(labels.size).toBeLessThanOrEqual(2);
    expect(labels.size).toBeLessThanOrEqual(MAX_LABELS);
  });

  it('keeps a string the current build still asks for', () => {
    const labels = factory();
    const first = labels.get('redis');
    const disposed = jest.spyOn(first, 'dispose');
    for (let i = 0; i < 5; i++) {
      expect(labels.get('redis')).toBe(first);
      labels.sweep();
    }
    expect(disposed).not.toHaveBeenCalled();
    expect(labels.size).toBe(1);
  });

  it('releases a string nothing asks for any more, texture included', () => {
    const labels = factory();
    const stale = labels.get('redis');
    const texture = stale.map;
    const matDisposed = jest.spyOn(stale, 'dispose');
    const texDisposed = jest.spyOn(texture as THREE.Texture, 'dispose');

    // Three sweeps with nobody asking: past the two generations of grace.
    labels.sweep();
    labels.sweep();
    labels.sweep();

    expect(matDisposed).toHaveBeenCalled();
    // A canvas texture is the expensive half. Leaking it while releasing the
    // material would look like a fix and free almost nothing.
    expect(texDisposed).toHaveBeenCalled();
    expect(labels.size).toBe(0);
  });

  it('gives a string that vanishes for one build its identity back', () => {
    // A sample briefly missing must not cost a re-rasterisation, which at 128px
    // and a per-glyph layout pass is the most expensive thing this file does.
    const labels = factory();
    const first = labels.ticker('redis', 'CPU 3%');
    labels.sweep();
    // One build with nobody asking.
    labels.sweep();
    expect(labels.ticker('redis', 'CPU 3%')).toBe(first);
  });

  it('does not throw when swept before anything is cached', () => {
    const labels = factory();
    expect(() => labels.sweep()).not.toThrow();
    expect(labels.size).toBe(0);
  });

  it('disposes everything it holds, whatever generation it is on', () => {
    const labels = factory();
    const name = labels.get('redis');
    const ticker = labels.ticker('redis', 'CPU 3%');
    const spies = [jest.spyOn(name, 'dispose'), jest.spyOn(ticker, 'dispose')];

    labels.dispose();

    for (const spy of spies) {
      expect(spy).toHaveBeenCalled();
    }
    expect(labels.size).toBe(0);
  });
});
