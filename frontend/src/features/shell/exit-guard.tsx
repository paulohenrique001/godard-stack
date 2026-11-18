import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'

type ExitGuardContextValue = {
  register: (key: string, blocked: boolean) => void
  isBlocked: () => boolean
}

const ExitGuardContext = createContext<ExitGuardContextValue>({
  register: () => {},
  isBlocked: () => false,
})

export function ExitGuardProvider({ children }: { children: ReactNode }) {
  const guards = useRef<Map<string, boolean>>(new Map())

  const register = useCallback((key: string, blocked: boolean) => {
    if (blocked) guards.current.set(key, true)
    else guards.current.delete(key)
  }, [])

  const isBlocked = useCallback(() => guards.current.size > 0, [])

  return (
    <ExitGuardContext.Provider value={{ register, isBlocked }}>
      {children}
    </ExitGuardContext.Provider>
  )
}

export function useExitGuard(key: string, blocked: boolean) {
  const { register } = useContext(ExitGuardContext)
  useEffect(() => {
    register(key, blocked)
    return () => register(key, false)
  }, [key, blocked, register])
}

export function useIsExitBlocked() {
  return useContext(ExitGuardContext).isBlocked
}
