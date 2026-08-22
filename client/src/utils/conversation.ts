// Conversation shape helpers: building, resetting and comparing conversation objects
// across endpoint changes.

import type { TConversation } from 'librechat-data-provider';

export const isTemporaryConversation = (conversation?: Partial<TConversation> | null): boolean =>
  conversation?.isTemporary === true ||
  (conversation?.isTemporary === undefined && conversation?.expiredAt != null);
