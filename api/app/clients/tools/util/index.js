/**
 * Barrel exposing `validateTools` and `loadTools` from `handleTools.js`.
 *
 * Only these two — the internal helpers in `handleTools.js` stay private so tool construction has
 * exactly one entry point.
 */
const { validateTools, loadTools } = require('./handleTools');

module.exports = {
  validateTools,
  loadTools,
};
