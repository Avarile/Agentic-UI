/**
 * Authorizes people-picker searches by the principal types being requested.
 *
 * Maps each requested principal type to the permission it needs — `user` -> VIEW_USERS,
 * `group` -> VIEW_GROUPS, `role` -> VIEW_ROLES — and, for an unfiltered mixed search, requires
 * at least one of them.
 *
 * Design: authorizing per requested type (rather than one blanket "can use people picker"
 * permission) means a role allowed to share with groups but not to enumerate individual users
 * gets exactly that. Both `type` (singular) and `types` (comma-separated or array) query
 * shapes are accepted because different UI call sites send different forms, and unknown types
 * are rejected against `VALID_PRINCIPAL_TYPES` rather than ignored.
 *
 * Connections:
 * - roles via `getRoleByName` from `~/models`
 * - used by `server/routes/accessPermissions.js` and the sharing UI endpoints
 */
const { logger } = require('@librechat/data-schemas');
const { PrincipalType, PermissionTypes, Permissions } = require('librechat-data-provider');
const { getRoleByName } = require('~/models');

const VALID_PRINCIPAL_TYPES = new Set([
  PrincipalType.USER,
  PrincipalType.GROUP,
  PrincipalType.ROLE,
]);

/**
 * Middleware to check if user has permission to access people picker functionality.
 * Validates requested principal types via `type` (singular) and `types` (comma-separated or array)
 * query parameters against the caller's role permissions:
 * - user: requires VIEW_USERS permission
 * - group: requires VIEW_GROUPS permission
 * - role: requires VIEW_ROLES permission
 * - no type filter (mixed search): requires at least one of the above
 */
const checkPeoplePickerAccess = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user || !user.role) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const role = await getRoleByName(user.role);
    if (!role || !role.permissions) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'No permissions configured for user role',
      });
    }

    const { type, types } = req.query;
    const peoplePickerPerms = role.permissions[PermissionTypes.PEOPLE_PICKER] || {};
    const canViewUsers = peoplePickerPerms[Permissions.VIEW_USERS] === true;
    const canViewGroups = peoplePickerPerms[Permissions.VIEW_GROUPS] === true;
    const canViewRoles = peoplePickerPerms[Permissions.VIEW_ROLES] === true;

    const permissionChecks = {
      [PrincipalType.USER]: {
        hasPermission: canViewUsers,
        message: 'Insufficient permissions to search for users',
      },
      [PrincipalType.GROUP]: {
        hasPermission: canViewGroups,
        message: 'Insufficient permissions to search for groups',
      },
      [PrincipalType.ROLE]: {
        hasPermission: canViewRoles,
        message: 'Insufficient permissions to search for roles',
      },
    };

    const requestedTypes = new Set();

    if (type && VALID_PRINCIPAL_TYPES.has(type)) {
      requestedTypes.add(type);
    }

    if (types) {
      const typesArray = Array.isArray(types) ? types : types.split(',');
      for (const t of typesArray) {
        if (VALID_PRINCIPAL_TYPES.has(t)) {
          requestedTypes.add(t);
        }
      }
    }

    for (const requested of requestedTypes) {
      const check = permissionChecks[requested];
      if (!check.hasPermission) {
        return res.status(403).json({
          error: 'Forbidden',
          message: check.message,
        });
      }
    }

    if (requestedTypes.size === 0 && !canViewUsers && !canViewGroups && !canViewRoles) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions to search for users, groups, or roles',
      });
    }

    next();
  } catch (error) {
    logger.error(
      `[checkPeoplePickerAccess][${req.user?.id}] error for type=${req.query.type}, types=${req.query.types}`,
      error,
    );
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check permissions',
    });
  }
};

module.exports = {
  checkPeoplePickerAccess,
};
