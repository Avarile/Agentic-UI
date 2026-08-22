/**
 * SPA fallback middleware: serves `index.html` for unmatched routes, 404s for missing assets.
 *
 * Design (see the rule stated on `STATIC_ASSET_EXT` below): a request for a non-existent
 * `/assets/main.abc123.js` must 404, not receive `index.html`. HTML served with a JavaScript
 * content type fails strict MIME checking, and the wrong body then gets cached by the browser
 * and any service worker — so the app stays broken even after the real asset is deployed.
 *
 * Connections:
 * - `createSpaFallback(sendIndexHtml)` is mounted last, before the error handler, in
 *   `server/index.js` (and `server/experimental.js`)
 */
/** Static asset extensions that must 404 when missing — serving the SPA's
 * index.html for them breaks strict MIME checks and poisons SW/browser caches. */
const STATIC_ASSET_EXT =
  /\.(?:js|mjs|css|map|json|wasm|webmanifest|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|eot)$/i;

/**
 * Creates the SPA fallback middleware: serves index.html for unmatched
 * routes while returning 404 for missing static assets.
 * @param {(req: import('express').Request, res: import('express').Response) => void} sendIndexHtml
 */
function createSpaFallback(sendIndexHtml) {
  return (req, res) => {
    if (STATIC_ASSET_EXT.test(req.path)) {
      return res.status(404).end();
    }
    return sendIndexHtml(req, res);
  };
}

module.exports = createSpaFallback;
