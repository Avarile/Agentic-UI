// The conversation surface: header, message list or landing, composer, footer.
//
// Where the chat's providers are established (`ChatFormProvider`, `ChatContext`,
// `AddedChatContext`) and where the streaming hooks are attached. Rendered by
// ChatRoute once conversation state has settled.
//
// The branching between landing, spinner and message list is more subtle than it
// looks. `isLandingPage` means "no messages AND this is a new chat", while
// `isNavigating` means "no messages yet but a conversation is named" — the second
// must show a spinner, not the landing page, or navigating to an existing
// conversation flashes the greeting before its messages arrive.
//
// `refetchOnMount: true` on the messages query is paired with the fact that
// navigation now *invalidates* rather than removes the cache: a warm conversation
// renders instantly and reconciles in the background instead of unmounting into a
// spinner. That in turn is why `useResumeOnLoad` is gated on `!isFetching` as well
// as `!isLoading` — a stale invalidated cache reports `isLoading: false` while its
// refetch is still in flight, and resume must not build from it.
//
// The `sr-only` heading and the guard around `conversationTitle` exist because
// Recoil's conversation can lag the route mid-navigation; announcing a title that
// belongs to the previous conversation is worse than announcing nothing.

import { memo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { Spinner } from '@librechat/client';
import { useParams } from 'react-router-dom';
import { Constants, buildTree } from 'librechat-data-provider';
import type { TChatProject, TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import {
  useAddedResponse,
  useResumeOnLoad,
  useAdaptiveSSE,
  useChatHelpers,
  useQueueDrain,
  useLocalize,
} from '~/hooks';
import { ChatContext, AddedChatContext, ChatFormProvider, useFileMapContext } from '~/Providers';
import ConversationStarters from './Input/ConversationStarters';
import { useGetMessagesByConvoId } from '~/data-provider';
import ProjectLandingChip from './ProjectLandingChip';
import MessagesView from './Messages/MessagesView';
import Presentation from './Presentation';
import ChatForm from './Input/ChatForm';
import Landing from './Landing';
import Header from './Header';
import Footer from './Footer';
import { cn } from '~/utils';
import store from '~/store';

function LoadingSpinner() {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    </div>
  );
}

function ChatView({ index = 0, project }: { index?: number; project?: TChatProject }) {
  const { conversationId } = useParams();
  const localize = useLocalize();
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  const fileMap = useFileMapContext();

  const {
    data: messagesTree = null,
    isLoading,
    isFetching,
  } = useGetMessagesByConvoId(
    conversationId ?? '',
    {
      select: useCallback(
        (data: TMessage[]) => {
          const dataTree = buildTree({ messages: data, fileMap });
          return dataTree?.length === 0 ? null : (dataTree ?? null);
        },
        [fileMap],
      ),
      enabled: !!conversationId && conversationId !== Constants.SEARCH,
      /** Refetch stale caches on mount: navigation invalidates (not removes)
       * messages now, so a warm conversation renders instantly from cache and
       * reconciles in the background instead of unmounting into a spinner. */
      refetchOnMount: true,
    },
    { isStreaming: isSubmitting },
  );

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse();

  useAdaptiveSSE(rootSubmission, chatHelpers, false, index);

  // Auto-resume if navigating back to conversation with active job.
  // Wait for messages to load AND the warm-cache background revalidation to
  // settle: a stale invalidated cache mounts with isLoading false while the
  // refetch is in flight, and resume must not build from (or race) it.
  useResumeOnLoad(conversationId, chatHelpers.getMessages, index, !isLoading && !isFetching);

  // Auto-send queued follow-up messages once a run finishes cleanly.
  useQueueDrain(index, conversationId, chatHelpers.ask);

  let content: JSX.Element | null | undefined;
  const isLandingPage =
    (!messagesTree || messagesTree.length === 0) &&
    (conversationId === Constants.NEW_CONVO || !conversationId);
  const isNavigating = (!messagesTree || messagesTree.length === 0) && conversationId != null;
  const isProjectLandingPage = isLandingPage && project != null;

  if (isLoading && conversationId !== Constants.NEW_CONVO) {
    content = <LoadingSpinner />;
  } else if ((isLoading || isNavigating) && !isLandingPage) {
    content = <LoadingSpinner />;
  } else if (!isLandingPage) {
    content = <MessagesView messagesTree={messagesTree} />;
  } else {
    content = <Landing centerFormOnLanding={centerFormOnLanding} />;
  }

  const chatFormPlaceholder =
    isProjectLandingPage && project
      ? localize('com_ui_new_chat_in_project', { name: project.name })
      : undefined;

  // Recoil conversation can lag the route during navigation; only announce a
  // title that belongs to the conversation currently in the URL.
  const conversationTitle =
    chatHelpers.conversation?.conversationId === conversationId
      ? chatHelpers.conversation?.title?.trim()
      : undefined;
  const pageHeading =
    isLandingPage || !conversationTitle ? localize('com_ui_new_chat') : conversationTitle;

  return (
    <ChatFormProvider {...methods}>
      <ChatContext.Provider value={chatHelpers}>
        <AddedChatContext.Provider value={addedChatHelpers}>
          <Presentation>
            <div className="relative flex h-full w-full flex-col">
              <h1 className="sr-only">{pageHeading}</h1>
              <Header />
              <>
                <div
                  className={cn(
                    'flex flex-col',
                    isLandingPage
                      ? 'flex-1 items-center justify-end sm:justify-center'
                      : 'h-full overflow-y-auto',
                  )}
                >
                  {content}
                  <div
                    className={cn(
                      'w-full',
                      isLandingPage && 'max-w-3xl transition-all duration-200 xl:max-w-4xl',
                    )}
                  >
                    {isProjectLandingPage && project && <ProjectLandingChip project={project} />}
                    {isLandingPage && <ConversationStarters />}
                    <ChatForm index={index} placeholder={chatFormPlaceholder} />
                    {!isLandingPage && <Footer />}
                  </div>
                </div>
                {isLandingPage && <Footer />}
              </>
            </div>
          </Presentation>
        </AddedChatContext.Provider>
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(ChatView);
