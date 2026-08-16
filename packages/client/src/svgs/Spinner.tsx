/**
 * The application spinner is the Cybernetics loading mark.
 *
 * This module is kept as the compatibility name: `Spinner` is imported at ~120
 * call sites, and `CustomizedSpinner` is prop-compatible with the geometry-only
 * spinner it replaced, so the swap needs no changes at those sites.
 *
 * Note that almost every call site sizes the spinner with utility classes
 * (`size-4`, `h-8 w-8`) rather than the `size` prop, and the tier heuristic can
 * only read the prop. Those sites therefore resolve from the 20px default and
 * render the inline ring, which is the correct mark at their rendered scale.
 * Pass `size` or `variant` explicitly to reach the mark or GIF tiers.
 */
export { default } from './CustomizedSpinner';
