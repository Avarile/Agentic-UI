/* eslint-disable react-hooks/exhaustive-deps */
// An effect that runs on a debounce rather than on every dependency change.
//
// The `exhaustive-deps` rule is disabled above because the pattern deliberately
// breaks it: the effect callback is captured into a ref each render while the
// debounced runner is created once, so the linter cannot see that the latest
// closure is always the one invoked.
//
// Use it where a dependency changes far faster than the work should run — a
// search field, a resize, a streaming value driving an expensive recompute.

// https://stackoverflow.com/a/67504622/51500
import { DependencyList, EffectCallback, useCallback, useEffect, useRef } from 'react';
import debounce from 'lodash/debounce';

export function useLazyEffect(effect: EffectCallback, deps: DependencyList = [], wait = 300) {
  const cleanUp = useRef<void | (() => void)>();
  const effectRef = useRef<EffectCallback>();
  effectRef.current = useCallback(effect, deps);
  const lazyEffect = useCallback(
    debounce(() => (cleanUp.current = effectRef.current?.()), wait),
    [],
  );
  useEffect(lazyEffect, deps);
  useEffect(() => {
    return () => (cleanUp.current instanceof Function ? cleanUp.current() : undefined);
  }, []);
}
