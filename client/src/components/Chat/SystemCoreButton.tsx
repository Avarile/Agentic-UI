import { memo, useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { Boxes } from 'lucide-react';
import { Button, TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import store from '~/store';

function SystemCoreButton() {
  const localize = useLocalize();
  const setShowSystemCore = useSetRecoilState(store.showSystemCore);
  const open = useCallback(() => setShowSystemCore(true), [setShowSystemCore]);

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
          className="size-10 rounded-xl text-text-primary hover:bg-surface-hover"
        >
          <Boxes className="size-5" aria-hidden="true" />
        </Button>
      }
    />
  );
}

export default memo(SystemCoreButton);
