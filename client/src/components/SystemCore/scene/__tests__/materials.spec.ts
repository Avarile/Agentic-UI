// The registry's sharing and its release, which together are what keep a
// poll-driven scene from leaking GPU memory.
//
// Real THREE materials throughout — the thing under test is whether actual
// MeshStandardMaterial instances get shared and disposed, so a mock would
// assert nothing. dispose() is spied on rather than replaced (jest.spyOn
// without a mock implementation still calls through), so the real release runs.

import * as THREE from 'three';
import { MAX_MATERIALS, MaterialRegistry } from '../materials';

const RUNNING = 0xf89945;
const FAULT = 0xe0342b;

/** One build of a scene: every material the given colours would ask for. */
function build(reg: MaterialRegistry, colors: number[]): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = [];
  for (const c of colors) {
    const mats = reg.forModule(c, null, 0.62);
    out.push(mats.band, mats.glow, mats.halo, mats.hot, mats.mark);
  }
  return out;
}

describe('MaterialRegistry sharing', () => {
  it('hands the same instance back for the same appearance', () => {
    const reg = new MaterialRegistry();
    const a = reg.get('band', RUNNING, null, 0.62);
    const b = reg.get('band', RUNNING, null, 0.62);
    // Identity, not equality: R3F compares the material prop by reference, so
    // this is what makes a duplicate poll tick cost zero GPU writes.
    expect(b).toBe(a);
    expect(reg.size).toBe(1);
  });

  it('separates entries that differ in any key component', () => {
    const reg = new MaterialRegistry();
    reg.get('band', RUNNING, null, 0.62);
    reg.get('glow', RUNNING, null, 0.62);
    reg.get('band', FAULT, null, 0.62);
    reg.get('band', RUNNING, 0.5, 0.62);
    reg.get('band', RUNNING, null, 1);
    expect(reg.size).toBe(5);
  });

  it('shares across modules with the same appearance', () => {
    const reg = new MaterialRegistry();
    build(reg, [RUNNING, RUNNING, RUNNING]);
    // Five kinds, one appearance — not fifteen.
    expect(reg.size).toBe(5);
  });
});

describe('MaterialRegistry.sweep', () => {
  it('keeps the registry bounded when the colour space is not', () => {
    const reg = new MaterialRegistry();
    // The failure this guards: a continuous signal reaching a material channel.
    // 500 distinct colours, one build each, sweeping between builds as Scene does.
    for (let i = 0; i < 500; i++) {
      build(reg, [0x100000 + i * 7]);
      reg.sweep();
    }
    // Two generations of grace means at most the last two builds survive.
    expect(reg.size).toBeLessThanOrEqual(10);
    expect(reg.size).toBeLessThanOrEqual(MAX_MATERIALS);
  });

  it('never disposes a material used in the current or previous build', () => {
    const reg = new MaterialRegistry();
    const first = build(reg, [RUNNING]);
    const spies = first.map((m) => jest.spyOn(m, 'dispose'));

    // Still asked for on the next build, so it must survive indefinitely.
    reg.sweep();
    build(reg, [RUNNING]);
    reg.sweep();
    build(reg, [RUNNING]);
    reg.sweep();

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(reg.size).toBe(5);
  });

  it('survives one missing build before releasing', () => {
    const reg = new MaterialRegistry();
    const kept = build(reg, [RUNNING]);
    const spy = jest.spyOn(kept[0], 'dispose');

    // Absent for a single build — a sample that briefly went missing.
    reg.sweep();
    build(reg, [FAULT]);
    reg.sweep();
    expect(spy).not.toHaveBeenCalled();

    // Asked for again: back in use, and the grace window resets.
    build(reg, [RUNNING]);
    reg.sweep();
    build(reg, [FAULT]);
    reg.sweep();
    expect(spy).not.toHaveBeenCalled();
  });

  it('does dispose what has genuinely fallen out of use', () => {
    const reg = new MaterialRegistry();
    const gone = build(reg, [RUNNING]);
    const spies = gone.map((m) => jest.spyOn(m, 'dispose'));

    // Absent for two consecutive builds.
    for (let i = 0; i < 3; i++) {
      reg.sweep();
      build(reg, [FAULT]);
    }
    reg.sweep();

    for (const spy of spies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
    // Only the fault appearance is left.
    expect(reg.size).toBe(5);
  });

  it('leaves a hand-authored arrangement untouched', () => {
    const reg = new MaterialRegistry();
    const palette = [RUNNING, FAULT, 0x2fcb6a, 0x3e8cf0, 0xffffff];
    const mats = build(reg, palette);
    const spies = mats.map((m) => jest.spyOn(m, 'dispose'));

    // The steady state: the same five statuses every tick, forever.
    for (let i = 0; i < 25; i++) {
      reg.sweep();
      build(reg, palette);
    }
    reg.sweep();

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(reg.size).toBe(palette.length * 5);
  });
});

describe('MaterialRegistry passes after a sweep', () => {
  it('dims and pulses without touching a released material', () => {
    const reg = new MaterialRegistry();
    build(reg, [RUNNING]);
    reg.sweep();
    build(reg, [FAULT]);
    reg.sweep();
    build(reg, [FAULT]);
    reg.sweep();

    // The per-frame passes walk reg.values(); a disposed entry must be gone
    // from the map, not merely disposed, or these would write to freed handles.
    expect(() => reg.setDimmed(true)).not.toThrow();
    expect(() => reg.setDimmed(false)).not.toThrow();
    expect(() => reg.pulse(1234)).not.toThrow();
  });

  it('pulses the picked strip only, and never the resting one', () => {
    // The guard for the whole emphasis design. `hot` is the resting appearance of
    // every unselected strip and `mark` is the picked one; because the registry is
    // keyed by appearance rather than by module, a pulse that also touched `hot`
    // would make the entire stack breathe in lockstep the moment anything was
    // selected. Nothing else in the repo tests these visuals — Dialog.spec mocks
    // Scene outright — so this is the only thing standing between that and a
    // release.
    const reg = new MaterialRegistry();
    const hot = reg.get('hot', RUNNING, null, 1);
    const mark = reg.get('mark', RUNNING, null, 1);
    const restingOpacity = hot.opacity;
    const restingEmissive = hot.emissiveIntensity;

    reg.pulse(0);
    reg.pulse(900);
    reg.pulse(1234);

    expect(hot.opacity).toBe(restingOpacity);
    expect(hot.emissiveIntensity).toBe(restingEmissive);
    expect(mark.opacity).not.toBe(restingOpacity);
  });

  it('pulses opacity rather than emissive, so every colour swings alike', () => {
    // The canvas leaves ACES tone mapping on, which saturates emissiveIntensity
    // past ~1.5 and clips differently per hue — a pulse written on emissive is
    // invisible on white and obvious on red. Opacity is the post-tone-mapping
    // blend factor, so the ratio is identical for every status in the palette.
    const reg = new MaterialRegistry();
    // Every status colour: running, fault, init, loading, controller.
    const colours = [RUNNING, FAULT, 0x2fcb6a, 0x3e8cf0, 0xffffff];
    const marks = colours.map((c) => reg.get('mark', c, null, 1));
    const emissiveBefore = marks.map((m) => m.emissiveIntensity);

    reg.pulse(700);

    for (const [i, mark] of marks.entries()) {
      expect(mark.emissiveIntensity).toBe(emissiveBefore[i]);
    }
    // One opacity for all of them, so one ratio for all of them.
    expect(new Set(marks.map((m) => m.opacity)).size).toBe(1);
  });

  it('never pulses the selected strip below the resting appearance', () => {
    // Selection is emphasis, so a picked strip must not read as dimmer than its
    // neighbours at any point in the cycle. At the trough it matches them exactly.
    const reg = new MaterialRegistry();
    const hot = reg.get('hot', RUNNING, null, 1);
    const mark = reg.get('mark', RUNNING, null, 1);

    // The two share a resting recipe; only motion separates them.
    expect(mark.opacity).toBe(hot.opacity);
    expect(mark.emissiveIntensity).toBe(hot.emissiveIntensity);

    let lowest = Infinity;
    let highest = -Infinity;
    // The cycle is ~2.6s at the current rate; sample past a full period.
    for (let t = 0; t <= 3200; t += 25) {
      reg.pulse(t);
      lowest = Math.min(lowest, mark.opacity);
      highest = Math.max(highest, mark.opacity);
    }

    expect(lowest).toBeGreaterThanOrEqual(hot.opacity - 1e-9);
    expect(highest).toBeGreaterThan(hot.opacity);
    // Opacity is a blend factor; past 1 it would silently clamp and the top of
    // the swing would be wasted.
    expect(highest).toBeLessThanOrEqual(1);
  });

  it('separates the picked overlay from the rest while something is selected', () => {
    // The cue that works in a still frame. At the trough of its cycle `mark` is
    // identical to `hot` by construction, so the pulse alone cannot say which
    // strip is selected — dimming the unselected overlays is what does.
    const reg = new MaterialRegistry();
    const hot = reg.get('hot', RUNNING, null, 1);
    const mark = reg.get('mark', RUNNING, null, 1);

    reg.setDimmed(true);
    expect(hot.opacity).toBeLessThan(mark.opacity);
    expect(hot.emissiveIntensity).toBeLessThan(mark.emissiveIntensity);

    reg.setDimmed(false);
    expect(hot.opacity).toBeCloseTo(mark.opacity, 10);
  });

  it('restores emissive intensity from the recorded base after dimming', () => {
    const reg = new MaterialRegistry();
    const band = reg.get('band', RUNNING, null, 0.62);
    const base = band.emissiveIntensity;

    reg.setDimmed(true);
    expect(band.emissiveIntensity).toBeLessThan(base);
    reg.setDimmed(false);
    expect(band.emissiveIntensity).toBeCloseTo(base, 10);
  });
});
