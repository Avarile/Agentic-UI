// Derives the added pane's conversation from the primary one, so a second model
// inherits the conversation's settings without duplicating its identity.

import { useRecoilCallback } from 'recoil';
import store from '~/store';

/**
 * Hook that provides lazy access to addedConvo without subscribing to changes.
 * Use this to avoid unnecessary re-renders when addedConvo changes.
 */
export default function useGetAddedConvo() {
  return useRecoilCallback(
    ({ snapshot }) =>
      () =>
        snapshot.getLoadable(store.conversationByKeySelector(1)).getValue(),
    [],
  );
}
