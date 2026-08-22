// Web-search results keyed for citation lookup.
//
// Supplied by the message that owns the search results and read by citation
// markers rendered deep inside its markdown, which is why it is a context and not
// props — the intermediate markdown renderers know nothing about citations.

import { createContext, useContext } from 'react';
import type { SearchResultData } from 'librechat-data-provider';

type SearchContext = {
  searchResults?: { [key: string]: SearchResultData };
};

export const SearchContext = createContext<SearchContext>({} as SearchContext);
export const useSearchContext = () => useContext(SearchContext);
