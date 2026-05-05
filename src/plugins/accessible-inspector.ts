/**
 * Accessible Inspector plugin — lets you pick an element on the page and
 * inspect a DOM-derived accessibility tree for the selected subtree.
 */
import type { DevLensPlugin } from '../types.js'
import {
  compactText,
  escapeHtml,
  getAccessibleName,
  getRole,
  getTabOrderMap,
  isHiddenFromAccessibility,
} from './a11y-utils.js'

const MAX_TREE_NODES = 300

interface TreeRenderState {
  count: number
  truncated: boolean
}

function elementLabel(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  const classes = typeof el.className === 'string' && el.className
    ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`
    : ''
  return `<${tag}${id}${classes}>`
}

function elementPath(el: HTMLElement): string {
  const parts: string[] = []
  let current: HTMLElement | null = el
  while (current && current !== document.body && parts.length < 4) {
    parts.unshift(elementLabel(current))
    current = current.parentElement
  }
  return parts.join(' › ') || elementLabel(el)
}

function stateBadges(el: HTMLElement, tabOrder: Map<HTMLElement, number>): string[] {
  const badges: string[] = []
  const role = getRole(el)
  const name = getAccessibleName(el)
  const tabIndex = tabOrder.get(el)
  const level = /^h[1-6]$/i.test(el.tagName) ? el.tagName[1] : el.getAttribute('aria-level')

  if (role) badges.push(`role=${role}`)
  if (name) badges.push(`name="${name}"`)
  if (tabIndex) badges.push(`tab #${tabIndex}`)
  if (level && role === 'heading') badges.push(`level=${level}`)
  if (isHiddenFromAccessibility(el)) badges.push('hidden')
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') badges.push('disabled')
  if (el.getAttribute('aria-selected')) badges.push(`selected=${el.getAttribute('aria-selected')}`)
  if (el.getAttribute('aria-expanded')) badges.push(`expanded=${el.getAttribute('aria-expanded')}`)
  if (el.getAttribute('aria-checked')) badges.push(`checked=${el.getAttribute('aria-checked')}`)
  if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)) badges.push(`checked=${el.checked}`)

  return badges
}

function renderBadges(badges: string[]): string {
  return badges.map((badge) => {
    const isWarning = badge === 'hidden' || badge === 'disabled'
    const isTab = badge.startsWith('tab #')
    const color = isWarning ? '#f0a030' : isTab ? '#4caf50' : '#4ea8de'
    return `<span style="
      display:inline-flex;align-items:center;max-width:190px;
      padding:1px 5px;border:1px solid ${color};border-radius:3px;
      color:${color};font-size:10px;line-height:1.4;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    ">${escapeHtml(badge)}</span>`
  }).join('')
}

function renderTreeNode(el: HTMLElement, depth: number, tabOrder: Map<HTMLElement, number>, state: TreeRenderState): string {
  if (state.count >= MAX_TREE_NODES) {
    state.truncated = true
    return ''
  }

  state.count++
  const label = elementLabel(el)
  const badges = stateBadges(el, tabOrder)
  const text = compactText(
    [...el.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || '')
      .join(' '),
    70,
  )
  const textPreview = text
    ? `<span style="color:#8a8a9a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(text)}</span>`
    : ''
  const opacity = isHiddenFromAccessibility(el) ? '0.55' : '1'
  const children = [...el.children]
    .filter((child): child is HTMLElement => child instanceof HTMLElement && !child.closest('#devlens') && !child.closest('[data-devlens]'))
    .map((child) => renderTreeNode(child, depth + 1, tabOrder, state))
    .join('')

  return `
    <div style="margin-left:${depth * 14}px;opacity:${opacity};">
      <div style="
        display:flex;align-items:center;gap:6px;min-width:0;
        padding:4px 6px;margin-bottom:3px;border-radius:4px;background:#1a1a2e;
        border-left:2px solid ${badges.some((b) => b.startsWith('tab #')) ? '#4caf50' : '#0f3460'};
      ">
        <code style="color:#e0e0e0;font-size:11px;white-space:nowrap;">${escapeHtml(label)}</code>
        <span style="display:flex;gap:4px;min-width:0;flex-wrap:wrap;">${renderBadges(badges)}</span>
        ${textPreview}
      </div>
      ${children}
    </div>
  `
}

function modalStyles(): string {
  return `
    position:fixed;inset:0;z-index:1000000;
    background:rgba(0,0,0,0.45);
    display:flex;align-items:center;justify-content:center;
    padding:24px;font-family:var(--dl-font, ui-monospace, monospace);
  `
}

export function accessibleInspectorPlugin(): DevLensPlugin {
  let panelRoot: HTMLElement | null = null
  let selecting = false
  let hovered: HTMLElement | null = null
  let lastSelected: HTMLElement | null = null
  let hoverOverlay: HTMLElement | null = null
  let modal: HTMLElement | null = null

  function renderPanel() {
    if (!panelRoot) return
    const selectedText = lastSelected && document.body.contains(lastSelected)
      ? escapeHtml(elementPath(lastSelected))
      : 'No element inspected yet.'
    const actionLabel = selecting ? 'Cancel selection' : 'Start selecting'
    const actionColor = selecting ? '#e94560' : '#4caf50'
    const lastAction = lastSelected && document.body.contains(lastSelected)
      ? `<button id="devlens-inspect-open-last" style="
          padding:4px 10px;border:1px solid #0f3460;border-radius:4px;cursor:pointer;
          font-family:var(--dl-font);font-size:11px;background:transparent;color:#8a8a9a;
        ">Open last</button>`
      : ''

    panelRoot.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;">
        <span style="font-size:12px;color:#8a8a9a;">${selecting ? 'Hover and click an element on the page' : 'Inspect a DOM-derived accessibility tree'}</span>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          ${lastAction}
          <button id="devlens-inspect-toggle" style="
            padding:4px 12px;border-radius:4px;cursor:pointer;
            font-family:var(--dl-font);font-size:12px;font-weight:600;
            background:${selecting ? '#3a1a1a' : '#1a3a1a'};
            color:${actionColor};border:1px solid ${actionColor};
          ">${actionLabel}</button>
        </div>
      </div>

      <div style="padding:8px 10px;background:#16213e;border-radius:4px;margin-bottom:10px;font-size:12px;">
        <div style="color:#8a8a9a;margin-bottom:4px;">Last inspected</div>
        <code style="display:block;color:#e0e0e0;word-break:break-word;">${selectedText}</code>
      </div>

      <div style="font-size:11px;color:#8a8a9a;line-height:1.5;">
        The tree is derived from the DOM: explicit or implicit role, approximate accessible name, ARIA states, hidden state and global tab order.
      </div>
    `

    panelRoot.querySelector('#devlens-inspect-toggle')?.addEventListener('click', () => {
      if (selecting) cancelSelection()
      else startSelection()
    })
    panelRoot.querySelector('#devlens-inspect-open-last')?.addEventListener('click', () => {
      if (lastSelected && document.body.contains(lastSelected)) openModal(lastSelected)
      else renderPanel()
    })
  }

  function ensureHoverOverlay(): HTMLElement {
    if (hoverOverlay && document.body.contains(hoverOverlay)) return hoverOverlay
    hoverOverlay = document.createElement('div')
    hoverOverlay.id = 'devlens-inspect-hover'
    hoverOverlay.setAttribute('data-devlens', '')
    hoverOverlay.style.cssText = `
      position:fixed;z-index:999998;pointer-events:none;display:none;
      border:2px solid #4ea8de;border-radius:4px;
      background:rgba(78,168,222,0.14);
      box-shadow:0 0 0 9999px rgba(0,0,0,0.08), 0 0 18px rgba(78,168,222,0.55);
    `
    document.body.append(hoverOverlay)
    return hoverOverlay
  }

  function updateHoverOverlay(target: HTMLElement | null) {
    const overlay = ensureHoverOverlay()
    if (!target) {
      overlay.style.display = 'none'
      return
    }

    const rect = target.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      overlay.style.display = 'none'
      return
    }

    overlay.style.display = 'block'
    overlay.style.left = `${rect.left}px`
    overlay.style.top = `${rect.top}px`
    overlay.style.width = `${rect.width}px`
    overlay.style.height = `${rect.height}px`
  }

  function targetFromPoint(x: number, y: number): HTMLElement | null {
    const target = document.elementFromPoint(x, y)
    if (!(target instanceof HTMLElement)) return null
    if (target.closest('#devlens') || target.closest('[data-devlens]')) return null
    return target
  }

  function onPointerMove(e: PointerEvent) {
    if (!selecting) return
    hovered = targetFromPoint(e.clientX, e.clientY)
    updateHoverOverlay(hovered)
  }

  function onClick(e: MouseEvent) {
    if (!selecting) return
    const target = targetFromPoint(e.clientX, e.clientY)
    if (!target) return
    e.preventDefault()
    e.stopPropagation()
    lastSelected = target
    stopSelection()
    openModal(target)
    renderPanel()
  }

  function onSelectionKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') cancelSelection()
  }

  function startSelection() {
    closeModal()
    if (selecting) return
    selecting = true
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onSelectionKeydown, true)
    ensureHoverOverlay()
    renderPanel()
  }

  function stopSelection() {
    if (!selecting) return
    selecting = false
    hovered = null
    document.removeEventListener('pointermove', onPointerMove, true)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', onSelectionKeydown, true)
    hoverOverlay?.remove()
    hoverOverlay = null
  }

  function cancelSelection() {
    stopSelection()
    renderPanel()
  }

  function closeModal() {
    modal?.remove()
    modal = null
    document.removeEventListener('keydown', onModalKeydown, true)
  }

  function onModalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeModal()
  }

  function openModal(target: HTMLElement) {
    closeModal()
    const tabOrder = getTabOrderMap()
    const treeState: TreeRenderState = { count: 0, truncated: false }
    const rootRole = getRole(target) || 'none'
    const rootName = getAccessibleName(target) || '(none)'
    const rootTab = tabOrder.get(target)
    const treeHtml = renderTreeNode(target, 0, tabOrder, treeState)
    const truncated = treeState.truncated
      ? `<div style="margin-top:8px;padding:8px 10px;background:#3a2e1a;border-left:3px solid #f0a030;border-radius:4px;color:#8a8a9a;font-size:12px;">
          Tree truncated after ${MAX_TREE_NODES} nodes.
        </div>`
      : ''

    modal = document.createElement('div')
    modal.id = 'devlens-inspect-modal'
    modal.setAttribute('data-devlens', '')
    modal.style.cssText = modalStyles()
    modal.innerHTML = `
      <div role="dialog" aria-modal="true" aria-label="Accessible tree" style="
        width:min(920px, calc(100vw - 48px));max-height:min(760px, calc(100vh - 48px));
        display:flex;flex-direction:column;background:#1a1a2e;color:#e0e0e0;
        border:1px solid #0f3460;border-radius:8px;box-shadow:0 18px 70px rgba(0,0,0,0.55);
        overflow:hidden;
      ">
        <div style="
          display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
          padding:12px 14px;background:#16213e;border-bottom:1px solid #0f3460;
        ">
          <div style="min-width:0;">
            <div style="font-size:12px;color:#8a8a9a;margin-bottom:4px;">Accessible tree</div>
            <code style="display:block;color:#e0e0e0;font-size:12px;word-break:break-word;">${escapeHtml(elementPath(target))}</code>
          </div>
          <button id="devlens-inspect-close" style="
            width:28px;height:28px;border:1px solid #0f3460;border-radius:4px;cursor:pointer;
            background:#1a1a2e;color:#e0e0e0;font-family:var(--dl-font);font-size:16px;line-height:1;
            flex-shrink:0;
          " title="Close">×</button>
        </div>

        <div style="padding:12px 14px;border-bottom:1px solid #0f3460;display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:8px;font-size:12px;">
          <div><div style="color:#8a8a9a;">Root</div><code>${escapeHtml(elementLabel(target))}</code></div>
          <div><div style="color:#8a8a9a;">Role</div><code>${escapeHtml(rootRole)}</code></div>
          <div><div style="color:#8a8a9a;">Name</div><code>${escapeHtml(rootName)}</code></div>
          <div><div style="color:#8a8a9a;">Tab order</div><code>${rootTab ? `#${rootTab}` : 'not focusable'}</code></div>
        </div>

        <div style="padding:12px 14px;overflow:auto;min-height:180px;">
          ${treeHtml}
          ${truncated}
        </div>
      </div>
    `

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal()
    })
    document.body.append(modal)
    document.addEventListener('keydown', onModalKeydown, true)
    modal.querySelector<HTMLElement>('#devlens-inspect-close')?.addEventListener('click', closeModal)
    modal.querySelector<HTMLElement>('#devlens-inspect-close')?.focus()
  }

  function deactivate() {
    stopSelection()
    closeModal()
    renderPanel()
  }

  return {
    name: 'Inspect',
    icon: '🧭',

    panel() {
      const el = document.createElement('div')
      el.className = 'devlens-inspect'
      return el
    },

    onMount(container) {
      panelRoot = container.querySelector('.devlens-inspect') as HTMLElement
      renderPanel()
    },

    onUnmount() {
      panelRoot = null
    },

    deactivate,
  }
}
