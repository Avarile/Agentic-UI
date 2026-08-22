// The store barrel — and the map of a deliberate two-library split.
//
// The client runs Recoil and Jotai side by side. That is not accidental drift:
//
//   Recoil  the conversation model — atom *families* keyed by pane index or
//           conversation id, plus the selectors derived from them. Recoil's
//           `atomFamily`/`selectorFamily` and `useRecoilCallback` (read a value
//           without subscribing) are what the chat machinery is built on.
//   Jotai   newer, narrower state: user preferences with localStorage backing,
//           and very-high-frequency per-conversation atoms (token usage, steer
//           overlay height) where the goal is that a write re-renders exactly one
//           subscriber.
//
// The two shapes here follow from that. Recoil modules default-export an object of
// atoms and are spread into the single `store` namespace below, so feature code
// writes `store.isSubmittingFamily(index)`. Jotai modules use named exports and
// are re-exported with `export *`, so they are imported by name.
//
// Naming conventions worth knowing before reading any consumer:
//
//   *ByIndex / *Family   keyed by pane index. 0 is the primary chat; 1..n are the
//                        extra panes of a multi-response ("add a model") run.
//   *ByConvoId           keyed by conversation id, so state survives pane reuse
//                        and navigation between conversations.
//
// A name is exported once, from one library. Reaching for `store.x` and finding
// nothing usually means `x` is a Jotai atom and needs a named import.

import * as artifacts from './artifacts';
import submission from './submission';
import isTemporary from './temporary';
import endpoints from './endpoints';
import families from './families';
import settings from './settings';
import prompts from './prompts';
import search from './search';
import preset from './preset';
import lang from './language';
import toast from './toast';
import user from './user';
import text from './text';
import misc from './misc';
export * from './agents';
export * from './mcp';
export * from './favorites';
export * from './subagents';
export * from './sandbox';
export * from './usage';
export * from './steer';

export default {
  ...artifacts,
  ...families,
  ...endpoints,
  ...user,
  ...text,
  ...toast,
  ...submission,
  ...search,
  ...prompts,
  ...preset,
  ...lang,
  ...settings,
  ...misc,
  ...isTemporary,
};
