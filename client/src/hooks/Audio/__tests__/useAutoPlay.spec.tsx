import React from 'react';
import { RecoilRoot } from 'recoil';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import type { TConversation, TMessage } from 'librechat-data-provider';
import type { MutableSnapshot } from 'recoil';
import useAutoPlay from '~/hooks/Audio/useAutoPlay';
import store from '~/store';

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

const activeRunId = 'run-1';

function createWrapper(
  messages: TMessage[],
  initializeState?: (snapshot: MutableSnapshot) => void,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData<TMessage[]>([QueryKeys.messages, conversation.conversationId], messages);

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <RecoilRoot
          initializeState={(snapshot) => {
            snapshot.set(store.conversationByIndex(0), conversation);
            snapshot.set(store.automaticPlayback, true);
            snapshot.set(store.activeRunFamily(0), activeRunId);
            initializeState?.(snapshot);
          }}
        >
          <MemoryRouter initialEntries={[`/c/${conversation.conversationId}`]}>
            <Routes>
              <Route path="/c/:conversationId?" element={children} />
            </Routes>
          </MemoryRouter>
        </RecoilRoot>
      </QueryClientProvider>
    );
  };
}

describe('useAutoPlay', () => {
  it('exposes the finished assistant run as pending', () => {
    const { result } = renderHook(() => useAutoPlay(0), {
      wrapper: createWrapper([userMessage, assistantMessage]),
    });

    expect(result.current.pending).toEqual({
      runId: activeRunId,
      messageId: assistantMessage.messageId,
      text: assistantMessage.text,
    });
  });

  it('stops offering a run once it is marked played', () => {
    const { result } = renderHook(() => useAutoPlay(0), {
      wrapper: createWrapper([userMessage, assistantMessage]),
    });

    act(() => result.current.markPlayed(activeRunId));

    expect(result.current.pending).toBeNull();
  });

  it('does not offer a run while the message is still streaming', () => {
    const { result } = renderHook(() => useAutoPlay(0), {
      wrapper: createWrapper([userMessage, assistantMessage], ({ set }) =>
        set(store.isSubmittingFamily(0), true),
      ),
    });

    expect(result.current.pending).toBeNull();
  });

  it('does not offer a user-authored tail message', () => {
    const { result } = renderHook(() => useAutoPlay(0), {
      wrapper: createWrapper([
        assistantMessage,
        {
          ...userMessage,
          messageId: 'user-follow-up',
          parentMessageId: assistantMessage.messageId,
        } as TMessage,
      ]),
    });

    expect(result.current.pending).toBeNull();
  });

  it('does not offer a placeholder message id', () => {
    const { result } = renderHook(() => useAutoPlay(0), {
      wrapper: createWrapper([
        userMessage,
        { ...assistantMessage, messageId: `${assistantMessage.messageId}_placeholder` } as TMessage,
      ]),
    });

    expect(result.current.pending).toBeNull();
  });

  it('does not offer a run when automatic playback is disabled', () => {
    const { result } = renderHook(() => useAutoPlay(0), {
      wrapper: createWrapper([userMessage, assistantMessage], ({ set }) =>
        set(store.automaticPlayback, false),
      ),
    });

    expect(result.current.pending).toBeNull();
  });

  it('does not offer a run before one becomes active', () => {
    const { result } = renderHook(() => useAutoPlay(0), {
      wrapper: createWrapper([userMessage, assistantMessage], ({ set }) =>
        set(store.activeRunFamily(0), null),
      ),
    });

    expect(result.current.pending).toBeNull();
  });

  it('exposes the tail message for consumers that need the raw message', () => {
    const { result } = renderHook(() => useAutoPlay(0), {
      wrapper: createWrapper([userMessage, assistantMessage]),
    });

    expect(result.current.latestMessage).toEqual(
      expect.objectContaining({ messageId: assistantMessage.messageId }),
    );
  });
});
