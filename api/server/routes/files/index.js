/**
 * Root router for `/api/files`, exported as an async `initialize()` rather than a router.
 *
 * Why async: multer's configuration (size limits, MIME filter) depends on the loaded app
 * config, which is not available at require time. `server/index.js` awaits
 * `routes.files.initialize()` at mount time.
 *
 * Design:
 * - Common chain: `requireJwtAuth -> configMiddleware -> checkBan -> uaParser`.
 * - Upload routes are declared as *separate* `router.post(...)` statements that only run
 *   `upload.single(...)` and `restoreTenantContextFromReq`, before the corresponding
 *   `router.use(...)` mounts the handler router. Multer must consume the multipart body first,
 *   and `restoreTenantContextFromReq` re-establishes the async-local tenant context that is
 *   lost across multer's stream handling — without it, tenant-scoped writes in the handler
 *   would fail.
 * - Avatar routers for agents and assistants are imported from their own route modules and
 *   mounted here (`/images/agents`, `/images/assistants`) so avatar uploads reuse this
 *   file-upload stack.
 *
 * Connections: `files.js`, `images.js`, `avatar.js`, `speech/`, `multer.js`
 */
const express = require('express');
const {
  createFileUsageLimiter,
  createFileLimiters,
  configMiddleware,
  requireJwtAuth,
  uaParser,
  checkBan,
} = require('~/server/middleware');
const { restoreTenantContextFromReq } = require('@librechat/api');
const { avatar: asstAvatarRouter } = require('~/server/routes/assistants/v1');
const { avatar: agentAvatarRouter } = require('~/server/routes/agents/v1');
const { createMulterInstance } = require('./multer');

const files = require('./files');
const images = require('./images');
const avatar = require('./avatar');
const speech = require('./speech');

const initialize = async () => {
  const router = express.Router();
  router.use(requireJwtAuth);
  router.use(configMiddleware);
  router.use(checkBan);
  router.use(uaParser);

  const upload = await createMulterInstance();
  router.post('/speech/stt', upload.single('audio'), restoreTenantContextFromReq);

  /* Important: speech route must be added before the upload limiters */
  router.use('/speech', speech);

  const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();
  const fileUsageLimiter = createFileUsageLimiter();

  /** Non-strict routing means `/usage/` reaches the same handler, so match the
   *  route the way Express does. An exact comparison would push a
   *  trailing-slash request onto the upload quota instead. */
  const isUsagePath = (path) => path.replace(/\/+$/, '') === '/usage';

  /** Apply rate limiters to all POST routes (excluding /speech which is handled
   *  above). `/usage` is a metadata touch, so it gets its own limiter rather
   *  than consuming upload quota, but it is never left unmetered. */
  router.use((req, res, next) => {
    if (req.method !== 'POST' || req.path.startsWith('/speech')) {
      return next();
    }
    if (isUsagePath(req.path)) {
      return fileUsageLimiter(req, res, next);
    }
    return fileUploadIpLimiter(req, res, (err) => {
      if (err) {
        return next(err);
      }
      return fileUploadUserLimiter(req, res, next);
    });
  });

  router.post('/', upload.single('file'), restoreTenantContextFromReq);
  router.post('/images', upload.single('file'), restoreTenantContextFromReq);
  router.post('/images/avatar', upload.single('file'), restoreTenantContextFromReq);
  router.post(
    '/images/agents/:agent_id/avatar',
    upload.single('file'),
    restoreTenantContextFromReq,
  );
  router.post(
    '/images/assistants/:assistant_id/avatar',
    upload.single('file'),
    restoreTenantContextFromReq,
  );

  router.use('/', files);
  router.use('/images', images);
  router.use('/images/avatar', avatar);
  router.use('/images/agents', agentAvatarRouter);
  router.use('/images/assistants', asstAvatarRouter);
  return router;
};

module.exports = { initialize };
