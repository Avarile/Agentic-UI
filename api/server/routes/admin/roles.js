/**
 * Admin API for role CRUD, role permissions and role membership.
 *
 * Same split-capability pattern as groups: `READ_ROLES` for reads, `MANAGE_ROLES` for writes,
 * under a router-wide `ACCESS_ADMIN`.
 *
 * Distinct from `server/routes/roles.js`, which is the *user-facing* per-feature permissions
 * API. This one manages roles as entities (create, delete, assign members).
 *
 * Connections: handlers from `createAdminRolesHandlers` (`packages/api`)
 */
const express = require('express');
const { createAdminRolesHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadRoles = requireCapability(SystemCapabilities.READ_ROLES);
const requireManageRoles = requireCapability(SystemCapabilities.MANAGE_ROLES);

const handlers = createAdminRolesHandlers({
  listRoles: db.listRoles,
  countRoles: db.countRoles,
  getRoleByName: db.getRoleByName,
  createRoleByName: db.createRoleByName,
  updateRoleByName: db.updateRoleByName,
  updateAccessPermissions: db.updateAccessPermissions,
  deleteRoleByName: db.deleteRoleByName,
  findUser: db.findUser,
  updateUser: db.updateUser,
  updateUsersByRole: db.updateUsersByRole,
  findUserIdsByRole: db.findUserIdsByRole,
  updateUsersRoleByIds: db.updateUsersRoleByIds,
  listUsersByRole: db.listUsersByRole,
  countUsersByRole: db.countUsersByRole,
  deleteConfig: db.deleteConfig,
  deleteAclEntries: db.deleteAclEntries,
  deleteGrantsForPrincipal: db.deleteGrantsForPrincipal,
  recordAuditEntry: db.recordAuditEntry,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', requireReadRoles, handlers.listRoles);
router.post('/', requireManageRoles, handlers.createRole);
router.get('/:name', requireReadRoles, handlers.getRole);
router.patch('/:name', requireManageRoles, handlers.updateRole);
router.delete('/:name', requireManageRoles, handlers.deleteRole);
router.patch('/:name/permissions', requireManageRoles, handlers.updateRolePermissions);
router.get('/:name/members', requireReadRoles, handlers.getRoleMembers);
router.post('/:name/members', requireManageRoles, handlers.addRoleMember);
router.delete('/:name/members/:userId', requireManageRoles, handlers.removeRoleMember);

module.exports = router;
