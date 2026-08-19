import { useId, useRef, useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '~/utils';

export interface AnimatedGridPatternProps extends ComponentPropsWithoutRef<'svg'> {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  strokeDasharray?: number;
  numSquares?: number;
  maxOpacity?: number;
  duration?: number;
  repeatDelay?: number;
}

interface Square {
  id: number;
  pos: [number, number];
  iteration: number;
}

/**
 * Decorative grid backdrop whose cells fade in and out at random positions.
 * Lines are drawn with `stroke-current`/`fill-current`, so the surrounding
 * text color drives the pattern and it adapts to any theme without overrides.
 * Honours `prefers-reduced-motion` by rendering the static grid alone.
 */
const AnimatedGridPattern = ({
  width = 40,
  height = 40,
  x = -1,
  y = -1,
  strokeDasharray = 0,
  numSquares = 50,
  className,
  maxOpacity = 0.5,
  duration = 4,
  repeatDelay = 0.5,
  ...props
}: AnimatedGridPatternProps): JSX.Element => {
  const id = useId();
  const containerRef = useRef<SVGSVGElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [squares, setSquares] = useState<Square[]>([]);

  const getPos = useCallback(
    (): [number, number] => [
      Math.floor((Math.random() * dimensions.width) / width),
      Math.floor((Math.random() * dimensions.height) / height),
    ],
    [dimensions.height, dimensions.width, height, width],
  );

  const updateSquarePosition = useCallback(
    (squareId: number) => {
      setSquares((currentSquares) => {
        const current = currentSquares[squareId];
        if (!current || current.id !== squareId) {
          return currentSquares;
        }

        const nextSquares = currentSquares.slice();
        nextSquares[squareId] = { ...current, pos: getPos(), iteration: current.iteration + 1 };
        return nextSquares;
      });
    },
    [getPos],
  );

  useEffect(() => {
    if (!dimensions.width || !dimensions.height) {
      return;
    }
    if (prefersReducedMotion === true) {
      setSquares([]);
      return;
    }
    setSquares(
      Array.from({ length: numSquares }, (_, index) => ({
        id: index,
        pos: getPos(),
        iteration: 0,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions.width, dimensions.height, numSquares, prefersReducedMotion]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions((current) => {
          const nextWidth = entry.contentRect.width;
          const nextHeight = entry.contentRect.height;
          if (current.width === nextWidth && current.height === nextHeight) {
            return current;
          }
          return { width: nextWidth, height: nextHeight };
        });
      }
    });
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full fill-current stroke-current',
        className,
      )}
      {...props}
    >
      <defs>
        <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse" x={x} y={y}>
          <path d={`M.5 ${height}V.5H${width}`} fill="none" strokeDasharray={strokeDasharray} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
      <svg x={x} y={y} className="overflow-visible">
        {squares.map(({ pos: [squareX, squareY], id: squareId, iteration }, index) => (
          <motion.rect
            key={`${squareId}-${iteration}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: maxOpacity }}
            transition={{
              duration,
              repeat: 1,
              delay: index * 0.1,
              repeatType: 'reverse',
              repeatDelay,
            }}
            onAnimationComplete={() => updateSquarePosition(squareId)}
            width={width - 1}
            height={height - 1}
            x={squareX * width + 1}
            y={squareY * height + 1}
            fill="currentColor"
            strokeWidth="0"
          />
        ))}
      </svg>
    </svg>
  );
};

export { AnimatedGridPattern };
