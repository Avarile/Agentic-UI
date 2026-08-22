// Conversation tag reads.
//
// A single hook, kept separate from the tag *mutations* in mutations.ts by history
// rather than design. Backs Providers/BookmarkContext.

import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type { TConversationTagsResponse } from 'librechat-data-provider';
import { QueryKeys, dataService } from 'librechat-data-provider';

export const useGetConversationTags = (
  config?: UseQueryOptions<TConversationTagsResponse>,
): QueryObserverResult<TConversationTagsResponse> => {
  return useQuery<TConversationTagsResponse>(
    [QueryKeys.conversationTags],
    () => dataService.getConversationTags(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};
