// The settings dialog shell, hosting the tab groups under SettingsTabs.

import type { TDialogProps } from '~/common';
import { SettingsDialog } from './Settings/index';

export default function Settings(props: TDialogProps) {
  return <SettingsDialog {...props} />;
}
