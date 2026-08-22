// The legacy single-pane composer text atom.
//
// Superseded by `textByIndex` in families.ts, which multi-pane chat requires. Kept
// for the remaining call sites that predate panes.

import { atom } from 'recoil';

const text = atom<string>({
  key: 'text',
  default: '',
});

export default { text };
