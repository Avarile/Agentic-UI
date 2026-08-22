// `clsx` + `tailwind-merge`: conditional classes with later Tailwind utilities
// winning over earlier conflicting ones. Use it anywhere classes are composed, or
// variant overrides silently lose to base classes.

import { twMerge } from 'tailwind-merge';
import { type ClassValue, clsx } from 'clsx';

/**
 * Merges the tailwind clases (using twMerge). Conditionally removes false values
 * @param inputs The tailwind classes to merge
 * @returns className string to apply to an element or HOC
 */
export default function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
