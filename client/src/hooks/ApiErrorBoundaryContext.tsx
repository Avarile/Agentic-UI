// The 401 sink.
//
// Provided in main.jsx — above App, and therefore above the QueryClient whose
// `QueryCache.onError` writes to it. That ordering is the whole reason this is a
// separate context: the thing that *reports* auth failure is created inside App,
// so the thing that *records* it has to exist outside.
//
// Read by `ApiErrorWatcher` (components/Auth), which reacts by sending the user to
// login. The hook throws when unprovided, since a silently swallowed session
// expiry looks like a frozen app.

import React, { useState } from 'react';
import { TError } from 'librechat-data-provider';

type ProviderValue = {
  error?: TError;
  setError: React.Dispatch<React.SetStateAction<boolean>>;
};
const ApiErrorBoundaryContext = React.createContext<ProviderValue | undefined>(undefined);

export const ApiErrorBoundaryProvider = ({
  value,
  children,
}: {
  value: ProviderValue;
  children: React.ReactNode;
}) => {
  const [error, setError] = useState(false);
  return (
    <ApiErrorBoundaryContext.Provider value={value ?? { error, setError }}>
      {children}
    </ApiErrorBoundaryContext.Provider>
  );
};

export const useApiErrorBoundary = () => {
  const context = React.useContext(ApiErrorBoundaryContext);

  if (context === undefined) {
    throw new Error('useApiErrorBoundary must be used inside ApiErrorBoundaryProvider');
  }

  return context;
};
