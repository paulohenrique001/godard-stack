import type { Theme } from '../../api'

const THEME_STORAGE_KEY = 'godard-stack.theme'

export function systemTheme(): Theme {
  try {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  } catch {
    return 'light'
  }
}

export function resolveTheme(theme: Theme | 'system'): Theme {
  return theme === 'system' ? systemTheme() : theme
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    return
  }
}

export function applyMotion() {
  document.documentElement.classList.toggle(
    'reduce-motion',
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  document.documentElement.classList.remove('full-motion')
}
