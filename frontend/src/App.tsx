import { Fragment, useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useAppBootstrap } from './features/app/use-app-bootstrap'
import { useAutoRecovery } from './features/app/use-auto-recovery'
import { Onboarding } from './features/onboarding/onboarding'
import { adjustFontScale, applyFontScale, loadFontScaleIndex } from './features/preferences/font-size'
import { applyMotion, applyTheme, resolveTheme } from './features/preferences/theme'
import { AppShell } from './features/shell/app-shell'
import { ExitDialog } from './features/shell/exit-dialog'
import { ExitGuardProvider, useIsExitBlocked } from './features/shell/exit-guard'
import { TextContextMenu } from './features/shell/text-context-menu'
import { runDesktopWindowAction } from './features/shell/window-actions'
import { restoreWindowState, setupWindowStateTracking } from './features/shell/window-state'
import { SplashScreen } from './features/splash/splash-screen'

export default function App() {
  return (
    <ExitGuardProvider>
      <AppInner />
      <TextContextMenu />
    </ExitGuardProvider>
  )
}

function AppInner() {
  const {
    runtime,
    state,
    error,
    retry,
    refreshDashboard,
    updateProfile,
    updatePreferences,
    eraseActivities,
  } = useAppBootstrap()
  const recovery = useAutoRecovery(runtime.status === 'failed', retry)
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false)
  const allowWindowClose = useRef(false)
  const isExitBlocked = useIsExitBlocked()

  useEffect(() => {
    applyFontScale(loadFontScaleIndex())
    void restoreWindowState()
    return setupWindowStateTracking()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        adjustFontScale(1)
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        adjustFontScale(-1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return

    let disposed = false
    let unlisten: (() => void) | undefined
    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (allowWindowClose.current) return
        if (!isExitBlocked()) {
          allowWindowClose.current = true
          return
        }
        event.preventDefault()
        setExitConfirmationOpen(true)
      })
      .then((stopListening) => {
        if (disposed) {
          stopListening()
          return
        }
        unlisten = stopListening
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const confirmExit = () => {
    allowWindowClose.current = true
    runDesktopWindowAction((appWindow) => appWindow.close())
  }

  const requestExit = () => {
    if (!isExitBlocked()) {
      allowWindowClose.current = true
      runDesktopWindowAction((appWindow) => appWindow.close())
    } else {
      setExitConfirmationOpen(true)
    }
  }

  const exitDialog = exitConfirmationOpen && (
    <ExitDialog onCancel={() => setExitConfirmationOpen(false)} onConfirm={confirmExit} />
  )
  if (runtime.status !== 'ready' || state === null) {
    return (
      <Fragment>
        <SplashScreen runtime={runtime} error={error} recovery={recovery} onRequestExit={requestExit} />
        {exitDialog}
      </Fragment>
    )
  }

  if (state.user === null) {
    const theme = resolveTheme(state.preferences.theme)
    const toggleTheme = () => {
      const nextTheme = theme === 'dark' ? 'light' : 'dark'
      applyTheme(nextTheme)
      void updatePreferences({ ...state.preferences, theme: nextTheme })
    }
    return (
      <Fragment>
        <Onboarding onComplete={updateProfile} theme={theme} onToggleTheme={toggleTheme} onRequestExit={requestExit} />
        {exitDialog}
      </Fragment>
    )
  }

  return (
    <Fragment>
      <AppShell
        runtime={runtime}
        state={state}
        onProfileChange={updateProfile}
        onPreferencesChange={updatePreferences}
        onActivitiesCleared={eraseActivities}
        onRefresh={refreshDashboard}
        onRequestExit={requestExit}
        onApplyTheme={applyTheme}
      />
      {exitDialog}
    </Fragment>
  )
}
