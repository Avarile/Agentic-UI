/**
 * Serves generated images from `paths.imageOutput` as static files.
 *
 * Mounted at `/images/` in `server/index.js` *behind* `createValidateImageRequest`, which is
 * what enforces per-user authorization — this router itself does no access control.
 *
 * `ENABLE_IMAGE_OUTPUT_GZIP_SCAN` controls whether the static cache scans for pre-compressed
 * variants; it is off by default because generated images are already compressed and the scan
 * is wasted I/O on a large directory.
 *
 * Connections: `server/utils/staticCache.js`, `server/middleware/validateImageRequest.js`
 */
const express = require('express');
const { isEnabled } = require('@librechat/api');
const staticCache = require('../utils/staticCache');
const paths = require('~/config/paths');

const skipGzipScan = !isEnabled(process.env.ENABLE_IMAGE_OUTPUT_GZIP_SCAN);

const router = express.Router();
router.use(staticCache(paths.imageOutput, { skipGzipScan }));

module.exports = router;
