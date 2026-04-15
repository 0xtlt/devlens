# DevLens

A lightweight, zero-dependency devtools panel you can drop into any web app. It gives you a floating tab bar with live plugins for network inspection, repaint tracking, console mirroring, accessibility auditing, SEO checks and heading outlines — without touching browser devtools.

Built in vanilla TypeScript. No runtime dependencies. ~20 KB gzipped for the full bundle.

## Install

```bash
npm install devlens
# or
bun add devlens
```

## Quick start

```ts
import {
  devlens,
  networkPlugin,
  repaintsPlugin,
  consolePlugin,
  a11yAuditPlugin,
  a11yTabOrderPlugin,
  a11yClickAuditPlugin,
  seoPlugin,
  headingsPlugin,
} from 'devlens'

devlens({
  plugins: [
    networkPlugin(),
    repaintsPlugin(),
    consolePlugin(),
    a11yAuditPlugin(),
    a11yTabOrderPlugin(),
    a11yClickAuditPlugin(),
    seoPlugin(),
    headingsPlugin(),
  ],
})
```

The panel mounts in the bottom-right corner. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> or click the 🔍 button to open it.

Only load DevLens in development — it mutates the DOM and patches a few globals (`console.error`, `console.warn`, `addEventListener`). A common pattern:

```ts
if (import.meta.env.DEV) {
  const { devlens, consolePlugin /* … */ } = await import('devlens')
  devlens({ plugins: [consolePlugin()] })
}
```

## Plugins

Each plugin is a factory — call it to get a plugin instance, pass the result to `devlens({ plugins: [...] })`.

| Factory | Tab | What it does |
| --- | --- | --- |
| `networkPlugin()` | 🌐 Network | Reads `performance.getEntriesByType('resource')` to list requests, group by domain, and flag slow / oversized transfers. Read-only — does not patch `fetch`. |
| `repaintsPlugin()` | 🎨 Repaints | Watches `MutationObserver` events and draws a canvas overlay that highlights frequently-mutating elements. Color ramps from teal (x1–2) to red (x15+). |
| `consolePlugin()` | 🚨 Console | Hooks `console.error`, `console.warn`, `window.onerror` and `unhandledrejection`; mirrors them as toasts (when active) and keeps the last 50 entries. |
| `a11yAuditPlugin()` | ♿ A11y Audit | DOM audit for missing `lang`, heading skips, unlabeled inputs, empty links or buttons, duplicate ids, autoplaying media and more. Draws dashed overlays on offenders. |
| `a11yTabOrderPlugin()` | 🔢 Tab Order | Numbers every focusable element in the order the keyboard will visit them, making tab traps and positive `tabindex` values obvious. |
| `a11yClickAuditPlugin()` | 👆 Click Audit | Flags clicks that land on non-semantic elements (`div`, `span`, `img`) carrying click handlers but no `role` + `tabindex`. |
| `seoPlugin()` | 🔍 SEO | Checks title length, meta description, Open Graph (ogp.me required + recommended), Twitter Card, canonical, robots, charset, viewport, hreflang and JSON-LD. |
| `headingsPlugin()` | 🗂 Headings | Renders the h1–h6 outline. Flags level skips, empty headings, missing / multiple h1, hidden headings. Click a row to scroll + flash the element on the page. |

You can also define plugins inline — anything matching the `DevLensPlugin` interface works:

```ts
devlens({
  plugins: [
    {
      name: 'Info',
      icon: '📋',
      panel: () => `<div>URL: ${location.href}</div>`,
    },
  ],
})
```

## API

### `devlens(config?)`

Mount the panel. Only one instance can exist at a time — a second call logs a warning and returns the existing instance.

```ts
function devlens(config?: Partial<DevLensConfig>): PanelController
```

**Config**

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `position` | `'bottom-left' \| 'bottom-right' \| 'top-left' \| 'top-right'` | `'bottom-right'` | Panel anchor on the viewport. |
| `defaultOpen` | `boolean` | `false` | Open the panel on first load instead of just showing the toggle. |
| `shortcut` | `string` | `'ctrl+shift+d'` | Keyboard shortcut — `ctrl`, `shift`, `alt` modifiers plus a single key. |
| `plugins` | `DevLensPlugin[]` | `[]` | Plugins to register, in tab order. |

**Returned controller**

```ts
interface PanelController {
  addPlugin(plugin: DevLensPlugin): void
  removePlugin(name: string): void
  open(): void
  close(): void
  toggle(): void
  destroy(): void
}
```

### `destroyDevlens()`

Tear down the current panel and release the singleton slot so `devlens()` can be called again.

### `DevLensPlugin`

```ts
interface DevLensPlugin {
  name: string
  icon?: string
  panel: () => HTMLElement | string
  onMount?: (container: HTMLElement) => void
  onUnmount?: () => void
}
```

**Lifecycle.** `panel()` is called once each time the tab becomes active and must return the tab's content (element or HTML string). `onMount(container)` runs right after the content is attached, with `container` pointing at the wrapper element. `onUnmount()` runs when the user switches to another tab or the panel is destroyed — release any listeners, intervals or overlays there.

**Interval convention.** If your plugin uses `setInterval` for periodic refresh, set the id on a DOM node you own:

```ts
const id = setInterval(render, 3000)
container.setAttribute('data-interval', String(id))
```

The panel clears every `[data-interval]` descendant on unmount, so you don't have to.

**Overlay convention.** Any element your plugin adds to `document.body` should carry a `data-devlens` attribute. Other plugins (notably Repaints and A11y Audit) use it to ignore their own internals and avoid feedback loops.

## Development

```bash
bun install
bun run dev      # Vite dev server with the playground at index.html
bun run check    # TypeScript type-check
bun run build    # library build (ESM + CJS + d.ts) to dist/
```

The `dev/` folder holds the playground (`dev/main.ts`) that registers every plugin against `index.html` for manual testing.

### Project layout

```
src/
  index.ts         Public entry — exports devlens() and every plugin factory
  panel.ts         Panel shell, tab switching, keyboard shortcut
  styles.ts        Injected CSS for the panel chrome
  toasts.ts        Top-right toast notifications used by plugins
  types.ts         DevLensPlugin + DevLensConfig
  config.ts        Default config
  plugins/
    network.ts
    repaints.ts
    console.ts
    a11y-audit.ts
    a11y-tab-order.ts
    a11y-click-audit.ts
    seo.ts
    headings.ts
```

### Writing a new plugin

1. Create `src/plugins/my-plugin.ts` that exports a factory returning a `DevLensPlugin`.
2. Export it from `src/index.ts`.
3. Register it in `dev/main.ts` so the playground picks it up.
4. Follow the existing patterns: vanilla DOM, inline styles, `data-devlens` on overlays, `data-interval` on your refresh loop.

### Conventions

- Zero runtime dependencies. Keep it that way — the whole point is that DevLens drops into any project without dragging a graph behind it.
- Vanilla DOM only. No framework, no JSX, no shadow DOM.
- Plugins must be safe to register multiple times across hot reloads. Use `localStorage` / `sessionStorage` for any state that should survive a refresh.
- Never throw from a plugin. Swallow errors and surface them as warnings in the tab.

## License

MIT
