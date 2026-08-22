/**
 * CRUD for programmatic agent API keys (used by remote-agent callers).
 *
 * Handlers come from `createApiKeyHandlers` in `packages/api`; this file supplies the model
 * functions and the authorization gate.
 *
 * Design: every route requires the `REMOTE_AGENTS`/`USE` permission — the keys only exist to
 * authenticate remote agent invocations, so the ability to mint one is tied to the ability to
 * use that feature rather than being a separate permission.
 *
 * Connections: models via `~/models`; consumed by the remote-agent request path
 */
const express = require('express');
const { generateCheckAccess, createApiKeyHandlers } = require('@librechat/api');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  getAgentApiKeyById,
  createAgentApiKey,
  deleteAgentApiKey,
  listAgentApiKeys,
  getRoleByName,
} = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

const handlers = createApiKeyHandlers({
  createAgentApiKey,
  listAgentApiKeys,
  deleteAgentApiKey,
  getAgentApiKeyById,
});

const checkRemoteAgentsUse = generateCheckAccess({
  permissionType: PermissionTypes.REMOTE_AGENTS,
  permissions: [Permissions.USE],
  getRoleByName,
});

router.post('/', requireJwtAuth, checkRemoteAgentsUse, handlers.createApiKey);

router.get('/', requireJwtAuth, checkRemoteAgentsUse, handlers.listApiKeys);

router.get('/:id', requireJwtAuth, checkRemoteAgentsUse, handlers.getApiKey);

router.delete('/:id', requireJwtAuth, checkRemoteAgentsUse, handlers.deleteApiKey);

module.exports = router;
