// StartupLayout plus the auth-aware query gate.
//
// The only reason this wrapper exists: `queriesEnabled` is flipped on a 500ms
// delay after mount. Right after a redirect from login the session cookie may not
// yet be readable, and letting every query fire immediately produces a burst of
// 401s that trip the API error boundary. The delay is a deliberate settle window,
// and it is one-shot — once enabled, it stays enabled for the session.

import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { useAuthContext } from '~/hooks/AuthContext';
import StartupLayout from './Startup';
import store from '~/store';

export default function LoginLayout() {
  const { isAuthenticated } = useAuthContext();
  const [queriesEnabled, setQueriesEnabled] = useRecoilState<boolean>(store.queriesEnabled);
  useEffect(() => {
    if (queriesEnabled) {
      return;
    }
    const timeout: NodeJS.Timeout = setTimeout(() => {
      setQueriesEnabled(true);
    }, 500);

    return () => {
      clearTimeout(timeout);
    };
  }, [queriesEnabled, setQueriesEnabled]);
  return <StartupLayout isAuthenticated={isAuthenticated} />;
}
