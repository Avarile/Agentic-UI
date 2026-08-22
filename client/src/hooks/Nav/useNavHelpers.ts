// `useCustomLink` — a click handler that navigates like a real link.
//
// Router navigation applied naively breaks the browser conventions users rely on:
// middle-click and ctrl/cmd-click should open a new tab, not navigate in place. So
// `preventDefault` is applied only for an unmodified primary click, and everything
// else falls through to the browser.
//
// It also stashes the current location as `prevLocation` in router state, which is
// what lets a destination offer a meaningful "back" instead of guessing.

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';

export function useCustomLink<T = HTMLAnchorElement>(
  route: string,
  callback?: (event: React.MouseEvent<T>) => void,
) {
  const navigate = useNavigate();
  const location = useLocation();
  const clickHandler = useCallback(
    (event: React.MouseEvent<T>) => {
      if (callback) {
        callback(event);
      }
      if (event.button === 0 && !(event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        navigate(route, { state: { prevLocation: location } });
      }
    },
    [navigate, route, callback, location],
  );
  return clickHandler;
}

export const usePreviousLocation = () => {
  const location = useLocation();
  const previousLocationRef: React.MutableRefObject<Location<unknown> | undefined> = useRef();

  useEffect(() => {
    previousLocationRef.current = location.state?.prevLocation;
  }, [location]);

  return previousLocationRef;
};
