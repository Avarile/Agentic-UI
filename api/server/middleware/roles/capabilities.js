/**
 * Binds the capability-checking system to this app's principal/grant lookups.
 *
 * `generateCapabilityCheck` (from `packages/api`) contains the evaluation logic; this file
 * supplies `getUserPrincipals`, `hasCapabilityForPrincipals`, `getHeldCapabilities` and
 * `hasAnyConfigReadAccess` from `~/models`, and re-exports the resulting helpers plus
 * `capabilityContextMiddleware`.
 *
 * Design: `capabilityContextMiddleware` installs a per-request memo, which is why
 * `server/index.js` mounts it before any route that calls `hasCapability` — capability
 * resolution otherwise re-reads principals and grants on every check within one request.
 *
 * Import this module *directly*, never through the middleware barrel: it depends on
 * `~/models`, and going through the barrel creates the circular require documented in
 * `roles/index.js`.
 *
 * Connections:
 * - consumed by `accessResources/*`, `canDeleteAccount.js`, `checkSharePublicAccess.js`,
 *   `server/controllers/PermissionsController.js` and the admin routes
 */
const { generateCapabilityCheck, capabilityContextMiddleware } = require('@librechat/api');
const {
  getUserPrincipals,
  hasAnyConfigReadAccess,
  hasCapabilityForPrincipals,
  getHeldCapabilities,
} = require('~/models');

const {
  hasCapability,
  requireCapability,
  hasConfigCapability,
  hasAnyConfigReadAccess: checkAnyConfigReadAccess,
  getReadableConfigSections,
} = generateCapabilityCheck({
  getUserPrincipals,
  hasAnyConfigReadAccess,
  hasCapabilityForPrincipals,
  getHeldCapabilities,
});

module.exports = {
  hasCapability,
  requireCapability,
  hasConfigCapability,
  capabilityContextMiddleware,
  hasAnyConfigReadAccess: checkAnyConfigReadAccess,
  getReadableConfigSections,
};
