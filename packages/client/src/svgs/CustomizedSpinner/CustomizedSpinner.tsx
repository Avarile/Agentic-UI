import { JSX } from 'react/jsx-runtime';
import type { CSSProperties } from 'react';
import { cn } from '~/utils/';
import './CustomizedSpinner.css';

type SpinnerVariant = 'auto' | 'mark' | 'ring' | 'gif';
type ResolvedVariant = Exclude<SpinnerVariant, 'auto'>;

interface CustomizedSpinnerProps {
  className?: string;
  size?: string | number;
  color?: string;
  bgOpacity?: number;
  speed?: number;
  variant?: SpinnerVariant;
  assetPath?: string;
}

/** Ring geometry shared by every Cybernetics product mark. */
const RING_RADIUS = 12;
const RING_CENTRE = 16;
const NODE_RADIUS = 1.5;

/**
 * Ring arc/gap ratio from the brand assets: stroke-dasharray "58 18" against a
 * circumference of 2π·12 ≈ 75.4. Declaring pathLength 76 normalises the dash to
 * the designed 76.9%/23.1% split independently of the rendered radius.
 */
const RING_PATH_LENGTH = 76;
const RING_DASH = '58 18';

/** HOW-TO-USE.txt: the ring-only mark is the variant specified for 16-24px. */
const SMALL_SIZE_THRESHOLD = 24;

/**
 * At or above this the rendered brand GIF replaces the inline SVG. Below it the
 * SVG is kept deliberately: it inherits `currentColor`, honours
 * prefers-reduced-motion, and costs ~1.5KB of shared CSS rather than an 86KB
 * raster downscaled into a button.
 */
const GIF_SIZE_THRESHOLD = 48;

const GIF_BASENAME = 'cybernetics-loader';

/**
 * Core breathes at 1.4s against the node pulse's 1.6s — the two ends of the
 * spec's interior band. Nodes stay locked to the ring period so the staggered
 * pulse travels exactly one lap per revolution, while the offset core keeps the
 * centre from reading as a single stiff unit.
 */
const CORE_SPEED_RATIO = 1.4 / 1.6;

const NODES = [
  { cx: 16, cy: 8.7 },
  { cx: 23.3, cy: 16 },
  { cx: 16, cy: 23.3 },
  { cx: 8.7, cy: 16 },
] as const;

/**
 * Only bare numbers and explicit px resolve to a comparable pixel size.
 * `parseFloat` is deliberately avoided: it reads '2rem' as 2, which would trip
 * the small-size branch for a value that is actually 32px.
 */
const PIXEL_SIZE = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/;

function variantForPixels(pixels: number): ResolvedVariant {
  if (pixels >= GIF_SIZE_THRESHOLD) {
    return 'gif';
  }

  return pixels <= SMALL_SIZE_THRESHOLD ? 'ring' : 'mark';
}

/** Relative sizes (`2rem`, `100%`) cannot be compared to a px threshold, so
 * they fall through to the full mark rather than silently dropping the nodes. */
function resolveVariant(variant: SpinnerVariant, size: string | number): ResolvedVariant {
  if (variant !== 'auto') {
    return variant;
  }

  if (typeof size === 'number') {
    return variantForPixels(size);
  }

  const match = PIXEL_SIZE.exec(size);
  return match ? variantForPixels(Number(match[1])) : 'mark';
}

/** Keeps binary-float artefacts such as `1.2000000000000002s` out of the DOM. */
function seconds(value: number): string {
  return `${Number(value.toFixed(4))}s`;
}

interface SpinnerMarkProps {
  className: string;
  size: string | number;
  color: string;
  bgOpacity: number;
  speed: number;
  isRingOnly: boolean;
}

function SpinnerMark({
  className,
  size,
  color,
  bgOpacity,
  speed,
  isRingOnly,
}: SpinnerMarkProps): JSX.Element {
  const strokeWidth = isRingOnly ? 3 : 2.4;
  const coreRadius = isRingOnly ? 3 : 2.7;

  const cssVars = {
    '--cyb-spinner-ring-speed': seconds(speed),
    '--cyb-spinner-node-speed': seconds(speed),
    '--cyb-spinner-core-speed': seconds(speed * CORE_SPEED_RATIO),
  } as CSSProperties;

  return (
    <svg
      className={cn(className, 'cybernetics-spinner')}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      style={cssVars}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <circle
        cx={RING_CENTRE}
        cy={RING_CENTRE}
        r={RING_RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeOpacity={bgOpacity}
      />
      <circle
        className="cybernetics-spinner__ring"
        cx={RING_CENTRE}
        cy={RING_CENTRE}
        r={RING_RADIUS}
        pathLength={RING_PATH_LENGTH}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={RING_DASH}
      />
      <circle
        className="cybernetics-spinner__core"
        cx={RING_CENTRE}
        cy={RING_CENTRE}
        r={coreRadius}
        fill={color}
      />
      {!isRingOnly &&
        NODES.map((node, index) => (
          <circle
            key={`${node.cx}-${node.cy}`}
            className="cybernetics-spinner__node"
            style={
              {
                '--cyb-spinner-node-delay': seconds((speed / NODES.length) * index),
              } as CSSProperties
            }
            cx={node.cx}
            cy={node.cy}
            r={NODE_RADIUS}
            fill={color}
          />
        ))}
    </svg>
  );
}

/**
 * Accessible Cybernetics loading mark — a rotating brand ring around a
 * breathing core, with four nodes pulsing in sequence around the perimeter.
 *
 * Prop-compatible with `Spinner`, so it substitutes at existing call sites
 * without changes. Three tiers resolve from `size`, or are forced via `variant`:
 *
 * - `ring` (<=24px) inline SVG, ring and core only
 * - `mark` (25-47px) inline SVG, full four-node mark
 * - `gif`  (>=48px) the rendered brand animation from `assetPath`
 *
 * Below 48px the SVG inherits `currentColor` from the call site's semantic text
 * token; the GIF cannot, so it ships as a light and a dark file swapped by the
 * `.dark` ancestor class. The GIF also cannot be paused, so the SVG mark is
 * rendered alongside it and CSS promotes it under prefers-reduced-motion.
 *
 * Animation is defined in CustomizedSpinner.css (extracted into the package
 * style bundle), never an embedded <style> tag: stylesheet text inside the SVG
 * becomes part of the ancestor's textContent, leaking raw CSS into label
 * readouts of any control that wraps a spinner.
 */
export default function CustomizedSpinner({
  className = 'm-auto',
  size = 20,
  color = 'currentColor',
  bgOpacity = 0.1,
  speed = 1.6,
  variant = 'auto',
  assetPath = '/assets',
}: CustomizedSpinnerProps): JSX.Element {
  const resolved = resolveVariant(variant, size);

  if (resolved !== 'gif') {
    return (
      <SpinnerMark
        className={className}
        size={size}
        color={color}
        bgOpacity={bgOpacity}
        speed={speed}
        isRingOnly={resolved === 'ring'}
      />
    );
  }

  return (
    <span
      className={cn(className, 'cybernetics-loader')}
      style={{ width: size, height: size }}
      aria-hidden="true"
      role="presentation"
    >
      <img
        className="cybernetics-loader__frames cybernetics-loader__frames--light"
        src={`${assetPath}/${GIF_BASENAME}-light.gif`}
        alt=""
        width={size}
        height={size}
        decoding="async"
      />
      <img
        className="cybernetics-loader__frames cybernetics-loader__frames--dark"
        src={`${assetPath}/${GIF_BASENAME}-dark.gif`}
        alt=""
        width={size}
        height={size}
        decoding="async"
      />
      <SpinnerMark
        className="cybernetics-loader__static"
        size={size}
        color={color}
        bgOpacity={bgOpacity}
        speed={speed}
        isRingOnly={false}
      />
    </span>
  );
}
