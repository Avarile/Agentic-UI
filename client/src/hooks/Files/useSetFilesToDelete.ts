// Records temp files pending deletion in localStorage, so uploads abandoned by a
// closed tab are swept on next boot (see components/Chat/Presentation.tsx).

import { LocalStorageKeys } from 'librechat-data-provider';

export default function useSetFilesToDelete() {
  const setFilesToDelete = (files: Record<string, unknown>) =>
    localStorage.setItem(LocalStorageKeys.FILES_TO_DELETE, JSON.stringify(files));
  return setFilesToDelete;
}
