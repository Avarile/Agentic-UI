// Search box state for the conversation/message search.
//
// One atom holding five fields, because they are always read together and their
// invariants are cross-field. `query` is what the user typed, `debouncedQuery` is
// what is actually fetched, and `isTyping` is true in the gap between them — that
// gap is what routes/Search.tsx uses to dim outgoing results and suppress
// pagination, so it has to be observable rather than internal to a debounce hook.
//
// `enabled` is tri-state (`null` = not yet known) so the UI can withhold the search
// affordance until the server has said whether search is configured, rather than
// showing and then removing it.

import { atom } from 'recoil';

export type SearchState = {
  enabled: boolean | null;
  query: string;
  debouncedQuery: string;
  isSearching: boolean;
  isTyping: boolean;
};

export const search = atom<SearchState>({
  key: 'search',
  default: {
    enabled: null,
    query: '',
    debouncedQuery: '',
    isSearching: false,
    isTyping: false,
  },
});

export default {
  search,
};
