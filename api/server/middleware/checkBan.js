/**
 * Blocks requests from banned users or IPs before any work is done.
 *
 * Design:
 * - Bans are looked up by *both* user id and IP, because the point of an IP ban is to stop an
 *   evasion attempt with a fresh account. The key helper switches between a prefixed Redis key
 *   and a raw Mongo key since the two stores namespace differently.
 * - The ban cache is `keyvMongo` with `ttl: 0` — bans must survive a Redis flush and a
 *   restart, so expiry is carried in the stored record rather than by store eviction.
 * - Response shape depends on the route: chat requests go through `denyRequest` so the ban
 *   appears as a message in the conversation, while other routes get a plain 403. Returning
 *   403 to an open SSE stream would leave the client hanging.
 * - The user agent is parsed so non-browser ban attempts can be distinguished in logs.
 *
 * Connections:
 * - bans are written by `cache/banViolation.js`
 * - rejection path via `server/middleware/denyRequest.js`
 */
const { Keyv } = require('keyv');
const uap = require('ua-parser-js');
const { logger } = require('@librechat/data-schemas');
const { ViolationTypes } = require('librechat-data-provider');
const { isEnabled, keyvMongo, removePorts } = require('@librechat/api');
const { getLogStores } = require('~/cache');
const denyRequest = require('./denyRequest');
const { findUser } = require('~/models');

const banCache = new Keyv({ store: keyvMongo, namespace: ViolationTypes.BAN, ttl: 0 });
const message = 'Your account has been temporarily banned due to violations of our service.';

/** @returns {string} Cache key for ban lookups, prefixed for Redis or raw for MongoDB */
const getBanCacheKey = (prefix, value, useRedis) => {
  if (!value) {
    return '';
  }
  return useRedis ? `ban_cache:${prefix}:${value}` : value;
};

/**
 * Respond to the request if the user is banned.
 *
 * @async
 * @function
 * @param {Object} req - Express Request object.
 * @param {Object} res - Express Response object.
 *
 * @returns {Promise<Object>} - Returns a Promise which when resolved sends a response status of 403 with a specific message if request is not of api/agents/chat. If it is, calls `denyRequest()` function.
 */
const banResponse = async (req, res) => {
  const ua = uap(req.headers['user-agent']);
  const { baseUrl, originalUrl } = req;
  if (!ua.browser.name) {
    return res.status(403).json({ message });
  } else if (baseUrl === '/api/agents' && originalUrl.startsWith('/api/agents/chat')) {
    return await denyRequest(req, res, { type: ViolationTypes.BAN });
  }

  return res.status(403).json({ message });
};

/**
 * Checks if the source IP or user is banned or not.
 *
 * @async
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {import('express').NextFunction} next - Next middleware function.
 *
 * @returns {Promise<function|Object>} - Returns a Promise which when resolved calls next middleware if user or source IP is not banned. Otherwise calls `banResponse()` and sets ban details in `banCache`.
 */
const checkBan = async (req, res, next = () => {}) => {
  try {
    const { BAN_VIOLATIONS } = process.env ?? {};

    if (!isEnabled(BAN_VIOLATIONS)) {
      return next();
    }

    req.ip = removePorts(req);
    let userId = req.user?.id ?? req.user?._id ?? null;

    if (!userId && req?.body?.email) {
      const user = await findUser({ email: req.body.email }, '_id');
      userId = user?._id ? user._id.toString() : userId;
    }

    if (!userId && !req.ip) {
      return next();
    }

    const useRedis = isEnabled(process.env.USE_REDIS);
    const ipKey = getBanCacheKey('ip', req.ip, useRedis);
    const userKey = getBanCacheKey('user', userId, useRedis);

    const [cachedIPBan, cachedUserBan] = await Promise.all([
      ipKey ? banCache.get(ipKey) : undefined,
      userKey ? banCache.get(userKey) : undefined,
    ]);

    if (cachedIPBan || cachedUserBan) {
      req.banned = true;
      return await banResponse(req, res);
    }

    const banLogs = getLogStores(ViolationTypes.BAN);
    const duration = banLogs.opts.ttl;

    if (duration <= 0) {
      return next();
    }

    const [ipBan, userBan] = await Promise.all([
      req.ip ? banLogs.get(req.ip) : undefined,
      userId ? banLogs.get(userId) : undefined,
    ]);

    const banData = ipBan || userBan;

    if (!banData) {
      return next();
    }

    const expiresAt = Number(banData.expiresAt);
    if (!banData.expiresAt || isNaN(expiresAt)) {
      req.banned = true;
      return await banResponse(req, res);
    }

    const timeLeft = expiresAt - Date.now();

    if (timeLeft <= 0) {
      const cleanups = [];
      if (ipBan) {
        cleanups.push(banLogs.delete(req.ip));
      }
      if (userBan) {
        cleanups.push(banLogs.delete(userId));
      }
      await Promise.all(cleanups);
      return next();
    }

    const cacheWrites = [];
    if (ipKey) {
      cacheWrites.push(banCache.set(ipKey, banData, timeLeft));
    }
    if (userKey) {
      cacheWrites.push(banCache.set(userKey, banData, timeLeft));
    }
    await Promise.all(cacheWrites).catch((err) =>
      logger.warn('[checkBan] Failed to write ban cache:', err),
    );

    req.banned = true;
    return await banResponse(req, res);
  } catch (error) {
    logger.error('Error in checkBan middleware:', error);
    return next(error);
  }
};

module.exports = checkBan;
