/**
 * Public-sharing policy middleware, constructed from the `packages/api` factory.
 *
 * Injects `getRoleByName` and `hasCapability` so the shared policy code can evaluate whether
 * the caller's role is permitted to create or view public shares, without `packages/api`
 * depending on app models.
 *
 * Connections: used by `server/routes/share.js`; capabilities via `roles/capabilities.js`
 */
const { createSharePolicyMiddleware } = require('@librechat/api');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { getRoleByName } = require('~/models');

module.exports = createSharePolicyMiddleware({
  getRoleByName,
  hasCapability,
});
