// State that has no better home: banner dismissals, dialog visibility, keyboard
// shortcut overrides, composer badge order, and the per-message attachment map.
//
// A junk drawer by design rather than by neglect — each of these is a single atom
// with no siblings, and giving each its own module would add files without adding
// structure. Anything here that grows a second related atom should move out.
//
// `conversationAttachmentsSelector` is the one non-trivial member: attachments
// arrive keyed by message id in a flat map, and this filters that map down to one
// conversation so a chat does not subscribe to every attachment in the session.
//
// Note the ordering constraint on `chatBadges` — the array index is the badge
// identity, so existing entries must not be reordered.

import { atom, selectorFamily } from 'recoil';
import { TAttachment } from 'librechat-data-provider';
import { atomWithLocalStorage } from './utils';
import { BadgeItem } from '~/common';

const hideBannerHint = atomWithLocalStorage('hideBannerHint', [] as string[]);

const messageAttachmentsMap = atom<Record<string, TAttachment[] | undefined>>({
  key: 'messageAttachmentsMap',
  default: {},
});

/**
 * Selector to get attachments for a specific conversation.
 */
const conversationAttachmentsSelector = selectorFamily<
  Record<string, TAttachment[]>,
  string | undefined
>({
  key: 'conversationAttachments',
  get:
    (conversationId) =>
    ({ get }) => {
      if (!conversationId) {
        return {};
      }

      const attachmentsMap = get(messageAttachmentsMap);
      const result: Record<string, TAttachment[]> = {};

      // Filter to only include attachments for this conversation
      Object.entries(attachmentsMap).forEach(([messageId, attachments]) => {
        if (!attachments || attachments.length === 0) {
          return;
        }

        const relevantAttachments = attachments.filter(
          (attachment) => attachment.conversationId === conversationId,
        );

        if (relevantAttachments.length > 0) {
          result[messageId] = relevantAttachments;
        }
      });

      return result;
    },
});

const queriesEnabled = atom<boolean>({
  key: 'queriesEnabled',
  default: true,
});

const isEditingBadges = atom<boolean>({
  key: 'isEditingBadges',
  default: false,
});

const showShortcutsDialog = atom<boolean>({
  key: 'showShortcutsDialog',
  default: false,
});

const showSystemCore = atom<boolean>({
  key: 'showSystemCore',
  default: false,
});

export type KeyboardDeleteTarget = {
  conversationId: string;
  title: string;
};

const keyboardDeleteTarget = atom<KeyboardDeleteTarget | null>({
  key: 'keyboardDeleteTarget',
  default: null,
});

export type ShortcutOverride = {
  mac: string | null;
  other: string | null;
};

const customShortcuts = atomWithLocalStorage<Record<string, ShortcutOverride>>(
  'customKeyboardShortcuts',
  {},
);

const chatBadges = atomWithLocalStorage<Pick<BadgeItem, 'id'>[]>('chatBadges', [
  // When adding new badges, make sure to add them to useChatBadges.ts as well and add them as last item
  // DO NOT CHANGE THE ORDER OF THE BADGES ALREADY IN THE ARRAY
  { id: '1' },
  // { id: '2' },
]);

export default {
  hideBannerHint,
  messageAttachmentsMap,
  conversationAttachmentsSelector,
  queriesEnabled,
  isEditingBadges,
  showShortcutsDialog,
  showSystemCore,
  keyboardDeleteTarget,
  customShortcuts,
  chatBadges,
};
