import { useTheme, isDark, useMediaQuery } from '@librechat/client';
import { cn } from '~/utils';

interface OrbitMarkProps {
  /** Rendered edge length in px. */
  size?: number;
  className?: string;
}

const ASSET_BASE = '/assets/animation/agentic-icon-orbit-core';

/** The animation is authored at 80px so it stays crisp at 40px on 2x displays. */
const ASSET_SIZE = 80;

/**
 * Animated brand mark. Resolves to a single `<img>` rather than a light/dark
 * pair swapped by `dark:hidden`, because a hidden `<img>` is still fetched —
 * the pair cost both files on every render.
 *
 * The theme is read from context instead of a `<picture media="(prefers-color-scheme: dark)">`
 * query: the app's theme is a `.dark` class the user can override, so a media
 * query picks the wrong cut whenever the chosen theme differs from the OS.
 */
export default function OrbitMark({ size = 40, className }: OrbitMarkProps) {
  const { theme } = useTheme();
  /** `isDark` resolves 'system' imperatively, so it cannot react to the OS
   * flipping while the context value stays 'system'. */
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const dark = theme === 'system' ? systemPrefersDark : isDark(theme);
  const cut = dark ? 'dark' : 'light';
  const frames = prefersReducedMotion ? '-static' : '';

  return (
    <img
      src={`${ASSET_BASE}-${cut}-${ASSET_SIZE}${frames}.webp`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      decoding="async"
      className={cn('shrink-0', className)}
    />
  );
}
