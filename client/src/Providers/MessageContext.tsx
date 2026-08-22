// Per-message identity and render flags, provided by each message as it renders.
//
// This is how deeply nested content parts (code blocks, artifacts, tool output)
// learn which message and part index they belong to without every intermediate
// component threading props. `isSubmitting`/`isLatestMessage` are scoped here
// rather than read from the store so only the streaming message pays for cursor
// and progress re-renders.

import { createContext, useContext } from 'react';

type MessageContext = {
  messageId: string;
  nextType?: string;
  partIndex?: number;
  isExpanded: boolean;
  conversationId?: string | null;
  /** Submission state for cursor display - only true for latest message when submitting */
  isSubmitting?: boolean;
  /** Whether this is the latest message in the conversation */
  isLatestMessage?: boolean;
};

export const MessageContext = createContext<MessageContext>({} as MessageContext);
export const useMessageContext = () => useContext(MessageContext);
