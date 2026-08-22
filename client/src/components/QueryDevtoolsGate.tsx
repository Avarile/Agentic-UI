// Conditionally mounts the React Query devtools.
//
// Enabled in development, or in a deployed build when the runtime config sets
// `enableQueryDevtools` — which is why it imports the `/production` devtools entry
// rather than the dev-only one. Lazily loaded so the bundle cost is paid only when
// actually enabled, and `shouldEnableQueryDevtools` is exported separately so the
// decision is testable without rendering.

import { lazy, Suspense } from 'react';

interface QueryDevtoolsConfig {
  enableQueryDevtools?: boolean;
}

interface QueryDevtoolsGateProps {
  config?: QueryDevtoolsConfig;
  isDevelopment?: boolean;
}

const LazyReactQueryDevtools = lazy(() =>
  import('@tanstack/react-query-devtools/production').then(({ ReactQueryDevtools }) => ({
    default: ReactQueryDevtools,
  })),
);

export const shouldEnableQueryDevtools = ({
  isDevelopment = import.meta.env.DEV,
  config = typeof window === 'undefined' ? undefined : window.__LIBRECHAT_CONFIG__,
}: QueryDevtoolsGateProps = {}) => isDevelopment || config?.enableQueryDevtools === true;

export default function QueryDevtoolsGate({ isDevelopment, config }: QueryDevtoolsGateProps = {}) {
  if (!shouldEnableQueryDevtools({ isDevelopment, config })) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyReactQueryDevtools initialIsOpen={false} position="top-right" />
    </Suspense>
  );
}
