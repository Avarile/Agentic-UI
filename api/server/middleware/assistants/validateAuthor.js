/**
 * Enforces `privateAssistants`: a user may only act on assistants they authored.
 *
 * Design: not middleware — a helper called from the assistants controllers, because the
 * assistant id can arrive from `req.params`, `req.body` or `req.query` depending on the
 * operation, and the caller knows which (plus may need to pass overrides).
 *
 * Authorship is read from the assistant's OpenAI `metadata.author` field. That is the only
 * place it can live: assistants are stored upstream, not in our database, so the check
 * requires a `beta.assistants.retrieve` round trip and *throws* on mismatch for the caller to
 * map to a response.
 *
 * Connections:
 * - called by `server/controllers/assistants/*`; capability check via
 *   `server/middleware/roles/capabilities.js`
 */
const { logger, SystemCapabilities } = require('@librechat/data-schemas');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { getAssistant } = require('~/models');

/**
 * Checks if the assistant is supported or excluded
 * @param {object} params
 * @param {object} params.req - Express Request
 * @param {object} params.req.body - The request payload.
 * @param {string} params.overrideEndpoint - The override endpoint
 * @param {string} params.overrideAssistantId - The override assistant ID
 * @param {OpenAIClient} params.openai - OpenAI API Client
 * @returns {Promise<void>}
 */
const validateAuthor = async ({ req, openai, overrideEndpoint, overrideAssistantId }) => {
  const endpoint = overrideEndpoint ?? req.body.endpoint ?? req.query.endpoint;
  const assistant_id =
    overrideAssistantId ?? req.params.id ?? req.body.assistant_id ?? req.query.assistant_id;

  const appConfig = req.config;
  /** @type {Partial<TAssistantEndpoint>} */
  const assistantsConfig = appConfig.endpoints?.[endpoint];
  if (!assistantsConfig) {
    return;
  }

  if (!assistantsConfig.privateAssistants) {
    return;
  }

  let canManageAssistants = false;
  try {
    canManageAssistants = await hasCapability(req.user, SystemCapabilities.MANAGE_ASSISTANTS);
  } catch (err) {
    logger.warn(`[validateAuthor] capability check failed, denying bypass: ${err.message}`);
  }

  if (canManageAssistants) {
    logger.debug(`[validateAuthor] MANAGE_ASSISTANTS bypass for user ${req.user.id}`);
    return;
  }

  const assistantDoc = await getAssistant({ assistant_id, user: req.user.id });
  if (assistantDoc) {
    return;
  }
  const assistant = await openai.beta.assistants.retrieve(assistant_id);
  if (req.user.id !== assistant?.metadata?.author) {
    throw new Error(`Assistant ${assistant_id} is not authored by the user.`);
  }
};

module.exports = validateAuthor;
