// The System Core modal.
//
// Mounted once, app-wide (see routes/Root.tsx), and opened from a Recoil atom
// so any surface can raise it — currently the sidebar rail and the chat header.
//
// Full screen: OGDialogContent ships `max-w-11/12`, `max-h-[90vh]`, `rounded-2xl`
// and `p-6`, so all four are overridden below. The primitive's centring transform
// is left alone — a 100dvh × 100% box centred in the viewport already sits at
// inset 0, and keeping it means the open/close animation still works. Same
// approach as Chat/Menus/Presets/EditPresetDialog.tsx.
//
// The scene is behind a lazy boundary that is render-gated on `open`, following
// Chat/Presentation.tsx: while the modal is closed the `three` chunk is never
// fetched and no WebGL context exists. Radix unmounts dialog content on close,
// so the context is released again every time it is dismissed.
//
// Module state lives here rather than in Scene, so edits and each strip's live
// rotation survive a close: reopening resumes where it left off instead of
// restarting the stack.

import { lazy, Suspense, useRef, useState, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { X, Radar, PanelRight, RotateCcw } from 'lucide-react';
import {
  Button,
  Spinner,
  OGDialog,
  TooltipAnchor,
  OGDialogTitle,
  OGDialogContent,
  OGDialogDescription,
} from '@librechat/client';
import useModules from '~/hooks/SystemCore/useModules';
import useLive from '~/hooks/SystemCore/useLive';
import Boundary from './Boundary';
import Panel from './Panel';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const Scene = lazy(() => import('./Scene'));

// The controls float over the viewport, which is a fixed dark stage in both
// themes (see scene/palette.ts). The usual text/surface roles flip with the
// theme and would disappear against it, so these use the theme-invariant
// `-fixed` roles — the same treatment UIResourceCarousel gives its overlay
// controls. Off-state toggles drop to 50% rather than changing hue, since there
// is only one ink colour to work with on the chip.
const ICON_BUTTON =
  'size-8 min-w-0 rounded-lg p-0 text-text-fixed/50 hover:bg-surface-fixed-hover ' +
  'hover:text-text-fixed focus-visible:ring-text-fixed focus-visible:ring-offset-0';

function SceneLoading() {
  const localize = useLocalize();
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-surface-primary"
      role="status"
    >
      <Spinner className="size-6" aria-hidden="true" />
      <span className="sr-only">{localize('com_ui_loading')}</span>
    </div>
  );
}

function SceneError() {
  const localize = useLocalize();
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-primary p-8">
      <p className="text-center text-sm text-text-secondary">
        {localize('com_ui_system_core_unavailable')}
      </p>
    </div>
  );
}

export default function SystemCoreDialog() {
  const localize = useLocalize();
  const [open, setOpen] = useRecoilState(store.showSystemCore);
  const [scannerVisible, setScannerVisible] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [resetToken, setResetToken] = useState(0);

  // Called above the `open &&` gate below on purpose: the query's `enabled` is
  // what stops the network, not the mount, and keeping the hook mounted is what
  // preserves the cache across an open/close cycle.
  const live = useLive(open);
  const {
    modules,
    selected,
    select,
    runtimeFor,
    parkPhase,
    livePhase,
    replace,
    add,
    remove,
    reset,
  } = useModules({ catalog: live.catalog, catalogRevision: live.catalogRevision });

  const contentRef = useRef<HTMLDivElement>(null);

  // Radix focuses the first tabbable node on open, which here is a toolbar
  // button — and TooltipAnchor opens on focus, so the modal would appear with a
  // tooltip sitting over its own controls. Focus the panel instead. The focus
  // trap is unaffected: Tab still walks into the toolbar from here.
  const focusSelf = useCallback((event: Event) => {
    event.preventDefault();
    contentRef.current?.focus();
  }, []);

  const resetView = useCallback(() => setResetToken((n) => n + 1), []);
  const toggleScanner = useCallback(() => setScannerVisible((v) => !v), []);
  const togglePanel = useCallback(() => setPanelOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), [setOpen]);
  // The list toggles selection on re-click; picking from the list should always
  // land on the module clicked.
  const selectFromList = useCallback((id: string) => select(id), [select]);

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <OGDialogContent
        ref={contentRef}
        tabIndex={-1}
        onOpenAutoFocus={focusSelf}
        showCloseButton={false}
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full overflow-hidden rounded-none border-0 bg-surface-dialog p-0"
      >
        {/* No visible chrome: the viewport is the whole modal. Radix still needs
            an accessible name and description, and `sr-only` is absolutely
            positioned so neither joins the flex row. */}
        <OGDialogTitle className="sr-only">{localize('com_ui_system_core')}</OGDialogTitle>
        <OGDialogDescription className="sr-only">
          {localize('com_ui_system_core_description')}
        </OGDialogDescription>

        <div className="relative min-h-0 min-w-0 flex-1">
          {open && (
            <Boundary fallback={<SceneError />}>
              <Suspense fallback={<SceneLoading />}>
                <Scene
                  modules={modules}
                  readings={live.readings}
                  runtimeFor={runtimeFor}
                  parkPhase={parkPhase}
                  selected={selected}
                  onSelect={select}
                  scannerVisible={scannerVisible}
                  resetToken={resetToken}
                />
              </Suspense>
            </Boundary>
          )}

          <div
            role="toolbar"
            aria-label={localize('com_ui_system_core')}
            aria-orientation="horizontal"
            className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-xl bg-surface-fixed p-1 shadow-lg"
          >
            <TooltipAnchor
              description={localize('com_ui_system_core_panel')}
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={localize('com_ui_system_core_panel')}
                  aria-pressed={panelOpen}
                  onClick={togglePanel}
                  className={cn(ICON_BUTTON, panelOpen && 'text-text-fixed')}
                >
                  <PanelRight className="size-4" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipAnchor
              description={localize('com_ui_system_core_scanner')}
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={localize('com_ui_system_core_scanner')}
                  aria-pressed={scannerVisible}
                  onClick={toggleScanner}
                  className={cn(ICON_BUTTON, scannerVisible && 'text-text-fixed')}
                >
                  <Radar className="size-4" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipAnchor
              description={localize('com_ui_system_core_reset_view')}
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={localize('com_ui_system_core_reset_view')}
                  onClick={resetView}
                  className={cn(ICON_BUTTON, 'text-text-fixed')}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipAnchor
              description={localize('com_ui_close')}
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={localize('com_ui_close')}
                  onClick={close}
                  className={cn(ICON_BUTTON, 'text-text-fixed')}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              }
            />
          </div>

          <p className="pointer-events-none absolute bottom-4 left-4 select-none text-xs text-text-tertiary">
            {localize('com_ui_system_core_hint')}
          </p>
        </div>

        {panelOpen && (
          <div className="hidden w-[320px] shrink-0 md:block">
            <Panel
              modules={modules}
              readings={live.readings}
              selected={selected}
              onSelect={selectFromList}
              onAdd={add}
              onRemove={remove}
              onReplace={replace}
              onReset={reset}
              livePhase={livePhase}
              liveState={live.state}
              cacheAgeMs={live.cacheAgeMs}
              onRetry={live.retry}
            />
          </div>
        )}
      </OGDialogContent>
    </OGDialog>
  );
}
