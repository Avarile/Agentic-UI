// The conversation tag list, shared by the bookmark menus.
//
// Small by design: bookmarks are read in several unrelated places (nav item menus,
// the bookmark dropdown, the tag editor) and a shared context avoids each mounting
// its own query.

import { createContext, useContext } from 'react';
import type { TConversationTag } from 'librechat-data-provider';

type TBookmarkContext = { bookmarks: TConversationTag[] };

export const BookmarkContext = createContext<TBookmarkContext>({
  bookmarks: [],
} as TBookmarkContext);
export const useBookmarkContext = () => useContext(BookmarkContext);
