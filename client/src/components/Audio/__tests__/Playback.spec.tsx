import React from 'react';
import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TConversation, TMessage } from 'librechat-data-provider';
import type { MutableSnapshot } from 'recoil';
import store from '~/store';

jest.mock('~/components/Chat/Input/StreamAudio', () => ({
  __esModule: true,
  default: () => <div data-testid="stream-audio" />,
}));

import Playback from '../Playback';

const conversation = {
  conversationId: 'conversation-1',
  endpoint: 'openAI',
  model: 'gpt-4',
} as TConversation;

const userMessage = {
  messageId: 'user-message',
  parentMessageId: '00000000-0000-0000-0000-000000000000',
  conversationId: conversation.conversationId,
  text: 'Hello',
  isCreatedByUser: true,
} as TMessage;

const assistantMessage = {
  messageId: 'assistant-message',
  parentMessageId: userMessage.messageId,
  conversationId: conversation.conversationId,
  text: 'Hi there',
  isCreatedByUser: false,
} as TMessage;

const speak = jest.fn();
const cancel = jest.fn();
const fetchMock = jest.fn();
const submitLabel = 'submit';
const navigateLabel = 'navigate';
const voice = { name: 'Local Voice', localService: true };

/** `speechSynthesis.getVoices()` is empty until the browser fires `voiceschanged` */
let availableVoices: (typeof voice)[] = [];
const synthState = { speaking: false, pending: false };
const voicesChangedHandlers: (() => void)[] = [];

const loadVoices = () => {
  availableVoices = [voice];
  act(() => voicesChangedHandlers.forEach((handler) => handler()));
};

class UtteranceMock {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

beforeAll(() => {
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    writable: true,
    value: {
      speak,
      cancel,
      get speaking() {
        return synthState.speaking;
      },
      get pending() {
        return synthState.pending;
      },
      getVoices: () => availableVoices,
      addEventListener: (event: string, handler: () => void) => {
        if (event === 'voiceschanged') {
          voicesChangedHandlers.push(handler);
        }
      },
    },
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    writable: true,
    value: UtteranceMock,
  });
});

function Controls({ index = 0 }: { index?: number }) {
  const setIsSubmitting = useSetRecoilState(store.isSubmittingFamily(index));
  const isSpeaking = useRecoilValue(store.isSpeakingFamily(index));
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="is-speaking">{String(isSpeaking)}</span>
      <button type="button" onClick={() => setIsSubmitting(true)}>
        {submitLabel}
      </button>
      <button type="button" onClick={() => navigate('/c/conversation-2')}>
        {navigateLabel}
      </button>
    </>
  );
}

function renderPlayback({
  engineTTS = 'browser',
  initialized = true,
  withVoices = true,
  messages = [userMessage, assistantMessage],
  initializeState,
}: {
  engineTTS?: string;
  initialized?: boolean;
  withVoices?: boolean;
  messages?: TMessage[];
  initializeState?: (snapshot: MutableSnapshot) => void;
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData<TMessage[]>([QueryKeys.messages, conversation.conversationId], messages);

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot
        initializeState={(snapshot) => {
          snapshot.set(store.conversationByIndex(0), conversation);
          snapshot.set(store.engineTTS, engineTTS);
          snapshot.set(store.speechSettingsInitialized, initialized);
          snapshot.set(store.automaticPlayback, true);
          snapshot.set(store.activeRunFamily(0), 'run-1');
          initializeState?.(snapshot);
        }}
      >
        <MemoryRouter initialEntries={[`/c/${conversation.conversationId}`]}>
          <Routes>
            <Route
              path="/c/:conversationId?"
              element={
                <>
                  <Playback index={0} />
                  <Controls index={0} />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );

  if (withVoices) {
    loadVoices();
  }
  return result;
}

describe('Playback', () => {
  beforeEach(() => {
    speak.mockClear();
    cancel.mockClear();
    fetchMock.mockClear();
    synthState.speaking = false;
    synthState.pending = false;
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
  });

  it('waits for the browser voice list before speaking', () => {
    renderPlayback({ withVoices: false });

    expect(speak).not.toHaveBeenCalled();

    loadVoices();

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toEqual(
      expect.objectContaining({ text: assistantMessage.text }),
    );
  });

  it('speaks the finished reply locally without calling the server on the browser engine', () => {
    renderPlayback();

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toEqual(
      expect.objectContaining({ text: assistantMessage.text }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('stream-audio')).not.toBeInTheDocument();
  });

  it('speaks a run only once', () => {
    const { rerender } = renderPlayback();
    rerender(<div />);

    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('falls back to the first available voice when none is selected', () => {
    renderPlayback();

    expect(speak.mock.calls[0][0]).toEqual(expect.objectContaining({ voice }));
  });

  it('mounts the streaming component on the external engine', () => {
    renderPlayback({ engineTTS: 'external' });

    expect(screen.getByTestId('stream-audio')).toBeInTheDocument();
    expect(speak).not.toHaveBeenCalled();
  });

  it('plays nothing before speech settings initialize', () => {
    renderPlayback({ initialized: false });

    expect(speak).not.toHaveBeenCalled();
    expect(screen.queryByTestId('stream-audio')).not.toBeInTheDocument();
  });

  it('plays nothing for an unknown engine', () => {
    renderPlayback({ engineTTS: 'elevenlabs' });

    expect(speak).not.toHaveBeenCalled();
    expect(screen.queryByTestId('stream-audio')).not.toBeInTheDocument();
  });

  it('cancels playback when a new message is submitted', () => {
    renderPlayback();
    cancel.mockClear();

    fireEvent.click(screen.getByText(submitLabel));

    expect(cancel).toHaveBeenCalled();
  });

  it('cancels playback when the conversation changes', () => {
    renderPlayback();
    cancel.mockClear();

    fireEvent.click(screen.getByText(navigateLabel));

    expect(cancel).toHaveBeenCalled();
  });

  it('cancels playback on unmount', () => {
    const { unmount } = renderPlayback();
    cancel.mockClear();

    unmount();

    expect(cancel).toHaveBeenCalled();
  });

  it('reports the assistant as speaking so the microphone gate can close', () => {
    renderPlayback();

    expect(screen.getByTestId('is-speaking')).toHaveTextContent('true');

    const utterance = speak.mock.calls[0][0] as UtteranceMock;
    act(() => utterance.onend?.());

    expect(screen.getByTestId('is-speaking')).toHaveTextContent('false');
  });

  it('releases the gate when the synthesizer drops onend', () => {
    jest.useFakeTimers();
    synthState.speaking = true;

    renderPlayback();
    expect(screen.getByTestId('is-speaking')).toHaveTextContent('true');

    /** Chrome intermittently never fires `onend`; only the watchdog can recover */
    act(() => jest.advanceTimersByTime(250));
    expect(screen.getByTestId('is-speaking')).toHaveTextContent('true');

    synthState.speaking = false;
    act(() => jest.advanceTimersByTime(250));

    expect(screen.getByTestId('is-speaking')).toHaveTextContent('false');
    jest.useRealTimers();
  });
});
