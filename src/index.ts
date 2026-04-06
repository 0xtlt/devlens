import { createPanel } from './panel'
import { defaultConfig } from './config'
import type { DevLensConfig } from './types'

export type { DevLensConfig, DevLensPlugin } from './types'

let panelInstance: ReturnType<typeof createPanel> | null = null

export function devlens(userConfig: Partial<DevLensConfig> = {}) {
  if (panelInstance) {
    console.warn('[devlens] Already initialized')
    return panelInstance
  }

  const config: DevLensConfig = { ...defaultConfig, ...userConfig }
  panelInstance = createPanel(config)

  return panelInstance
}

export function destroyDevlens() {
  if (panelInstance) {
    panelInstance.destroy()
    panelInstance = null
  }
}
