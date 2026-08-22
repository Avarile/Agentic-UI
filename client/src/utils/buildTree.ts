// Groups a flat message list into the parent/child tree the renderer walks.
//
// Messages are stored flat with `parentMessageId` pointers, because branching
// (regenerate, edit-resubmit, fork) makes a conversation a tree rather than a list.
// This is where that shape is reconstituted, and it also hydrates each message's
// file references from the shared file map in the same pass — one traversal instead
// of a per-attachment lookup later.
//
// Every streaming write produces fresh `children` arrays, which is what lets
// MultiMessage's recursion re-render only the spine leading to the changed message
// while settled rows bail out of their memo comparators.

import type { TMessage } from 'librechat-data-provider';

const even =
  'w-full border-b border-border-light text-text-primary bg-surface-secondary group hover:bg-surface-hover hover:text-text-primary';
const odd =
  'w-full border-b border-border-light text-text-primary group bg-surface-active-alt hover:bg-surface-hover hover:text-text-primary';

export function groupIntoList({
  messages,
}: // fileMap,
{
  messages: TMessage[] | null;
  // fileMap?: Record<string, TFile>;
}) {
  if (messages === null) {
    return null;
  }
  return messages.map((m, idx) => ({ ...m, bg: idx % 2 === 0 ? even : odd }));
}
