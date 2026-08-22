import React from 'react';
import { RecoilRoot } from 'recoil';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MutableSnapshot } from 'recoil';
import useAudioOutput from '~/hooks/Audio/useAudioOutput';
import useMicGate from '~/hooks/Audio/useMicGate';
import { globalAudioId } from '~/common';
import store from '~/store';

const SPEECH_TAIL_MS = 400;

type THarnessProps = { isListening: boolean };

const startRecording = jest.fn();
const abortRecording = jest.fn();

function createWrapper(handsFree: boolean, initializeState?: (s: MutableSnapshot) => void) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <RecoilRoot
        initializeState={(snapshot) => {
          snapshot.set(store.autoTranscribeAudio, handsFree);
          initializeState?.(snapshot);
        }}
      >
        <MemoryRouter initialEntries={['/c/conversation-1']}>
          <Routes>
            <Route path="/c/:conversationId?" element={children} />
          </Routes>
        </MemoryRouter>
      </RecoilRoot>
    );
  };
}

/** Drives the gate through the real speaking signal rather than a stubbed atom */
function useHarness({ isListening }: THarnessProps) {
  const { setIsSpeaking } = useAudioOutput({ index: 0 });
  const gate = useMicGate({ index: 0, isListening, startRecording, abortRecording });
  return { ...gate, setIsSpeaking };
}

function renderGate(handsFree: boolean, isListening = true) {
  return renderHook<ReturnType<typeof useHarness>, THarnessProps>(useHarness, {
    wrapper: createWrapper(handsFree),
    initialProps: { isListening },
  });
}

describe('useMicGate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    /** jsdom ships no object-URL implementation */
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('discards the microphone as soon as the assistant becomes audible', () => {
    const { result } = renderGate(true);

    expect(result.current.isSuspended).toBe(false);

    act(() => result.current.setIsSpeaking(true));

    expect(result.current.isSuspended).toBe(true);
    expect(abortRecording).toHaveBeenCalledTimes(1);
    expect(startRecording).not.toHaveBeenCalled();
  });

  it('re-arms the microphone after the tail cooldown in hands-free mode', () => {
    const { result } = renderGate(true);

    act(() => result.current.setIsSpeaking(true));
    act(() => result.current.setIsSpeaking(false));

    expect(result.current.isSuspended).toBe(true);
    expect(startRecording).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(SPEECH_TAIL_MS));

    expect(result.current.isSuspended).toBe(false);
    expect(startRecording).toHaveBeenCalledTimes(1);
  });

  it('leaves the microphone off after playback when not hands-free', () => {
    const { result } = renderGate(false);

    act(() => result.current.setIsSpeaking(true));
    expect(abortRecording).toHaveBeenCalledTimes(1);

    act(() => result.current.setIsSpeaking(false));
    act(() => jest.advanceTimersByTime(SPEECH_TAIL_MS));

    expect(result.current.isSuspended).toBe(false);
    expect(startRecording).not.toHaveBeenCalled();
  });

  it('does not abort a microphone that was never listening', () => {
    const { result } = renderGate(true, false);

    act(() => result.current.setIsSpeaking(true));

    expect(result.current.isSuspended).toBe(true);
    expect(abortRecording).not.toHaveBeenCalled();

    act(() => result.current.setIsSpeaking(false));
    act(() => jest.advanceTimersByTime(SPEECH_TAIL_MS));

    expect(startRecording).not.toHaveBeenCalled();
  });

  it('cancels a pending resume when the assistant starts speaking again', () => {
    const { result } = renderGate(true);

    act(() => result.current.setIsSpeaking(true));
    act(() => result.current.setIsSpeaking(false));
    act(() => jest.advanceTimersByTime(SPEECH_TAIL_MS / 2));
    act(() => result.current.setIsSpeaking(true));
    act(() => jest.advanceTimersByTime(SPEECH_TAIL_MS));

    expect(startRecording).not.toHaveBeenCalled();
    expect(result.current.isSuspended).toBe(true);
  });

  it('interrupt cancels assistant audio and suppresses the automatic resume', () => {
    const cancel = jest.fn();
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel, speaking: false, pending: false },
    });

    const { result } = renderGate(true);

    act(() => result.current.setIsSpeaking(true));
    act(() => result.current.interrupt());

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(result.current.isSuspended).toBe(false);

    /** the cancelled player only clears its source afterwards; the gate must not re-close */
    expect(result.current.isSuspended).toBe(false);
    act(() => result.current.setIsSpeaking(false));
    act(() => jest.advanceTimersByTime(SPEECH_TAIL_MS));

    expect(result.current.isSuspended).toBe(false);
    expect(startRecording).not.toHaveBeenCalled();
  });

  it('re-closes the gate for the next reply after an interrupt', () => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel: jest.fn(), speaking: false, pending: false },
    });

    const { result } = renderGate(true);

    act(() => result.current.setIsSpeaking(true));
    act(() => result.current.interrupt());
    act(() => result.current.setIsSpeaking(false));

    act(() => result.current.setIsSpeaking(true));

    expect(result.current.isSuspended).toBe(true);
  });

  it('interrupt pauses the global audio element', () => {
    const audio = document.createElement('audio');
    audio.id = globalAudioId;
    audio.pause = jest.fn();
    document.body.appendChild(audio);

    const { result } = renderHook<ReturnType<typeof useHarness>, THarnessProps>(useHarness, {
      wrapper: createWrapper(true, (snapshot) =>
        snapshot.set(store.globalAudioURLFamily(0), 'blob:audio'),
      ),
      initialProps: { isListening: true },
    });

    act(() => result.current.interrupt());

    expect(audio.pause).toHaveBeenCalledTimes(1);
    document.body.removeChild(audio);
  });

  it('drops a pending resume when the hook unmounts', () => {
    const { result, unmount } = renderGate(true);

    act(() => result.current.setIsSpeaking(true));
    act(() => result.current.setIsSpeaking(false));
    unmount();

    act(() => jest.advanceTimersByTime(SPEECH_TAIL_MS));

    expect(startRecording).not.toHaveBeenCalled();
  });
});
