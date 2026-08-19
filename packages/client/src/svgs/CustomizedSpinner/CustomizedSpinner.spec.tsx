import { render } from '@testing-library/react';
import CustomizedSpinner from './CustomizedSpinner';

const nodes = (container: HTMLElement) => container.querySelectorAll('.cybernetics-spinner__node');
const isGif = (container: HTMLElement) => container.querySelector('.cybernetics-loader') !== null;
const frames = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'));

/** The GIF tier also renders the inline mark as its reduced-motion fallback, so
 *  tier assertions test for the loader wrapper rather than counting nodes. */
const tierOf = (container: HTMLElement) => {
  if (isGif(container)) {
    return 'gif';
  }
  return nodes(container).length === 4 ? 'mark' : 'ring';
};

describe('CustomizedSpinner', () => {
  describe('tier resolution', () => {
    it('renders the ring-only mark at the default 20px size', () => {
      const { container } = render(<CustomizedSpinner />);

      expect(tierOf(container)).toBe('ring');
      expect(container.querySelector('.cybernetics-spinner__ring')).not.toBeNull();
      expect(container.querySelector('.cybernetics-spinner__core')).not.toBeNull();
    });

    it('maps each size band to its tier', () => {
      expect(tierOf(render(<CustomizedSpinner size={16} />).container)).toBe('ring');
      expect(tierOf(render(<CustomizedSpinner size={24} />).container)).toBe('ring');
      expect(tierOf(render(<CustomizedSpinner size={25} />).container)).toBe('mark');
      expect(tierOf(render(<CustomizedSpinner size={47} />).container)).toBe('mark');
      expect(tierOf(render(<CustomizedSpinner size={48} />).container)).toBe('gif');
      expect(tierOf(render(<CustomizedSpinner size={256} />).container)).toBe('gif');
    });

    it('compares explicit px strings against the thresholds', () => {
      expect(tierOf(render(<CustomizedSpinner size="20px" />).container)).toBe('ring');
      expect(tierOf(render(<CustomizedSpinner size="32px" />).container)).toBe('mark');
      expect(tierOf(render(<CustomizedSpinner size="48px" />).container)).toBe('gif');
    });

    it('falls back to the inline mark for relative sizes', () => {
      expect(tierOf(render(<CustomizedSpinner size="2rem" />).container)).toBe('mark');
      expect(tierOf(render(<CustomizedSpinner size="100%" />).container)).toBe('mark');
    });

    it('honours an explicit variant over the size heuristic', () => {
      expect(tierOf(render(<CustomizedSpinner size={16} variant="mark" />).container)).toBe('mark');
      expect(tierOf(render(<CustomizedSpinner size={256} variant="ring" />).container)).toBe(
        'ring',
      );
      expect(tierOf(render(<CustomizedSpinner size={16} variant="gif" />).container)).toBe('gif');
    });
  });

  describe('rendered GIF tier', () => {
    it('emits a light and a dark frame source for the theme swap', () => {
      const { container } = render(<CustomizedSpinner size={64} />);

      expect(frames(container)).toEqual([
        '/assets/cybernetics-loader-light.gif',
        '/assets/cybernetics-loader-dark.gif',
      ]);
    });

    it('honours a custom assetPath', () => {
      const { container } = render(<CustomizedSpinner size={64} assetPath="/static/brand" />);

      expect(frames(container)).toEqual([
        '/static/brand/cybernetics-loader-light.gif',
        '/static/brand/cybernetics-loader-dark.gif',
      ]);
    });

    it('carries the inline mark as the reduced-motion fallback', () => {
      const { container } = render(<CustomizedSpinner size={64} />);
      const fallback = container.querySelector('.cybernetics-loader__static');

      expect(fallback).not.toBeNull();
      expect(nodes(container)).toHaveLength(4);
    });

    it('sizes the wrapper so the frames inherit the requested box', () => {
      const { container } = render(<CustomizedSpinner size={96} />);
      const wrapper = container.querySelector('.cybernetics-loader');

      expect(wrapper).toHaveStyle({ width: '96px', height: '96px' });
      container.querySelectorAll('img').forEach((img) => {
        expect(img).toHaveAttribute('width', '96');
        expect(img).toHaveAttribute('height', '96');
      });
    });

    it('keeps the frames out of the accessibility tree', () => {
      const { container } = render(<CustomizedSpinner size={64} />);

      expect(container.querySelector('.cybernetics-loader')).toHaveAttribute('aria-hidden', 'true');
      container.querySelectorAll('img').forEach((img) => {
        expect(img).toHaveAttribute('alt', '');
      });
    });
  });

  describe('brand geometry', () => {
    it('normalises the ring dash to the designed arc/gap ratio', () => {
      const { container } = render(<CustomizedSpinner size={32} />);
      const ring = container.querySelector('.cybernetics-spinner__ring');

      expect(ring).toHaveAttribute('stroke-dasharray', '58 18');
      expect(ring).toHaveAttribute('pathLength', '76');
      expect(ring).toHaveAttribute('r', '12');
    });

    it('places the four nodes at the cardinal points of the ring', () => {
      const { container } = render(<CustomizedSpinner size={32} />);
      const points = Array.from(nodes(container)).map((node) => [
        node.getAttribute('cx'),
        node.getAttribute('cy'),
      ]);

      expect(points).toEqual([
        ['16', '8.7'],
        ['23.3', '16'],
        ['16', '23.3'],
        ['8.7', '16'],
      ]);
    });
  });

  describe('theming and timing', () => {
    it('defaults every stroke and fill to currentColor', () => {
      const { container } = render(<CustomizedSpinner size={32} />);
      const painted = container.querySelectorAll('circle');

      expect(painted.length).toBeGreaterThan(0);
      painted.forEach((circle) => {
        const paint = circle.getAttribute('stroke') ?? circle.getAttribute('fill');
        expect(paint).toBe('currentColor');
      });
    });

    it('scales ring, node, and core timings from a single speed prop', () => {
      const { container } = render(<CustomizedSpinner size={32} speed={0.8} />);
      const svg = container.querySelector('svg');

      expect(svg?.style.getPropertyValue('--cyb-spinner-ring-speed')).toBe('0.8s');
      expect(svg?.style.getPropertyValue('--cyb-spinner-node-speed')).toBe('0.8s');
      expect(svg?.style.getPropertyValue('--cyb-spinner-core-speed')).toBe('0.7s');
    });

    it('staggers the node pulse across one full ring revolution', () => {
      const { container } = render(<CustomizedSpinner size={32} speed={1.6} />);
      const delays = Array.from(nodes(container)).map((node) =>
        (node as SVGElement).style.getPropertyValue('--cyb-spinner-node-delay'),
      );

      expect(delays).toEqual(['0s', '0.4s', '0.8s', '1.2s']);
    });
  });

  describe('accessibility', () => {
    it('stays out of the accessibility tree so wrapping controls own the label', () => {
      const { container } = render(<CustomizedSpinner />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('role', 'presentation');
      expect(svg).toHaveAttribute('focusable', 'false');
    });

    it('never emits a style element that would leak CSS into ancestor text', () => {
      const { container } = render(<CustomizedSpinner size={32} />);

      expect(container.querySelector('style')).toBeNull();
      expect(container.textContent).toBe('');
    });
  });
});
