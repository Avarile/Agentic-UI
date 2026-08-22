// Assigns each artifact in a message its document-order index.
//
// A ref-based counter, not state, because assignment happens during render and
// must not trigger one. `baseIndex` exists because a long message is rendered as
// independently memoized blocks: each block gets its own provider seeded with the
// count of artifacts in earlier blocks, so indices stay stable in document order
// without a single shared counter that memoization would defeat.

import { createContext, useContext, ReactNode, useCallback, useRef } from 'react';

type TArtifactContext = {
  getNextIndex: (skip: boolean) => number;
  resetCounter: () => void;
};

export const ArtifactContext = createContext<TArtifactContext>({} as TArtifactContext);
export const useArtifactContext = () => useContext(ArtifactContext);

export function ArtifactProvider({
  children,
  baseIndex = 0,
}: {
  children: ReactNode;
  /**
   * Offset added to every assigned index, so per-block memoized rendering can
   * seed each block's provider with the count of artifacts in earlier blocks
   * and keep document-order indices stable.
   */
  baseIndex?: number;
}) {
  const counterRef = useRef(0);

  const getNextIndex = useCallback(
    (skip: boolean) => {
      if (skip) {
        return baseIndex + counterRef.current;
      }
      const nextIndex = counterRef.current;
      counterRef.current += 1;
      return baseIndex + nextIndex;
    },
    [baseIndex],
  );

  const resetCounter = useCallback(() => {
    counterRef.current = 0;
  }, []);

  return (
    <ArtifactContext.Provider value={{ getNextIndex, resetCounter }}>
      {children}
    </ArtifactContext.Provider>
  );
}
