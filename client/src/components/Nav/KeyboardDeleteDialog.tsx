// The confirmation for deleting a conversation via the keyboard, which needs an
// explicit target (`store.keyboardDeleteTarget`) since there is no click context to
// infer it from.

import { useCallback } from 'react';
import { useRecoilState } from 'recoil';
import DeleteButton from '~/components/Conversations/ConvoOptions/DeleteButton';
import store from '~/store';

const retainView = () => {};

export default function KeyboardDeleteDialog() {
  const [target, setTarget] = useRecoilState(store.keyboardDeleteTarget);

  const setShowDeleteDialog = useCallback(
    (open: boolean) => {
      if (!open) {
        setTarget(null);
      }
    },
    [setTarget],
  );

  if (!target) {
    return null;
  }

  return (
    <DeleteButton
      title={target.title}
      conversationId={target.conversationId}
      currentConversationId={target.conversationId}
      retainView={retainView}
      showDeleteDialog={true}
      setShowDeleteDialog={setShowDeleteDialog}
    />
  );
}
