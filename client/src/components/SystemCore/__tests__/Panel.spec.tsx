// The control panel, driven through the real useModules hook so the commit path
// is exercised rather than mocked. No WebGL is involved: Panel never touches the
// canvas.

import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, within } from 'test/layout-test-utils';
import type { LiveState } from '~/hooks/SystemCore/useLive';
import type { Reading } from '../live/bind';
import useModules from '~/hooks/SystemCore/useModules';
import { loadFixture } from '../data/fixture';
import Panel from '../Panel';

// Read off the fixture rather than hard-coded: the arrangement is authored data
// and changes, and a stale literal here silently drifted once already.
const NO_READINGS: ReadonlyMap<string, Reading> = new Map();
const FIXTURE = loadFixture().modules;
const COUNT = FIXTURE.length;
const KERNEL = FIXTURE.find((m) => m.id === 'kernel-scheduler');

function reading(over: Partial<Reading> = {}): Reading {
  return {
    status: 'running',
    up: true,
    health: 0.9,
    load: 0.4,
    rate: 52,
    stale: false,
    overflow: false,
    ...over,
  };
}

/** A reading for the one module these tests select. */
const LIVE: ReadonlyMap<string, Reading> = new Map([['kernel-scheduler', reading()]]);

interface HarnessProps {
  readings?: ReadonlyMap<string, Reading>;
  liveState?: LiveState;
  cacheAgeMs?: number | null;
  onRetry?: () => void;
}

function Harness({
  readings = NO_READINGS,
  liveState = 'off',
  cacheAgeMs = null,
  onRetry = () => undefined,
}: HarnessProps) {
  const m = useModules();
  const kernel = m.modules.find((x) => x.id === 'kernel-scheduler');
  return (
    <>
      {/* The authored value the poll must never overwrite, exposed so a test can
          watch it across a commit of some other field. */}
      <output data-testid="authored-speed">{String(kernel?.motion.speed)}</output>
      <Panel
        modules={m.modules}
        readings={readings}
        selected={m.selected}
        onSelect={m.select}
        onAdd={m.add}
        onRemove={m.remove}
        onReplace={m.replace}
        onReset={m.reset}
        livePhase={m.livePhase}
        liveState={liveState}
        cacheAgeMs={cacheAgeMs}
        onRetry={onRetry}
      />
    </>
  );
}

/** The SPEC sections other than Geometry start collapsed. */
async function openSection(title: string) {
  await userEvent.click(screen.getByText(title));
}

async function selectModule(name: string) {
  await userEvent.click(screen.getByRole('option', { name: new RegExp(name) }));
}

describe('SystemCore Panel', () => {
  it('lists the fixture grouped by meta.group', () => {
    render(<Harness />);
    expect(screen.getByText(`(${COUNT})`)).toBeInTheDocument();
    expect(screen.getByText('core')).toBeInTheDocument();
    expect(screen.getByText('storage')).toBeInTheDocument();
  });

  it('opens the editor for the module clicked', async () => {
    render(<Harness />);
    expect(screen.getByText('Select a module to edit it.')).toBeInTheDocument();

    await selectModule('kernel-scheduler');

    expect(screen.getByLabelText('ID')).toHaveValue('kernel-scheduler');
    expect(screen.getByLabelText('Radius')).toHaveValue(KERNEL?.geometry.radius);
  });

  it('commits a boolean toggle', async () => {
    render(<Harness />);
    await selectModule('kernel-scheduler');
    await openSection('Appearance');

    const glow = screen.getByRole('checkbox', { name: 'Glow' });
    expect(glow).toBeChecked();
    await userEvent.click(glow);
    expect(glow).not.toBeChecked();
  });

  it('gives every toggle its own full-width row', async () => {
    // Regression guard. These captions sit beside their control rather than
    // above it, so in one column of the two-column grid the caption claims the
    // whole row and pushes the checkbox outside it — where the panel's
    // `overflow-y-auto` clips it and it cannot be clicked at all. jsdom does no
    // layout, so it cannot observe the clipping; asserting the row spans both
    // columns is what pins the fix.
    render(<Harness />);
    await selectModule('kernel-scheduler');
    await openSection('Appearance');

    for (const name of ['Glow', 'Halo', 'Trail', 'Show band text']) {
      const row = screen.getByRole('checkbox', { name }).parentElement;
      expect(row).toHaveClass('col-span-2');
      // And the caption must be allowed to shrink, not hold `w-full`.
      const label = within(row as HTMLElement).getByText(name);
      expect(label).toHaveClass('flex-1', 'min-w-0', 'w-auto');
    }
  });

  it('refuses an out-of-range value and says why, without refilling the field', async () => {
    render(<Harness />);
    await selectModule('kernel-scheduler');

    const radius = screen.getByLabelText('Radius');
    await userEvent.clear(radius);
    await userEvent.type(radius, '999');
    await userEvent.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('must be at most 8');
    // The rejected value stays on screen to be corrected.
    expect(radius).toHaveValue(999);
  });

  it('adds and removes modules', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /Add/ }));
    expect(screen.getByText(`(${COUNT + 1})`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(screen.getByText(`(${COUNT})`)).toBeInTheDocument();
  });
});

describe('SystemCore Panel under live data', () => {
  it('leaves every field editable when the poll is off', async () => {
    // The feature-off contract. Most deployments are in this state, and it has
    // to behave exactly as it did before there was a feed.
    render(<Harness />);
    await selectModule('kernel-scheduler');
    await openSection('Motion');

    expect(screen.getByLabelText(/^Speed/)).not.toHaveAttribute('readonly');
    expect(screen.queryByTitle('Driven by live data')).not.toBeInTheDocument();
  });

  it('marks a bound field read-only and names the channel driving it', async () => {
    render(<Harness readings={LIVE} liveState="live" cacheAgeMs={0} />);
    await selectModule('kernel-scheduler');
    await openSection('Motion');

    const speed = screen.getByLabelText(/^Speed/);
    // readOnly, not disabled: the whole point of a live field is that you can
    // still read the number on it.
    expect(speed).toHaveAttribute('readonly');
    expect(speed).not.toBeDisabled();
    expect(within(speed.closest('div') as HTMLElement).getByText('throughput')).toBeInTheDocument();
  });

  it('does not lock the fields the poll does not own', async () => {
    render(<Harness readings={LIVE} liveState="live" cacheAgeMs={0} />);
    await selectModule('kernel-scheduler');

    // Geometry, labels, audio and visibility stay authored — the arrangement is
    // still something a person composes.
    expect(screen.getByLabelText('Radius')).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('Arc °')).not.toHaveAttribute('readonly');
  });

  it('never carries a bound field into a commit of another field', async () => {
    // The correctness half of binding: a bound control registers no reader, so
    // `Form.commit` — which gathers every control at once — cannot write its DOM
    // value over the module. Without this, one edit anywhere would pin every
    // bound field to whatever it happened to be showing.
    render(<Harness readings={LIVE} liveState="live" cacheAgeMs={0} />);
    await selectModule('kernel-scheduler');
    await openSection('Motion');

    const before = screen.getByTestId('authored-speed').textContent;
    // Force a value into the read-only control, as a stray commit would find it.
    fireEvent.change(screen.getByLabelText(/^Speed/), { target: { value: '9' } });

    // Now commit a different, unbound field.
    const radius = screen.getByLabelText('Radius');
    await userEvent.clear(radius);
    await userEvent.type(radius, '1.5');
    await userEvent.tab();

    expect(screen.getByLabelText('Radius')).toHaveValue(1.5);
    expect(screen.getByTestId('authored-speed').textContent).toBe(before);
  });

  it('disables the status control, which has no read-only to fall back on', async () => {
    // Radix renders a button rather than an input.
    render(<Harness readings={LIVE} liveState="live" cacheAgeMs={0} />);
    await selectModule('kernel-scheduler');

    // Matched loosely because the caption carries the channel badge alongside
    // it. The badge is aria-hidden, so a screen reader still hears just
    // "Status" — but Testing Library matches raw label text, not the computed
    // accessible name.
    expect(screen.getByLabelText(/^Status/)).toBeDisabled();
  });

  it('reports what the poll is doing', () => {
    // Without a chip there is no way to tell a quiet cluster from a dead poll.
    const cases: Array<[LiveState, string]> = [
      ['off', 'Example data'],
      ['paused', 'Paused'],
      ['live', 'Live'],
      ['stale', 'Live'],
      ['error', 'Live data is unavailable.'],
    ];
    for (const [state, label] of cases) {
      const { unmount } = render(<Harness liveState={state} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('offers a retry only when the poll has given up', async () => {
    const onRetry = jest.fn();
    const { unmount } = render(<Harness liveState="live" />);
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    unmount();

    render(<Harness liveState="error" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('says how old a stale snapshot is', () => {
    render(<Harness liveState="stale" cacheAgeMs={45_000} />);
    expect(screen.getByTitle('Updated 45s ago')).toBeInTheDocument();
  });

  it('rounds a long stale age to minutes', () => {
    render(<Harness liveState="stale" cacheAgeMs={185_000} />);
    expect(screen.getByTitle('Updated 3m ago')).toBeInTheDocument();
  });

  it('says which pristine state reset goes back to', () => {
    // "Reset" means something different depending on whether there is a feed
    // behind the arrangement.
    const off = render(<Harness />);
    expect(screen.getByTitle('Reset to example data')).toBeInTheDocument();
    off.unmount();

    render(<Harness readings={LIVE} liveState="live" />);
    expect(screen.getByTitle('Reset to source data')).toBeInTheDocument();
  });
});
