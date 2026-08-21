// The dialog shell: its Recoil wiring, and the lazy boundary around the canvas.
//
// The scene itself is mocked out. jest-canvas-mock (global in test/setupTests)
// only implements the 2D context, so getContext('webgl') returns null and a real
// WebGLRenderer would throw — the canvas belongs in a browser test, not here.
// What is worth asserting in jsdom is that the heavy chunk is never reached
// while the modal is shut, which is the whole point of the render gate.

import { useSetRecoilState } from 'recoil';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from 'test/layout-test-utils';
import SystemCoreDialog from '../Dialog';
import store from '~/store';

const mockSceneMounted = jest.fn();

jest.mock('../Scene', () => ({
  __esModule: true,
  default: () => {
    mockSceneMounted();
    return <div data-testid="scene" />;
  },
}));

function Opener() {
  const setOpen = useSetRecoilState(store.showSystemCore);
  return (
    <>
      <button data-testid="opener" onClick={() => setOpen(true)} />
      <SystemCoreDialog />
    </>
  );
}

describe('SystemCoreDialog', () => {
  beforeEach(() => mockSceneMounted.mockClear());

  it('renders nothing until the atom is set, and never reaches the scene', () => {
    render(<Opener />);
    expect(screen.queryByText('System Core')).not.toBeInTheDocument();
    expect(mockSceneMounted).not.toHaveBeenCalled();
  });

  it('opens from the atom and mounts the scene behind Suspense', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByTestId('opener'));

    expect(await screen.findByText('System Core')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('scene')).toBeInTheDocument());
    expect(mockSceneMounted).toHaveBeenCalled();
  });

  it('shows the module panel with the bundled fixture loaded', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByTestId('opener'));

    expect(await screen.findByText('Modules')).toBeInTheDocument();
    // The fixture ships 25 modules; the header prints the count.
    expect(screen.getByText('(25)')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /kernel-scheduler/ })).toBeInTheDocument();
  });

  it('floats all four controls in a toolbar over the viewport', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByTestId('opener'));

    const toolbar = await screen.findByRole('toolbar');
    const labels = Array.from(toolbar.querySelectorAll('button')).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Toggle module panel', 'Scanner deck', 'Reset view', 'Close']);
  });

  it('keeps an accessible name even though the title bar is not rendered', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByTestId('opener'));

    // The heading is sr-only: present for the dialog's accessible name, but no
    // longer a visible strip of chrome.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('System Core');
    expect(screen.getByRole('heading', { name: 'System Core' })).toHaveClass('sr-only');
  });

  it('tracks toggle state on the viewport controls', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByTestId('opener'));

    const scanner = await screen.findByRole('button', { name: 'Scanner deck' });
    expect(scanner).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(scanner);
    expect(scanner).toHaveAttribute('aria-pressed', 'false');

    const panel = screen.getByRole('button', { name: 'Toggle module panel' });
    expect(panel).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(panel);
    expect(panel).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Modules')).not.toBeInTheDocument();
  });

  it('unmounts the scene on close, releasing the WebGL context', async () => {
    render(<Opener />);
    await userEvent.click(screen.getByTestId('opener'));
    await screen.findByTestId('scene');

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByTestId('scene')).not.toBeInTheDocument());
  });
});
