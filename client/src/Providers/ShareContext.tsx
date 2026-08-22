// A two-field flag: "we are rendering a shared, read-only conversation".
//
// Message components use it to suppress anything that implies interaction —
// editing, regenerating, forking, feedback. A context rather than a prop because
// the components that must react to it are many levels below the share route.

import { createContext, useContext } from 'react';
type TShareContext = { isSharedConvo?: boolean; shareId?: string };

export const ShareContext = createContext<TShareContext>({} as TShareContext);
export const useShareContext = () => useContext(ShareContext);
