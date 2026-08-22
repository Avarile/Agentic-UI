import { useRef, useMemo, useEffect, useSyncExternalStore } from 'react';
import { useRecoilValue } from 'recoil';
import type { VoiceOption } from '~/common';
import { subscribeSpeechVoices, getSpeechVoicesSnapshot } from '~/utils';
import store from '~/store';

/** Chrome intermittently drops `utterance.onend`; poll `speaking` so state cannot stick */
const SPEAKING_POLL_MS = 250;

function useTextToSpeechBrowser({
  setIsSpeaking,
}: {
  setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const voiceName = useRecoilValue(store.voice);
  const cloudBrowserVoices = useRecoilValue(store.cloudBrowserVoices);
  const { voices: availableVoices, supported: isSpeechSynthesisSupported } = useSyncExternalStore(
    subscribeSpeechVoices,
    getSpeechVoicesSnapshot,
    getSpeechVoicesSnapshot,
  );

  const voices = useMemo(() => {
    const filteredVoices = availableVoices.filter(
      (v) => cloudBrowserVoices || v.localService === true,
    );
    return filteredVoices.map((v): VoiceOption => ({ value: v.name, label: v.name }));
  }, [availableVoices, cloudBrowserVoices]);

  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearWatchdog = () => {
    if (watchdogRef.current == null) {
      return;
    }
    clearInterval(watchdogRef.current);
    watchdogRef.current = null;
  };

  /**
   * Releases the speaking state once the synthesizer goes quiet, even if `onend` never
   * arrives. Without this the microphone gate would stay closed for the rest of the session.
   */
  const startWatchdog = () => {
    clearWatchdog();
    watchdogRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        return;
      }
      clearWatchdog();
      setIsSpeaking(false);
    }, SPEAKING_POLL_MS);
  };

  useEffect(() => () => clearWatchdog(), []);

  const generateSpeechLocal = (text: string) => {
    if (!isSpeechSynthesisSupported) {
      console.warn('Speech synthesis is not supported');
      return;
    }

    const synth = window.speechSynthesis;
    const voice = voices.find((v) => v.value === voiceName) ?? voices[0];

    if (!voice) {
      console.warn('No speech synthesis voice available');
      return;
    }

    try {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = synth.getVoices().find((v) => v.name === voice.value) || null;
      utterance.onend = () => {
        clearWatchdog();
        setIsSpeaking(false);
      };
      utterance.onerror = (event) => {
        clearWatchdog();
        if (event.error === 'interrupted' || event.error === 'canceled') {
          setIsSpeaking(false);
          return;
        }

        console.error('Speech synthesis error:', event);
        setIsSpeaking(false);
      };
      setIsSpeaking(true);
      synth.speak(utterance);
      startWatchdog();
    } catch (error) {
      console.error('Error generating speech:', error);
      clearWatchdog();
      setIsSpeaking(false);
    }
  };

  const cancelSpeechLocal = () => {
    if (!isSpeechSynthesisSupported) {
      return;
    }

    clearWatchdog();
    try {
      window.speechSynthesis.cancel();
    } catch (error) {
      console.error('Error cancelling speech:', error);
    } finally {
      setIsSpeaking(false);
    }
  };

  return { generateSpeechLocal, cancelSpeechLocal, voices, isSpeechSynthesisSupported };
}

export default useTextToSpeechBrowser;
