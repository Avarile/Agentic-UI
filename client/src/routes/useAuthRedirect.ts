// Sends unauthenticated visitors to `/login`, preserving where they were going.
//
// The 300ms timeout is the point of the hook. `isAuthenticated` is false both when
// the user is genuinely signed out and during the brief window while the session
// is being restored or a token refreshed; redirecting on the first false reading
// would bounce a valid session out on every hard refresh. The timer gives auth a
// chance to settle and is cleared if it does.
//
// `buildLoginRedirectUrl` carries pathname + search + hash so the deep link is
// restored after sign-in (consumed by Layouts/Startup).

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildLoginRedirectUrl } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks';

export default function useAuthRedirect() {
  const { user, roles, isAuthenticated } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isAuthenticated) {
        return;
      }

      navigate(buildLoginRedirectUrl(location.pathname, location.search, location.hash), {
        replace: true,
      });
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAuthenticated, navigate, location]);

  return {
    user,
    roles,
    isAuthenticated,
  };
}
