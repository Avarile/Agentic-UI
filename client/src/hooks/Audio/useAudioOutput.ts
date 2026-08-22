// Registers one playback source as "currently audible", for the microphone gate.
//
// Not an owner of any audio element — a registry entry. Every playback path funnels
// its `setIsPlaying`/`setIsSpeaking` through here, and the hook adds and removes its
// own `useId()` from the per-index source set in the store.
//
// That is what makes `store.isSpeakingFamily` a *selector over sources* rather than
// a single flag: two engines and two playback modes can be active, and the mic gate
// (hooks/Audio/useMicGate.ts) needs to know whether anything at all is speaking
// without one player's state leaking into another's UI.

import { useId, useRef, useState, useEffect, useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import type { Dispatch, SetStateAction } from 'react';
import store from '~/store';

type TUseAudioOutput = {
  index?: number;
  /** Kept in sync with the returned setter, e.g. `globalAudioPlayingFamily` for auto-playback */
  onChange?: (isSpeaking: boolean) => void;
};

type TAudioOutput = {
  isSpeaking: boolean;
  setIsSpeaking: Dispatch<SetStateAction<boolean>>;
};

/**
 * Registers this hook instance as a source of audible assistant speech while it plays.
 * Every playback path funnels through a `setIsSpeaking`/`setIsPlaying` callback, so
 * wrapping that callback here gives `store.isSpeakingFamily` a complete picture without
 * leaking one player's state into another's UI.
 */
const useAudioOutput = ({ index = 0, onChange }: TUseAudioOutput = {}): TAudioOutput => {
  const sourceId = useId();
  const isSpeakingRef = useRef(false);
  const [isSpeaking, setIsSpeakingState] = useState(false);
  const setSources = useSetRecoilState(store.audioOutputSourcesFamily(index));

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const register = useCallback(
    (active: boolean) =>
      setSources((current) => {
        if (active === current.has(sourceId)) {
          return current;
        }
        const next = new Set(current);
        if (active) {
          next.add(sourceId);
        } else {
          next.delete(sourceId);
        }
        return next;
      }),
    [sourceId, setSources],
  );

  const setIsSpeaking = useCallback<Dispatch<SetStateAction<boolean>>>(
    (value) => {
      const next = typeof value === 'function' ? value(isSpeakingRef.current) : value;
      if (next === isSpeakingRef.current) {
        return;
      }
      isSpeakingRef.current = next;
      setIsSpeakingState(next);
      register(next);
      onChangeRef.current?.(next);
    },
    [register],
  );

  useEffect(() => () => register(false), [register]);

  return { isSpeaking, setIsSpeaking };
};

export default useAudioOutput;
