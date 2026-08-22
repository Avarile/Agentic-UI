// Browser entry point: the only module Vite treats as the app root.
//
// Render is deliberately deferred behind `initializeI18n()`. Localization is not
// optional here — every user-facing string goes through `useLocalize`, so painting
// before the catalogue resolves would flash raw `com_*` keys. The `.catch` still
// renders rather than leaving a blank page: a broken translation fetch degrades to
// English fallbacks instead of no app at all.
//
// `ApiErrorBoundaryProvider` wraps `App` from out here so a 401 raised by the very
// first query has a handler already mounted — App.jsx consumes it via
// `useApiErrorBoundary` and cannot also provide it.
//
// The `vite:preloadError` listener is the stale-deploy guard: after a release the
// old index.html asks for hashed chunks that no longer exist, and
// `__lcRecoverStaleAssets` (see index.html) reloads instead of surfacing a
// chunk-load crash.
//
// CSS is imported here, once, in cascade order: the shared design system
// (`@librechat/client/style.css`) before local `style.css`/`mobile.css` overrides.

import './polyfills/regeneratorRuntime';
import { createRoot } from 'react-dom/client';
import { initializeI18n } from './locales/i18n';
import App from './App';
import '@librechat/client/style.css';
import './style.css';
import './mobile.css';
import { ApiErrorBoundaryProvider } from './hooks/ApiErrorBoundaryContext';
import 'katex/dist/katex.min.css';
import 'katex/dist/contrib/copy-tex.js';

window.addEventListener('vite:preloadError', (event) => {
  if (window.__lcRecoverStaleAssets?.()) {
    event.preventDefault();
  }
});

const container = document.getElementById('root');
const root = createRoot(container);

async function bootstrap() {
  await initializeI18n();

  root.render(
    <ApiErrorBoundaryProvider>
      <App />
    </ApiErrorBoundaryProvider>,
  );
}

bootstrap().catch((error) => {
  console.error('[i18n] Failed to initialize before render', error);
  root.render(
    <ApiErrorBoundaryProvider>
      <App />
    </ApiErrorBoundaryProvider>,
  );
});
