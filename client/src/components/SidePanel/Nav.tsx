// Renders whichever sidebar panel is active.
//
// Deliberately tiny: it resolves the stored panel id through
// `resolveActivePanel`, so a panel that is no longer available (permission or
// config changed) falls back to the first one instead of rendering nothing.

import type { NavLink } from '~/common';
import { useActivePanel, resolveActivePanel } from '~/Providers';

export default function Nav({ links }: { links: NavLink[] }) {
  const { active } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden text-text-primary">
      {links.map((link) =>
        link.id === effectiveActive && link.Component ? <link.Component key={link.id} /> : null,
      )}
    </div>
  );
}
