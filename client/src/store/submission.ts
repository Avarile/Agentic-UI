// The legacy single-pane submission atoms.
//
// Superseded by `submissionByIndex` / `isSubmittingFamily` in families.ts, which
// the multi-pane chat requires. These remain because a handful of older call sites
// still read them; the comment block below is the original contract, kept as-is
// since it documents the submission shape that families.ts inherited.

import { atom } from 'recoil';
import { TSubmission } from 'librechat-data-provider';

// current submission
// submit any new value to this state will cause new message to be send.
// set to null to give up any submission
// {
//   conversation, // target submission, must have: model, chatGptLabel, promptPrefix
//   messages, // old messages
//   message, // request message
//   initialResponse, // response message
//   isRegenerate=false, // isRegenerate?
// }

const submission = atom<TSubmission | null>({
  key: 'submission',
  default: null,
});

const isSubmitting = atom({
  key: 'isSubmitting',
  default: false,
});

export default {
  submission,
  isSubmitting,
};
