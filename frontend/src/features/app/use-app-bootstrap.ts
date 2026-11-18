import { useCallback, useEffect, useRef, useState } from 'react'
import type { Bootstrap, RuntimeStatus, UserPreferences, UserProfile } from '../../api'
import {
  clearActivities,
  fetchBootstrap,
  fetchDashboard,
  retryRuntime,
  runtimeStatus,
  savePreferences,
  saveProfile,
} from '../../api'
import { applyMotion, applyTheme, resolveTheme, systemTheme } from '../preferences/theme'

export function useAppBootstrap() {
  const [runtime, setRuntime] = useState<RuntimeStatus>({ status: 'starting' })
  const [state, setState] = useState<Bootstrap | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const dashboardRefreshInFlight = useRef(false)

  useEffect(() => {
    let cancelled = false
    let timeout: number | undefined
    const load = async () => {
      try {
        const nextRuntime = await runtimeStatus()
        if (cancelled) return
        setRuntime((current) => (sameRuntime(current, nextRuntime) ? current : nextRuntime))
        if (nextRuntime.status !== 'ready') {
          timeout = window.setTimeout(() => void load(), 700)
          return
        }
        const bootstrap = await fetchBootstrap(nextRuntime)
        const preferences =
          bootstrap.preferences.theme === 'system'
            ? { ...bootstrap.preferences, theme: systemTheme() }
            : bootstrap.preferences
        if (!cancelled) {
          setState({ ...bootstrap, preferences })
          setError(null)
          if (bootstrap.preferences.theme === 'system') {
            void savePreferences(nextRuntime, preferences).catch(() => undefined)
          }
        }
      } catch (failure) {
        if (!cancelled) {
          setRuntime({ status: 'failed', message: 'Não foi possível iniciar o serviço local.' })
          setError(failure instanceof Error ? failure.message : 'Falha desconhecida.')
        }
      }
    }

    void load()
    return () => {
      cancelled = true
      if (timeout !== undefined) window.clearTimeout(timeout)
    }
  }, [attempt])

  const refreshDashboard = useCallback(async () => {
    if (runtime.status !== 'ready' || dashboardRefreshInFlight.current) return
    dashboardRefreshInFlight.current = true
    try {
      const dashboard = await fetchDashboard(runtime)
      setState((current) => (current ? { ...current, ...dashboard } : current))
    } catch {
      return
    } finally {
      dashboardRefreshInFlight.current = false
    }
  }, [runtime])

  useThemeAndMotion(state?.preferences)

  const retry = useCallback(async () => {
    setError(null)
    setState(null)
    setRuntime({ status: 'starting' })
    try {
      await retryRuntime()
    } finally {
      setAttempt((value) => value + 1)
    }
  }, [])

  const updateProfile = useCallback(
    async (profile: UserProfile) => {
      const saved = await saveProfile(runtime, profile)
      setState((current) => (current ? { ...current, user: saved } : current))
    },
    [runtime],
  )

  const updatePreferences = useCallback(
    async (preferences: UserPreferences) => {
      const saved = await savePreferences(runtime, preferences)
      setState((current) => (current ? { ...current, preferences: saved } : current))
    },
    [runtime],
  )

  const eraseActivities = useCallback(async () => {
    await clearActivities(runtime)
    setState((current) => (current ? { ...current, activities: [] } : current))
  }, [runtime])

  return {
    runtime,
    state,
    error,
    retry,
    refreshDashboard,
    updateProfile,
    updatePreferences,
    eraseActivities,
  }
}

function useThemeAndMotion(preferences: UserPreferences | undefined) {
  useEffect(() => {
    if (preferences) applyTheme(resolveTheme(preferences.theme))
  }, [preferences?.theme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    applyMotion()
    media.addEventListener('change', applyMotion)
    return () => media.removeEventListener('change', applyMotion)
  }, [])
}

function sameRuntime(left: RuntimeStatus, right: RuntimeStatus) {
  return (
    left.status === right.status &&
    left.apiBase === right.apiBase &&
    left.sessionToken === right.sessionToken &&
    (left.status === 'ready' || left.message === right.message)
  )
}
