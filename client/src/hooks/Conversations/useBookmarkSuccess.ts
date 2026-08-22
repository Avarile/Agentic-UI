// Post-bookmark cache reconciliation, shared by the several places a conversation
// can be tagged.

import { useSetRecoilState } from 'recoil';
import useUpdateTagsInConvo from './useUpdateTagsInConvo';
import store from '~/store';

const useBookmarkSuccess = (conversationId: string) => {
  const updateConversation = useSetRecoilState(store.updateConversationSelector(conversationId));
  const { updateTagsInConversation } = useUpdateTagsInConvo();

  return (newTags: string[]) => {
    if (!conversationId) {
      return;
    }
    updateTagsInConversation(conversationId, newTags);
    updateConversation({ tags: newTags });
  };
};

export default useBookmarkSuccess;
