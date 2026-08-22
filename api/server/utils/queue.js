/**
 * Leaky-bucket queue that paces outbound API calls to ~60 requests/second.
 *
 * `LB_QueueAsyncCall(asyncFunc, args, callback)` enqueues a call; a single interval timer
 * drains one item per tick.
 *
 * Design: a shared process-wide bucket rather than a per-caller limiter, because the thing
 * being protected is a *provider's* rate limit, which every request in the process shares.
 * The interval is started lazily and cleared when the queue empties, so an idle process holds
 * no timer.
 *
 * Connections:
 * - used by `server/services/Files/process.js` (bulk-delete pacing) and other
 *   provider-facing batch paths; exported through `server/utils/index.js`
 */
/**
 * A leaky bucket queue structure to manage API requests.
 * @type {{queue: Array, interval: NodeJS.Timer | null}}
 */
const _LB = {
  queue: [],
  interval: null,
};

/**
 * Interval in milliseconds to control the rate of API requests.
 * Adjust the interval according to your rate limit needs.
 */
const _LB_INTERVAL_MS = Math.ceil(1000 / 60); // 60 req/s

/**
 * Executes the next function in the leaky bucket queue.
 * This function is called at regular intervals defined by _LB_INTERVAL_MS.
 */
const _LB_EXEC_NEXT = async () => {
  if (_LB.queue.length === 0) {
    clearInterval(_LB.interval);
    _LB.interval = null;
    return;
  }

  const next = _LB.queue.shift();
  if (!next) {
    return;
  }

  const { asyncFunc, args, callback } = next;

  try {
    const data = await asyncFunc(...args);
    callback(null, data);
  } catch (e) {
    callback(e);
  }
};

/**
 * Adds an async function call to the leaky bucket queue.
 * @param {Function} asyncFunc - The async function to be executed.
 * @param {Array} args - Arguments to pass to the async function.
 * @param {Function} callback - Callback function for handling the result or error.
 */
function LB_QueueAsyncCall(asyncFunc, args, callback) {
  _LB.queue.push({ asyncFunc, args, callback });

  if (_LB.interval === null) {
    _LB.interval = setInterval(_LB_EXEC_NEXT, _LB_INTERVAL_MS);
  }
}

module.exports = {
  LB_QueueAsyncCall,
};
