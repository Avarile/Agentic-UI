// Whether the current user's role grants a permission.
//
// Reads AuthContext directly with `useContext` rather than the `useAuthContext`
// hook, so it can be called from components that may render outside the provider
// (the share route) without throwing — it degrades to "no access" instead.
//
// Role *definitions* come from the server (data-provider/roles.ts); this only
// evaluates them, which is why a permission change appears without a reload.

import { useMemo, useCallback, useContext } from 'react';
import type { TUser, PermissionTypes, Permissions } from 'librechat-data-provider';
import { AuthContext } from '~/hooks/AuthContext';

const useHasAccess = ({
  permissionType,
  permission,
}: {
  permissionType: PermissionTypes;
  permission: Permissions;
}) => {
  const authContext = useContext(AuthContext);
  const user = authContext?.user;
  const roles = authContext?.roles;
  const isAuthenticated = authContext?.isAuthenticated || false;

  const checkAccess = useCallback(
    ({
      user,
      permissionType,
      permission,
    }: {
      user?: TUser | null;
      permissionType: PermissionTypes;
      permission: Permissions;
    }) => {
      if (!authContext) {
        return false;
      }

      if (isAuthenticated && user?.role != null && roles && roles[user.role]) {
        return roles[user.role]?.permissions?.[permissionType]?.[permission] === true;
      }
      return false;
    },
    [authContext, isAuthenticated, roles],
  );

  const hasAccess = useMemo(
    () => checkAccess({ user, permissionType, permission }),
    [user, permissionType, permission, checkAccess],
  );

  return hasAccess;
};

export default useHasAccess;
