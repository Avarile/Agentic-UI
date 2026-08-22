// The provider stack. Ordering is the whole content of this file.
//
// Outside-in, each layer is above the ones that depend on it:
//
//   QueryClientProvider   server cache — data-provider hooks feed atoms below it
//   RecoilRoot            client state (conversations, submissions, settings)
//   LiveAnnouncer         a11y live regions, needed by anything that announces
//   ThemeProvider         paints CSS variables the rest of the tree styles against
//   Toast / Dnd           cross-cutting UI services
//   RouterProvider        the app itself (see routes/index.tsx)
//
// The QueryClient is built with `networkMode: 'always'` because LibreChat is
// routinely self-hosted: `navigator.onLine` reports false on a machine with no
// WiFi whose localhost backend is perfectly reachable, and the default mode would
// pause every query. Its `QueryCache.onError` funnels 401s to the boundary set up
// in main.jsx — one place to notice an expired session, no matter which query saw
// it first.
//
// Theme resolution is intentionally conditional: `initialTheme`/`themeRGB` are
// spread in only when an env theme exists, so on a default deployment the
// localStorage preference stays authoritative instead of being overwritten on
// every boot.
//
// The default export wraps App in `ScreenshotProvider` and mounts a hidden silent
// audio iframe — the standard workaround for browsers that refuse programmatic
// TTS playback until the document has had an autoplay-permitted audio element.

import { useEffect } from 'react';
import { RecoilRoot } from 'recoil';
import { DndProvider } from 'react-dnd';
import { RouterProvider } from 'react-router-dom';
import * as RadixToast from '@radix-ui/react-toast';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { Toast, ThemeProvider, ToastProvider, useInputModality } from '@librechat/client';
import { ScreenshotProvider, useApiErrorBoundary } from './hooks';
import WakeLockManager from '~/components/System/WakeLockManager';
import QueryDevtoolsGate from '~/components/QueryDevtoolsGate';
import LanguageSync from '~/components/System/LanguageSync';
import { getThemeFromEnv } from './utils/getThemeFromEnv';
import { initializeFontSize } from '~/store/fontSize';
import { LiveAnnouncer } from '~/a11y';
import { router } from './routes';

const App = () => {
  const { setError } = useApiErrorBoundary();
  useInputModality();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Always attempt network requests, even when navigator.onLine is false
        // This is needed because localhost is reachable without WiFi
        networkMode: 'always',
      },
      mutations: {
        networkMode: 'always',
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        if (error?.response?.status === 401) {
          setError(error);
        }
      },
    }),
  });

  useEffect(() => {
    initializeFontSize();
  }, []);

  // Load theme from environment variables if available
  const envTheme = getThemeFromEnv();

  return (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <LanguageSync />
        <LiveAnnouncer>
          <ThemeProvider
            // Only pass initialTheme and themeRGB if environment theme exists
            // This allows localStorage values to persist when no env theme is set
            {...(envTheme && { initialTheme: 'system', themeRGB: envTheme })}
          >
            {/* The ThemeProvider will automatically:
                1. Apply dark/light mode classes
                2. Apply custom theme colors if envTheme is provided
                3. Otherwise use stored theme preferences from localStorage
                4. Fall back to default theme colors if nothing is stored */}
            <RadixToast.Provider>
              <ToastProvider>
                <DndProvider backend={HTML5Backend}>
                  <RouterProvider router={router} />
                  <WakeLockManager />
                  <QueryDevtoolsGate />
                  <Toast />
                  <RadixToast.Viewport className="pointer-events-none fixed inset-x-0 top-0 z-[1000] mx-auto my-2 flex max-w-[560px] flex-col items-stretch justify-start" />
                </DndProvider>
              </ToastProvider>
            </RadixToast.Provider>
          </ThemeProvider>
        </LiveAnnouncer>
      </RecoilRoot>
    </QueryClientProvider>
  );
};

export default () => (
  <ScreenshotProvider>
    <App />
    <iframe
      src="assets/silence.mp3"
      allow="autoplay"
      id="audio"
      title="audio-silence"
      style={{
        display: 'none',
      }}
    />
  </ScreenshotProvider>
);
