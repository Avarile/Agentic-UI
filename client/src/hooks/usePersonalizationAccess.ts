// Whether personalization features (memory, preferences) are available to this user
// — a config flag and a permission, resolved together so call sites check once.

import { PermissionTypes, Permissions } from 'librechat-data-provider';
import useHasAccess from './Roles/useHasAccess';

export default function usePersonalizationAccess() {
  const hasMemoryOptOut = useHasAccess({
    permissionType: PermissionTypes.MEMORIES,
    permission: Permissions.OPT_OUT,
  });

  const hasAnyPersonalizationFeature = hasMemoryOptOut;

  return {
    hasMemoryOptOut,
    hasAnyPersonalizationFeature,
  };
}
