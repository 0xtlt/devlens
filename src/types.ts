export interface DevLensPlugin {
  name: string
  icon?: string
  panel: () => HTMLElement | string
  onMount?: (container: HTMLElement) => void
  onUnmount?: () => void
}

export interface DevLensConfig {
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
  defaultOpen: boolean
  shortcut: string
  plugins: DevLensPlugin[]
}
