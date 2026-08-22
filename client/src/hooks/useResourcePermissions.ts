// Effective permissions for one resource (agent, prompt, skill, project).
//
// Distinct from `useHasAccess`, which answers a *global* role question. This
// answers a per-object one — can this user edit this specific agent — which
// requires a server round trip because sharing is per-resource.

import {
  hasPermissions,
  useGetEffectivePermissionsQuery,
} from 'librechat-data-provider/react-query';
import type { ResourceType } from 'librechat-data-provider';

/**
 * fetches resource permissions once and returns a function to check any permission
 * More efficient when checking multiple permissions for the same resource
 * @param resourceType - Type of resource (e.g., ResourceType.AGENT)
 * @param resourceId - ID of the resource
 * @returns Object with hasPermission function and loading state
 */
export const useResourcePermissions = (resourceType: ResourceType, resourceId: string) => {
  const { data, isLoading } = useGetEffectivePermissionsQuery(resourceType, resourceId);

  const hasPermission = (requiredPermission: number): boolean => {
    return data ? hasPermissions(data.permissionBits, requiredPermission) : false;
  };

  return {
    hasPermission,
    isLoading,
    permissionBits: data?.permissionBits || 0,
  };
};

export default useResourcePermissions;
