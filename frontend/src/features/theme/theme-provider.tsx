import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'godard-stack-theme-choice'

type ThemeContextValue = {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : null
  } catch {
    return null
  }
}

function readDeviceTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    return
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme() ?? readDeviceTheme())

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const value = useMemo(() => {
    const applyTheme = (nextTheme: Theme) => {
      const switchTheme = () => setTheme(nextTheme)
      storeTheme(nextTheme)
      if (document.startViewTransition && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        document.startViewTransition(() => flushSync(switchTheme))
      } else {
        switchTheme()
      }
    }
    return {
      theme,
      setTheme: applyTheme,
      toggleTheme: () => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark'
        applyTheme(nextTheme)
      },
    }
  }, [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme precisa estar dentro de ThemeProvider')
  }
  return context
}
