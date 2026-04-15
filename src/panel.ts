/**
 * Panel shell — builds the floating DOM, handles open/close, keyboard
 * shortcut, plugin switching, and persists UI state to sessionStorage.
 */
import type { DevLensConfig, DevLensPlugin } from './types'
import { injectStyles } from './styles'

const STORAGE_KEY = 'devlens'

function loadState(): { open: boolean; tab: string | null } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { open: false, tab: null }
}

function saveState(open: boolean, tab: string | null) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ open, tab }))
  } catch {}
}

export function createPanel(config: DevLensConfig) {
  injectStyles()
  const savedState = loadState()

  const root = document.createElement('div')
  root.id = 'devlens'
  root.className = `devlens devlens--${config.position}`

  const toggle = document.createElement('button')
  toggle.className = 'devlens__toggle'
  toggle.innerHTML = '🔍'
  toggle.title = `DevLens (${config.shortcut})`

  const container = document.createElement('div')
  container.className = 'devlens__container'

  const nav = document.createElement('nav')
  nav.className = 'devlens__nav'

  const content = document.createElement('div')
  content.className = 'devlens__content'

  container.append(nav, content)
  root.append(toggle, container)
  document.body.append(root)

  let isOpen = savedState.open || config.defaultOpen
  let activePlugin: DevLensPlugin | null = null

  function updateVisibility() {
    container.classList.toggle('devlens__container--open', isOpen)
    toggle.classList.toggle('devlens__toggle--active', isOpen)
    saveState(isOpen, activePlugin?.name ?? null)
  }

  function unmountActive() {
    if (!activePlugin) return
    // Clear any intervals the plugin registered via the data-interval convention.
    // Without this, switching tabs leaks a new interval every time.
    content.querySelectorAll<HTMLElement>('[data-interval]').forEach((el) => {
      const id = Number(el.getAttribute('data-interval'))
      if (id) clearInterval(id)
    })
    activePlugin.onUnmount?.()
  }

  function showPlugin(plugin: DevLensPlugin) {
    unmountActive()

    content.innerHTML = ''
    const result = plugin.panel()
    if (typeof result === 'string') {
      content.innerHTML = result
    } else {
      content.append(result)
    }

    if (plugin.onMount) plugin.onMount(content)
    activePlugin = plugin
    saveState(isOpen, plugin.name)

    nav.querySelectorAll('.devlens__nav-item').forEach((el) => {
      el.classList.toggle('devlens__nav-item--active', el.getAttribute('data-plugin') === plugin.name)
    })
  }

  function renderNav() {
    nav.innerHTML = ''
    for (const plugin of config.plugins) {
      const btn = document.createElement('button')
      btn.className = 'devlens__nav-item'
      btn.setAttribute('data-plugin', plugin.name)
      btn.textContent = plugin.icon ? `${plugin.icon} ${plugin.name}` : plugin.name
      btn.addEventListener('click', () => showPlugin(plugin))
      nav.append(btn)
    }
  }

  toggle.addEventListener('click', () => {
    isOpen = !isOpen
    updateVisibility()
  })

  document.addEventListener('keydown', (e) => {
    const parts = config.shortcut.split('+')
    const key = parts.pop()!
    const needCtrl = parts.includes('ctrl')
    const needShift = parts.includes('shift')
    const needAlt = parts.includes('alt')

    if (
      e.key.toLowerCase() === key.toLowerCase() &&
      e.ctrlKey === needCtrl &&
      e.shiftKey === needShift &&
      e.altKey === needAlt
    ) {
      e.preventDefault()
      isOpen = !isOpen
      updateVisibility()
    }
  })

  renderNav()
  updateVisibility()

  const restoredPlugin = savedState.tab && config.plugins.find((p) => p.name === savedState.tab)
  showPlugin(restoredPlugin || config.plugins[0])

  return {
    addPlugin(plugin: DevLensPlugin) {
      config.plugins.push(plugin)
      renderNav()
      if (config.plugins.length === 1) showPlugin(plugin)
    },

    removePlugin(name: string) {
      const idx = config.plugins.findIndex((p) => p.name === name)
      if (idx === -1) return
      if (activePlugin?.name === name) {
        unmountActive()
        activePlugin = null
        content.innerHTML = ''
      }
      config.plugins.splice(idx, 1)
      renderNav()
    },

    open() {
      isOpen = true
      updateVisibility()
    },

    close() {
      isOpen = false
      updateVisibility()
    },

    toggle() {
      isOpen = !isOpen
      updateVisibility()
    },

    destroy() {
      unmountActive()
      root.remove()
    },
  }
}
