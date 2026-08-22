// The strip above the textarea, shown only in multi-response mode.
//
// Its sole content is the added conversation's own controls (`AddedConvo`), so it
// renders nothing at all when no second pane is active — which is why the composer
// can mount it unconditionally.

import { memo } from 'react';
import AddedConvo from './AddedConvo';
import type { TConversation } from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';

export default memo(function TextareaHeader({
  addedConvo,
  setAddedConvo,
}: {
  addedConvo: TConversation | null;
  setAddedConvo: SetterOrUpdater<TConversation | null>;
}) {
  if (!addedConvo) {
    return null;
  }
  return (
    <div className="m-1.5 flex flex-col divide-y overflow-hidden rounded-b-lg rounded-t-2xl bg-surface-secondary-alt">
      <AddedConvo addedConvo={addedConvo} setAddedConvo={setAddedConvo} />
    </div>
  );
});
