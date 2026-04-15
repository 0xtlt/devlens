/**
 * A DevLens plugin. Each plugin contributes a single tab to the panel.
 *
 * Lifecycle: `panel()` is called once per tab activation to produce the
 * tab content. Then `onMount(container)` runs with the element that wraps
 * that content, and `onUnmount()` runs when the user switches to another
 * tab or the panel is destroyed.
 *
 * Side-effect conventions:
 * - If a plugin needs periodic refresh, it may expose the interval id via
 *   `container.setAttribute('data-interval', String(id))` — the panel will
 *   clear it automatically on unmount. Alternatively the plugin can keep
 *   the id in a closure and clear it inside `onUnmount`.
 * - Overlays the plugin adds to `document.body` should carry a
 *   `data-devlens` attribute so other plugins (e.g. repaints) ignore them.
 */
export interface DevLensPlugin {
  /** Unique, human-readable name shown in the tab bar. */
  name: string
  /** Optional emoji or short string rendered before the name. */
  icon?: string
  /** Builds the tab content. Called on every activation. */
  panel: () => HTMLElement | string
  /** Runs after the panel content is attached to the DOM. */
  onMount?: (container: HTMLElement) => void
  /** Runs when leaving the tab. Should release any resources the plugin owns. */
  onUnmount?: () => void
}

/** Runtime configuration for a DevLens instance. */
export interface DevLensConfig {
  /** Panel anchor on the viewport. */
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
  /** Open the panel on first load (otherwise only the toggle button shows). */
  defaultOpen: boolean
  /** Keyboard shortcut that toggles the panel (e.g. `ctrl+shift+d`). */
  shortcut: string
  /** Plugins to register, in display order. */
  plugins: DevLensPlugin[]
}
