/** Default config merged on top of whatever the user passes to `devlens()`. */
import type { DevLensConfig } from './types.js'

export const defaultConfig: DevLensConfig = {
  position: 'bottom-right',
  defaultOpen: false,
  shortcut: 'ctrl+shift+d',
  plugins: [],
}
