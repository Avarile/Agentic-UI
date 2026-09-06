// Layout for the pre-session pages: login, register, 2FA, password reset.
//
// Owns the state those forms share (`error`, `headerText`, `startupConfig`) and
// passes it down through the router's `Outlet context` rather than a provider,
// since the consumers are all direct route children.
//
// The header is chosen by pathname via `headerMap` so each form does not have to
// set its own title, and `error`/`headerText` reset on navigation — otherwise a
// failed login's message would follow the user to the register page.
//
// The redirect-to-`/c/new` on an already-authenticated visit is suppressed when a
// pending redirect exists (query param or session key), so an interrupted deep
// link still wins over the default landing.

import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { DEFAULT_APP_TITLE } from 'librechat-data-provider';
import type { TStartupConfig } from 'librechat-data-provider';
import { TranslationKeys, useLocalize } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import AuthLayout from '~/components/Auth/AuthLayout';
import { REDIRECT_PARAM, SESSION_KEY } from '~/utils';

const headerMap: Record<string, TranslationKeys> = {
  '/login': 'com_auth_welcome_back',
  '/register': 'com_auth_create_account',
  '/forgot-password': 'com_auth_reset_password',
  '/reset-password': 'com_auth_reset_password',
  '/login/2fa': 'com_auth_verify_your_identity',
};

export default function StartupLayout({ isAuthenticated }: { isAuthenticated?: boolean }) {
  const [error, setError] = useState<TranslationKeys | null>(null);
  const [headerText, setHeaderText] = useState<TranslationKeys | null>(null);
  const [startupConfig, setStartupConfig] = useState<TStartupConfig | null>(null);
  const {
    data,
    isFetching,
    error: startupConfigError,
  } = useGetStartupConfig({
    enabled: isAuthenticated ? startupConfig === null : true,
  });
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      const hasPendingRedirect =
        new URLSearchParams(window.location.search).has(REDIRECT_PARAM) ||
        sessionStorage.getItem(SESSION_KEY) != null;
      if (!hasPendingRedirect) {
        navigate('/c/new', { replace: true });
      }
    }
    if (data) {
      setStartupConfig(data);
    }
  }, [isAuthenticated, navigate, data]);

  useEffect(() => {
    document.title = startupConfig?.appTitle || DEFAULT_APP_TITLE;
  }, [startupConfig?.appTitle]);

  useEffect(() => {
    setError(null);
    setHeaderText(null);
  }, [location.pathname]);

  const contextValue = {
    error,
    setError,
    headerText,
    setHeaderText,
    startupConfigError,
    startupConfig,
    isFetching,
  };

  return (
    <AuthLayout
      header={headerText ? localize(headerText) : localize(headerMap[location.pathname])}
      isFetching={isFetching}
      startupConfig={startupConfig}
      startupConfigError={startupConfigError}
      pathname={location.pathname}
      error={error}
    >
      <Outlet context={contextValue} />
    </AuthLayout>
  );
}
