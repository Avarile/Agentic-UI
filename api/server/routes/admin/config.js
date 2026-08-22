/**
 * Admin API for layered configuration overrides.
 *
 * Config is stored as a base layer plus per-principal overrides (`:principalType/:principalId`
 * — role, group, user, tenant), and this router exposes the whole lifecycle: list, read base,
 * read/write a principal's overrides, patch or delete an individual field, tombstone a field,
 * and toggle a layer active.
 *
 * Design:
 * - Field-level operations exist because overrides are merged, not replaced: patching one field
 *   must not require resubmitting (and thus potentially clobbering) the rest of a layer.
 * - A *tombstone* is distinct from a delete — it explicitly suppresses an inherited value from
 *   a lower layer, which deleting the override could not express.
 * - `invalidateConfigCaches` is injected so every write flushes the resolved-config caches;
 *   without it a saved change would not take effect until TTL expiry.
 * - Whole router behind `requireJwtAuth -> requireAdminAccess`.
 *
 * Connections:
 * - handlers: `createAdminConfigHandlers` from `packages/api`
 * - resolution: `server/services/Config/app.js`; consumed via `req.config` everywhere
 */
const express = require('express');
const { createAdminConfigHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const {
  hasCapability,
  requireCapability,
  hasConfigCapability,
  hasAnyConfigReadAccess,
  getReadableConfigSections,
} = require('~/server/middleware/roles/capabilities');
const { getAppConfig, invalidateConfigCaches } = require('~/server/services/Config');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createAdminConfigHandlers({
  listAllConfigs: db.listAllConfigs,
  findConfigByPrincipal: db.findConfigByPrincipal,
  upsertConfig: db.upsertConfig,
  patchConfigFields: db.patchConfigFields,
  tombstoneConfigField: db.tombstoneConfigField,
  unsetConfigField: db.unsetConfigField,
  deleteConfig: db.deleteConfig,
  toggleConfigActive: db.toggleConfigActive,
  hasAnyConfigReadAccess,
  getReadableConfigSections,
  hasConfigCapability,
  hasCapability,
  getAppConfig,
  invalidateConfigCaches,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', handlers.listConfigs);
router.get('/base', handlers.getBaseConfig);
router.get('/:principalType/:principalId', handlers.getConfig);
router.put('/:principalType/:principalId', handlers.upsertConfigOverrides);
router.patch('/:principalType/:principalId/fields', handlers.patchConfigField);
router.post('/:principalType/:principalId/fields/tombstone', handlers.tombstoneConfigField);
router.delete('/:principalType/:principalId/fields', handlers.deleteConfigField);
router.delete('/:principalType/:principalId', handlers.deleteConfigOverrides);
router.patch('/:principalType/:principalId/active', handlers.toggleConfig);

module.exports = router;
