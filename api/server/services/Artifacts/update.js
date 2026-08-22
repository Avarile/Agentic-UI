/**
 * Re-export of the artifact parsing/replacement helpers from `packages/api`.
 *
 * Keeps `ARTIFACT_START`/`ARTIFACT_END`, `findAllArtifacts` and `replaceArtifactContent`
 * reachable from a stable local path while the implementation stays in TypeScript, per the
 * workspace boundary.
 *
 * Connections: `server/routes/messages.js` (artifact edit endpoint)
 */
const {
  ARTIFACT_START,
  ARTIFACT_END,
  findAllArtifacts,
  replaceArtifactContent,
} = require('@librechat/api');

module.exports = {
  ARTIFACT_START,
  ARTIFACT_END,
  findAllArtifacts,
  replaceArtifactContent,
};
