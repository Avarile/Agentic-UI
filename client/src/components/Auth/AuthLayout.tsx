// The shell for every pre-session page: branding, showcase, tabs, social login.
//
// All of it is config-driven, and the gating is deliberate: login/register tabs
// appear only on entry pages and only when registration is enabled, and a startup
// config *error* is distinguished from a still-loading config so a misconfigured
// server shows a diagnosis rather than a spinner forever.

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
    <div className="relative flex min-h-dvh flex-col bg-surface-primary">
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
      <div className="relative z-10 flex flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5 sm:py-5 lg:absolute lg:inset-x-0 lg:top-0 lg:z-20 lg:h-20 lg:flex-nowrap lg:py-0">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center overflow-hidden">
              <BlinkAnimation active={isFetching}>
                <Brand
                  className="gap-2 text-sm"
                  logoClassName="h-8 w-8 rounded-[2px]"
                  taglineClassName="hidden min-[360px]:flex"
                  logoAlt={localize('com_ui_logo', {
                    0: startupConfig?.appTitle ?? DEFAULT_APP_TITLE,
                  })}
                />
              </BlinkAnimation>
            </div>
            <ThemeSelector className="shrink-0 lg:fixed lg:bottom-0 lg:left-0 lg:z-20 lg:m-4" />
          </div>
          {showTabs && <AuthTabs pathname={pathname} />}
        </header>
        <div className="flex flex-1">
          <Showcase />
          <main className="flex flex-1 shrink-0 flex-col items-center justify-center px-4 sm:px-6">
            <div className="w-full max-w-full py-10 sm:w-authPageWidth sm:py-16 lg:py-24">
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
    </div>
  );
}

export default AuthLayout;
