// The same shape as ChatContext, for the *second* response pane.
//
// Multi-response mode ("add a model") runs a parallel conversation alongside the
// primary one. A separate context rather than an array in ChatContext keeps every
// existing consumer untouched — components that know nothing about split panes
// keep reading ChatContext — while the few that render both read this one too.

import { createContext, useContext } from 'react';
import type { TConversation } from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import type { ConvoGenerator } from '~/common';

type TAddedChatContext = {
  conversation: TConversation | null;
  setConversation: SetterOrUpdater<TConversation | null>;
  generateConversation: ConvoGenerator;
};

export const AddedChatContext = createContext<TAddedChatContext>({} as TAddedChatContext);
export const useAddedChatContext = () => useContext(AddedChatContext);
