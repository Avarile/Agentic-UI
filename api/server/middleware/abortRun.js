/**
 * Abort handler specific to the OpenAI Assistants API (thread/run model).
 *
 * Design: an Assistants run lives on OpenAI's side, so aborting is not just closing our
 * stream — the run must be cancelled upstream and our local thread state reconciled. The
 * `abortKey` is `"<conversationId>:<latestMessageId>"`, and the run id is looked up from the
 * `ABORT_KEYS` cache; a cache miss returns 204 (nothing to abort) rather than an error,
 * because a completed or already-cancelled run is not a client fault.
 *
 * `conversationId` is validated as a UUID before use — it comes from a client-supplied
 * `abortKey`. The conversation's stored model is copied onto `req.body` because
 * `initializeClient` needs it to pick the right credentials, and the abort request itself does
 * not carry one (an Express 5 `req.body` existence guard is required here).
 *
 * `checkMessageGaps` then repairs the message chain, since a cancelled run can leave the
 * thread with messages we never received.
 *
 * Connections:
 * - called from `server/middleware/abortMiddleware.js`
 * - client via `server/services/Endpoints/assistants`; thread repair/usage via
 *   `server/services/Threads`
 */
const { sendEvent } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys, RunStatus, isUUID } = require('librechat-data-provider');
const { initializeClient } = require('~/server/services/Endpoints/assistants');
const { checkMessageGaps, recordUsage } = require('~/server/services/Threads');
const { deleteMessages, getConvo } = require('~/models');
const getLogStores = require('~/cache/getLogStores');

const three_minutes = 1000 * 60 * 3;

async function abortRun(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const { abortKey, endpoint } = req.body;
  const [conversationId, latestMessageId] = abortKey.split(':');
  const conversation = await getConvo(req.user.id, conversationId);

  if (conversation?.model) {
    req.body = req.body || {}; // Express 5: ensure req.body exists
    req.body.model = conversation.model;
  }

  if (!isUUID.safeParse(conversationId).success) {
    logger.error('[abortRun] Invalid conversationId', { conversationId });
    return res.status(400).send({ message: 'Invalid conversationId' });
  }

  const cacheKey = `${req.user.id}:${conversationId}`;
  const cache = getLogStores(CacheKeys.ABORT_KEYS);
  const runValues = await cache.get(cacheKey);
  if (!runValues) {
    logger.warn('[abortRun] Run not found in cache', { cacheKey });
    return res.status(204).send({ message: 'Run not found' });
  }
  const [thread_id, run_id] = runValues.split(':');

  if (!run_id) {
    logger.warn("[abortRun] Couldn't find run for cancel request", { thread_id });
    return res.status(204).send({ message: 'Run not found' });
  } else if (run_id === 'cancelled') {
    logger.warn('[abortRun] Run already cancelled', { thread_id });
    return res.status(204).send({ message: 'Run already cancelled' });
  }

  let runMessages = [];
  /** @type {{ openai: OpenAI }} */
  const { openai } = await initializeClient({ req, res });

  try {
    await cache.set(cacheKey, 'cancelled', three_minutes);
    const cancelledRun = await openai.beta.threads.runs.cancel(run_id, { thread_id });
    logger.debug('[abortRun] Cancelled run:', cancelledRun);
  } catch (error) {
    logger.error('[abortRun] Error cancelling run', error);
    if (
      error?.message?.includes(RunStatus.CANCELLED) ||
      error?.message?.includes(RunStatus.CANCELLING)
    ) {
      return res.end();
    }
  }

  try {
    const run = await openai.beta.threads.runs.retrieve(run_id, { thread_id });
    await recordUsage({
      ...run.usage,
      model: run.model,
      user: req.user.id,
      conversationId,
    });
  } catch (error) {
    logger.error('[abortRun] Error fetching or processing run', error);
  }

  /* TODO: a reconciling strategy between the existing intermediate message would be more optimal than deleting it */
  await deleteMessages({
    user: req.user.id,
    unfinished: true,
    conversationId,
  });
  runMessages = await checkMessageGaps({
    openai,
    run_id,
    endpoint,
    thread_id,
    conversationId,
    latestMessageId,
  });

  const finalEvent = {
    final: true,
    conversation,
    runMessages,
  };

  if (res.headersSent && finalEvent) {
    return sendEvent(res, finalEvent);
  }

  res.json(finalEvent);
}

module.exports = {
  abortRun,
};
