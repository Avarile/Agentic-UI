// Automatic playback of new assistant messages when the preference is on, including
// the once-per-message guard.

import { useMemo, useCallback } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import type { TAutoPlayRun } from '~/common';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { getLatestText } from '~/utils';
import store from '~/store';

type TUseAutoPlay = {
  pending: TAutoPlayRun | null;
  latestMessage: TMessage | null;
  markPlayed: (runId: string) => void;
};

/**
 * Single source of truth for "which assistant run should be played automatically".
 * Shared by both TTS engines so the trigger rule (and its dedupe by run) lives in one place.
 */
const useAutoPlay = (index: string | number = 0): TUseAutoPlay => {
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const activeRunId = useRecoilValue(store.activeRunFamily(index));
  const [audioRunId, setAudioRunId] = useRecoilState(store.audioRunFamily(index));
  const latestMessage = useLatestMessage(index);

  const pending = useMemo<TAutoPlayRun | null>(() => {
    if (!automaticPlayback || isSubmitting) {
      return null;
    }
    if (activeRunId == null || activeRunId === audioRunId) {
      return null;
    }
    if (!latestMessage || latestMessage.isCreatedByUser) {
      return null;
    }
    const messageId = latestMessage.messageId;
    if (!messageId || messageId.includes('_')) {
      return null;
    }
    const text = getLatestText(latestMessage);
    if (!text) {
      return null;
    }
    return { runId: activeRunId, messageId, text };
  }, [automaticPlayback, isSubmitting, activeRunId, audioRunId, latestMessage]);

  const markPlayed = useCallback((runId: string) => setAudioRunId(runId), [setAudioRunId]);

  return { pending, latestMessage, markPlayed };
};

export default useAutoPlay;
