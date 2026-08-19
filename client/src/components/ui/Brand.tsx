import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface BrandProps {
  className?: string;
  logoClassName?: string;
  wordmarkClassName?: string;
  /** Accessible name for the logo; when omitted the logo is treated as decorative */
  logoAlt?: string;
}

export default function Brand({
  className,
  logoClassName,
  wordmarkClassName,
  logoAlt,
}: BrandProps) {
  const localize = useLocalize();

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <img
        src="/assets/logo.svg"
        alt={logoAlt ?? ''}
        aria-hidden={logoAlt == null ? true : undefined}
        className={cn('h-4 w-4 shrink-0 rounded-[3px]', logoClassName)}
      />
      <span className={cn('flex items-baseline gap-1 whitespace-nowrap', wordmarkClassName)}>
        <span className="font-bold tracking-tight text-text-primary">CYBERNETICS</span>
        <span className="text-accent-primary">/</span>
        <span className="font-mono lowercase text-accent-primary">
          {localize('com_ui_footer_brand_tagline')}
        </span>
      </span>
    </div>
  );
}
