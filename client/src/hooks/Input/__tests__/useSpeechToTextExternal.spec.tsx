import React from 'react';
import { RecoilRoot } from 'recoil';
import { act, renderHook, waitFor } from '@testing-library/react';
import useSpeechToTextExternal from '~/hooks/Input/useSpeechToTextExternal';
import store from '~/store';

const AUTO_SEND_SECONDS = 3;

const mockProcessAudio = jest.fn();
let mockOnSuccess: ((data: { text: string }) => void) | undefined;

jest.mock('~/data-provider', () => ({
  __esModule: true,
  useSpeechToTextMutation: (options: { onSuccess: (data: { text: string }) => void }) => {
    mockOnSuccess = options.onSuccess;
    return { mutate: mockProcessAudio, isLoading: false };
  },
}));

/** jsdom implements neither MediaRecorder, getUserMedia, nor Web Audio */
class MediaRecorderMock {
  static instances: MediaRecorderMock[] = [];
  static isTypeSupported = () => true;

  state: 'inactive' | 'recording' = 'inactive';
  private listeners: Record<string, ((event: unknown) => void)[]> = {};

  constructor(public stream: MediaStream) {
    MediaRecorderMock.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  start() {
    this.state = 'recording';
    this.emit('dataavailable', { data: new Blob(['audio']) });
  }

  stop() {
    this.state = 'inactive';
    this.emit('stop', {});
  }

  private emit(type: string, event: unknown) {
    (this.listeners[type] ?? []).forEach((listener) => listener(event));
  }
}

const audioContextClose = jest.fn().mockResolvedValue(undefined);
let audioContextCount = 0;

class AudioContextMock {
  constructor() {
    audioContextCount += 1;
  }

  createMediaStreamSource = () => ({ connect: jest.fn() });
  createAnalyser = () => ({
    minDecibels: 0,
    frequencyBinCount: 8,
    getByteFrequencyData: (data: Uint8Array) => data.fill(0),
  });

  close = () => {
    audioContextCount -= 1;
    return audioContextClose();
  };
}

const track = { stop: jest.fn() };
const stream = { getTracks: () => [track] } as unknown as MediaStream;

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <RecoilRoot
      initializeState={(snapshot) => {
        snapshot.set(store.autoSendText, AUTO_SEND_SECONDS);
        snapshot.set(store.speechToText, true);
        snapshot.set(store.autoTranscribeAudio, true);
      }}
    >
      {children}
    </RecoilRoot>
  );
}

describe('useSpeechToTextExternal', () => {
  const setText = jest.fn();
  const onTranscriptionComplete = jest.fn();

  beforeAll(() => {
    Object.defineProperty(global, 'MediaRecorder', { writable: true, value: MediaRecorderMock });
    Object.defineProperty(global, 'AudioContext', { writable: true, value: AudioContextMock });
    Object.defineProperty(global.navigator, 'mediaDevices', {
      writable: true,
      value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
    });
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    MediaRecorderMock.instances = [];
    audioContextCount = 0;
  });

  const renderSTT = () =>
    renderHook(() => useSpeechToTextExternal(setText, onTranscriptionComplete), {
      wrapper: Wrapper,
    });

  it('transcribes the recording on a normal stop', async () => {
    const { result } = renderSTT();

    await act(async () => result.current.externalStartRecording());
    await waitFor(() => expect(result.current.isListening).toBe(true));

    act(() => result.current.externalStopRecording());

    expect(mockProcessAudio).toHaveBeenCalledTimes(1);
  });

  it('discards the recording on abort so the assistant is never transcribed', async () => {
    const { result } = renderSTT();

    await act(async () => result.current.externalStartRecording());
    await waitFor(() => expect(result.current.isListening).toBe(true));

    act(() => result.current.externalAbortRecording());

    expect(mockProcessAudio).not.toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });

  it('abort cancels an auto-send already armed by a returned transcription', () => {
    jest.useFakeTimers();
    const { result } = renderSTT();

    act(() => mockOnSuccess?.({ text: 'the capital of France is Paris' }));
    act(() => result.current.externalAbortRecording());
    act(() => jest.advanceTimersByTime(AUTO_SEND_SECONDS * 1000));

    expect(onTranscriptionComplete).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('closes the silence monitor so repeated turns do not leak AudioContexts', async () => {
    const { result } = renderSTT();

    for (let i = 0; i < 4; i++) {
      await act(async () => result.current.externalStartRecording());
      await waitFor(() => expect(result.current.isListening).toBe(true));
      act(() => result.current.externalAbortRecording());
      await waitFor(() => expect(result.current.isListening).toBe(false));
    }

    expect(audioContextCount).toBe(0);
    expect(audioContextClose).toHaveBeenCalledTimes(4);
  });

  it('requests echo cancellation from the microphone', async () => {
    const { result } = renderSTT();

    await act(async () => result.current.externalStartRecording());

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  });
});
