/**
 * Establishes and memoizes the Mongoose connection.
 *
 * Caches the connection on `global.mongoose` so hot reloads (nodemon) and repeated requires
 * reuse one pool instead of opening a new one each time — without this, connections grow
 * exponentially in development. A cached-but-disconnected handle is detected via
 * `_readyState` and reconnected.
 *
 * Design: every pool tuning knob (`maxPoolSize`, `minPoolSize`, `maxConnecting`,
 * `maxIdleTimeMS`, `waitQueueTimeoutMS`, `autoIndex`, `autoCreate`) is read from an env var
 * and only spread into the options object when actually set, so unset vars fall through to
 * driver defaults rather than being pinned to a hardcoded value. `strictQuery` is enabled and
 * `bufferCommands` disabled so queries fail fast instead of silently queueing before connect.
 * Query metrics instrumentation is attached at import time, before any model is used.
 *
 * Connections:
 * - called by `server/index.js` and `server/experimental.js` via `db/index.js`
 * - metrics instrumentation from `packages/api` feeds the `/metrics` endpoint
 */
require('dotenv').config();
const { isEnabled, instrumentMongooseQueryMetrics } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI;

instrumentMongooseQueryMetrics(mongoose);

if (!MONGO_URI) {
  throw new Error('Please define the MONGO_URI environment variable');
}
/** The maximum number of connections in the connection pool. */
const maxPoolSize = parseInt(process.env.MONGO_MAX_POOL_SIZE) || undefined;
/** The minimum number of connections in the connection pool. */
const minPoolSize = parseInt(process.env.MONGO_MIN_POOL_SIZE) || undefined;
/** The maximum number of connections that may be in the process of being established concurrently by the connection pool. */
const maxConnecting = parseInt(process.env.MONGO_MAX_CONNECTING) || undefined;
/** The maximum number of milliseconds that a connection can remain idle in the pool before being removed and closed. */
const maxIdleTimeMS = parseInt(process.env.MONGO_MAX_IDLE_TIME_MS) || undefined;
/** The maximum time in milliseconds that a thread can wait for a connection to become available. */
const waitQueueTimeoutMS = parseInt(process.env.MONGO_WAIT_QUEUE_TIMEOUT_MS) || undefined;
/** Set to false to disable automatic index creation for all models associated with this connection. */
const autoIndex =
  process.env.MONGO_AUTO_INDEX != undefined
    ? isEnabled(process.env.MONGO_AUTO_INDEX) || false
    : undefined;

/** Set to `false` to disable Mongoose automatically calling `createCollection()` on every model created on this connection. */
const autoCreate =
  process.env.MONGO_AUTO_CREATE != undefined
    ? isEnabled(process.env.MONGO_AUTO_CREATE) || false
    : undefined;
/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

mongoose.connection.on('error', (err) => {
  logger.error('[connectDb] MongoDB connection error:', err);
});

async function connectDb() {
  if (cached.conn && cached.conn?._readyState === 1) {
    return cached.conn;
  }

  const disconnected = cached.conn && cached.conn?._readyState !== 1;
  if (!cached.promise || disconnected) {
    const opts = {
      bufferCommands: false,
      ...(maxPoolSize ? { maxPoolSize } : {}),
      ...(minPoolSize ? { minPoolSize } : {}),
      ...(maxConnecting ? { maxConnecting } : {}),
      ...(maxIdleTimeMS ? { maxIdleTimeMS } : {}),
      ...(waitQueueTimeoutMS ? { waitQueueTimeoutMS } : {}),
      ...(autoIndex != undefined ? { autoIndex } : {}),
      ...(autoCreate != undefined ? { autoCreate } : {}),
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      // bufferMaxEntries: 0,
      // useFindAndModify: true,
      // useCreateIndex: true
    };
    logger.info('Mongo Connection options');
    logger.info(JSON.stringify(opts, null, 2));
    mongoose.set('strictQuery', true);
    cached.promise = mongoose.connect(MONGO_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;

  return cached.conn;
}

module.exports = {
  connectDb,
};
