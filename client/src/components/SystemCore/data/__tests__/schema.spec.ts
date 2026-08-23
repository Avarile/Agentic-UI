import type { Module } from '../schema';
import modulesJson from '../modules.json';
import { STATUS_KEYS } from '../status';
import { serialize } from '../serialize';
import { loadFixture } from '../fixture';
import { isNum, verify, normalize, bandText, uniqueId, blankModule, displayName } from '../schema';

const opts = { statuses: STATUS_KEYS };

describe('loadFixture', () => {
  it('normalizes every bundled module with no errors', () => {
    const { modules, errors } = loadFixture();
    expect(errors).toEqual([]);
    // Counted off the file rather than hard-coded: the point is that *every*
    // bundled module survives normalize(), whatever the arrangement holds.
    expect(modules).toHaveLength(modulesJson.modules.length);
  });

  it('fills defaults the file omits', () => {
    const { modules } = loadFixture();
    const kernel = modules.find((m) => m.id === 'kernel-scheduler');
    expect(kernel).toBeDefined();
    // The file carries only geometry, motion.speed and meta.group for this one.
    expect(kernel?.appearance.glow).toBe(true);
    expect(kernel?.appearance.labelScale).toBe(1);
    expect(kernel?.motion.phase).toBeNull();
    expect(kernel?.motion.lane).toBeNull();
    expect(kernel?.layout.visible).toBe(true);
    expect(kernel?.telemetry.metrics).toEqual({});
    expect(kernel?.links.dependsOn).toEqual([]);
  });

  it('round trips through serialize without losing a module', () => {
    const { modules } = loadFixture();
    const reparsed = JSON.parse(serialize(modules)) as { version: number; modules: unknown[] };
    expect(reparsed.version).toBe(2);
    expect(reparsed.modules).toHaveLength(modules.length);
    expect(verify(reparsed.modules, opts)).toEqual([]);
  });
});

describe('isNum', () => {
  it('accepts numbers and fully-numeric strings', () => {
    expect(isNum(0)).toBe(true);
    expect(isNum(-0.05)).toBe(true);
    expect(isNum('0.05')).toBe(true);
  });

  it('rejects the values a bare + coercion would turn into a number', () => {
    // Each of these coerces to 0 or 1, which is why the check is not Number.isFinite(+v).
    expect(isNum(null)).toBe(false);
    expect(isNum('')).toBe(false);
    expect(isNum('   ')).toBe(false);
    expect(isNum([])).toBe(false);
    expect(isNum(true)).toBe(false);
    expect(isNum(NaN)).toBe(false);
    expect(isNum(Infinity)).toBe(false);
    expect(isNum('12px')).toBe(false);
  });
});

describe('normalize', () => {
  const valid = {
    id: 'alpha',
    status: 'running',
    geometry: { radius: 1, y: 0, arc: 180, band: 0.05 },
    motion: { speed: 0.1 },
  };

  it('reports missing required fields rather than substituting a default', () => {
    const { module, errors } = normalize({ id: 'alpha', status: 'running' }, opts);
    expect(module).toBeNull();
    expect(errors).toContain('alpha: geometry.radius is missing');
    expect(errors).toContain('alpha: motion.speed is missing');
  });

  it('rejects a status outside the known keys', () => {
    const { module, errors } = normalize({ ...valid, status: 'melted' }, opts);
    expect(module).toBeNull();
    expect(errors[0]).toContain('must be one of running, degraded, fault, init, loading');
  });

  it('enforces inclusive bounds', () => {
    const under = normalize({ ...valid, geometry: { ...valid.geometry, arc: 0 } }, opts);
    expect(under.errors[0]).toContain('must be at least 1');
    const over = normalize({ ...valid, geometry: { ...valid.geometry, arc: 361 } }, opts);
    expect(over.errors[0]).toContain('must be at most 360');
    const edge = normalize({ ...valid, geometry: { ...valid.geometry, arc: 360 } }, opts);
    expect(edge.errors).toEqual([]);
  });

  it('requires whole numbers for int fields', () => {
    const { errors } = normalize({ ...valid, motion: { speed: 0.1, lane: 1.5 } }, opts);
    expect(errors[0]).toContain('must be a whole number');
  });

  it('keeps null distinct from the default on nullable fields', () => {
    const { module } = normalize({ ...valid, motion: { speed: 0.1, phase: null } }, opts);
    expect(module?.motion.phase).toBeNull();
  });

  it('uppercases and validates colour overrides', () => {
    const ok = normalize({ ...valid, appearance: { color: '#f8c845' } }, opts);
    expect(ok.module?.appearance.color).toBe('#F8C845');
    const bad = normalize({ ...valid, appearance: { color: 'gold' } }, opts);
    expect(bad.errors[0]).toContain('must be a hex colour');
  });

  it('dedupes list entries and rejects blank ones', () => {
    const ok = normalize({ ...valid, meta: { tags: ['a', 'a', ' b '] } }, opts);
    expect(ok.module?.meta.tags).toEqual(['a', 'b']);
    const bad = normalize({ ...valid, meta: { tags: ['a', '  '] } }, opts);
    expect(bad.errors[0]).toContain('non-empty text');
  });

  it('carries unrecognised keys through, inside groups and at the top level', () => {
    const { module } = normalize(
      { ...valid, futureField: 7, geometry: { ...valid.geometry, futureGeom: 'x' } },
      opts,
    );
    expect(module?.futureField).toBe(7);
    expect(module?.geometry.futureGeom).toBe('x');
  });

  it('rejects a non-object', () => {
    expect(normalize(null, opts).errors).toEqual(['is not an object']);
    expect(normalize([], opts).errors).toEqual(['is not an object']);
  });
});

describe('verify', () => {
  it('flags two modules sharing an id', () => {
    const a = blankModule('dup', 'running');
    const b = blankModule('dup', 'fault');
    expect(verify([a, b], opts)).toContain('two modules share the id "dup"');
  });

  it('passes a blank module, which must start valid', () => {
    expect(verify([blankModule('fresh', 'running')], opts)).toEqual([]);
  });
});

describe('displayName and bandText', () => {
  const base = (): Module => blankModule('the-id', 'running');

  it('falls back from label to id', () => {
    expect(displayName(base())).toBe('the-id');
    const labelled = { ...base(), label: 'The Label' };
    expect(displayName(labelled)).toBe('The Label');
  });

  it('treats a whitespace-only label as absent', () => {
    expect(displayName({ ...base(), label: '   ' })).toBe('the-id');
  });

  it('prefers the band-text override over the label', () => {
    const m = base();
    m.label = 'The Label';
    m.appearance.label = 'BAND';
    expect(bandText(m)).toBe('BAND');
    m.appearance.label = null;
    expect(bandText(m)).toBe('The Label');
  });
});

describe('uniqueId', () => {
  it('returns the cleaned root when free', () => {
    expect(uniqueId('alpha', new Set())).toBe('alpha');
    expect(uniqueId('  spaced name ', new Set())).toBe('spaced-name');
  });

  it('appends a counter past taken ids', () => {
    expect(uniqueId('alpha', new Set(['alpha']))).toBe('alpha-2');
    expect(uniqueId('alpha', new Set(['alpha', 'alpha-2']))).toBe('alpha-3');
  });

  it('falls back to "module" when nothing usable survives cleaning', () => {
    expect(uniqueId('!!!', new Set())).toBe('module');
  });
});

describe('the audio group', () => {
  it('leaves every module silent by default', () => {
    const fresh = blankModule('fresh', 'running');
    expect(fresh.audio.hz).toBeNull();
    expect(fresh.audio.level).toBe(0.5);
    // A hz of null is the off switch, which is what keeps a newly added module
    // from humming the moment it appears.
    expect(verify([fresh], opts)).toEqual([]);
  });

  it('fills its defaults for a module that says nothing about sound', () => {
    const { modules } = loadFixture();
    const silent = modules.find((m) => m.id === 'kernel-scheduler');
    expect(silent?.audio.hz).toBeNull();
    expect(silent?.audio.level).toBe(0.5);
  });

  it('reads the controller drone off the fixture', () => {
    const { modules } = loadFixture();
    const controller = modules.find((m) => m.id === 'controller');
    expect(controller?.audio.hz).toBe(86);
    expect(controller?.audio.level).toBe(0.7);
  });

  it('rejects a frequency outside the range the oscillators can carry', () => {
    const tooHigh = normalize(
      {
        id: 'x',
        status: 'running',
        geometry: { radius: 1, y: 0, arc: 90, band: 0.05 },
        motion: { speed: 0.1 },
        audio: { hz: 20000 },
      },
      opts,
    );
    expect(tooHigh.module).toBeNull();
    expect(tooHigh.errors.join(' ')).toContain('audio.hz');
  });

  it('writes nothing for a silent module and both fields for a sounding one', () => {
    const { modules } = loadFixture();
    const written = serialize(modules);
    const reparsed = JSON.parse(written) as { modules: Record<string, unknown>[] };
    const controller = reparsed.modules.find((m) => m.id === 'controller');
    const silent = reparsed.modules.find((m) => m.id === 'kernel-scheduler');
    expect(controller?.audio).toEqual({ hz: 86, level: 0.7 });
    // Defaults are omitted, so a module that makes no sound stays as short as it
    // was before the schema grew a sound.
    expect(silent?.audio).toBeUndefined();
  });

  it('keeps a pinned level that happens to equal nothing', () => {
    const { modules } = loadFixture();
    const m = modules.find((x) => x.id === 'controller') as Module;
    m.audio.level = 0;
    const reparsed = JSON.parse(serialize([m])) as { modules: Record<string, unknown>[] };
    expect(reparsed.modules[0].audio).toEqual({ hz: 86, level: 0 });
  });
});
