import { memo, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { ComponentType } from 'react';
import useTextToSpeechBrowser from '~/hooks/Input/useTextToSpeechBrowser';
import { useAutoPlay, useAudioOutput } from '~/hooks/Audio';
import StreamAudio from '~/components/Chat/Input/StreamAudio';
import { TTSEndpoints } from '~/common';
import { logger } from '~/utils';
import store from '~/store';

type TPlayback = { index?: number };

export function BrowserPlayback({ index = 0 }: TPlayback) {
  const { conversationId: paramId } = useParams();
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const setGlobalIsPlaying = useSetRecoilState(store.globalAudioPlayingFamily(index));
  const { setIsSpeaking } = useAudioOutput({ index, onChange: setGlobalIsPlaying });

  const { pending, markPlayed } = useAutoPlay(index);
  const { generateSpeechLocal, cancelSpeechLocal, voices, isSpeechSynthesisSupported } =
    useTextToSpeechBrowser({ setIsSpeaking });

  const playedRunRef = useRef<string | null>(null);
  const cancelRef = useRef(cancelSpeechLocal);
  useEffect(() => {
    cancelRef.current = cancelSpeechLocal;
  });

  useEffect(() => {
    if (!pending || playedRunRef.current === pending.runId) {
      return;
    }
    if (!isSpeechSynthesisSupported) {
      playedRunRef.current = pending.runId;
      markPlayed(pending.runId);
      return;
    }
    /** `getVoices()` is empty until the browser fires `voiceschanged`; retry once it does */
    if (!voices.length) {
      return;
    }
    logger.log('BrowserPlayback - speaking run:', pending.runId);
    playedRunRef.current = pending.runId;
    markPlayed(pending.runId);
    generateSpeechLocal(pending.text);
  }, [pending, voices.length, isSpeechSynthesisSupported, markPlayed, generateSpeechLocal]);

  useEffect(() => {
    if (!isSubmitting) {
      return;
    }
    cancelRef.current();
  }, [isSubmitting]);

  useEffect(() => () => cancelRef.current(), [paramId]);

  return null;
}

const playbackComponents: Record<string, ComponentType<TPlayback> | undefined> = {
  [TTSEndpoints.browser]: BrowserPlayback,
  [TTSEndpoints.external]: StreamAudio,
};

function Playback({ index = 0 }: TPlayback) {
  const engineTTS = useRecoilValue<string>(store.engineTTS);
  const speechSettingsInitialized = useRecoilValue(store.speechSettingsInitialized);

  if (!speechSettingsInitialized) {
    return null;
  }

  const SelectedPlayback = playbackComponents[engineTTS];
  if (!SelectedPlayback) {
    return null;
  }
  return <SelectedPlayback index={index} />;
}

export default memo(Playback);
