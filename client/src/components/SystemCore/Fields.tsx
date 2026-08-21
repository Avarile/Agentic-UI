// One control per `ui.control` in SPEC.
//
// WHY THESE ARE UNCONTROLLED
// --------------------------
// A controlled input is the reflex here and it would be wrong twice over:
//
//   * React's onChange is the DOM's `input` event — it fires per keystroke. The
//     reference bound the native `change` event, which for a text field fires
//     on blur. That difference is the whole editing model: committing per
//     keystroke would rebuild the strip's geometry on every character typed,
//     and "0.0" would be rejected as out of range on its way to "0.05".
//   * A controlled number input cannot hold the intermediate states of typing a
//     number. Binding state to a number turns "-" and "0." into NaN before the
//     user has finished the thought.
//
// So the DOM holds the edit in progress, each control registers a read(), and
// the form asks every control for its value at once when a commit is triggered.
//
// TWO COMMIT TRIGGERS, ONE COMMIT PATH
// ------------------------------------
// Input and Textarea are native elements, so they emit a native `change` that
// bubbles to the form's one delegated listener — that is what gives text and
// number fields their blur-commit semantics. Checkbox and Select are Radix
// button-based primitives and emit no such event, so they call commit()
// directly. For a boolean or an enum there is no intermediate typing state, and
// a native checkbox or select would have fired on click anyway, so the timing
// is the same either way.

import { useRef, useState, useEffect, useContext, createContext } from 'react';
import { Input, Label, Select, Checkbox, Textarea, SelectItem } from '@librechat/client';
import { SelectValue, SelectContent, SelectTrigger } from '@librechat/client';
import type { MutableRefObject, ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { FieldSpec } from './data/schema';
import { STATUS } from './data/status';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export type Reader = () => unknown;

interface Registry {
  register: (path: string, read: Reader) => () => void;
  commit: () => void;
}

const RegistryContext = createContext<Registry | null>(null);

export function ReaderRegistry({
  readers,
  commit,
  children,
}: {
  readers: MutableRefObject<Map<string, Reader>>;
  commit: () => void;
  children: ReactNode;
}) {
  const value: Registry = {
    register: (path, read) => {
      readers.current.set(path, read);
      return () => {
        // Only drop it if it is still ours: a remounting control registers its
        // replacement before the outgoing one cleans up.
        if (readers.current.get(path) === read) {
          readers.current.delete(path);
        }
      };
    },
    commit,
  };
  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}

function useField(path: string, read: Reader) {
  const ctx = useContext(RegistryContext);
  const latest = useRef(read);
  latest.current = read;
  const register = ctx?.register;

  useEffect(() => {
    if (!register) {
      return;
    }
    return register(path, () => latest.current());
  }, [path, register]);

  return ctx?.commit ?? (() => undefined);
}

export const isNullable = (s: FieldSpec) => s.nullable === true || s.default === null;
const emptyValue = (s: FieldSpec) => (isNullable(s) ? null : '');

export interface ControlProps {
  path: string;
  spec: FieldSpec;
  value: unknown;
  disabled: boolean;
  /** Ties the field's <Label> to its control. Radix Checkbox and Select render
   *  buttons rather than inputs, so an explicit htmlFor/id pair is the only
   *  association that works across all eight controls. */
  id: string;
  /** Only the phase control uses this. */
  onPin?: () => void;
}

const FIELD = 'h-8 rounded-lg px-2 py-1 text-xs bg-surface-primary';

/** Status keys are schema values; these are their display names. Mapped
 *  explicitly rather than built from the key so the translation keys stay
 *  statically checkable. */
const STATUS_LABELS: Record<string, TranslationKeys> = {
  running: 'com_ui_system_core_status_running',
  fault: 'com_ui_system_core_status_fault',
  init: 'com_ui_system_core_status_init',
  loading: 'com_ui_system_core_status_loading',
};

function TextControl({ path, spec, value, disabled, id }: ControlProps) {
  const ref = useRef<HTMLInputElement>(null);
  useField(path, () => {
    const v = ref.current?.value.trim() ?? '';
    return v === '' ? emptyValue(spec) : v;
  });
  return (
    <Input
      ref={ref}
      id={id}
      type="text"
      className={FIELD}
      defaultValue={value == null ? '' : String(value)}
      disabled={disabled}
    />
  );
}

function NumberControl({ path, spec, value, disabled, id }: ControlProps) {
  const localize = useLocalize();
  const ref = useRef<HTMLInputElement>(null);
  useField(path, () => {
    const raw = ref.current?.value.trim() ?? '';
    return raw === '' ? null : Number(raw);
  });
  return (
    <Input
      ref={ref}
      id={id}
      type="number"
      className={FIELD}
      step={spec.ui.step}
      min={spec.min}
      max={spec.max}
      placeholder={isNullable(spec) ? localize('com_ui_system_core_auto') : undefined}
      defaultValue={value == null ? '' : String(value)}
      disabled={disabled}
    />
  );
}

function ToggleControl({ path, value, disabled, id }: ControlProps) {
  const [checked, setChecked] = useState(value === true);
  const commit = useField(path, () => checked);
  return (
    <Checkbox
      id={id}
      aria-labelledby={`${id}-label`}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(next) => {
        setChecked(next === true);
        // Deferred so read() sees the new value: the state write above has not
        // landed yet when this handler runs.
        queueMicrotask(commit);
      }}
    />
  );
}

function StatusControl({ path, value, disabled, id }: ControlProps) {
  const localize = useLocalize();
  const [current, setCurrent] = useState(String(value ?? ''));
  const commit = useField(path, () => current);
  return (
    <Select
      value={current}
      disabled={disabled}
      onValueChange={(next) => {
        setCurrent(next);
        queueMicrotask(commit);
      }}
    >
      <SelectTrigger id={id} className={cn(FIELD, 'w-full')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.keys(STATUS).map((k) => (
          <SelectItem key={k} value={k} className="text-xs">
            {STATUS_LABELS[k] ? localize(STATUS_LABELS[k]) : STATUS[k].name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A colour input has no way to say "no override", so an explicit auto box
 *  carries the null and greys the swatch out while it is ticked. */
function ColorControl({ path, value, disabled, id }: ControlProps) {
  const localize = useLocalize();
  const [auto, setAuto] = useState(value == null);
  const valRef = useRef<HTMLInputElement>(null);
  const commit = useField(path, () => (auto ? null : (valRef.current?.value ?? '').toUpperCase()));
  return (
    <span className="flex items-center gap-2">
      <Checkbox
        aria-label={localize('com_ui_system_core_auto_colour')}
        checked={auto}
        disabled={disabled}
        onCheckedChange={(next) => {
          setAuto(next === true);
          queueMicrotask(commit);
        }}
      />
      {/* Native colour input: there is no shared primitive for one, and being
          native is what puts it on the delegated `change` path. */}
      <input
        ref={valRef}
        id={id}
        type="color"
        className="h-8 w-10 cursor-pointer rounded-lg border border-border-light bg-surface-primary p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        defaultValue={value == null ? '#888888' : String(value)}
        disabled={disabled || auto}
      />
    </span>
  );
}

function ListControl({ path, value, disabled, id }: ControlProps) {
  const localize = useLocalize();
  const ref = useRef<HTMLInputElement>(null);
  useField(path, () =>
    (ref.current?.value ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return (
    <Input
      ref={ref}
      id={id}
      type="text"
      className={FIELD}
      placeholder={localize('com_ui_system_core_comma_separated')}
      defaultValue={((value as string[]) || []).join(', ')}
      disabled={disabled}
    />
  );
}

function PairsControl({ path, value, disabled, id }: ControlProps) {
  const localize = useLocalize();
  const ref = useRef<HTMLTextAreaElement>(null);
  useField(path, () => {
    const out: Record<string, number> = {};
    for (const line of (ref.current?.value ?? '').split('\n')) {
      const t = line.trim();
      if (!t) {
        continue;
      }
      const eq = t.indexOf('=');
      // A line with no "=" is left as NaN on purpose: the schema reports it.
      if (eq < 0) {
        out[t] = NaN;
      } else {
        out[t.slice(0, eq).trim()] = Number(t.slice(eq + 1).trim());
      }
    }
    return out;
  });
  const initial = Object.entries((value as Record<string, number>) || {})
    .map(([k, n]) => k + ' = ' + n)
    .join('\n');
  return (
    <Textarea
      ref={ref}
      id={id}
      rows={2}
      className="min-h-16 rounded-lg px-2 py-1 text-xs"
      placeholder={localize('com_ui_system_core_pairs_hint')}
      defaultValue={initial}
      disabled={disabled}
    />
  );
}

/** A number, plus a way to capture where the strip has actually got to —
 *  typing a radian angle by hand is nobody's idea of a good time. */
function PhaseControl({ path, spec, value, disabled, id, onPin }: ControlProps) {
  const localize = useLocalize();
  const ref = useRef<HTMLInputElement>(null);
  useField(path, () => {
    const raw = ref.current?.value.trim() ?? '';
    return raw === '' ? null : Number(raw);
  });
  return (
    <span className="flex items-center gap-1">
      <Input
        ref={ref}
        id={id}
        type="number"
        className={FIELD}
        step={spec.ui.step}
        placeholder={localize('com_ui_system_core_auto')}
        defaultValue={value == null ? '' : String(value)}
        disabled={disabled}
      />
      <button
        type="button"
        title={localize('com_ui_system_core_pin_hint')}
        disabled={disabled}
        onClick={onPin}
        className="shrink-0 rounded-lg border border-border-light px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {localize('com_ui_system_core_pin')}
      </button>
    </span>
  );
}

const CONTROLS: Record<string, (p: ControlProps) => ReactNode> = {
  text: TextControl,
  number: NumberControl,
  toggle: ToggleControl,
  status: StatusControl,
  color: ColorControl,
  list: ListControl,
  pairs: PairsControl,
  phase: PhaseControl,
};

/** One labelled field: caption plus whichever control the schema asked for. */
export function Field(props: Omit<ControlProps, 'id'>) {
  const { spec } = props;
  const Control = CONTROLS[spec.ui.control];
  if (!Control) {
    return null;
  }
  const id = `sysc-${props.path.replace(/\./g, '-')}`;
  // Toggles put the caption and the control side by side, so they take the full
  // width of the two-column grid: in one column the caption crowds the box out
  // of the row, and the panel's `overflow-y-auto` then clips it away entirely —
  // an unclickable checkbox.
  const inline = spec.ui.control === 'toggle';
  return (
    <div
      className={cn(
        'min-w-0',
        spec.ui.wide === true || inline ? 'col-span-2' : '',
        inline ? 'flex items-center justify-between gap-2' : 'flex flex-col gap-1',
      )}
    >
      {/* Label ships `w-full break-all`, which is right above a stacked control
          and wrong beside an inline one — it leaves nothing for the control to
          occupy. Beside one it flexes and is allowed to shrink instead. */}
      <Label
        id={`${id}-label`}
        htmlFor={id}
        className={cn(
          'text-xs text-text-secondary',
          inline ? 'w-auto min-w-0 flex-1 break-words' : '',
        )}
      >
        {spec.ui.label}
      </Label>
      <Control {...props} id={id} />
    </div>
  );
}
