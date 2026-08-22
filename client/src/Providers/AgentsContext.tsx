// react-hook-form provider for the agent builder form.
//
// A thin wrapper whose job is to own `defaultValues` in one place —
// `getDefaultAgentFormValues()` — so the many panels that make up the builder
// (SidePanel/Agents/*) all register against the same schema.

import { useForm, FormProvider } from 'react-hook-form';
import { createContext, useContext } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { AgentForm } from '~/common';
import { getDefaultAgentFormValues } from '~/utils';

type AgentsContextType = UseFormReturn<AgentForm>;

export const AgentsContext = createContext<AgentsContextType>({} as AgentsContextType);

export function useAgentsContext() {
  const context = useContext(AgentsContext);

  if (context === undefined) {
    throw new Error('useAgentsContext must be used within an AgentsProvider');
  }

  return context;
}

export default function AgentsProvider({ children }) {
  const methods = useForm<AgentForm>({
    defaultValues: getDefaultAgentFormValues(),
  });

  return <FormProvider {...methods}>{children}</FormProvider>;
}
