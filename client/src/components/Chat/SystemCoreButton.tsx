// Opens the System Core modal by writing its Recoil atom.
//
// A button that owns no state: the dialog is mounted once at the root
// (routes/Root.tsx), so any surface can raise it without hosting it.
//
// Rendered only for a caller the server will actually serve. The feed is gated on
// ACCESS_ADMIN, and offering an entry point that answers 403 is worse than
// offering none — see hooks/SystemCore/useAvailable.ts for why this is a request
// rather than a role check.

import { memo, useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { Boxes } from 'lucide-react';
import { Button, TooltipAnchor } from '@librechat/client';
import useSystemCoreAvailable from '~/hooks/SystemCore/useAvailable';
import { useLocalize } from '~/hooks';
import store from '~/store';

function SystemCoreButton() {
  const localize = useLocalize();
  const available = useSystemCoreAvailable();
  const setShowSystemCore = useSetRecoilState(store.showSystemCore);
  const open = useCallback(() => setShowSystemCore(true), [setShowSystemCore]);

  if (!available) {
    return null;
  }

  return (
    <TooltipAnchor
      description={localize('com_ui_system_core_open')}
      render={
        <Button
          size="icon"
          variant="ghost"
          data-testid="system-core-button"
          aria-label={localize('com_ui_system_core_open')}
          onClick={open}
          className="inline-flex size-9 flex-shrink-0 items-center justify-center rounded-xl border border-border-light bg-presentation text-text-primary transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50 radix-state-open:bg-surface-tertiary"
        >
          <Boxes className="icon-sm" aria-hidden="true" />
        </Button>
      }
    />
  );
}

export default memo(SystemCoreButton);
