// Whether reasoning/thinking blocks start expanded.
//
// A single persisted preference; kept in its own module because it is read by
// message-content components that should not import the whole settings namespace.

import { createStorageAtom } from './jotai-utils';

const DEFAULT_SHOW_THINKING = false;

/**
 * This atom controls whether AI reasoning/thinking content is expanded by default.
 */
export const showThinkingAtom = createStorageAtom<boolean>('showThinking', DEFAULT_SHOW_THINKING);
