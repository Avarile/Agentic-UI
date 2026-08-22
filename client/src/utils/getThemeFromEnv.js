// Builds a theme from `REACT_APP_THEME_*` build-time environment variables.
//
// Derived from the canonical token registry in `@librechat/client` rather than a
// local list, so adding a token upstream makes its env var work without a change
// here.
//
// Returning `undefined` when nothing is set is the load-bearing behaviour: App.jsx
// spreads `initialTheme`/`themeRGB` only when a theme exists, which is what lets a
// user's stored preference stand on a deployment that configures no theme.

import { themeColorTokens } from '@librechat/client';

const toEnvName = (token) => `REACT_APP_THEME_${token.slice(4).toUpperCase().replace(/-/g, '_')}`;

/**
 * Loads the canonical color-token registry from build-time environment variables.
 * Values are inlined by Vite and continue to use the existing REACT_APP_THEME_* names.
 * @param {Record<string, string | undefined>} [env] Environment source, defaults to the build-time env
 * @returns {import('@librechat/client').IThemeRGB | undefined}
 */
export function getThemeFromEnv(env = import.meta.env) {
  const theme = themeColorTokens.reduce((colors, token) => {
    const value = env[toEnvName(token)];
    if (value) {
      colors[token] = value;
    }
    return colors;
  }, {});

  return Object.keys(theme).length > 0 ? theme : undefined;
}
