// Screen-reader announcement channel: `announcePolite` / `announceAssertive`.
//
// The default value logs a warning instead of throwing, deliberately — a missing
// LiveAnnouncer should never break a render, and a dropped announcement is the
// one failure mode here that is safe. Fulfilled by a11y/LiveAnnouncer.tsx, which
// owns the actual aria-live regions.

import React from 'react';
import type { AnnounceOptions } from '~/common';

interface AnnouncerContextType {
  announceAssertive: (options: AnnounceOptions) => void;
  announcePolite: (options: AnnounceOptions) => void;
}

const defaultContext: AnnouncerContextType = {
  announceAssertive: () => console.warn('Announcement failed, LiveAnnouncer context is missing'),
  announcePolite: () => console.warn('Announcement failed, LiveAnnouncer context is missing'),
};

const AnnouncerContext = React.createContext<AnnouncerContextType>(defaultContext);

export const useLiveAnnouncer = () => {
  const context = React.useContext(AnnouncerContext);
  return context;
};

export default AnnouncerContext;
