// Polls connection state for the named servers, gated so it does not run when there
// is nothing to watch.

import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';

export function useMCPConnectionStatus({ enabled }: { enabled?: boolean } = {}) {
  const { data } = useMCPConnectionStatusQuery({
    enabled,
  });

  return {
    connectionStatus: data?.connectionStatus,
  };
}
