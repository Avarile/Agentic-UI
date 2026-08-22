import React from 'react';
import { RecoilRoot } from 'recoil';
import { act, renderHook } from '@testing-library/react';
import type { MutableSnapshot } from 'recoil';
import useSpeechToTextBrowser from '~/hooks/Input/useSpeechToTextBrowser';
import store from '~/store';

const AUTO_SEND_SECONDS = 3;

const mockStartListening = jest.fn();
const mockStopListening = jest.fn();
const mockAbortListening = jest.fn();
const mockResetTranscript = jest.fn();

let mockFinalTranscript = '';
let mockInterimTranscript = '';

/** jsdom ships no Web Speech API, so the recogniser is faked at the library boundary */
jest.mock('react-speech-recognition', () => ({
  __esModule: true,
  default: {
    startListening: (...args: unknown[]) => mockStartListening(...args),
    stopListening: () => mockStopListening(),
    abortListening: () => mockAbortListening(),
  },
  useSpeechRecognition: () => ({
    listening: true,
    finalTranscript: mockFinalTranscript,
    interimTranscript: mockInterimTranscript,
    resetTranscript: mockResetTranscript,
    isMicrophoneAvailable: true,
    browserSupportsSpeechRecognition: true,
  }),
}));

jest.mock('librechat-data-provider/react-query', () => ({
  __esModule: true,
  useGetCustomConfigSpeechQuery: () => ({ data: { sttExternal: false } }),
}));

function createWrapper(initializeState?: (snapshot: MutableSnapshot) => void) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <RecoilRoot
        initializeState={(snapshot) => {
          snapshot.set(store.autoSendText, AUTO_SEND_SECONDS);
          snapshot.set(store.autoTranscribeAudio, true);
          initializeState?.(snapshot);
        }}
      >
        {children}
      </RecoilRoot>
    );
  };
}

describe('useSpeechToTextBrowser', () => {
  const setText = jest.fn();
  const onTranscriptionComplete = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockFinalTranscript = '';
    mockInterimTranscript = '';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderSTT = () =>
    renderHook(() => useSpeechToTextBrowser(setText, onTranscriptionComplete), {
      wrapper: createWrapper(),
    });

  it('auto-sends a finalized transcript once the delay elapses', () => {
    const { rerender } = renderSTT();

    mockFinalTranscript = 'what is the weather';
    rerender();

    expect(setText).toHaveBeenCalledWith('what is the weather');

    act(() => jest.advanceTimersByTime(AUTO_SEND_SECONDS * 1000));

    expect(onTranscriptionComplete).toHaveBeenCalledWith('what is the weather');
  });

  it('abortRecording cancels an armed auto-send so echo is never submitted', () => {
    const { result, rerender } = renderSTT();

    mockFinalTranscript = 'the capital of France is Paris';
    rerender();

    act(() => result.current.abortRecording());
    act(() => jest.advanceTimersByTime(AUTO_SEND_SECONDS * 1000));

    expect(onTranscriptionComplete).not.toHaveBeenCalled();
    expect(mockAbortListening).toHaveBeenCalledTimes(1);
    expect(mockResetTranscript).toHaveBeenCalledTimes(1);
    expect(mockStopListening).not.toHaveBeenCalled();
  });

  it('abortRecording discards, rather than finalizes, the pending transcript', () => {
    const { result } = renderSTT();

    act(() => result.current.abortRecording());

    expect(mockAbortListening).toHaveBeenCalledTimes(1);
    expect(mockStopListening).not.toHaveBeenCalled();
  });

  it('accepts the same phrase again after an abort', () => {
    const { result, rerender } = renderSTT();

    mockFinalTranscript = 'hello there';
    rerender();
    expect(setText).toHaveBeenCalledTimes(1);

    act(() => result.current.abortRecording());
    mockFinalTranscript = '';
    rerender();
    setText.mockClear();

    /** the user repeats themselves once the assistant stops; the abort cleared the guard */
    mockFinalTranscript = 'hello there';
    rerender();

    expect(setText).toHaveBeenCalledWith('hello there');
  });

  it('starts and stops through the recogniser controller', () => {
    const { result } = renderSTT();

    act(() => result.current.stopRecording());
    expect(mockStopListening).toHaveBeenCalledTimes(1);

    act(() => result.current.startRecording());
    /** already listening, so a redundant start is ignored */
    expect(mockStartListening).not.toHaveBeenCalled();
  });
});
