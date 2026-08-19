import { loginPage, registerPage } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const tabClassName =
  'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary';
const activeTabClassName = 'bg-surface-primary text-text-primary shadow-sm';
const inactiveTabClassName = 'text-text-secondary hover:text-text-primary';

export default function AuthTabs({ pathname }: { pathname: string }) {
  const localize = useLocalize();
  const isRegister = pathname.includes('register');

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border-light bg-surface-tertiary p-1">
      <a
        href={loginPage()}
        aria-current={isRegister ? undefined : 'page'}
        className={cn(tabClassName, isRegister ? inactiveTabClassName : activeTabClassName)}
      >
        {localize('com_auth_sign_in')}
      </a>
      <a
        href={registerPage()}
        aria-current={isRegister ? 'page' : undefined}
        className={cn(tabClassName, isRegister ? activeTabClassName : inactiveTabClassName)}
      >
        {localize('com_auth_sign_up')}
      </a>
    </div>
  );
}
