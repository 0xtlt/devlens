/**
 * DevLens — lightweight, zero-dependency devtools panel for any web app.
 *
 * Call {@link devlens} once at startup to mount the panel, passing the
 * plugins you want to enable. See the README for the full plugin list.
 */
import { createPanel } from './panel.js'
import { defaultConfig } from './config.js'
import type { DevLensConfig, DevLensPlugin } from './types.js'
import { networkPlugin } from './plugins/network.js'
import { repaintsPlugin } from './plugins/repaints.js'
import { consolePlugin } from './plugins/console.js'
import { a11yTabOrderPlugin } from './plugins/a11y-tab-order.js'
import { a11yClickAuditPlugin } from './plugins/a11y-click-audit.js'
import { a11yAuditPlugin } from './plugins/a11y-audit.js'
import { seoPlugin } from './plugins/seo.js'
import { headingsPlugin } from './plugins/headings.js'

export type { DevLensConfig, DevLensPlugin } from './types.js'
export { networkPlugin } from './plugins/network.js'
export { repaintsPlugin } from './plugins/repaints.js'
export { consolePlugin } from './plugins/console.js'
export { a11yTabOrderPlugin } from './plugins/a11y-tab-order.js'
export { a11yClickAuditPlugin } from './plugins/a11y-click-audit.js'
export { a11yAuditPlugin } from './plugins/a11y-audit.js'
export { seoPlugin } from './plugins/seo.js'
export { headingsPlugin } from './plugins/headings.js'

/**
 * Returns a fresh instance of every built-in plugin, ready to be passed
 * to {@link devlens}. Handy for a one-line setup when you want the full
 * experience without picking plugins individually.
 *
 * @example
 * ```ts
 * import { devlens, allPlugins } from '@0xtlt/devlens'
 * devlens({ plugins: allPlugins() })
 * ```
 */
export function allPlugins(): DevLensPlugin[] {
  return [
    networkPlugin(),
    repaintsPlugin(),
    consolePlugin(),
    a11yAuditPlugin(),
    a11yTabOrderPlugin(),
    a11yClickAuditPlugin(),
    seoPlugin(),
    headingsPlugin(),
  ]
}

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
