const { TextEncoder, TextDecoder } = require('node:util');

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
}

/** jsdom lacks fetch primitives; react-router builds a Request per navigation and reads its fields */
if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = class Request {
    constructor(url, init) {
      this.url = String(url);
      this.method = init?.method ?? 'GET';
      this.headers = init?.headers ?? {};
      this.signal = init?.signal;
    }
  };
}

/** jsdom does not expose structuredClone; the app uses it to deep-copy plain
 *  data (prompt group caches, System Core module drafts). v8's serializer gives
 *  the same semantics for the JSON-safe values those call sites pass. */
if (typeof globalThis.structuredClone === 'undefined') {
  const v8 = require('node:v8');
  globalThis.structuredClone = (value) => v8.deserialize(v8.serialize(value));
}
