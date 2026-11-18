import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export const REFRESH_INTERVALS = [0, 30_000, 60_000, 120_000] as const
export type RefreshInterval = typeof REFRESH_INTERVALS[number]

const DEFAULT_REFRESH_INTERVAL: RefreshInterval = 60_000
const STORAGE_KEY = 'godard-stack.refresh-interval'

type SettingsContextValue = {
  refreshInterval: RefreshInterval
  setRefreshInterval: (interval: RefreshInterval) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function isRefreshInterval(value: number): value is RefreshInterval {
  return REFRESH_INTERVALS.includes(value as RefreshInterval)
}

function readRefreshInterval(): RefreshInterval {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return isRefreshInterval(stored) ? stored : DEFAULT_REFRESH_INTERVAL
  } catch {
    return DEFAULT_REFRESH_INTERVAL
  }
}

function storeRefreshInterval(interval: RefreshInterval) {
  try {
    localStorage.setItem(STORAGE_KEY, String(interval))
  } catch {
    // A preferência continua ativa enquanto esta aba estiver aberta.
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [refreshInterval, setRefreshIntervalState] = useState<RefreshInterval>(readRefreshInterval)

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setRefreshIntervalState(readRefreshInterval())
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const value = useMemo(
    () => ({
      refreshInterval,
      setRefreshInterval: (interval: RefreshInterval) => {
        setRefreshIntervalState(interval)
        storeRefreshInterval(interval)
      },
    }),
    [refreshInterval],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings precisa estar dentro de SettingsProvider')
  }
  return context
}
