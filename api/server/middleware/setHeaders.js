/**
 * Opens an SSE stream: writes the `text/event-stream` headers for a chat response.
 *
 * Design: `X-Accel-Buffering: no` and `Cache-Control: no-transform` are the important ones —
 * without them nginx (and most CDNs/proxies) buffer or transform the response and the client
 * receives the entire generation at once instead of token by token. `Connection: keep-alive`
 * holds the socket open for the duration of the run.
 *
 * Because this writes the head immediately, every failure *after* this middleware must be
 * reported through the event stream (see `server/middleware/error.js`), not as an HTTP status.
 *
 * Connections: mounted on the chat routes in `server/routes/agents/*` and `assistants/*`
 */
function setHeaders(req, res, next) {
  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });
  next();
}

module.exports = setHeaders;
