/** Default config merged on top of whatever the user passes to `devlens()`. */
import type { DevLensConfig } from './types'

export const defaultConfig: DevLensConfig = {
  position: 'bottom-right',
  defaultOpen: false,
  shortcut: 'ctrl+shift+d',
  plugins: [],
}
