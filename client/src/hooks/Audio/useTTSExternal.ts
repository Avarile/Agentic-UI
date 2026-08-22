// Message-level text-to-speech via the server's TTS endpoint.
//
// The network counterpart to useTTSBrowser, with the same interface and the same
// role in the audio-output registry. The difference that matters: audio arrives as
// a stream, so playback starts on the first chunk through the MediaSource appender
// rather than waiting for a complete file — and it therefore has real failure modes
// (a dropped connection mid-utterance) that the browser engine does not.

import { useRef, useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { parseTextParts } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import useTextToSpeechExternal from '~/hooks/Input/useTextToSpeechExternal';
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

const useTTSExternal = (props?: TUseTextToSpeech) => {
  const { messageId, content, isLast = false, index = 0 } = props ?? {};

  const isMouseDownRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const { isSpeaking: isSpeakingState, setIsSpeaking } = useAudioOutput({ index });
  const { audioRef } = useAudioRef({ setIsPlaying: setIsSpeaking });

  const { pauseGlobalAudio } = usePauseGlobalAudio(index);
  const [voice, setVoice] = useRecoilState(store.voice);
  const globalIsPlaying = useRecoilValue(store.globalAudioPlayingFamily(index));

  const isSpeaking = isSpeakingState || (isLast && globalIsPlaying);
  const {
    cancelSpeech,
    generateSpeechExternal: generateSpeech,
    isLoading,
    voices,
  } = useTextToSpeechExternal({
    setIsSpeaking,
    audioRef,
    messageId,
    isLast,
    index,
  });

  useEffect(() => {
    const firstVoice = voices[0];
    if (voices.length) {
      const lastSelectedVoice = voices.find((v) => v === voice);
      if (lastSelectedVoice != null) {
        logger.log('useTextToSpeech.ts - Effect:', { voices, voice: lastSelectedVoice });
        setVoice(lastSelectedVoice.toString());
        return;
      }
      logger.log('useTextToSpeech.ts - Effect:', { voices, voice: firstVoice });
      setVoice(firstVoice.toString());
    }
  }, [setVoice, voice, voices]);

  const handleMouseDown = () => {
    isMouseDownRef.current = true;
    timerRef.current = window.setTimeout(() => {
      if (isMouseDownRef.current) {
        const messageContent = content ?? '';
        const parsedMessage =
          typeof messageContent === 'string' ? messageContent : parseTextParts(messageContent);
        generateSpeech(parsedMessage, false);
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
      generateSpeech(parsedMessage, false);
    }
  };

  return {
    handleMouseDown,
    handleMouseUp,
    toggleSpeech,
    isSpeaking,
    isLoading,
    audioRef,
    voices,
  };
};

export default useTTSExternal;
