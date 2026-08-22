/**
 * File inspection and filename-safety helpers.
 *
 * `determineFileType`/`getBufferMetadata` sniff the *actual* type from the buffer (via
 * `file-type`, plus `sharp` for image dimensions) rather than trusting the client-declared MIME
 * type — a declared type is attacker-controlled and must never decide how a file is handled.
 *
 * `cleanFileName`, `getAsciiFilenameFallback` and `getContentDisposition` build safe
 * `Content-Disposition` headers: the header is emitted with both an ASCII fallback and a
 * UTF-8 `filename*` form, because a non-ASCII name breaks older clients and an unescaped one is
 * a header-injection vector.
 *
 * Note `file-type` is loaded with a dynamic `import()` because it is ESM-only — one of the few
 * places the project's no-dynamic-imports rule is unavoidable.
 *
 * Connections: `server/services/Files/process.js`, `routes/files/files.js`, `routes/share.js`
 */
const sharp = require('sharp');

/**
 * Determines the file type of a buffer
 * @param {Buffer} dataBuffer
 * @param {boolean} [returnFileType=false] - Optional. If true, returns the file type instead of the file extension.
 * @returns {Promise<string|null|import('file-type').FileTypeResult>} - Returns the file extension if found, else null
 * */
const determineFileType = async (dataBuffer, returnFileType) => {
  const fileType = await import('file-type');
  const type = await fileType.fileTypeFromBuffer(dataBuffer);
  if (returnFileType) {
    return type;
  }
  return type ? type.ext : null; // Returns extension if found, else null
};

/**
 * Get buffer metadata
 * @param {Buffer} buffer
 * @returns {Promise<{ bytes: number, type: string, dimensions: Record<string, number>, extension: string}>}
 */
const getBufferMetadata = async (buffer) => {
  const fileType = await determineFileType(buffer, true);
  const bytes = buffer.length;
  let extension = fileType ? fileType.ext : 'unknown';

  /** @type {Record<string, number>} */
  let dimensions = {};

  if (fileType && fileType.mime.startsWith('image/') && extension !== 'unknown') {
    const imageMetadata = await sharp(buffer).metadata();
    dimensions = {
      width: imageMetadata.width,
      height: imageMetadata.height,
    };
  }

  return {
    bytes,
    type: fileType?.mime ?? 'unknown',
    dimensions,
    extension,
  };
};

/**
 * Removes UUID prefix from filename for clean display
 * Pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx__filename.ext
 * @param {string} fileName - The filename to clean
 * @returns {string} - The cleaned filename without UUID prefix
 */
const cleanFileName = (fileName) => {
  if (!fileName) {
    return fileName;
  }

  // Remove UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx__
  const cleaned = fileName.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}__/i,
    '',
  );

  return cleaned;
};

const encodeRFC5987ValueChars = (value) =>
  encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const getAsciiFilenameFallback = (fileName) => {
  const fallback = fileName
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\\r\n]/g, '_');

  return fallback || 'download';
};

const getContentDisposition = (fileName, disposition = 'attachment') => {
  const cleanedFilename = cleanFileName(fileName) || 'download';
  const asciiFallback = getAsciiFilenameFallback(cleanedFilename);
  const encodedFilename = encodeRFC5987ValueChars(cleanedFilename);

  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`;
};

module.exports = {
  determineFileType,
  getBufferMetadata,
  cleanFileName,
  getContentDisposition,
};
