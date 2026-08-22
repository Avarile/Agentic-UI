// The primary chat seam: everything `useChatHelpers` returns, shared by one pane.
//
// The type is `ReturnType<typeof useChatHelpers>` rather than a hand-written
// interface, so the context can never drift from the hook that fills it.
//
// Mounted per conversation pane (ChatView, and separately by UnifiedSidebar for
// its own composer), which is why the default is `null` and the hook throws: a
// consumer rendered outside a pane has no meaningful conversation to act on, and
// failing loudly beats silently sending into index 0.

import { createContext, useContext } from 'react';
import useChatHelpers from '~/hooks/Chat/useChatHelpers';
type TChatContext = ReturnType<typeof useChatHelpers>;

export const ChatContext = createContext<TChatContext | null>(null);
export const useChatContext = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChatContext must be used within a ChatContext.Provider');
  }
  return ctx;
};
