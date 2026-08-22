// Hands scroll control back to the user mid-stream.
//
// The message list follows the bottom while an answer streams. This hook's
// throttled scroll handler sets `abortScroll` to whatever `isSubmitting` currently
// is, so a scroll *during* generation stops the auto-follow and a scroll after it
// finishes does not.
//
// `isSubmitting` is read through a ref rather than a dependency so the throttled
// handler keeps a stable identity — re-creating it on every submission-state change
// would reset the throttle window and let a burst of scroll events through.

import throttle from 'lodash/throttle';
import { useEffect, useRef, useMemo } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useMessagesViewContext } from '~/Providers';
import { logger } from '~/utils';

export default function useMessageProcess({ message: _message }: { message?: TMessage | null }) {
  const { conversation, setAbortScroll, isSubmitting } = useMessagesViewContext();

  /** Use ref for isSubmitting to stabilize handleScroll across isSubmitting changes */
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  const handleScroll = useMemo(
    () =>
      throttle((event: unknown) => {
        logger.log(
          'message_scrolling',
          `useMessageProcess: setting abort scroll to ${isSubmittingRef.current}, handleScroll event`,
          event,
        );
        setAbortScroll(isSubmittingRef.current);
      }, 500),
    [setAbortScroll],
  );

  useEffect(() => () => handleScroll.cancel(), [handleScroll]);

  return {
    handleScroll,
    isSubmitting,
    conversation,
  };
}
