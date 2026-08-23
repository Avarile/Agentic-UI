// Catalogue reconciliation, and the two things it must never do.
//
// The whole reason the layers are split is that the poll owns *which* modules
// exist and the person at the keyboard owns what they look like. Two assertions
// carry that: 'never rewrites an authored field' and 'does not resurrect a
// dismissed module'. If either goes, the panel becomes an argument with the
// cluster twenty seconds at a time.
//
// A strip's rotation is keyed by module id and parked in a ref, so 'keeps its
// runtime across a reconcile' is what stands between a poll and the whole stack
// visibly restarting.

import { renderHook, act } from '@testing-library/react';
import type { SystemCoreSnapshotResponse } from 'librechat-data-provider';
import type { Module } from '~/components/SystemCore/data/schema';
import snapshotFixture from '~/components/SystemCore/live/__tests__/__fixtures__/snapshot.json';
import { catalogOf } from '~/components/SystemCore/live/adapt';
import useModules from '../useModules';

const snapshot = snapshotFixture as unknown as SystemCoreSnapshotResponse;
const REVISION = snapshot.catalogRevision;

/** The real 28-module catalogue, from the captured snapshot. */
function catalogue(): Module[] {
  return catalogOf(snapshot).modules;
}

function without(ids: string[]): Module[] {
  return catalogue().filter((m) => !ids.includes(m.id));
}

describe('with no catalogue', () => {
  it('shows the bundled fixture, so an unconfigured deployment is a working scene', () => {
    const { result } = renderHook(() => useModules());
    expect(result.current.modules.length).toBeGreaterThan(0);
    expect(result.current.loadErrors).toEqual([]);
  });

  it('is unaffected by a revision with no catalogue behind it', () => {
    const { result } = renderHook(() => useModules({ catalog: null, catalogRevision: REVISION }));
    const fixtureIds = result.current.modules.map((m) => m.id);
    expect(fixtureIds).not.toContain('kube-apiserver');
  });
});

describe('the first catalogue', () => {
  it('replaces the fixture rather than joining it', () => {
    // Adding to the fixture would draw the cluster twice — once as real modules
    // and once as the stand-ins they replaced.
    const { result } = renderHook(() =>
      useModules({ catalog: catalogue(), catalogRevision: REVISION }),
    );
    expect(result.current.modules).toHaveLength(28);
    expect(result.current.modules.map((m) => m.id)).toContain('kube-apiserver');
  });

  it('carries the server placement into the scene', () => {
    const { result } = renderHook(() =>
      useModules({ catalog: catalogue(), catalogRevision: REVISION }),
    );
    const mongo = result.current.modules.find((m) => m.id === 'mongo');
    const fromServer = catalogue().find((m) => m.id === 'mongo');
    expect(mongo?.geometry).toEqual(fromServer?.geometry);
  });
});

describe('a later catalogue', () => {
  it('adds a module that appeared', () => {
    const { result, rerender } = renderHook(
      ({ catalog, revision }: { catalog: Module[]; revision: string }) =>
        useModules({ catalog, catalogRevision: revision }),
      { initialProps: { catalog: without(['redis']), revision: 'rev-1' } },
    );
    expect(result.current.modules.map((m) => m.id)).not.toContain('redis');

    rerender({ catalog: catalogue(), revision: 'rev-2' });
    expect(result.current.modules.map((m) => m.id)).toContain('redis');
  });

  it('removes a module that went away', () => {
    const { result, rerender } = renderHook(
      ({ catalog, revision }: { catalog: Module[]; revision: string }) =>
        useModules({ catalog, catalogRevision: revision }),
      { initialProps: { catalog: catalogue(), revision: 'rev-1' } },
    );
    expect(result.current.modules.map((m) => m.id)).toContain('redis');

    rerender({ catalog: without(['redis']), revision: 'rev-2' });
    expect(result.current.modules.map((m) => m.id)).not.toContain('redis');
  });

  it('never rewrites an authored field', () => {
    // The load-bearing one. An edit has to survive every future tick, or the
    // panel is unusable on a live feed.
    const { result, rerender } = renderHook(
      ({ catalog, revision }: { catalog: Module[]; revision: string }) =>
        useModules({ catalog, catalogRevision: revision }),
      { initialProps: { catalog: catalogue(), revision: 'rev-1' } },
    );

    const before = result.current.modules.find((m) => m.id === 'mongo') as Module;
    act(() => {
      result.current.replace('mongo', {
        ...before,
        geometry: { ...before.geometry, radius: 2.5 },
        appearance: { ...before.appearance, label: 'edited by hand' },
      });
    });
    expect(result.current.modules.find((m) => m.id === 'mongo')?.geometry.radius).toBe(2.5);

    rerender({ catalog: catalogue(), revision: 'rev-2' });

    const after = result.current.modules.find((m) => m.id === 'mongo');
    expect(after?.geometry.radius).toBe(2.5);
    expect(after?.appearance.label).toBe('edited by hand');
  });

  it('keeps a hand-added module that the catalogue never mentioned', () => {
    const { result, rerender } = renderHook(
      ({ catalog, revision }: { catalog: Module[]; revision: string }) =>
        useModules({ catalog, catalogRevision: revision }),
      { initialProps: { catalog: catalogue(), revision: 'rev-1' } },
    );
    let added = '';
    act(() => {
      added = result.current.add();
    });
    expect(result.current.modules.map((m) => m.id)).toContain(added);

    rerender({ catalog: catalogue(), revision: 'rev-2' });
    expect(result.current.modules.map((m) => m.id)).toContain(added);
  });

  it('does nothing at all when the revision has not changed', () => {
    const { result, rerender } = renderHook(
      ({ catalog, revision }: { catalog: Module[]; revision: string }) =>
        useModules({ catalog, catalogRevision: revision }),
      { initialProps: { catalog: catalogue(), revision: 'rev-1' } },
    );
    const first = result.current.modules;

    // A new array with the same revision: a fresh poll carrying new numbers.
    rerender({ catalog: catalogue(), revision: 'rev-1' });

    // Identity, not equality: the scene's build memo keys on this array, so a new
    // one would rebuild every strip on every tick.
    expect(result.current.modules).toBe(first);
  });

  it('keeps a module identity stable so its rotation is not restarted', () => {
    const { result, rerender } = renderHook(
      ({ catalog, revision }: { catalog: Module[]; revision: string }) =>
        useModules({ catalog, catalogRevision: revision }),
      { initialProps: { catalog: catalogue(), revision: 'rev-1' } },
    );
    const mongo = result.current.modules.find((m) => m.id === 'mongo') as Module;
    const runtime = result.current.runtimeFor(mongo);
    runtime.phase = 1.234;

    rerender({ catalog: without(['redis']), revision: 'rev-2' });

    const after = result.current.modules.find((m) => m.id === 'mongo') as Module;
    // Same runtime object, so the strip resumes rather than snapping back.
    expect(result.current.runtimeFor(after)).toBe(runtime);
    expect(result.current.livePhase('mongo')).toBeCloseTo(1.234, 3);
  });

  it('forgets the runtime of a module it removed', () => {
    const { result, rerender } = renderHook(
      ({ catalog, revision }: { catalog: Module[]; revision: string }) =>
        useModules({ catalog, catalogRevision: revision }),
      { initialProps: { catalog: catalogue(), revision: 'rev-1' } },
    );
    const redis = result.current.modules.find((m) => m.id === 'redis') as Module;
    result.current.runtimeFor(redis);
    expect(result.current.livePhase('redis')).not.toBeNull();

    rerender({ catalog: without(['redis']), revision: 'rev-2' });
    expect(result.current.livePhase('redis')).toBeNull();
  });
});

describe('lanes', () => {
  /** A module filed under the group the server gives a discovered target. */
  function discovered(id: string): Module {
    const base = catalogue()[1];
    return { ...base, id, meta: { ...base.meta, group: 'overflow' } } as Module;
  }

  it('puts a discovered module on the reserved outer ring', () => {
    const { result } = renderHook(() =>
      useModules({ catalog: [...catalogue(), discovered('auto.mystery.host-9999')] }),
    );
    // Reconcile needs a revision; without one the catalogue is ignored, so drive
    // the lane assignment directly instead.
    const overflow = discovered('auto.mystery.host-9999');
    expect(result.current.runtimeFor(overflow).lane).toBe(4);
  });

  it('walks curated modules through the inner lanes only', () => {
    const { result } = renderHook(() => useModules());
    const lanes = catalogue()
      .slice(0, 8)
      .map((m) => result.current.runtimeFor({ ...m, motion: { ...m.motion, lane: null } }).lane);

    for (const lane of lanes) {
      expect(lane).toBeLessThan(4);
      expect(lane).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not let a discovered module consume a curated lane', () => {
    // Counting it would punch a gap in the rotation of everything after it.
    const { result } = renderHook(() => useModules());
    const curated = catalogue().filter((m) => m.motion.lane == null);

    const first = result.current.runtimeFor({ ...curated[0], id: 'a' } as Module).lane;
    result.current.runtimeFor(discovered('auto.one'));
    const second = result.current.runtimeFor({ ...curated[1], id: 'b' } as Module).lane;

    expect(second).toBe((first + 1) % 4);
  });

  it('honours an explicitly authored lane over both rules', () => {
    const { result } = renderHook(() => useModules());
    const pinned = { ...discovered('auto.pinned'), motion: { speed: 0.1, phase: null, lane: 2 } };
    expect(result.current.runtimeFor(pinned as Module).lane).toBe(2);
  });
});

describe('dismissal', () => {
  it('does not resurrect a module the user removed', () => {
    // Without this the remove button looks broken: the module comes back on the
    // next tick, twenty seconds later.
    const { result, rerender } = renderHook(
      ({ catalog, revision }: { catalog: Module[]; revision: string }) =>
        useModules({ catalog, catalogRevision: revision }),
      { initialProps: { catalog: catalogue(), revision: 'rev-1' } },
    );
    act(() => result.current.remove('redis'));
    expect(result.current.modules.map((m) => m.id)).not.toContain('redis');

    rerender({ catalog: catalogue(), revision: 'rev-2' });
    expect(result.current.modules.map((m) => m.id)).not.toContain('redis');
  });

  it('clears the selection when the selected module is removed', () => {
    const { result } = renderHook(() =>
      useModules({ catalog: catalogue(), catalogRevision: REVISION }),
    );
    act(() => result.current.select('redis'));
    expect(result.current.selected).toBe('redis');

    act(() => result.current.remove('redis'));
    expect(result.current.selected).toBeNull();
  });
});

describe('reset', () => {
  it('goes back to the catalogue when there is one, not to an empty scene', () => {
    const { result } = renderHook(() =>
      useModules({ catalog: catalogue(), catalogRevision: REVISION }),
    );
    act(() => result.current.remove('redis'));
    act(() => result.current.reset());

    expect(result.current.modules).toHaveLength(28);
    expect(result.current.modules.map((m) => m.id)).toContain('redis');
  });

  it('clears dismissals, so a reset module can come back on the next tick', () => {
    const { result, rerender } = renderHook(
      ({ catalog, revision }: { catalog: Module[]; revision: string }) =>
        useModules({ catalog, catalogRevision: revision }),
      { initialProps: { catalog: catalogue(), revision: 'rev-1' } },
    );
    act(() => result.current.remove('redis'));
    act(() => result.current.reset());
    rerender({ catalog: catalogue(), revision: 'rev-2' });

    expect(result.current.modules.map((m) => m.id)).toContain('redis');
  });

  it('discards a hand edit, which is the point of it', () => {
    const { result } = renderHook(() =>
      useModules({ catalog: catalogue(), catalogRevision: REVISION }),
    );
    const before = result.current.modules.find((m) => m.id === 'mongo') as Module;
    act(() => {
      result.current.replace('mongo', { ...before, geometry: { ...before.geometry, radius: 2.5 } });
    });
    act(() => result.current.reset());

    expect(result.current.modules.find((m) => m.id === 'mongo')?.geometry.radius).toBe(
      before.geometry.radius,
    );
  });

  it('goes back to the fixture when there is no catalogue', () => {
    const { result } = renderHook(() => useModules());
    const fixtureCount = result.current.modules.length;
    act(() => result.current.remove(result.current.modules[0].id));
    act(() => result.current.reset());

    expect(result.current.modules).toHaveLength(fixtureCount);
  });
});
