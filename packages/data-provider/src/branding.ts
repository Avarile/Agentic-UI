/**
 * Brand identity fallbacks shared by client and backend. A deployment's
 * `APP_TITLE` env var always takes precedence; these are the values baked into
 * the build for when it is unset.
 */

/** Short brand name, for places where a compact label reads better than the full title. */
export const BRAND_NAME = 'Cybernetics';

/** Full product title: browser tab, PWA manifest, transactional email sender. */
export const DEFAULT_APP_TITLE = 'Cybernetics - Agentic Centre';
