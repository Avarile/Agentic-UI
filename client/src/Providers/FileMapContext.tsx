// Uploaded files as `file_id -> file`, built once in Root.
//
// Messages arrive from the server carrying file *references*; rendering an
// attachment needs the full record (source, dimensions, preview URL). Sharing one
// map avoids a per-attachment lookup query and lets `buildTree` hydrate
// attachments in the same pass that builds the message tree.

import { createContext, useContext } from 'react';
import { useFileMap } from '~/hooks/Files';
type FileMapContextType = ReturnType<typeof useFileMap>;

export const FileMapContext = createContext<FileMapContextType>({} as FileMapContextType);
export const useFileMapContext = () => useContext(FileMapContext);
