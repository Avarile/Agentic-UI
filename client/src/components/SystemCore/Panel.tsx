// The control panel: the module list, the editing form, and the actions.
//
// Commit flow, and why a rejected edit does not refill the form: the form hands
// over a candidate module, the schema judges it, and only a clean one reaches
// the scene. On success `refillKey` is bumped so every control re-reads from the
// normalised module — that is how "0.050" becomes "0.05" and a lower-case hex
// becomes upper-case. On failure the controls are deliberately left alone, so
// the value the user is arguing with is still on screen to be corrected.

import { useMemo, useState, useCallback } from 'react';
import { Plus, Copy, Trash2, RotateCcw, Check } from 'lucide-react';
import { Button } from '@librechat/client';
import type { Module } from './data/schema';
import { serialize } from './data/serialize';
import { displayName } from './data/schema';
import Form from './Form';
import List from './List';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface PanelProps {
  modules: Module[];
  selected: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  /** Returns the reasons it was refused; empty means committed. */
  onReplace: (id: string, draft: unknown) => string[];
  onReset: () => void;
  livePhase: (id: string) => number | null;
}

const ACTION = 'h-7 gap-1 rounded-lg px-2 text-xs text-text-secondary hover:text-text-primary';

export default function Panel({
  modules,
  selected,
  onSelect,
  onAdd,
  onRemove,
  onReplace,
  onReset,
  livePhase,
}: PanelProps) {
  const localize = useLocalize();
  const [refillKey, setRefillKey] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const current = useMemo(
    () => modules.find((m) => m.id === selected) ?? null,
    [modules, selected],
  );

  const handleCommit = useCallback(
    (candidate: Module) => {
      if (!selected) {
        return;
      }
      const problems = onReplace(selected, candidate);
      setErrors(problems);
      if (problems.length === 0) {
        setRefillKey((k) => k + 1);
      }
    },
    [selected, onReplace],
  );

  // Capture where the strip has actually turned to, rather than making anyone
  // type a radian angle by hand.
  const handlePin = useCallback(() => {
    if (!current || !selected) {
      return;
    }
    const phase = livePhase(selected);
    if (phase == null) {
      return;
    }
    const draft = structuredClone(current);
    draft.motion.phase = Number(phase.toFixed(4));
    const problems = onReplace(selected, draft);
    setErrors(problems);
    if (problems.length === 0) {
      setRefillKey((k) => k + 1);
    }
  }, [current, selected, livePhase, onReplace]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(serialize(modules)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setErrors([localize('com_ui_system_core_copy_failed')]),
    );
  }, [modules, localize]);

  const handleRemove = useCallback(() => {
    if (selected) {
      onRemove(selected);
      setErrors([]);
    }
  }, [selected, onRemove]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-l border-border-light bg-surface-primary text-text-primary">
      <div className="flex shrink-0 items-center justify-between border-b border-border-light px-3 py-2">
        <span className="text-xs font-medium text-text-secondary">
          {localize('com_ui_system_core_modules')}
          <span className="ml-1 text-text-tertiary">({modules.length})</span>
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onAdd} className={ACTION}>
            <Plus className="size-3.5" aria-hidden="true" />
            {localize('com_ui_add')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={!current || current.layout.locked === true}
            className={cn(ACTION, 'text-text-secondary hover:text-status-error')}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            {localize('com_ui_delete')}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <List modules={modules} selected={selected} onSelect={onSelect} />
      </div>

      {/* The form only claims its share of the height once there is something to
          edit; otherwise the list gets the whole panel, which matters at full
          screen where an empty form pane would waste half of it. */}
      <div
        className={cn(
          'min-h-0 overflow-y-auto border-t border-border-light px-3 py-3',
          current ? 'flex-[1.4]' : 'shrink-0',
        )}
      >
        {current ? (
          <>
            <p className="mb-2 truncate text-xs font-medium text-text-primary">
              {displayName(current)}
            </p>
            <Form
              module={current}
              refillKey={refillKey}
              onCommit={handleCommit}
              onPin={handlePin}
            />
          </>
        ) : (
          <p className="text-xs text-text-tertiary">
            {localize('com_ui_system_core_no_selection')}
          </p>
        )}

        {errors.length > 0 && (
          <ul
            role="alert"
            className="mt-3 flex flex-col gap-1 rounded-lg bg-status-error-subtle px-2 py-1.5 text-xs text-status-error"
          >
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 border-t border-border-light px-3 py-2">
        <Button variant="ghost" size="sm" onClick={handleCopy} className={ACTION}>
          {copied ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
          {copied ? localize('com_ui_copied') : localize('com_ui_system_core_copy_json')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className={cn(ACTION, 'ml-auto')}
          title={localize('com_ui_system_core_reset_data')}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {localize('com_ui_reset')}
        </Button>
      </div>
    </div>
  );
}
