// The System Core's module list, and the per-module state that outlives its
// meshes.
//
// Two stores, deliberately separate:
//
//   `modules`  React state. Changing it re-renders the scene graph.
//   `runtime`  a Map in a ref, keyed by module id. Written 60×/second by every
//              strip on screen, and never read by React's render path — a
//              setState here would re-render the whole stack every frame.
//
// The runtime map is keyed by id rather than by list index so that deleting a
// module cannot shift everyone else's phase and lane onto their neighbours'.
//
// Edits are in-memory only; the data source is out of scope for now.

import { useRef, useMemo, useState, useCallback } from 'react';
import type { Module } from '~/components/SystemCore/data/schema';
import type { Runtime } from '~/components/SystemCore/scene/resolve';
import { STATUS_KEYS } from '~/components/SystemCore/data/status';
import { loadFixture } from '~/components/SystemCore/data/fixture';
import { newRuntime } from '~/components/SystemCore/scene/resolve';
import { uniqueId, normalize, blankModule } from '~/components/SystemCore/data/schema';

const NORMALIZE_OPTS = { statuses: STATUS_KEYS };

export interface UseModulesReturn {
  modules: Module[];
  /** Fixture problems, surfaced rather than swallowed. Empty in the happy path. */
  loadErrors: string[];
  selected: string | null;
  select: (id: string | null) => void;
  /** The phase and lane a strip should resume from, created on first ask. */
  runtimeFor: (m: Module) => Runtime;
  /** Parks a strip's live angle. Does not trigger a render. */
  parkPhase: (id: string, phase: number) => void;
  /** Where a strip has actually turned to, for the phase control's pin button. */
  livePhase: (id: string) => number | null;
  /** Validates before committing, and reports why not. */
  replace: (id: string, draft: unknown) => string[];
  add: () => string;
  remove: (id: string) => void;
  reset: () => void;
}

export default function useModules(): UseModulesReturn {
  const initial = useMemo(() => loadFixture(), []);
  const [modules, setModules] = useState<Module[]>(initial.modules);
  const [selected, setSelected] = useState<string | null>(null);

  const runtime = useRef(new Map<string, Runtime>());
  const laneSeq = useRef(0);

  const runtimeFor = useCallback((m: Module): Runtime => {
    const found = runtime.current.get(m.id);
    if (found) {
      return found;
    }
    const created = newRuntime(m, laneSeq.current);
    if (m.motion.lane == null) {
      laneSeq.current += 1;
    }
    runtime.current.set(m.id, created);
    return created;
  }, []);

  const parkPhase = useCallback((id: string, phase: number) => {
    const rt = runtime.current.get(id);
    if (rt) {
      rt.phase = phase;
    }
  }, []);

  // Wrapped into 0..2π: the live angle grows without bound, and the schema
  // bounds `phase` to one revolution.
  const livePhase = useCallback((id: string): number | null => {
    const rt = runtime.current.get(id);
    if (!rt) {
      return null;
    }
    const turn = Math.PI * 2;
    return ((rt.phase % turn) + turn) % turn;
  }, []);

  const select = useCallback((id: string | null) => {
    setSelected((current) => (current === id ? null : id));
  }, []);

  const replace = useCallback((id: string, draft: unknown): string[] => {
    const { module, errors } = normalize(draft, NORMALIZE_OPTS);
    if (!module) {
      return errors;
    }
    let rejected: string[] = [];
    setModules((current) => {
      const at = current.findIndex((m) => m.id === id);
      if (at < 0) {
        return current;
      }
      if (module.id !== id && current.some((m) => m.id === module.id)) {
        rejected = ['the id "' + module.id + '" is already taken'];
        return current;
      }
      const next = current.slice();
      next[at] = module;
      return next;
    });
    // An id change carries the strip's live angle and lane across with it, so
    // renaming a module does not restart its spin.
    if (module.id !== id) {
      const rt = runtime.current.get(id);
      if (rt) {
        runtime.current.set(module.id, rt);
        runtime.current.delete(id);
      }
      setSelected((current) => (current === id ? module.id : current));
    }
    return rejected;
  }, []);

  const add = useCallback((): string => {
    const id = uniqueId('module', new Set(modules.map((m) => m.id)));
    setModules((current) => [...current, blankModule(id, 'init')]);
    setSelected(id);
    return id;
  }, [modules]);

  const remove = useCallback((id: string) => {
    setModules((current) => current.filter((m) => m.id !== id));
    runtime.current.delete(id);
    setSelected((current) => (current === id ? null : current));
  }, []);

  const reset = useCallback(() => {
    runtime.current.clear();
    laneSeq.current = 0;
    setModules(loadFixture().modules);
    setSelected(null);
  }, []);

  return {
    modules,
    loadErrors: initial.errors,
    selected,
    select,
    runtimeFor,
    parkPhase,
    livePhase,
    replace,
    add,
    remove,
    reset,
  };
}
