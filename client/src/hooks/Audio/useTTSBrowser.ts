// Message-level text-to-speech via the browser's own SpeechSynthesis.
//
// One of two interchangeable engine hooks (see useTTSExternal for the server-side
// one); the user's `engineTTS` preference chooses between them and both present the
// same interface so callers do not branch.
//
// Message content arrives as content *parts*, so `parseTextParts` flattens it to
// the speakable text first — reasoning, tool calls and artifacts are not read
// aloud. Playback registers through `useAudioOutput` so the microphone gate knows
// the assistant has the floor, and `usePauseGlobalAudio` stops the global player
// first so the two cannot overlap.

import { useRef, useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { parseTextParts } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import useTextToSpeechBrowser from '~/hooks/Input/useTextToSpeechBrowser';
import usePauseGlobalAudio from '~/hooks/Audio/usePauseGlobalAudio';
import useAudioOutput from '~/hooks/Audio/useAudioOutput';
import useAudioRef from '~/hooks/Audio/useAudioRef';
import { logger } from '~/utils';
import store from '~/store';

type TUseTextToSpeech = {
  messageId?: string;
  content?: TMessageContentParts[] | string;
  isLast?: boolean;
  index?: number;
};

const useTTSBrowser = (props?: TUseTextToSpeech) => {
  const { content, isLast = false, index = 0 } = props ?? {};

  const isMouseDownRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const { isSpeaking: isSpeakingState, setIsSpeaking } = useAudioOutput({ index });
  const { audioRef } = useAudioRef({ setIsPlaying: setIsSpeaking });

  const { pauseGlobalAudio } = usePauseGlobalAudio(index);
  const [voice, setVoice] = useRecoilState(store.voice);
  const globalIsPlaying = useRecoilValue(store.globalAudioPlayingFamily(index));

  const isSpeaking = isSpeakingState || (isLast && globalIsPlaying);

  const {
    generateSpeechLocal: generateSpeech,
    cancelSpeechLocal: cancelSpeech,
    voices,
  } = useTextToSpeechBrowser({ setIsSpeaking });

  useEffect(() => {
    const firstVoice = voices[0];
    if (voices.length && typeof firstVoice === 'object') {
      const lastSelectedVoice = voices.find((v) =>
        typeof v === 'object' ? v.value === voice : v === voice,
      );
      if (lastSelectedVoice != null) {
        const currentVoice =
          typeof lastSelectedVoice === 'object' ? lastSelectedVoice.value : lastSelectedVoice;
        logger.log('useTextToSpeech.ts - Effect:', { voices, voice: currentVoice });
        setVoice(currentVoice);
        return;
      }

      logger.log('useTextToSpeech.ts - Effect:', { voices, voice: firstVoice.value });
      setVoice(firstVoice.value);
    }
  }, [setVoice, voice, voices]);

  const handleMouseDown = () => {
    isMouseDownRef.current = true;
    timerRef.current = window.setTimeout(() => {
      if (isMouseDownRef.current) {
        const messageContent = content ?? '';
        const parsedMessage =
          typeof messageContent === 'string' ? messageContent : parseTextParts(messageContent);
        generateSpeech(parsedMessage);
      }
    }, 1000);
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
  };

  const toggleSpeech = () => {
    if (isSpeaking === true) {
      cancelSpeech();
      pauseGlobalAudio();
    } else {
      const messageContent = content ?? '';
      const parsedMessage =
        typeof messageContent === 'string' ? messageContent : parseTextParts(messageContent);
      generateSpeech(parsedMessage);
    }
  };

  return {
    handleMouseDown,
    handleMouseUp,
    toggleSpeech,
    isSpeaking,
    isLoading: false,
    audioRef,
    voices,
  };
};

export default useTTSBrowser;
