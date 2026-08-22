/**
 * Authentication and authorization middleware for the API-key (remote agent) surface.
 *
 * Assembles four pieces from `packages/api` with app dependencies injected:
 * `apiKeyMiddleware` (raw key validation), `requireRemoteAgentAuth`, `checkRemoteAgentsFeature`
 * (role permission for the feature), and `checkAgentPermission` (ACL on the requested agent).
 *
 * Design: this exists as its own module because the OpenAI-compatible and Open Responses
 * routers are mounted *before* the JWT gate and therefore cannot reuse the normal
 * `requireJwtAuth` stack — they need a parallel, key-based one. Keeping it in one file means
 * both surfaces enforce identical rules.
 *
 * Connections: used by `server/routes/agents/openai.js` and `responses.js`
 */
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  generateCheckAccess,
  preAuthTenantMiddleware,
  createRequireApiKeyAuth,
  createRemoteAgentAuth,
  createCheckRemoteAgentAccess,
} = require('@librechat/api');
const { getEffectivePermissions } = require('~/server/services/PermissionService');
const { getAppConfig } = require('~/server/services/Config');
const db = require('~/models');

const apiKeyMiddleware = createRequireApiKeyAuth({
  validateAgentApiKey: db.validateAgentApiKey,
  findUser: db.findUser,
});

const requireRemoteAgentAuth = createRemoteAgentAuth({
  apiKeyMiddleware,
  findUser: db.findUser,
  getRolesByNames: db.findRolesByNames,
  updateUser: db.updateUser,
  getAppConfig,
});

const checkRemoteAgentsFeature = generateCheckAccess({
  permissionType: PermissionTypes.REMOTE_AGENTS,
  permissions: [Permissions.USE],
  getRoleByName: db.getRoleByName,
});

const checkAgentPermission = createCheckRemoteAgentAccess({
  getAgent: db.getAgent,
  getEffectivePermissions,
});

module.exports = {
  checkAgentPermission,
  preAuthTenantMiddleware,
  requireRemoteAgentAuth,
  checkRemoteAgentsFeature,
};
