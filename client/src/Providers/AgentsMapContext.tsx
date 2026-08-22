// The agent catalogue as `id -> agent`, built once in Root and read everywhere a
// conversation has to resolve `agent_id` into a name, icon, model, or capability.
//
// One shared map rather than a query per consumer: the composer, the message
// header, the landing page and ChatRoute's initialization gate all need it on
// first paint. See the note below on why the default is `undefined` — several
// call sites depend on being able to tell "not loaded" from "loaded and empty".

import { createContext, useContext } from 'react';
import useAgentsMap from '~/hooks/Agents/useAgentsMap';
type AgentsMapContextType = ReturnType<typeof useAgentsMap>;

/** Defaults to undefined (map unknown): an `{}` default outside the provider would
 * read as a loaded-but-empty catalog and misclassify stored agent picks as deleted. */
export const AgentsMapContext = createContext<AgentsMapContextType>(undefined);
export const useAgentsMapContext = () => useContext(AgentsMapContext);
