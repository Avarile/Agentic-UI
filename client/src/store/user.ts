// The authenticated user and the available-tools map.
//
// Both are duplicates of query state, kept in Recoil for the same reason as
// store/endpoints.ts: selectors and callbacks need a synchronous read. AuthContext
// (hooks/AuthContext.tsx) remains the source of truth for the user — treat this
// atom as a read mirror, not a place to write.

import { atom } from 'recoil';
import type { TUser, TPlugin } from 'librechat-data-provider';

const user = atom<TUser | undefined>({
  key: 'user',
  default: undefined,
});

const availableTools = atom<Record<string, TPlugin>>({
  key: 'availableTools',
  default: {},
});

export default {
  user,
  availableTools,
};
