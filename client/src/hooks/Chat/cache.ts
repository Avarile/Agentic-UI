// Query-key helpers for message caches, and the "which conversation do these
// messages belong to" question.
//
// `getMessagesConversationId` scans from the end because the earliest messages of a
// new conversation still carry the placeholder id while later ones have the real
// one. Reading forward would return the placeholder.

import { Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';

type MessageCacheIdsParams = {
  queryParam: string;
  conversationId?: string | null;
  messages: TMessage[];
};

function isConcreteConversationId(conversationId?: string | null): conversationId is string {
  return (
    !!conversationId &&
    conversationId !== Constants.NEW_CONVO &&
    conversationId !== Constants.PENDING_CONVO
  );
}

export function getMessagesConversationId(messages: TMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const conversationId = messages[i]?.conversationId;
    if (isConcreteConversationId(conversationId)) {
      return conversationId;
    }
  }
}

export function getMessageCacheIds({
  queryParam,
  conversationId,
  messages,
}: MessageCacheIdsParams): string[] {
  const ids = [queryParam];
  const messageConversationId = getMessagesConversationId(messages);

  if (queryParam === Constants.NEW_CONVO && isConcreteConversationId(conversationId)) {
    ids.push(conversationId);
  }

  if (isConcreteConversationId(messageConversationId) && !ids.includes(messageConversationId)) {
    ids.push(messageConversationId);
  }

  return ids;
}
