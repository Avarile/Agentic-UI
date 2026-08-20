import React from 'react';
import { render } from '@testing-library/react';
import { ThemeContext } from '@librechat/client';
import OrbitMark from '../OrbitMark';

/** `AppearanceMode` is not re-exported from the package, so take it from the
 * real context rather than restating the union. */
type ThemeValue = React.ContextType<typeof ThemeContext>;

/** Narrows the shared matchMedia mock to a set of queries that should match. */
function matchQueries(...active: string[]) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: active.includes(query),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

function renderWithTheme(theme: ThemeValue['theme']) {
  return render(
    <ThemeContext.Provider
      value={{
        theme,
        setTheme: () => undefined,
        setThemeRGB: () => undefined,
        setThemeDefinition: () => undefined,
        setThemeName: () => undefined,
        resetTheme: () => undefined,
      }}
    >
      <OrbitMark />
    </ThemeContext.Provider>,
  );
}

const src = (container: HTMLElement) => container.querySelector('img')?.getAttribute('src');

describe('OrbitMark', () => {
  beforeEach(() => matchQueries());

  it('renders a single image so the unused cut is never fetched', () => {
    const { container } = renderWithTheme('dark');
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('picks the light cut for the light theme', () => {
    expect(src(renderWithTheme('light').container)).toBe(
      '/assets/animation/agentic-icon-orbit-core-light-80.webp',
    );
  });

  it('picks the dark cut for the dark theme', () => {
    expect(src(renderWithTheme('dark').container)).toBe(
      '/assets/animation/agentic-icon-orbit-core-dark-80.webp',
    );
  });

  it('resolves the system theme from prefers-color-scheme', () => {
    matchQueries('(prefers-color-scheme: dark)');
    expect(src(renderWithTheme('system').container)).toContain('-dark-');

    matchQueries();
    expect(src(renderWithTheme('system').container)).toContain('-light-');
  });

  it('ignores prefers-color-scheme when a theme is chosen explicitly', () => {
    matchQueries('(prefers-color-scheme: dark)');
    expect(src(renderWithTheme('light').container)).toContain('-light-');
  });

  it('swaps to the still poster under reduced motion', () => {
    matchQueries('(prefers-reduced-motion: reduce)');
    expect(src(renderWithTheme('dark').container)).toBe(
      '/assets/animation/agentic-icon-orbit-core-dark-80-static.webp',
    );
  });

  it('stays decorative', () => {
    const image = renderWithTheme('dark').container.querySelector('img');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('aria-hidden', 'true');
    expect(image).toHaveAttribute('width', '40');
  });

  it('honours an explicit size', () => {
    const { container } = render(<OrbitMark size={64} />);
    expect(container.querySelector('img')).toHaveAttribute('width', '64');
  });
});
