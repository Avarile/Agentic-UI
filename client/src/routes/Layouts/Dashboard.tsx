// Auth gate for the legacy `/d/*` subtree.
//
// Renders nothing until a session exists, so the redirect children below it never
// briefly evaluate for an anonymous visitor.

import { Outlet } from 'react-router-dom';
import { useAuthContext } from '~/hooks';

export default function DashboardRoute() {
  const { isAuthenticated } = useAuthContext();

  if (!isAuthenticated) {
    return null;
  }

  return <Outlet />;
}
