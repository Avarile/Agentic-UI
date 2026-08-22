/**
 * Barrel exposing the small, stable slice of the Files subsystem other layers should use.
 *
 * Deliberately narrow: upload entry points, image buffer upload, and the agent-based access
 * helpers. Storage-backend modules (`Local/`, `Azure/`, `Firebase/`, `OpenAI/`, `VectorDB/`,
 * `Code/`) are *not* re-exported — callers must go through `strategies.js`, which is what keeps
 * the storage backend swappable by configuration rather than by import path.
 */
const { processCodeFile } = require('./Code/process');
const { processFileUpload } = require('./process');
const { uploadImageBuffer } = require('./images');
const { hasAccessToFilesViaAgent, filterFilesByAgentAccess } = require('./permissions');

module.exports = {
  processCodeFile,
  processFileUpload,
  uploadImageBuffer,
  hasAccessToFilesViaAgent,
  filterFilesByAgentAccess,
};
