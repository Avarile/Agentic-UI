// Prompt-library filters and editor preferences.
//
// The split mirrors store/settings.ts: filters (name, category, page) are session
// state that should reset, while `autoSendPrompts`, `alwaysMakeProd` and the
// editor mode are preferences that should persist.

import { atom } from 'recoil';
import { atomWithLocalStorage } from '~/store/utils';
import { PromptsEditorMode } from '~/common';

// Static atoms without localStorage
const staticAtoms = {
  // `name` filter
  promptsName: atom<string>({ key: 'promptsName', default: '' }),
  // `category` filter
  promptsCategory: atom<string>({ key: 'promptsCategory', default: '' }),
  // `pageNumber` filter
  promptsPageNumber: atom<number>({ key: 'promptsPageNumber', default: 1 }),
  // `pageSize` filter
  promptsPageSize: atom<number>({ key: 'promptsPageSize', default: 10 }),
};

// Atoms with localStorage
const localStorageAtoms = {
  autoSendPrompts: atomWithLocalStorage('autoSendPrompts', true),
  alwaysMakeProd: atomWithLocalStorage('alwaysMakeProd', true),
  // Editor mode
  promptsEditorMode: atomWithLocalStorage<PromptsEditorMode>(
    'promptsEditorMode',
    PromptsEditorMode.SIMPLE,
  ),
};

export default { ...staticAtoms, ...localStorageAtoms };
