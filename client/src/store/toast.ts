// The toast atom.
//
// Surfaced through `useToastContext` from `@librechat/client`; this is only the
// backing state. Prefer the context in feature code — writing the atom directly
// bypasses the toast's own queueing.

import { atom } from 'recoil';
import { NotificationSeverity } from '~/common';

const toastState = atom({
  key: 'toastState',
  default: {
    open: false,
    message: '',
    severity: NotificationSeverity.SUCCESS,
    showIcon: true,
  },
});

export default { toastState };
