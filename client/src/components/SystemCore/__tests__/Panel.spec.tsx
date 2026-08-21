// The control panel, driven through the real useModules hook so the commit path
// is exercised rather than mocked. No WebGL is involved: Panel never touches the
// canvas.

import userEvent from '@testing-library/user-event';
import { render, screen, within } from 'test/layout-test-utils';
import useModules from '~/hooks/SystemCore/useModules';
import Panel from '../Panel';

function Harness() {
  const m = useModules();
  return (
    <Panel
      modules={m.modules}
      selected={m.selected}
      onSelect={m.select}
      onAdd={m.add}
      onRemove={m.remove}
      onReplace={m.replace}
      onReset={m.reset}
      livePhase={m.livePhase}
    />
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
    expect(screen.getByText('(25)')).toBeInTheDocument();
    expect(screen.getByText('core')).toBeInTheDocument();
    expect(screen.getByText('storage')).toBeInTheDocument();
  });

  it('opens the editor for the module clicked', async () => {
    render(<Harness />);
    expect(screen.getByText('Select a module to edit it.')).toBeInTheDocument();

    await selectModule('kernel-scheduler');

    expect(screen.getByLabelText('ID')).toHaveValue('kernel-scheduler');
    expect(screen.getByLabelText('Radius')).toHaveValue(0.62);
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
    expect(screen.getByText('(26)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(screen.getByText('(25)')).toBeInTheDocument();
  });
});
