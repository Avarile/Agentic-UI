// Suppresses the microphone while the assistant is speaking.
//
// Without it, speech-to-text records the assistant's own voice and feeds it back as
// user input. Reads the `isSpeaking` selector in store/families.ts, which is true
// if *any* registered source is producing audio across both engines and both
// playback modes — hence a selector rather than a single flag.

import { useRef, useState, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import usePauseGlobalAudio from '~/hooks/Audio/usePauseGlobalAudio';
import store from '~/store';

/** Room reverb and synthesizer stop latency outlast the `speaking` flag */
const SPEECH_TAIL_MS = 400;

type TUseMicGate = {
  index?: number;
  isListening: boolean;
  startRecording: () => void;
  abortRecording: () => void;
};

type TMicGate = {
  /** Assistant audio is audible, or the tail cooldown after it has not elapsed yet */
  isSuspended: boolean;
  /** Cancels assistant audio so the user can take the floor */
  interrupt: () => void;
};

/**
 * Keeps speech-to-text and text-to-speech half-duplex: the microphone is aborted for as
 * long as the assistant is audible, so its own voice is never transcribed back into the
 * composer. In hands-free mode the microphone re-arms itself once playback has settled.
 */
const useMicGate = ({
  index = 0,
  isListening,
  startRecording,
  abortRecording,
}: TUseMicGate): TMicGate => {
  const { conversationId } = useParams();
  const isSpeaking = useRecoilValue(store.isSpeakingFamily(index));
  const autoTranscribeAudio = useRecoilValue(store.autoTranscribeAudio);
  const { pauseGlobalAudio } = usePauseGlobalAudio(index);

  const [isSuspended, setIsSuspended] = useState(false);
  const suspendedRef = useRef(false);
  const handsFreeRef = useRef(false);
  const interruptedRef = useRef(false);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latest = useRef({ isListening, startRecording, abortRecording, autoTranscribeAudio });
  useEffect(() => {
    latest.current = { isListening, startRecording, abortRecording, autoTranscribeAudio };
  });

  const clearCooldown = useCallback(() => {
    if (cooldownRef.current == null) {
      return;
    }
    clearTimeout(cooldownRef.current);
    cooldownRef.current = null;
  }, []);

  useEffect(() => {
    if (isSpeaking) {
      /** Cancelled audio clears asynchronously; the user already has the floor */
      if (interruptedRef.current) {
        return;
      }

      clearCooldown();
      setIsSuspended(true);
      if (suspendedRef.current || !latest.current.isListening) {
        return;
      }
      suspendedRef.current = true;
      handsFreeRef.current = latest.current.autoTranscribeAudio;
      latest.current.abortRecording();
      return;
    }

    interruptedRef.current = false;

    if (!isSuspended) {
      return;
    }

    cooldownRef.current = setTimeout(() => {
      cooldownRef.current = null;
      setIsSuspended(false);

      const shouldResume = suspendedRef.current && handsFreeRef.current;
      suspendedRef.current = false;
      handsFreeRef.current = false;

      if (shouldResume) {
        latest.current.startRecording();
      }
    }, SPEECH_TAIL_MS);

    return clearCooldown;
  }, [clearCooldown, isSpeaking, isSuspended]);

  useEffect(() => {
    clearCooldown();
    suspendedRef.current = false;
    handsFreeRef.current = false;
    interruptedRef.current = false;
    setIsSuspended(false);
  }, [clearCooldown, conversationId]);

  const interrupt = useCallback(() => {
    clearCooldown();
    suspendedRef.current = false;
    handsFreeRef.current = false;
    interruptedRef.current = true;
    setIsSuspended(false);

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    pauseGlobalAudio();
  }, [clearCooldown, pauseGlobalAudio]);

  return { isSuspended, interrupt };
};

export default useMicGate;
