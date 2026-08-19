import { TStartupConfig } from 'librechat-data-provider';
import { AnimatedGridPattern, ThemeSelector } from '@librechat/client';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { BlinkAnimation } from './BlinkAnimation';
import { Brand } from '~/components/ui';
import { Banner } from '../Banners';
import Showcase from './Showcase';
import AuthTabs from './Tabs';
import Footer from './Footer';

function AuthLayout({
  children,
  header,
  isFetching,
  startupConfig,
  startupConfigError,
  pathname,
  error,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
  pathname: string;
  error: TranslationKeys | null;
}) {
  const localize = useLocalize();

  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
  const isEntryPage =
    !pathname.includes('2fa') && (pathname.includes('login') || pathname.includes('register'));
  const showTabs = isEntryPage && startupConfig?.registrationEnabled === true;

  const DisplayError = () => {
    if (hasStartupConfigError) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize('com_auth_error_login_server')}</ErrorMessage>
        </div>
      );
    } else if (error === 'com_auth_error_invalid_reset_token') {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>
            {localize('com_auth_error_invalid_reset_token')}{' '}
            <a
              className="font-semibold text-accent-primary hover:underline"
              href="/forgot-password"
            >
              {localize('com_auth_click_here')}
            </a>{' '}
            {localize('com_auth_to_try_again')}
          </ErrorMessage>
        </div>
      );
    } else if (error != null && error) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize(error)}</ErrorMessage>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-surface-primary">
      <AnimatedGridPattern
        className="fixed inset-0 z-0 stroke-text-tertiary/25 text-text-tertiary [mask-image:radial-gradient(ellipse_at_center,white,transparent_80%)]"
        width={40}
        height={40}
        numSquares={48}
        maxOpacity={0.15}
        duration={3}
        repeatDelay={0.5}
      />
      <div className="relative z-10">
        <Banner />
      </div>
      <div className="fixed bottom-0 left-0 z-20 md:m-4">
        <ThemeSelector />
      </div>
      <div className="relative z-10 flex flex-1">
        <div className="absolute left-5 top-5 z-20">
          <BlinkAnimation active={isFetching}>
            <Brand
              className="gap-2 text-sm"
              logoClassName="h-8 w-8 rounded-[2px]"
              logoAlt={localize('com_ui_logo', {
                0: startupConfig?.appTitle ?? 'Cybernetics - Agentic Centre',
              })}
            />
          </BlinkAnimation>
        </div>
        <Showcase />
        <main className="relative flex flex-1 shrink-0 flex-col items-center justify-center px-6">
          {showTabs && (
            <div className="absolute right-0 top-0 flex h-20 items-center justify-end px-5">
              <AuthTabs pathname={pathname} />
            </div>
          )}
          <div className="w-authPageWidth max-w-full py-24">
            <DisplayError />
            {!hasStartupConfigError && !isFetching && header && (
              <h1
                className="mb-6 text-center text-2xl font-semibold text-text-primary"
                style={{ userSelect: 'none' }}
              >
                {header}
              </h1>
            )}
            {children}
            {isEntryPage && <SocialLoginRender startupConfig={startupConfig} />}
            <Footer startupConfig={startupConfig} />
          </div>
        </main>
      </div>
    </div>
  );
}

export default AuthLayout;
