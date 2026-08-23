// The audible curves, checked in isolation.
//
// This is the whole of the sound that can be tested honestly. jsdom has no
// AudioContext, so ../audio.ts and ../../objects/Tone.tsx are only reachable
// behind a stand-in, and a passing test against a stand-in AudioContext proves
// the stand-in works — which is why ../tone.ts is kept free of both three and
// Web Audio. The repo already draws this line: Dialog.spec mocks Scene outright
// because "the canvas belongs in a browser test, not here".

import { SPEC, isGroup } from '../../data/schema';
import {
  HUM,
  ROAR,
  BANDS,
  HUM_MIX,
  CHURN,
  FILTER,
  mixGain,
  humLevel,
  DRIVE_RMS,
  reach,
  roarLevel,
  roarCutoff,
  roarCeiling,
  emitterOffset,
  saturationCurve,
} from '../tone';

/** The controller module, which is the one the fixture gives a voice. */
const RADIUS = 3.62;
const ARC = 50;
/** Roughly where the framing pass leaves the camera at the default draw. */
const CENTRE = 8.7;

describe('roarLevel', () => {
  it('peaks at the near bound and is silent at the far bound', () => {
    expect(roarLevel(CENTRE - RADIUS, CENTRE, RADIUS)).toBeCloseTo(1, 6);
    expect(roarLevel(CENTRE + RADIUS, CENTRE, RADIUS)).toBe(0);
  });

  it('stays silent beyond the far bound rather than going negative', () => {
    expect(roarLevel(CENTRE + RADIUS + 5, CENTRE, RADIUS)).toBe(0);
  });

  it('falls monotonically across the orbit', () => {
    const near = CENTRE - RADIUS;
    let previous = Infinity;
    for (let i = 0; i <= 20; i++) {
      const level = roarLevel(near + (i / 20) * 2 * RADIUS, CENTRE, RADIUS);
      expect(level).toBeLessThanOrEqual(previous);
      previous = level;
    }
  });

  it('weights the near pass, which is what reads as immense', () => {
    // Halfway round the orbit by distance is well under halfway by loudness, or
    // the roar would simply be a volume knob.
    expect(roarLevel(CENTRE, CENTRE, RADIUS)).toBeLessThan(0.2);
  });

  it('holds a steady roar with the camera inside the ring', () => {
    // The bounds are clamped for this: unclamped, the near bound goes negative
    // and the middle of the orbit — where a constant roar is the only sensible
    // answer — comes out silent.
    expect(roarLevel(RADIUS, 0, RADIUS)).toBeCloseTo(Math.pow(0.5, ROAR.falloff), 6);
  });

  it('survives a degenerate orbit', () => {
    expect(Number.isFinite(roarLevel(5, 5, 0))).toBe(true);
  });

  it('is scale-free below the knee, so the swell survives any zoom', () => {
    // Same fraction of the way round, two very different camera distances: the
    // level has to match, which is the property no PannerNode model has.
    const at = (centre: number) => roarLevel(centre - RADIUS * 0.5, centre, RADIUS);
    expect(at(9)).toBeCloseTo(at(15), 6);
  });
});

describe('reach', () => {
  it('leaves the default framing untouched', () => {
    expect(reach(CENTRE)).toBe(1);
    expect(reach(ROAR.knee)).toBe(1);
  });

  it('pulls the level down past the knee, monotonically', () => {
    expect(reach(ROAR.knee * 2)).toBeLessThan(1);
    expect(reach(ROAR.knee * 4)).toBeLessThan(reach(ROAR.knee * 2));
  });
});

describe('roarCutoff', () => {
  it('spans the filter range and no further', () => {
    expect(roarCutoff(0)).toBeCloseTo(FILTER.low.min, 6);
    expect(roarCutoff(1)).toBeCloseTo(FILTER.low.max, 6);
    expect(roarCutoff(-1)).toBeCloseTo(FILTER.low.min, 6);
    expect(roarCutoff(2)).toBeCloseTo(FILTER.low.max, 6);
  });

  it('opens monotonically with level', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const hz = roarCutoff(i / 20);
      expect(hz).toBeGreaterThan(previous);
      previous = hz;
    }
  });

  it('interpolates in log frequency, not in Hz', () => {
    // Pins the thing most likely to be quietly "simplified" to a lerp later.
    // Cutoffs are heard geometrically: unbiased, half level is the geometric
    // mean of the endpoints, not the arithmetic one.
    const { min, max } = FILTER.low;
    const geometric = Math.sqrt(min * max);
    const arithmetic = (min + max) / 2;
    const half = min * Math.pow(max / min, 0.5);
    expect(half).toBeCloseTo(geometric, 6);
    expect(half).toBeLessThan(arithmetic);
  });
});

describe('emitterOffset', () => {
  it('lands on the arc midpoint, matching the cylinder winding', () => {
    // CylinderGeometry lays torso vertices at x = r·sinθ, z = r·cosθ from
    // thetaStart, and Strip passes thetaStart 0, so 25° round for a 50° arc.
    const [x, y, z] = emitterOffset(RADIUS, ARC);
    expect(x).toBeCloseTo(1.53, 2);
    expect(y).toBe(0);
    expect(z).toBeCloseTo(3.281, 2);
  });

  it('stays on the strip radius it was given', () => {
    const [x, , z] = emitterOffset(RADIUS, ARC);
    expect(Math.hypot(x, z)).toBeCloseTo(RADIUS, 6);
  });
});

describe('the noise bands', () => {
  it('puts the weight in the rumble and only a trace in the crackle', () => {
    // A launch is nearly all low-frequency turbulence. If this order ever
    // inverts it stops sounding like a rocket and starts sounding like static.
    const [rumble, body, hiss] = BANDS;
    expect(rumble.gain).toBeGreaterThan(body.gain);
    expect(body.gain).toBeGreaterThan(hiss.gain);
    expect(rumble.mul).toBeLessThan(body.mul);
    expect(body.mul).toBeLessThan(hiss.mul);
  });

  it('keeps every band below Nyquist at the schema maximum', () => {
    // The real guard on the schema's max: leave it open and someone types 20000,
    // every filter lands above half the sample rate, and the roar goes silent.
    const audio = SPEC.audio;
    const ceiling = isGroup(audio) ? (audio.fields.hz.max as number) : 0;
    const highest = Math.max(...BANDS.map((b) => b.mul)) * ceiling;
    expect(highest).toBeLessThan(44100 / 2);
  });

  it('gives every band a real weight and a real place', () => {
    for (const b of BANDS) {
      expect(b.gain).toBeGreaterThan(0);
      expect(b.q).toBeGreaterThan(0);
      expect(b.mul).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(b.mul * b.gain)).toBe(true);
    }
  });

  it('sweeps the master lowpass across the crackle band, not below it', () => {
    // The point of the distance sweep is that range takes the crackle away
    // first. If the lowpass never reached the top band, closing it would change
    // nothing audible about the approach.
    const crackle = BANDS[BANDS.length - 1];
    expect(FILTER.low.max).toBeGreaterThan(crackle.mul * 86);
    expect(FILTER.low.min).toBeLessThan(crackle.mul * 86);
  });

  it('weights the gains for bandwidth, so the rumble still dominates in power', () => {
    // The trap this guards. White noise gives up power in proportion to the
    // width of the window, so the top band — nearly five octaves up and far
    // wider — would arrive stronger than the rumble at anything like an equal
    // gain, and the roar would just be static.
    const nyquist = 22050;
    const hz = 86;
    const power = BANDS.map((b) => {
      const centre = hz * b.mul;
      const width = b.type === 'lowpass' ? centre : centre / b.q;
      return b.gain * b.gain * (width / nyquist);
    });
    expect(power[0]).toBeGreaterThan(power[1]);
    expect(power[1]).toBeGreaterThan(power[2]);
  });
});

describe('mixGain', () => {
  it('drives the saturator to the same place at any pitch', () => {
    // Without this the drive would fall with the module's frequency: narrower
    // windows, less power, and tanh quietly degrading into a straight wire.
    const nyquist = 22050;
    const low = mixGain(20, nyquist);
    const high = mixGain(400, nyquist);
    expect(low).toBeGreaterThan(high);
    for (const hz of [20, 86, 200, 400]) {
      expect(mixGain(hz, nyquist)).toBeGreaterThan(1);
      expect(Number.isFinite(mixGain(hz, nyquist))).toBe(true);
    }
  });

  it('compensates the sample rate, not just the pitch', () => {
    // The same windows pass twice the fraction of the power at 22 kHz that they
    // do at 44, so the make-up has to move with it.
    expect(mixGain(86, 22050)).toBeGreaterThan(mixGain(86, 11025));
  });

  it('actually lands on the drive it aims for', () => {
    const nyquist = 22050;
    const hz = 86;
    const makeup = mixGain(hz, nyquist);
    const rms = Math.sqrt(
      BANDS.reduce((total, b) => {
        const centre = hz * b.mul;
        const width = b.type === 'lowpass' ? centre : centre / b.q;
        return total + Math.pow(b.gain * makeup, 2) * (width / nyquist);
      }, 0),
    );
    expect(rms).toBeCloseTo(DRIVE_RMS, 6);
  });

  it('stays finite when every band is silent', () => {
    expect(mixGain(0, 22050)).toBe(0);
  });
});

describe('churn', () => {
  it('swings hard enough to hear without ever silencing the roar', () => {
    // Combustion is most of what separates a rocket from an air conditioner, so
    // the swing has to be substantial — but the modulators sum onto a gain of 1,
    // and a total depth past 1 would drive it through zero and invert.
    const depth = CHURN.reduce((total, m) => total + m.depth, 0);
    expect(depth).toBeGreaterThan(0.25);
    expect(depth).toBeLessThan(1);
  });

  it('uses rates with no short common multiple', () => {
    // Any two of these landing on a simple ratio would give the roar an audible
    // pulse instead of a wander.
    for (let i = 0; i < CHURN.length; i++) {
      for (let j = i + 1; j < CHURN.length; j++) {
        const ratio = CHURN[j].hz / CHURN[i].hz;
        expect(Math.abs(ratio - Math.round(ratio))).toBeGreaterThan(0.1);
      }
    }
  });
});

describe('saturationCurve', () => {
  it('bounds its output to full scale, which is what stops the roar clipping', () => {
    // ROAR.ceiling is documented as the exact peak amplitude on the strength of
    // this: whatever the bands sum to, nothing past the saturator exceeds 1.
    const curve = saturationCurve();
    for (const v of curve) {
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
    expect(curve[curve.length - 1]).toBeCloseTo(1, 6);
    expect(curve[0]).toBeCloseTo(-1, 6);
  });

  it('rises monotonically and passes through the origin', () => {
    const curve = saturationCurve();
    let previous = -Infinity;
    for (const v of curve) {
      expect(v).toBeGreaterThan(previous);
      previous = v;
    }
    expect(curve[curve.length / 2]).toBeCloseTo(0, 2);
  });

  it('compresses rather than merely scaling', () => {
    // A straight line here would be a volume change, not a saturator: half scale
    // in has to come out well above half scale.
    const curve = saturationCurve();
    const threeQuarters = curve[Math.floor((curve.length - 1) * 0.75)];
    expect(threeQuarters).toBeGreaterThan(0.5);
  });
});

describe('humLevel', () => {
  it('plateaus inside its near field instead of climbing', () => {
    // Structurally maximal at 1, which is what makes HUM.ceiling a real peak.
    // An earlier draft grew past 1 and clamped at 1.5, and that clamp engaged at
    // 6.1 units — still outside a model 3.6 units in radius, so most of the
    // zoom-in range was a dead control that only cost headroom.
    expect(humLevel(HUM.near)).toBe(1);
    expect(humLevel(HUM.near / 2)).toBe(1);
    expect(humLevel(0)).toBe(1);
    for (let d = 0; d <= 200; d += 0.5) {
      expect(humLevel(d)).toBeLessThanOrEqual(1);
      expect(Number.isFinite(humLevel(d))).toBe(true);
    }
  });

  it('falls as pure inverse distance past it', () => {
    expect(humLevel(2 * HUM.near)).toBeCloseTo(0.5, 6);
    expect(humLevel(4 * HUM.near)).toBeCloseTo(0.25, 6);
  });

  it('thins monotonically as the camera pulls back', () => {
    let previous = Infinity;
    for (let d = HUM.near; d <= 120; d += 4) {
      const level = humLevel(d);
      expect(level).toBeLessThanOrEqual(previous);
      previous = level;
    }
    expect(humLevel(120)).toBeLessThan(0.1);
  });
});

describe('why the mainframe cannot borrow the orbit law', () => {
  // The trap, written down. roarLevel normalises against the orbit radius, which
  // is what lets a strip's swell survive a zoom — and exactly what makes it
  // useless for something bolted to the centre of the scene.
  const staticSource = (camDist: number) => roarLevel(camDist, camDist, 0);

  it('roarLevel is flat across every distance the camera normally sits at', () => {
    const inside = [2, 4, HUM.near, 12, ROAR.knee].map(staticSource);
    expect(Math.max(...inside) - Math.min(...inside)).toBeLessThan(1e-9);
    expect(inside[0]).toBeCloseTo(Math.pow(0.5, ROAR.falloff), 6);
  });

  it('and is not literally frozen, which is why the claim needs scoping', () => {
    // Past the knee reach() does bite, so an unscoped "it never changes" would
    // simply be false. The far field is the only zoom it ever notices.
    expect(staticSource(4 * ROAR.knee)).toBeLessThan(staticSource(ROAR.knee));
  });

  it('humLevel responds across the range that actually matters', () => {
    expect(humLevel(HUM.near)).toBeGreaterThan(humLevel(12));
    expect(humLevel(12)).toBeGreaterThan(humLevel(ROAR.knee));
    expect(humLevel(ROAR.knee)).toBeGreaterThan(humLevel(4 * ROAR.knee));
  });
});

describe('the hum stack', () => {
  it('is carried by the even harmonics, because a core flexes twice per cycle', () => {
    // The design decision most likely to be "tidied" into a fundamental-first
    // stack by someone who has not read why. Stated as a property rather than a
    // literal, so adding a partial does not force a rewrite.
    const weight = (keep: (mul: number) => boolean) =>
      HUM.partials
        .filter((partial) => keep(partial.mul))
        .reduce((t, partial) => t + partial.gain, 0);
    expect(weight((mul) => mul % 2 === 0)).toBeGreaterThan(2 * weight((mul) => mul % 2 === 1));
    const loudest = HUM.partials.reduce((a, b) => (b.gain > a.gain ? b : a));
    expect(loudest.mul).toBe(2);
  });

  it('bounds its own peak, conservatively and on purpose', () => {
    // Amplitude-summed, so this holds even if a partial is added or some
    // implementation stops starting oscillators at zero phase. A harmonic series
    // started at phase 0 does not actually co-peak, so the true worst case is
    // nearer 0.8 — about 2 dB left unclaimed, which is the right way to be wrong.
    const sum = HUM.partials.reduce((total, partial) => total + partial.gain, 0);
    expect(sum * HUM_MIX).toBeCloseTo(1, 12);
  });

  it('survives a speaker with no bass', () => {
    // The lesson BANDS already learned, in the other direction. A stack weighted
    // purely by transformer physics puts almost everything at 60 and 120 Hz,
    // where A-weighting discounts it by 27 and 17 dB and most laptop speakers
    // have rolled off entirely. Measured that way it landed 20 dB under the roar.
    const total = HUM.partials.reduce((t, partial) => t + partial.gain, 0);
    const audible = HUM.partials
      .filter((partial) => partial.mul * HUM.mains >= 240)
      .reduce((t, partial) => t + partial.gain, 0);
    expect(audible / total).toBeGreaterThan(0.35);
    expect(
      HUM.mains * Math.max(...HUM.partials.map((partial) => partial.mul)),
    ).toBeGreaterThanOrEqual(480);
  });

  it('breathes from a detuned pair, not from a modulator', () => {
    // 0.35 Hz, a ~2.9 s cycle. An earlier draft also carried a 0.083 Hz wander at
    // depth 0.04 — 0.7 dB peak to peak, below the threshold for hearing
    // modulation that slow, against a beat already several times larger in the
    // same dimension. Recorded here so nobody re-adds it.
    const twins = HUM.partials.filter((partial) => partial.mul === 2);
    expect(twins).toHaveLength(2);
    const cents = Math.abs(twins[0].cents - twins[1].cents);
    const beat = HUM.mains * 2 * (Math.pow(2, cents / 1200) - 1);
    expect(beat).toBeGreaterThan(0.15);
    expect(beat).toBeLessThan(0.6);
  });

  it('gives every partial a real weight and stays below Nyquist', () => {
    for (const partial of HUM.partials) {
      expect(partial.gain).toBeGreaterThan(0);
      expect(partial.mul).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(partial.gain * partial.mul)).toBe(true);
    }
    expect(HUM.mains * Math.max(...HUM.partials.map((p) => p.mul))).toBeLessThan(44100 / 2);
  });

  it('cannot sum past full scale alongside the roar', () => {
    // Assumes one sounding module, which is what the fixture ships. With every
    // module voiced the panel can already exceed this on its own — a pre-existing
    // hole, not one the hum opens.
    expect(HUM.ceiling).toBeLessThan(ROAR.ceiling);
    expect(HUM.ceiling + ROAR.ceiling).toBeLessThan(1);
  });

  it('opens slowly, and its fade is a time constant not a duration', () => {
    // setTargetAtTime reaches 63% at one time constant and 95% at three, so this
    // is a ~6 s arrival. Slower than the roar's on purpose: it is the first thing
    // anyone hears, and it should not announce itself.
    expect(HUM.fadeIn).toBeGreaterThan(ROAR.fadeIn);
  });
});

describe('roarCeiling', () => {
  it('gives a module its own share of the one global ceiling', () => {
    expect(roarCeiling(1)).toBe(ROAR.ceiling);
    expect(roarCeiling(0.5)).toBeCloseTo(ROAR.ceiling / 2, 10);
    expect(roarCeiling(0)).toBe(0);
  });

  it('never exceeds the ceiling, whatever it is handed', () => {
    // The one decision about how loud this can ever get is made once, in ROAR.
    // A bound level arriving out of range must not be able to reopen it.
    for (const level of [1.5, 42, Infinity]) {
      expect(roarCeiling(level)).toBe(ROAR.ceiling);
    }
    for (const level of [-0.5, -Infinity]) {
      expect(roarCeiling(level)).toBe(0);
    }
  });

  it('is the same arithmetic a fresh voice and a retuned one both use', () => {
    // ToneBus.roar and ToneBus.setLevel both call this. If they computed it
    // separately, a retuned voice would land at a different loudness from a
    // freshly built one at the same level — audible on any poll that changed it.
    expect(roarCeiling(0.7)).toBe(roarCeiling(0.7));
    expect(roarCeiling(0.7)).toBeGreaterThan(roarCeiling(0.69));
  });
});
