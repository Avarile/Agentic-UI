// Watches the API error boundary for auth failures.
//
// Mounted as a sibling of the router outlet (routes/index.tsx) so it can react
// without re-rendering the page. Currently it only observes — the redirect-on-500
// branch is intentionally inert; session expiry is handled by AuthContext's own
// refresh path.

import React from 'react';
import { useApiErrorBoundary } from '~/hooks/ApiErrorBoundaryContext';
import { useNavigate } from 'react-router-dom';

const ApiErrorWatcher = () => {
  const { error } = useApiErrorBoundary();
  const navigate = useNavigate();
  React.useEffect(() => {
    if (error?.response?.status === 500) {
      // do something with error
      // navigate('/login');
    }
  }, [error, navigate]);

  return null;
};

export default ApiErrorWatcher;
