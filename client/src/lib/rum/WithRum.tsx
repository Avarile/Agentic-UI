// Mounts real-user monitoring for the authenticated subtree.
//
// Placed inside AuthLayout (routes/index.tsx) rather than at the app root, so
// anonymous share and OAuth traffic is not instrumented.

import type { ReactNode } from 'react';
import useRum from './useRum';

export default function WithRum({ children }: { children: ReactNode }) {
  useRum();

  return <>{children}</>;
}
