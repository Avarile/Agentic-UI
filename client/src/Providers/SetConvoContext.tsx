// A single mutable ref: "has this pane already initialized its conversation?"
//
// A ref rather than state, because flipping it must not re-render, and a context
// rather than a module variable so it is scoped to the provider (mounted in Root)
// and reset with it.
//
// Exists because ChatRoute's initialization effect can re-run for reasons that
// have nothing to do with the conversation. Reading and writing the flag through
// context lets store/families.ts consult the same latch when it navigates.

import { createContext, useContext, useRef } from 'react';
import type { MutableRefObject } from 'react';

type SetConvoContext = MutableRefObject<boolean>;

export const SetConvoContext = createContext<SetConvoContext>({} as SetConvoContext);

export const SetConvoProvider = ({ children }: { children: React.ReactNode }) => {
  const hasSetConversation = useRef<boolean>(false);

  return <SetConvoContext.Provider value={hasSetConversation}>{children}</SetConvoContext.Provider>;
};

export const useSetConvoContext = () => useContext(SetConvoContext);
