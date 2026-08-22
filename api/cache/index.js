/**
 * Barrel for the cache layer — exposes only what callers outside `cache/` should touch.
 *
 * Design: `banViolation` and `clearPendingReq` are intentionally *not* re-exported. They are
 * side-effecting policy helpers meant to be reached through `logViolation` or the abort path,
 * so keeping them off the barrel discourages ad-hoc use.
 *
 * Connections:
 * - `getLogStores` -> namespaced Keyv stores, see `cache/getLogStores.js`
 * - `logViolation` -> violation accounting + auto-ban, see `cache/logViolation.js`
 */
const getLogStores = require('./getLogStores');
const logViolation = require('./logViolation');

module.exports = { getLogStores, logViolation };
