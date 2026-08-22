// The app-local UI primitives.
//
// Deliberately thin: shared primitives live in `@librechat/client`, and per the
// project's styling rules a component belongs here only when it is a genuine
// addition to the system rather than a wrapper relocating class strings. What is
// here is branding (Brand, OrbitMark), panel scaffolding, and a few dialogs with no
// upstream equivalent.

export { Button } from '@librechat/client';
export { default as Brand } from './Brand';
export { default as Collapse } from './Collapse';
export { default as OrbitMark } from './OrbitMark';
export { default as PanelFooter } from './PanelFooter';
export { default as PanelContent } from './PanelContent';
export { default as TermsAndConditionsModal } from './TermsAndConditionsModal';
export { default as AdminSettingsDialog } from './AdminSettingsDialog';
export type { PermissionConfig, AdminSettingsDialogProps } from './AdminSettingsDialog';
