// The build entry that emits the bootstrap script as its own asset.

import { installRumBootstrap } from './bootstrap';

try {
  installRumBootstrap(window);
} catch {
  /* Diagnostics should never affect application startup. */
}
