// Reads a pane's conversation from the Recoil snapshot *without subscribing*.
//
// The distinction is the whole point. Callers here are event handlers and submit
// paths that need the current conversation at the moment they run; subscribing
// would re-render them on every conversation change, including every streamed
// title update.

import { useRecoilCallback } from 'recoil';
import type { TConversation } from 'librechat-data-provider';
import store from '~/store';

export default function useGetConversation(index: string | number = 0) {
  return useRecoilCallback(
    ({ snapshot }) =>
      () =>
        snapshot
          .getLoadable(store.conversationByKeySelector(index))
          .getValue() as TConversation | null,
    [index],
  );
}
