/**
 * Chat-request validation, built from the shared factory in `packages/api`.
 *
 * Design: this file only injects the app's runtime dependencies — `getConvo`, the
 * `GenerationJobManager` job lookup, `isPendingActionStale` and the logger — into
 * `createMessageRequestMiddleware`. The validation *rules* (conversation ownership, whether a
 * generation is already running for this conversation, whether a pending HITL action has gone
 * stale) live in TypeScript in `packages/api`, per the workspace boundary that new backend
 * logic belongs there and `/api` stays a thin wrapper.
 *
 * The job lookup is what prevents two concurrent generations on one conversation, and the
 * staleness check is what lets a crashed HITL checkpoint be superseded instead of wedging the
 * conversation forever.
 *
 * Connections:
 * - re-exported as `validateMessageReq`; `prepareMessageRequestValidation` and
 *   `sendValidationResponse` are used by the agent chat routes
 */
const {
  GenerationJobManager,
  createMessageRequestMiddleware,
  isPendingActionStale,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { getConvo } = require('~/models');

module.exports = createMessageRequestMiddleware({
  getConvo,
  getJob: (conversationId) => GenerationJobManager.getJob(conversationId),
  isPendingActionStale,
  logger,
});
