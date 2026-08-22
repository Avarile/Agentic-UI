// Development-only: logs which of the values you pass it changed since the last
// render.
//
// The practical tool for finding the identity change behind an unexpected
// re-render in the message tree. Off unless `window.__LC_RENDER_DEBUG__ = true` is
// set in the console, and compiled out of production builds.

import { useEffect, useRef } from 'react';

type DebugWindow = Window & {
  __LC_RENDER_DEBUG__?: boolean;
};

/**
 * Development-only hook that logs which tracked values changed between renders.
 *
 * Enable by setting `window.__LC_RENDER_DEBUG__ = true` in the browser console.
 * Automatically no-ops in production builds.
 *
 * @example
 * ```ts
 * useRenderChangeLog('MessageRender', { messageId, isLast, depth });
 * ```
 */
export default function useRenderChangeLog(
  name: string,
  values: Record<string, string | number | boolean | null | undefined>,
) {
  const previousValuesRef = useRef<Record<
    string,
    string | number | boolean | null | undefined
  > | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    if (typeof window === 'undefined' || !(window as DebugWindow).__LC_RENDER_DEBUG__) {
      previousValuesRef.current = values;
      return;
    }

    if (previousValuesRef.current == null) {
      console.log(`[render-debug] ${name}: initial render`, values);
      previousValuesRef.current = values;
      return;
    }

    const previousValues = previousValuesRef.current;
    const changedEntries = Object.entries(values).filter(
      ([key, value]) => !Object.is(previousValues[key], value),
    );

    if (changedEntries.length > 0) {
      console.log(
        `[render-debug] ${name}`,
        Object.fromEntries(
          changedEntries.map(([key, value]) => [
            key,
            {
              previous: previousValues[key],
              next: value,
            },
          ]),
        ),
      );
    } else {
      console.log(`[render-debug] ${name}: parent-driven render`);
    }

    previousValuesRef.current = values;
  });
}
