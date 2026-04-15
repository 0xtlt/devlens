/**
 * DevLens — lightweight, zero-dependency devtools panel for any web app.
 *
 * Call {@link devlens} once at startup to mount the panel, passing the
 * plugins you want to enable. See the README for the full plugin list.
 */
import { createPanel } from './panel'
import { defaultConfig } from './config'
import type { DevLensConfig } from './types'

export type { DevLensConfig, DevLensPlugin } from './types'
export { networkPlugin } from './plugins/network'
export { repaintsPlugin } from './plugins/repaints'
export { consolePlugin } from './plugins/console'
export { a11yTabOrderPlugin } from './plugins/a11y-tab-order'
export { a11yClickAuditPlugin } from './plugins/a11y-click-audit'
export { a11yAuditPlugin } from './plugins/a11y-audit'
export { seoPlugin } from './plugins/seo'
export { headingsPlugin } from './plugins/headings'

let panelInstance: ReturnType<typeof createPanel> | null = null

/**
 * Mount the DevLens panel on the current page.
 *
 * Only one instance can exist at a time — calling this a second time
 * returns the existing instance and logs a warning.
 *
 * @param userConfig Partial config merged on top of the defaults
 *   (`bottom-right`, closed, `ctrl+shift+d`, no plugins).
 * @returns The panel controller (`open`, `close`, `toggle`, `addPlugin`,
 *   `removePlugin`, `destroy`).
 */
export function devlens(userConfig: Partial<DevLensConfig> = {}) {
  if (panelInstance) {
    console.warn('[devlens] Already initialized')
    return panelInstance
  }

  const config: DevLensConfig = { ...defaultConfig, ...userConfig }
  panelInstance = createPanel(config)

  return panelInstance
}

/** Tear down the current panel and release its singleton slot. */
export function destroyDevlens() {
  if (panelInstance) {
    panelInstance.destroy()
    panelInstance = null
  }
}
