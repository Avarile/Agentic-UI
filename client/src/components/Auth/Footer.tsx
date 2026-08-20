import { TStartupConfig } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

const linkClassName =
  'text-sm text-accent-primary underline decoration-transparent transition-all duration-200 hover:text-accent-primary-hover hover:decoration-accent-primary-hover focus:text-accent-primary-hover focus:decoration-accent-primary-hover';

function Footer({ startupConfig }: { startupConfig: TStartupConfig | null | undefined }) {
  const localize = useLocalize();
  const privacyPolicy = startupConfig?.interface?.privacyPolicy;
  const termsOfService = startupConfig?.interface?.termsOfService;

  const privacyPolicyRender = privacyPolicy?.externalUrl && (
    <a
      className={linkClassName}
      href={privacyPolicy.externalUrl}
      // Removed for WCAG compliance
      // target={privacyPolicy.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_privacy_policy')}
    </a>
  );

  const termsOfServiceRender = termsOfService?.externalUrl && (
    <a
      className={linkClassName}
      href={termsOfService.externalUrl}
      // Removed for WCAG compliance
      // target={termsOfService.openNewTab ? '_blank' : undefined}
      rel="noreferrer"
    >
      {localize('com_ui_terms_of_service')}
    </a>
  );

  return (
    <div className="m-4 flex flex-col items-center gap-3" role="contentinfo">
      {(privacyPolicyRender || termsOfServiceRender) && (
        <div className="flex justify-center gap-2">
          {privacyPolicyRender}
          {privacyPolicyRender && termsOfServiceRender && (
            <div className="border-r-[1px] border-border-medium" />
          )}
          {termsOfServiceRender}
        </div>
      )}
      <div className="flex flex-col items-center gap-0.5 text-center text-xs text-text-secondary">
        <span>{localize('com_ui_footer_copyright', { 0: new Date().getFullYear() })}</span>
        <span>{localize('com_ui_footer_byline')}</span>
      </div>
    </div>
  );
}

export default Footer;
