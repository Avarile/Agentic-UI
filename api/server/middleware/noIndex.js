/**
 * Sets `X-Robots-Tag: noindex` unless `NO_INDEX=false`.
 *
 * Design: the default is to opt *out* of indexing. A self-hosted chat instance being crawled
 * is almost never intended, so the safe default is applied globally in `server/index.js` and
 * operators must explicitly enable indexing.
 */
const noIndex = (req, res, next) => {
  const shouldNoIndex = process.env.NO_INDEX ? process.env.NO_INDEX === 'true' : true;

  if (shouldNoIndex) {
    res.setHeader('X-Robots-Tag', 'noindex');
  }

  next();
};

module.exports = noIndex;
