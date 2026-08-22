// Prompt library state for both the navigation pane and the composer's `/` command.
//
// Two different shapes of the same data are needed at once: the paginated,
// filterable nav list (`usePromptGroupsNav`) and a flat, pre-mapped array for
// mention/autocomplete. Both are provided here so the composer's command menu does
// not re-fetch the catalogue the sidebar already has.
//
// Everything is gated on the PROMPTS/USE permission, and `hasAccess` is published
// alongside the data so consumers render an empty state rather than a failed
// query.

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TPromptGroup } from 'librechat-data-provider';
import type { PromptOption } from '~/common';
import { usePromptGroupsNav, useHasAccess } from '~/hooks';
import { useGetAllPromptGroups } from '~/data-provider';
import { CategoryIcon } from '~/components/Prompts';
import { mapPromptGroups } from '~/utils';

type AllPromptGroupsData =
  | {
      promptsMap: Record<string, TPromptGroup>;
      promptGroups: PromptOption[];
    }
  | undefined;

type PromptGroupsContextType =
  | (ReturnType<typeof usePromptGroupsNav> & {
      allPromptGroups: {
        data: AllPromptGroupsData;
        isLoading: boolean;
      };
      hasAccess: boolean;
    })
  | null;

const PromptGroupsContext = createContext<PromptGroupsContextType>(null);

export const PromptGroupsProvider = ({ children }: { children: ReactNode }) => {
  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });

  const promptGroupsNav = usePromptGroupsNav(hasAccess);
  const { data: allGroupsData, isLoading: isLoadingAll } = useGetAllPromptGroups(undefined, {
    enabled: hasAccess,
    select: (data) => {
      const mappedArray: PromptOption[] = data.map((group) => ({
        id: group._id ?? '',
        type: 'prompt',
        value: group.command ?? group.name,
        label: `${group.command != null && group.command ? `/${group.command} - ` : ''}${
          group.name
        }: ${
          (group.oneliner?.length ?? 0) > 0
            ? group.oneliner
            : (group.productionPrompt?.prompt ?? '')
        }`,
        icon: <CategoryIcon category={group.category ?? ''} className="h-5 w-5" />,
      }));

      const promptsMap = mapPromptGroups(data);

      return {
        promptsMap,
        promptGroups: mappedArray,
      };
    },
  });

  const contextValue = useMemo(
    () => ({
      ...promptGroupsNav,
      allPromptGroups: {
        data: hasAccess ? allGroupsData : undefined,
        isLoading: hasAccess ? isLoadingAll : false,
      },
      hasAccess,
    }),
    [promptGroupsNav, allGroupsData, isLoadingAll, hasAccess],
  );

  return (
    <PromptGroupsContext.Provider value={contextValue}>{children}</PromptGroupsContext.Provider>
  );
};

export const usePromptGroupsContext = () => {
  return useContext(PromptGroupsContext);
};
