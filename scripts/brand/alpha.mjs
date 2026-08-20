/**
 * Rebuilds the animated brand marks as WebP with a real 8-bit alpha channel.
 *
 * The delivered GIFs are fully opaque: every Graphic Control Extension has its
 * transparency flag clear, so each frame carries a flat backdrop baked in
 * (#080808 for the dark cut, #ffffff for the light one). Composited onto
 * `bg-presentation` that backdrop reads as a visible square. GIF's 1-bit
 * transparency cannot express the glow's falloff either, so the pedestal is
 * un-premultiplied back into an alpha channel and re-encoded as animated WebP.
 *
 * Re-run whenever the source animation is re-exported. The GIFs are the design
 * source and are not kept in the repo, so point at wherever they landed:
 *   node scripts/brand/alpha.mjs ~/Downloads
 */
import path from 'node:path';
import sharp from 'sharp';
import { stat } from 'node:fs/promises';

const ASSET_DIR = 'client/public/assets/animation';
const SOURCE_DIR = process.argv[2] ?? ASSET_DIR;
const BASENAME = 'agentic-icon-orbit-core';
const SIZE = 80;
/**
 * Lossless beats lossy on both axes for this source: the frames come from a
 * 256-colour palettised GIF, so lossless is both smaller (33KB vs 57KB) and
 * exact, where quality 92 pushed a mean composite error of ~2.9/255 into the
 * glow. `effort: 6` is the encoder's maximum.
 */
const WEBP = { lossless: true, effort: 6 };

/** The dark cut is a glow over near-black; #080808 is its flat pedestal. */
const DARK_PEDESTAL = 8;

const CUTS = [
  { variant: 'dark', over: 'black' },
  { variant: 'light', over: 'white' },
];

/**
 * Recovers straight alpha from a frame flattened onto a known flat backdrop.
 * Over black the stored value is already premultiplied, so alpha is the channel
 * peak once the pedestal is removed. Over white the same holds for the
 * inverted signal, and the backdrop's contribution is subtracted before
 * un-premultiplying.
 */
function unpremultiply(data, over) {
  const out = Buffer.alloc(data.length);
  let peakAlpha = 0;
  let transparent = 0;

  for (let i = 0; i < data.length; i += 4) {
    const signal =
      over === 'black'
        ? [
            Math.max(0, data[i] - DARK_PEDESTAL),
            Math.max(0, data[i + 1] - DARK_PEDESTAL),
            Math.max(0, data[i + 2] - DARK_PEDESTAL),
          ]
        : [255 - data[i], 255 - data[i + 1], 255 - data[i + 2]];

    const alpha = Math.max(signal[0], signal[1], signal[2]);

    if (alpha === 0) {
      transparent += 1;
      continue;
    }

    const backdrop = over === 'black' ? 0 : 255 - alpha;

    for (let channel = 0; channel < 3; channel += 1) {
      const straight = Math.round(((data[i + channel] - backdrop) * 255) / alpha);
      out[i + channel] = Math.max(0, Math.min(255, straight));
    }

    out[i + 3] = alpha;
    peakAlpha = Math.max(peakAlpha, alpha);
  }

  return { out, peakAlpha, transparent: transparent / (data.length / 4) };
}

async function keyed(source, over, inputOptions) {
  const image = sharp(source, inputOptions);
  const { pageHeight = SIZE, loop, delay } = await image.metadata();
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { out, peakAlpha, transparent } = unpremultiply(data, over);

  return {
    peakAlpha,
    transparent,
    /** `raw.pageHeight` is what makes the re-encode animated; passing `pages`
     * as an input option to a raw buffer throws on a missing `n-pages` field. */
    pipeline: sharp(out, {
      raw: { width: info.width, height: info.height, channels: 4, pageHeight },
    }),
    loop,
    delay,
  };
}

async function kilobytes(file) {
  const { size } = await stat(file);
  return (size / 1024).toFixed(1);
}

async function convert({ variant, over }) {
  const source = path.join(SOURCE_DIR, `${BASENAME}-${variant}-${SIZE}.gif`);

  await stat(source).catch(() => {
    throw new Error(
      `Missing ${source}. Pass the directory holding the exported GIFs, e.g. ` +
        `node scripts/brand/alpha.mjs ~/Downloads`,
    );
  });
  const target = path.join(ASSET_DIR, `${BASENAME}-${variant}-${SIZE}.webp`);
  const poster = path.join(ASSET_DIR, `${BASENAME}-${variant}-${SIZE}-static.webp`);

  const animated = await keyed(source, over, { animated: true });
  await animated.pipeline
    .webp({ ...WEBP, loop: animated.loop, delay: animated.delay })
    .toFile(target);

  const still = await keyed(source, over, { page: 0, pages: 1 });
  await still.pipeline.webp(WEBP).toFile(poster);

  const written = await sharp(target, { animated: true }).metadata();

  return {
    variant,
    animated: `${await kilobytes(target)} KB`,
    poster: `${await kilobytes(poster)} KB`,
    was: `${await kilobytes(source)} KB`,
    pages: written.pages,
    hasAlpha: written.hasAlpha,
    loop: written.loop,
    delay: written.delay?.[0],
    peakAlpha: animated.peakAlpha,
    transparent: `${(animated.transparent * 100).toFixed(1)}%`,
  };
}

const results = [];
for (const cut of CUTS) {
  results.push(await convert(cut));
}
console.table(results);
