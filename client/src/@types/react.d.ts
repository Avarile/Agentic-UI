// Local React type augmentations for attributes the installed types do not yet
// cover (notably `inert`, used by the sidebar's mobile overlay).

import 'react';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface HTMLAttributes<T> {
    inert?: boolean | '' | undefined;
  }
}
