// One predicate: whether a conversation change should reset the subagent progress
// atoms.
//
// Extracted and named because the exception is easy to get wrong — the transition
// from `new` to the real conversation id that the server just assigned is *not* a
// conversation change, and resetting there would wipe the progress of the run that
// caused the rename.

import { Constants } from 'librechat-data-provider';

export function shouldResetSubagentAtomsOnConversationChange(
  previous: string | null | undefined,
  next: string | null | undefined,
  preserveNewConversationId: string | null,
): boolean {
  if (previous == null || previous === next) return false;
  if (previous === Constants.NEW_CONVO && next === preserveNewConversationId) return false;
  return true;
}
