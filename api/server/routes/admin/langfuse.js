/**
 * Admin API for the Langfuse observability connection.
 *
 * Read/update the connection, run a live `/connection/test`, and resolve a per-conversation
 * trace link (`/connection/session/:conversationId`).
 *
 * Design: `/connection/test` exists so an operator can validate credentials *before* saving
 * them and silently losing traces. Updates invalidate the config caches so the new connection
 * takes effect immediately.
 *
 * Connections: handlers from `createAdminLangfuseHandlers` (`packages/api`); cache
 * invalidation via `server/services/Config`
 */
const express = require('express');
const { createAdminLangfuseHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const {
  hasConfigCapability,
  requireCapability,
} = require('~/server/middleware/roles/capabilities');
const { invalidateConfigCaches } = require('~/server/services/Config');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

async function requireLangfuseManage(req, res, next) {
  try {
    const id = req.user?.id ?? req.user?._id?.toString();
    if (!id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const user = {
      id,
      role: req.user.role ?? '',
      tenantId: req.user.tenantId,
      idOnTheSource: req.user.idOnTheSource ?? null,
    };
    if (await hasConfigCapability(user, 'langfuse')) {
      return next();
    }
    return res.status(403).json({ message: 'Forbidden' });
  } catch (_err) {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

const handlers = createAdminLangfuseHandlers({
  findConfigByPrincipal: db.findConfigByPrincipal,
  patchConfigFields: db.patchConfigFields,
  toggleConfigActive: db.toggleConfigActive,
  getMessages: db.getMessages,
  invalidateConfigCaches,
});

router.use(requireJwtAuth, requireAdminAccess, requireLangfuseManage);

router.get('/connection', handlers.getConnection);
router.get('/connection/session/:conversationId', handlers.getSessionLink);
router.put('/connection', handlers.updateConnection);
router.post('/connection/test', handlers.testConnection);

module.exports = router;
