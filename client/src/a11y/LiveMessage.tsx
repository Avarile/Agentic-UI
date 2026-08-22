// A single announced message, with the mount/clear cycle screen readers need.
//
// The non-obvious part: re-announcing the same text requires the node's content to
// *change*, so the same string twice in a row needs a clear between the two or the
// second announcement is silently dropped.

import React, { useEffect, useContext } from 'react';
import AnnouncerContext from '~/Providers/AnnouncerContext';

interface LiveMessageProps {
  message: string;
  'aria-live': 'polite' | 'assertive';
  clearOnUnmount?: boolean | 'true' | 'false';
}

const LiveMessage: React.FC<LiveMessageProps> = ({
  message,
  'aria-live': ariaLive,
  clearOnUnmount,
}) => {
  const { announceAssertive, announcePolite } = useContext(AnnouncerContext);

  useEffect(() => {
    if (ariaLive === 'assertive') {
      announceAssertive({ message });
    } else if (ariaLive === 'polite') {
      announcePolite({ message });
    }
  }, [message, ariaLive, announceAssertive, announcePolite]);

  useEffect(() => {
    return () => {
      if (clearOnUnmount === true || clearOnUnmount === 'true') {
        announceAssertive({ message: '' });
        announcePolite({ message: '' });
      }
    };
  }, [clearOnUnmount, announceAssertive, announcePolite]);

  return null;
};

export default LiveMessage;
