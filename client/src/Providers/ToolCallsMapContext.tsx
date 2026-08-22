// Persisted tool calls for one conversation, keyed for lookup by message part.
//
// Scoped per `conversationId` (the provider is mounted by ChatRoute with the
// current id) so navigating away drops the whole map rather than accumulating
// every conversation's tool calls for the session.

import { createContext, useContext } from 'react';
import useToolCallsMap from '~/hooks/Plugins/useToolCallsMap';
type ToolCallsMapContextType = ReturnType<typeof useToolCallsMap>;

export const ToolCallsMapContext = createContext<ToolCallsMapContextType>(
  {} as ToolCallsMapContextType,
);
export const useToolCallsMapContext = () => useContext(ToolCallsMapContext);

interface ToolCallsMapProviderProps {
  children: React.ReactNode;
  conversationId: string;
}

export function ToolCallsMapProvider({ children, conversationId }: ToolCallsMapProviderProps) {
  const toolCallsMap = useToolCallsMap({ conversationId });

  return (
    <ToolCallsMapContext.Provider value={toolCallsMap}>{children}</ToolCallsMapContext.Provider>
  );
}
