// The sidebar's panel list, filtered by permission and configuration.
//
// The single source for what the sidebar can show, which is what makes
// `resolveActivePanel` (Providers/ActivePanelContext) able to fall back safely when
// a stored panel id is no longer available.

import { useMemo } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { Boxes, MessagesSquare } from 'lucide-react';
import { useUserKeyQuery } from 'librechat-data-provider/react-query';
import { getConfigDefaults, getEndpointField } from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';
import type { NavLink } from '~/common';
import ConversationsSection from '~/components/UnifiedSidebar/ConversationsSection';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import useSideNavLinks from '~/hooks/Nav/useSideNavLinks';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

export default function useUnifiedSidebarLinks() {
  /** Selector instead of the full conversation atom: the links only depend on
   * the endpoint, so parameter edits and other conversation writes stay out. */
  const endpoint = useRecoilValue(store.conversationEndpointByIndex(0)) ?? undefined;
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig = {} as TEndpointsConfig } = useGetEndpointsQuery();
  const setShowSystemCore = useSetRecoilState(store.showSystemCore);

  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, endpoint, 'type'),
    [endpoint, endpointsConfig],
  );

  const userProvidesKey = useMemo(
    () => !!(endpointsConfig?.[endpoint ?? '']?.userProvide ?? false),
    [endpointsConfig, endpoint],
  );

  const { data: keyExpiry = { expiresAt: undefined } } = useUserKeyQuery(endpoint ?? '');

  const keyProvided = useMemo(
    () => (userProvidesKey ? !!(keyExpiry.expiresAt ?? '') : true),
    [keyExpiry.expiresAt, userProvidesKey],
  );

  const sideNavLinks = useSideNavLinks({
    keyProvided,
    endpoint,
    endpointType,
    interfaceConfig,
    endpointsConfig,
    includeHidePanel: false,
  });

  const links = useMemo(() => {
    const conversationLink: NavLink = {
      title: 'com_ui_chat_history',
      label: '',
      icon: MessagesSquare,
      id: 'conversations',
      Component: ConversationsSection,
    };

    // An `onClick` and no `Component`: NavIconButton short-circuits on it, so
    // this raises the modal instead of switching the expanded panel — and works
    // unchanged in the mobile drawer.
    const systemCoreLink: NavLink = {
      title: 'com_ui_system_core',
      label: '',
      icon: Boxes,
      id: 'system-core',
      onClick: () => setShowSystemCore(true),
    };

    return [conversationLink, ...sideNavLinks, systemCoreLink];
  }, [sideNavLinks, setShowSystemCore]);

  return links;
}
