// Resets `visibleArtifacts` when the conversation id changes.
//
// Deliberately narrow: it compares against a ref rather than relying on effect
// dependencies, so it fires on a genuine id change and not on the re-renders that
// accompany one. Broader conversation-switch cleanup lives elsewhere —
// hooks/Artifacts/useResetArtifactsOnConversationChange.ts for artifact focus,
// hooks/SSE/cleanup.ts for subagent state.

import { useEffect, useRef } from 'react';
import { useResetRecoilState } from 'recoil';
import { logger } from '~/utils';
import store from '~/store';

/**
 * Hook to reset visible artifacts when the conversation ID changes
 * @param conversationId - The current conversation ID
 */
export default function useIdChangeEffect(conversationId: string) {
  const lastConvoId = useRef<string | null>(null);
  const resetVisibleArtifacts = useResetRecoilState(store.visibleArtifacts);

  useEffect(() => {
    if (conversationId !== lastConvoId.current) {
      logger.log('conversation', 'Conversation ID change');
      resetVisibleArtifacts();
    }
    lastConvoId.current = conversationId;
  }, [conversationId, resetVisibleArtifacts]);
}
