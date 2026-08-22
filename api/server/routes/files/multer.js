/**
 * Multer configuration: disk storage, filename sanitization, and MIME filtering.
 *
 * Design:
 * - Filenames are `crypto`-randomized on disk and the original is sanitized
 *   (`sanitizeFilename`) — the client-supplied name is never used as a path component, which is
 *   the traversal boundary for uploads.
 * - `normalizeUploadMimeType` reconciles the browser-reported type with the extension, because
 *   browsers report inconsistent types for the same file (notably CSV and Office formats) and
 *   a naive filter would reject valid uploads.
 * - `createFileFilter(customFileConfig)` builds the filter from operator config, so allowed
 *   types are configuration rather than code. Admin-supplied MIME patterns are compiled by a
 *   linear-time (ReDoS-safe) engine — see `configureFileConfigRegexEngine()` in
 *   `server/index.js`.
 * - `importFileFilter` is a separate, narrower filter for conversation-import archives.
 * - `createMulterInstance` is async because limits come from the loaded app config.
 *
 * Connections: used by `server/routes/files/index.js` and `server/routes/convos.js`
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { sanitizeFilename, createCustomError } = require('@librechat/api');
const {
  mergeFileConfig,
  inferMimeType,
  getEndpointFileConfig,
  fileConfig: defaultFileConfig,
} = require('librechat-data-provider');
const { getAppConfig } = require('~/server/services/Config');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const appConfig = req.config;
    const outputPath = path.join(appConfig.paths.uploads, 'temp', req.user.id);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    cb(null, outputPath);
  },
  filename: function (req, file, cb) {
    req.file_id = crypto.randomUUID();
    file.originalname = decodeURIComponent(file.originalname);
    const sanitizedFilename = sanitizeFilename(file.originalname);
    cb(null, sanitizedFilename);
  },
});

const importFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/json') {
    cb(null, true);
  } else if (path.extname(file.originalname).toLowerCase() === '.json') {
    cb(null, true);
  } else {
    cb(createCustomError(415, 'Only JSON files are allowed'), false);
  }
};

const normalizeUploadMimeType = (file) => {
  const mimeType = inferMimeType(file.originalname || '', file.mimetype || '');
  if (mimeType && file.mimetype !== mimeType) {
    file.mimetype = mimeType;
  }
  return mimeType;
};

/**
 *
 * @param {import('librechat-data-provider').FileConfig | undefined} customFileConfig
 */
const createFileFilter = (customFileConfig) => {
  /**
   * @param {ServerRequest} req
   * @param {Express.Multer.File}
   * @param {import('multer').FileFilterCallback} cb
   */
  const fileFilter = (req, file, cb) => {
    if (!file) {
      return cb(createCustomError(400, 'No file provided'), false);
    }

    const mimeType = normalizeUploadMimeType(file);

    if (req.originalUrl.endsWith('/speech/stt') && mimeType.startsWith('audio/')) {
      return cb(null, true);
    }

    const endpoint = req.body.endpoint;
    const endpointType = req.body.endpointType;
    const endpointFileConfig = getEndpointFileConfig({
      fileConfig: customFileConfig,
      endpoint,
      endpointType,
    });

    if (!defaultFileConfig.checkType(mimeType, endpointFileConfig.supportedMimeTypes)) {
      return cb(
        createCustomError(415, 'Unsupported file type: ' + (file.mimetype || mimeType)),
        false,
      );
    }

    cb(null, true);
  };

  return fileFilter;
};

const createMulterInstance = async () => {
  const appConfig = await getAppConfig();
  const fileConfig = mergeFileConfig(appConfig?.fileConfig);
  const fileFilter = createFileFilter(fileConfig);
  return multer({
    storage,
    fileFilter,
    limits: { fileSize: fileConfig.serverFileSizeLimit },
  });
};

module.exports = { createMulterInstance, storage, importFileFilter, createFileFilter };
