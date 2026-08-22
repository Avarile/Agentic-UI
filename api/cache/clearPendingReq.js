/**
 * Releases a user's slot in the concurrent-request counter used by `LIMIT_CONCURRENT_MESSAGES`.
 *
 * Decrements the `PENDING_REQ` counter, or deletes the key outright when it reaches the floor
 * so stale keys do not accumulate.
 *
 * Design: this is the cleanup half of a counter incremented by the concurrent-message
 * limiter. It must be safe to call on every terminal path — success, error, and abort — so it
 * returns early (rather than throwing) when the feature is off, the user is unknown, or the
 * store is missing. The Redis key is prefixed with the namespace manually because the shared
 * Keyv instance is not namespaced in that mode.
 *
 * Connections:
 * - counterpart of `server/middleware/limiters/messageLimiters.js`
 * - called from `server/middleware/abortMiddleware.js` and the agent chat controllers
 */
const { isEnabled } = require('@librechat/api');
const { Time, CacheKeys } = require('librechat-data-provider');
const getLogStores = require('./getLogStores');

const { USE_REDIS, LIMIT_CONCURRENT_MESSAGES } = process.env ?? {};

/**
 * Clear or decrement pending requests from the cache.
 * Checks the environmental variable LIMIT_CONCURRENT_MESSAGES;
 * if the rule is enabled ('true'), it either decrements the count of pending requests
 * or deletes the key if the count is less than or equal to 1.
 *
 * @module clearPendingReq
 * @requires ./getLogStores
 * @requires ../server/utils
 * @requires process
 *
 * @async
 * @function
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The user ID for which the pending requests are to be cleared or decremented.
 * @param {Object} [params.cache] - An optional cache object to use. If not provided, a default cache will be fetched using getLogStores.
 * @returns {Promise<void>} A promise that either decrements the 'pendingRequests' count, deletes the key from the store, or resolves with no value.
 */
const clearPendingReq = async ({ userId, cache: _cache }) => {
  if (!userId) {
    return;
  } else if (!isEnabled(LIMIT_CONCURRENT_MESSAGES)) {
    return;
  }

  const namespace = CacheKeys.PENDING_REQ;
  const cache = _cache ?? getLogStores(namespace);

  if (!cache) {
    return;
  }

  const key = `${isEnabled(USE_REDIS) ? namespace : ''}:${userId ?? ''}`;
  const currentReq = +((await cache.get(key)) ?? 0);

  if (currentReq && currentReq >= 1) {
    await cache.set(key, currentReq - 1, Time.ONE_MINUTE);
  } else {
    await cache.delete(key);
  }
};

module.exports = clearPendingReq;
