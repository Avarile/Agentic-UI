// The OpenAI/Azure assistants catalogue as `endpoint -> id -> assistant`.
//
// The counterpart to AgentsMapContext for the older assistants endpoints. Built
// once in Root and read wherever a conversation needs to resolve
// `assistant_id` into a name, icon, or model.

import { createContext, useContext } from 'react';
import { useAssistantsMap } from '~/hooks/Assistants';
type AssistantsMapContextType = ReturnType<typeof useAssistantsMap>;

export const AssistantsMapContext = createContext<AssistantsMapContextType>(
  {} as AssistantsMapContextType,
);
export const useAssistantsMapContext = () => useContext(AssistantsMapContext);
