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
