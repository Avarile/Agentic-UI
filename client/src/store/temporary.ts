// Temporary-chat flags: whether this conversation is temporary, and whether new
// chats start that way.
//
// A temporary conversation is not persisted server-side. Both flags are
// localStorage-backed so the *default* survives a reload — see ChatRoute, which
// reads `defaultTemporaryChat` when landing on a new chat and the conversation's
// own flag otherwise.

import { atomWithLocalStorage } from '~/store/utils';

const isTemporary = atomWithLocalStorage('isTemporary', false);
const defaultTemporaryChat = atomWithLocalStorage('defaultTemporaryChat', false);

export default {
  isTemporary,
  defaultTemporaryChat,
};
