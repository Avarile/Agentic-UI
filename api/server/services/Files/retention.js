/**
 * Computes file expiry dates from retention policy and conversation type.
 *
 * Binds the retention resolvers in `packages/api` to this app's `getConvo` and
 * `createTempChatExpirationDate`.
 *
 * Design: expiry depends on the conversation — a temp chat's files must expire with the chat,
 * which is why the conversation is read (`getConvoRetention ?? getConvo`, preferring the
 * projection-limited variant when available). `getAgentFileRetentionExpiry` accepts both
 * `tool_resource` and `toolResource` spellings because both appear at existing call sites;
 * normalizing here avoids silently computing no expiry for the mismatched one.
 *
 * Connections: `server/services/Files/process.js`, `controllers/tools.js`
 */
const {
  getRetentionExpiry: getRetentionExpiryWithDeps,
  getAgentFileRetentionExpiry: getAgentFileRetentionExpiryWithDeps,
} = require('@librechat/api');
const { logger, createTempChatExpirationDate } = require('@librechat/data-schemas');
const db = require('~/models');

const getRetentionDependencies = () => ({
  getConvo: db.getConvoRetention ?? db.getConvo,
  createExpirationDate: createTempChatExpirationDate,
  logger,
});

/**
 * Returns `{ expiredAt }` when the request indicates data retention applies, otherwise `{}`.
 * Spread into file data objects before calling createFile.
 * @param {ServerRequest} req
 * @returns {Promise<{ expiredAt?: Date | null }>}
 */
async function getRetentionExpiry(req) {
  return getRetentionExpiryWithDeps(req, getRetentionDependencies());
}

/**
 * Returns `{ expiredAt }` for agent file uploads when retention applies, otherwise `{}`.
 * @param {object} params
 * @param {ServerRequest} params.req
 * @param {boolean} [params.messageAttachment]
 * @param {string} [params.tool_resource]
 * @param {string} [params.toolResource]
 * @returns {Promise<{ expiredAt?: Date | null }>}
 */
async function getAgentFileRetentionExpiry({ tool_resource, toolResource, ...params }) {
  return getAgentFileRetentionExpiryWithDeps(
    { ...params, toolResource: tool_resource ?? toolResource },
    getRetentionDependencies(),
  );
}

module.exports = {
  getRetentionExpiry,
  getAgentFileRetentionExpiry,
};
