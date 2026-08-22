import { useCallback, useEffect, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import { useGetCustomConfigSpeechQuery } from 'librechat-data-provider/react-query';
import SpeechRecognitionImport, { useSpeechRecognition } from 'react-speech-recognition';
import { useLocalize } from '~/hooks';
import store from '~/store';

type SpeechRecognitionController = Pick<
  typeof SpeechRecognitionImport,
  'startListening' | 'stopListening' | 'abortListening'
>;
type SpeechRecognitionModule = Partial<SpeechRecognitionController> & {
  default?: Partial<SpeechRecognitionController>;
};

const hasSpeechRecognitionController = (
  controller?: Partial<SpeechRecognitionController>,
): controller is SpeechRecognitionController =>
  typeof controller?.startListening === 'function' &&
  typeof controller.stopListening === 'function' &&
  typeof controller.abortListening === 'function';

const speechRecognitionModule = SpeechRecognitionImport as SpeechRecognitionModule;
const SpeechRecognition = hasSpeechRecognitionController(speechRecognitionModule)
  ? speechRecognitionModule
  : speechRecognitionModule.default;

const useSpeechToTextBrowser = (
  setText: (text: string) => void,
  onTranscriptionComplete: (text: string) => void,
) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: speechConfig } = useGetCustomConfigSpeechQuery({ enabled: true });
  const sttExternal = Boolean(speechConfig?.sttExternal);

  const lastTranscript = useRef<string | null>(null);
  const lastInterim = useRef<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>();
  const [autoSendText] = useRecoilState(store.autoSendText);
  const [languageSTT] = useRecoilState<string>(store.languageSTT);
  const [autoTranscribeAudio] = useRecoilState<boolean>(store.autoTranscribeAudio);

  const {
    listening,
    finalTranscript,
    resetTranscript,
    interimTranscript,
    isMicrophoneAvailable,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();
  const isListening = listening;

  useEffect(() => {
    if (interimTranscript == null || interimTranscript === '') {
      return;
    }

    if (lastInterim.current === interimTranscript) {
      return;
    }

    setText(interimTranscript);
    lastInterim.current = interimTranscript;
  }, [setText, interimTranscript]);

  useEffect(() => {
    if (finalTranscript == null || finalTranscript === '') {
      return;
    }

    if (lastTranscript.current === finalTranscript) {
      return;
    }

    setText(finalTranscript);
    lastTranscript.current = finalTranscript;
    if (autoSendText > -1 && finalTranscript.length > 0) {
      timeoutRef.current = setTimeout(() => {
        onTranscriptionComplete(finalTranscript);
        resetTranscript();
      }, autoSendText * 1000);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [setText, onTranscriptionComplete, resetTranscript, finalTranscript, autoSendText]);

  /** Reports why recognition is unusable, or `null` when it is ready to start */
  const getUnavailableMessage = useCallback(() => {
    if (!browserSupportsSpeechRecognition || !hasSpeechRecognitionController(SpeechRecognition)) {
      return sttExternal
        ? localize('com_ui_speech_not_supported_use_external')
        : localize('com_ui_speech_not_supported');
    }

    if (!isMicrophoneAvailable) {
      return localize('com_ui_microphone_unavailable');
    }

    return null;
  }, [browserSupportsSpeechRecognition, isMicrophoneAvailable, localize, sttExternal]);

  const startRecording = useCallback(() => {
    const unavailableMessage = getUnavailableMessage();
    if (unavailableMessage != null) {
      showToast({ message: unavailableMessage, status: 'error' });
      return;
    }

    if (isListening === true) {
      return;
    }

    SpeechRecognition?.startListening({ language: languageSTT, continuous: autoTranscribeAudio });
  }, [autoTranscribeAudio, getUnavailableMessage, isListening, languageSTT, showToast]);

  const stopRecording = useCallback(() => {
    if (!hasSpeechRecognitionController(SpeechRecognition)) {
      return;
    }

    SpeechRecognition.stopListening();
  }, []);

  /**
   * Stops listening and throws away everything captured, including any auto-send already
   * armed by `finalTranscript`. Used when the assistant starts speaking, so its own voice
   * is never transcribed back into the composer.
   */
  const abortRecording = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    lastTranscript.current = null;
    lastInterim.current = null;

    if (!hasSpeechRecognitionController(SpeechRecognition)) {
      return;
    }

    SpeechRecognition.abortListening();
    resetTranscript();
  }, [resetTranscript]);

  return {
    isListening,
    isLoading: false,
    startRecording,
    stopRecording,
    abortRecording,
  };
};

export default useSpeechToTextBrowser;
