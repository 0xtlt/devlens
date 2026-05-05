export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[tabindex]',
  'summary',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  'audio[controls]',
  'video[controls]',
  'iframe',
].join(',')

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function compactText(s: string, max = 80): string {
  const text = s.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function isHiddenFromAccessibility(el: HTMLElement): boolean {
  if (el.hidden) return true
  if (el.closest('[hidden], [aria-hidden="true"], [inert]')) return true
  const style = getComputedStyle(el)
  if (style.display === 'none') return true
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return true
  return false
}

// Returns true only if the element is actually reachable by keyboard tab.
// Handles disabled, aria-disabled, inert, tabindex=-1, hidden ancestors
// and disabled fieldsets — all cases CSS selectors alone can't cover.
export function isTabbable(el: HTMLElement): boolean {
  const tabindexAttr = el.getAttribute('tabindex')
  if (tabindexAttr !== null && parseInt(tabindexAttr, 10) < 0) return false

  if ('disabled' in el && (el as HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement).disabled) return false

  const disabledFieldset = el.closest('fieldset[disabled]')
  if (disabledFieldset) {
    const firstLegend = disabledFieldset.querySelector(':scope > legend:first-of-type')
    if (!firstLegend || !firstLegend.contains(el)) return false
  }

  if (el.getAttribute('aria-disabled') === 'true') return false
  if (el.closest('[aria-hidden="true"], [inert]')) return false

  const style = getComputedStyle(el)
  if (style.display === 'none') return false
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false
  if (el.offsetParent === null && style.position !== 'fixed') return false

  return true
}

export function getFocusableElements(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((el) => !el.closest('#devlens') && !el.closest('[data-devlens]') && isTabbable(el))
}

export function getTabOrderMap(): Map<HTMLElement, number> {
  const map = new Map<HTMLElement, number>()
  getFocusableElements(document).forEach((el, idx) => map.set(el, idx + 1))
  return map
}

export function getImplicitRole(el: HTMLElement): string | null {
  const tag = el.tagName.toLowerCase()
  if (/^h[1-6]$/.test(tag)) return 'heading'

  switch (tag) {
    case 'a':
      return el.hasAttribute('href') ? 'link' : null
    case 'article':
      return 'article'
    case 'aside':
      return 'complementary'
    case 'button':
      return 'button'
    case 'details':
      return 'group'
    case 'dialog':
      return 'dialog'
    case 'fieldset':
      return 'group'
    case 'figure':
      return 'figure'
    case 'footer':
      return el.closest('article, aside, main, nav, section') ? null : 'contentinfo'
    case 'form':
      return el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') ? 'form' : null
    case 'header':
      return el.closest('article, aside, main, nav, section') ? null : 'banner'
    case 'img':
      return 'img'
    case 'input': {
      const type = (el.getAttribute('type') || 'text').toLowerCase()
      if (type === 'checkbox') return 'checkbox'
      if (type === 'radio') return 'radio'
      if (type === 'range') return 'slider'
      if (type === 'number') return 'spinbutton'
      if (type === 'search') return 'searchbox'
      if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button'
      return 'textbox'
    }
    case 'li':
      return 'listitem'
    case 'main':
      return 'main'
    case 'nav':
      return 'navigation'
    case 'ol':
    case 'ul':
      return 'list'
    case 'progress':
      return 'progressbar'
    case 'section':
      return el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') ? 'region' : null
    case 'select':
      return (el as HTMLSelectElement).multiple ? 'listbox' : 'combobox'
    case 'textarea':
      return 'textbox'
    default:
      return null
  }
}

export function getRole(el: HTMLElement): string | null {
  return el.getAttribute('role') || getImplicitRole(el)
}

function getLabelText(id: string): string {
  const label = document.getElementById(id)
  return label ? compactText(label.textContent || '') : ''
}

export function getAccessibleName(el: HTMLElement): string {
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return compactText(ariaLabel)

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map(getLabelText)
      .filter(Boolean)
      .join(' ')
    if (text) return compactText(text)
  }

  if (el instanceof HTMLImageElement || el instanceof HTMLAreaElement) {
    const alt = el.getAttribute('alt')
    if (alt) return compactText(alt)
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    if (el.id) {
      const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`)
      if (label) return compactText(label.textContent || '')
    }
    const wrappingLabel = el.closest('label')
    if (wrappingLabel) return compactText(wrappingLabel.textContent || '')
    if ('placeholder' in el && el.placeholder) return compactText(el.placeholder)
  }

  const title = el.getAttribute('title')
  if (title) return compactText(title)

  return compactText(el.textContent || '')
}

