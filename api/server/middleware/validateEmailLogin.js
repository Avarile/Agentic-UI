/**
 * Re-export of `validateEmailLogin` from `packages/api`.
 *
 * Exists so route modules import middleware from a consistent local path while the
 * implementation stays in TypeScript in `packages/api`, per the workspace boundary.
 */
const { validateEmailLogin } = require('@librechat/api');

module.exports = validateEmailLogin;
