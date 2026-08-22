/**
 * Single source of truth for every absolute filesystem path the backend resolves.
 *
 * All paths are derived from `__dirname` so they stay correct regardless of the process CWD
 * (which differs between `npm run backend` from the repo root, Docker, and Jest).
 *
 * Design: centralizing these prevents the classic `path.join(process.cwd(), ...)` bug class
 * and gives one place to audit what the server is allowed to read from or write to. The
 * values are surfaced to the rest of the app as `appConfig.paths` rather than being required
 * directly, so config overrides can intercept them.
 *
 * Connections:
 * - loaded into `appConfig.paths` by `server/services/Config/app.js`
 * - `dist`/`fonts`/`assets` -> static serving and SPA fallback in `server/index.js`
 * - `imageOutput`/`uploads` -> `server/services/Files/*`
 * - `structuredTools`/`pluginManifest` -> `app/clients/tools/manifest.js` and
 *   `app/clients/tools/util/handleTools.js`
 */
const path = require('path');

module.exports = {
  root: path.resolve(__dirname, '..', '..'),
  uploads: path.resolve(__dirname, '..', '..', 'uploads'),
  clientPath: path.resolve(__dirname, '..', '..', 'client'),
  dist: path.resolve(__dirname, '..', '..', 'client', 'dist'),
  publicPath: path.resolve(__dirname, '..', '..', 'client', 'public'),
  fonts: path.resolve(__dirname, '..', '..', 'client', 'public', 'fonts'),
  assets: path.resolve(__dirname, '..', '..', 'client', 'public', 'assets'),
  imageOutput: path.resolve(__dirname, '..', '..', 'client', 'public', 'images'),
  structuredTools: path.resolve(__dirname, '..', 'app', 'clients', 'tools', 'structured'),
  pluginManifest: path.resolve(__dirname, '..', 'app', 'clients', 'tools', 'manifest.json'),
};
