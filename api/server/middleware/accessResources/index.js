/**
 * Barrel for the resource-level ACL middleware factories.
 *
 * Each export is a factory that takes a required permission bit and returns Express
 * middleware. All of them wrap `canAccessResource` with a resource type and an id resolver —
 * see `canAccessResource.js` for the shared mechanics.
 */
const { canAccessResource } = require('./canAccessResource');
const { canAccessAgentResource } = require('./canAccessAgentResource');
const { canAccessAgentFromBody } = require('./canAccessAgentFromBody');
const { canAccessPromptViaGroup } = require('./canAccessPromptViaGroup');
const { canAccessPromptGroupResource } = require('./canAccessPromptGroupResource');
const { canAccessMCPServerResource } = require('./canAccessMCPServerResource');
const { canAccessSkillResource } = require('./canAccessSkillResource');

module.exports = {
  canAccessResource,
  canAccessAgentResource,
  canAccessAgentFromBody,
  canAccessPromptViaGroup,
  canAccessPromptGroupResource,
  canAccessMCPServerResource,
  canAccessSkillResource,
};
