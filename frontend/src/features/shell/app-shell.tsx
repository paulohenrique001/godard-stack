import { Fragment, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuBell, LuBoxes, LuGripVertical, LuLink, LuSettings, LuSquareTerminal } from 'react-icons/lu'
import type { Bootstrap, Page, RuntimeStatus, Theme, UserPreferences, UserProfile } from '../../api'
import type { CommandInsertion } from '../terminal/types'
import { ActivityPage } from '../activity/activity-page'
import { DashboardPage } from '../dashboard/dashboard-page'
import { DashboardPanel } from '../dashboard/dashboard-panel'
import { ProfilePanel } from '../profile/profile-panel'
import { SearchDialog, type SearchItem } from '../search/search-dialog'
import { SettingsPage } from '../settings/settings-page'
import { resolveTheme } from '../preferences/theme'
import { AppNavbar } from './app-navbar'
import { AppSidebar } from './app-sidebar'
import { ModuleSlot } from './module-slot'
import { PAGES } from './navigation'
import { useWindowActivity } from './use-window-activity'

const TerminalPanel = lazy(() =>
  import('../terminal/terminal-panel').then((module) => ({ default: module.TerminalPanel })),
)
const TerminalWorkspace = lazy(() =>
  import('../terminal/terminal-workspace').then((module) => ({
    default: module.TerminalWorkspace,
  })),
)
const SgbdModule = lazy(() =>
  import('../sgbd/sgbd-module').then((module) => ({ default: module.SgbdModule })),
)
const DockerModule = lazy(() =>
  import('../docker/docker-module').then((module) => ({ default: module.DockerModule })),
)
const TodoPage = lazy(() =>
  import('../todo/todo-page').then((module) => ({ default: module.TodoPage })),
)
const ApiClientPage = lazy(() =>
  import('../api-client/api-client-page').then((module) => ({ default: module.ApiClientPage })),
)

const ASIDE_KEY = 'shell-aside-width'
const DEFAULT_ASIDE = 280
const MIN_ASIDE = 200

function loadAsideWidth(): number {
  try {
    const v = localStorage.getItem(ASIDE_KEY)
    return v === null ? DEFAULT_ASIDE : Math.max(MIN_ASIDE, Number(v))
  } catch {
    return DEFAULT_ASIDE
  }
}

function saveAsideWidth(value: number) {
  try { localStorage.setItem(ASIDE_KEY, String(value)) } catch {}
}

type AppShellProps = {
  runtime: RuntimeStatus
  state: Bootstrap
  onProfileChange: (profile: UserProfile) => Promise<void>
  onPreferencesChange: (preferences: UserPreferences) => Promise<void>
  onActivitiesCleared: () => Promise<void>
  onRefresh: () => Promise<void>
  onRequestExit: () => void
  onApplyTheme: (theme: Theme) => void
}

export function AppShell({
  runtime,
  state,
  onProfileChange,
  onPreferencesChange,
  onActivitiesCleared,
  onRefresh,
  onRequestExit,
  onApplyTheme,
}: AppShellProps) {
  const [page, setPage] = useState<Page>(state.preferences.lastPage)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [readUntil, setReadUntil] = useState(state.preferences.notificationsReadId)
  const [terminalInsertion, setTerminalInsertion] = useState<CommandInsertion | null>(null)
  const [newConsoleRequest, setNewConsoleRequest] = useState(0)
  const [newConnectionRequest, setNewConnectionRequest] = useState(0)
  const [terminalAccessVersion, setTerminalAccessVersion] = useState(0)
  const pageTitleRef = useRef<HTMLHeadingElement>(null)
  const refreshOnResume = useRef(false)
  const windowActive = useWindowActivity()
  const user = state.user!
  const activePage = PAGES.find((item) => item.id === page) ?? PAGES[0]
  const unreadCount = state.activities.filter((activity) => activity.id > readUntil).length

  const saveNextPreferences = useCallback(
    async (next: UserPreferences) => {
      try {
        await onPreferencesChange(next)
        setNotice(null)
        return true
      } catch (failure) {
        setNotice(
          failure instanceof Error ? failure.message : 'Não foi possível salvar as preferências.',
        )
        return false
      }
    },
    [onPreferencesChange],
  )

  const navigate = useCallback(
    (target: Page) => {
      setPage(target)
      void saveNextPreferences({ ...state.preferences, lastPage: target })
    },
    [saveNextPreferences, state.preferences],
  )

  const openModule = useCallback(
    (target: Extract<Page, 'terminal' | 'sgbd' | 'docker'>) => {
      navigate(target)
      setNotice(null)
    },
    [navigate],
  )

  const openNewConsole = useCallback(() => {
    setNewConsoleRequest((current) => current + 1)
    openModule('terminal')
  }, [openModule])

  const openNewConnection = useCallback(() => {
    setNewConnectionRequest((current) => current + 1)
    openModule('sgbd')
  }, [openModule])

  const insertTerminalCommand = useCallback(
    (command: string) => {
      setTerminalInsertion((current) => ({ id: (current?.id ?? 0) + 1, command }))
      navigate('terminal')
    },
    [navigate],
  )

  const markNotificationsRead = useCallback(() => {
    const nextReadId = state.activities.reduce(
      (highest, item) => Math.max(highest, item.id),
      readUntil,
    )
    setReadUntil(nextReadId)
    void saveNextPreferences({ ...state.preferences, notificationsReadId: nextReadId })
  }, [readUntil, saveNextPreferences, state.activities, state.preferences])

  const searchItems = useMemo<SearchItem[]>(
    () => [
      ...PAGES.map((item) => ({ ...item, section: 'Páginas', run: () => navigate(item.id) })),
      {
        id: 'new-console',
        title: 'Novo console',
        icon: LuSquareTerminal,
        section: 'Ações',
        run: openNewConsole,
      },
      {
        id: 'open-containers',
        title: 'Abrir contêineres',
        icon: LuBoxes,
        section: 'Ações',
        run: () => openModule('docker'),
      },
      {
        id: 'new-connection',
        title: 'Nova conexão',
        icon: LuLink,
        section: 'Ações',
        run: openNewConnection,
      },
      {
        id: 'open-notifications',
        title: 'Abrir notificações',
        icon: LuBell,
        section: 'Ações',
        run: () => setNotificationsOpen(true),
      },
      {
        id: 'open-settings',
        title: 'Abrir configurações',
        icon: LuSettings,
        section: 'Ações',
        run: () => navigate('settings'),
      },
    ],
    [navigate, openModule, openNewConnection, openNewConsole],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('.xterm')) {
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    setReadUntil(state.preferences.notificationsReadId)
  }, [state.preferences.notificationsReadId])

  useEffect(() => {
    if (!windowActive) {
      refreshOnResume.current = true
      return
    }
    if (refreshOnResume.current && page === 'dashboard') {
      refreshOnResume.current = false
      void onRefresh()
      return
    }
    refreshOnResume.current = false
  }, [onRefresh, page, windowActive])

  useEffect(() => {
    if (!windowActive || page !== 'dashboard') return
    const timer = window.setInterval(onRefresh, 60_000)
    return () => window.clearInterval(timer)
  }, [onRefresh, page, windowActive])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => pageTitleRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [page])

  return (
    <div className="animate-in fade-in flex h-full duration-300">
      <a href="#app-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <AppSidebar
        page={page}
        user={user}
        onNavigate={navigate}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppNavbar
          title={activePage.title}
          titleRef={pageTitleRef}
          activities={state.activities}
          unreadCount={unreadCount}
          notificationsOpen={notificationsOpen}
          onNotificationsOpenChange={setNotificationsOpen}
          onMarkNotificationsRead={markNotificationsRead}
          onOpenActivity={() => {
            markNotificationsRead()
            setNotificationsOpen(false)
            navigate('activity')
          }}
          onOpenSettings={() => navigate('settings')}
          onOpenSearch={() => setSearchOpen(true)}
          onRefresh={onRefresh}
          onRequestExit={onRequestExit}
        />
        {notice && (
          <p
            role="status"
            className="shrink-0 border-b bg-primary-soft px-6 py-2 text-xs text-highlight"
          >
            {notice}
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {activePage.title}
        </p>
        <div id="app-content" tabIndex={-1} className="flex min-h-0 flex-1 outline-none">
          <ShellContent
            page={page}
            runtime={runtime}
            state={state}
            user={user}
            windowActive={windowActive}
            terminalInsertion={terminalInsertion}
            newConsoleRequest={newConsoleRequest}
            newConnectionRequest={newConnectionRequest}
            terminalAccessVersion={terminalAccessVersion}
            onNavigate={navigate}
            onOpenModule={openModule}
            onRefresh={onRefresh}
            onProfileChange={onProfileChange}
            onPreferencesChange={saveNextPreferences}
            onActivitiesCleared={onActivitiesCleared}
            onApplyTheme={onApplyTheme}
            onNewConnectionHandled={() => setNewConnectionRequest(0)}
            onTerminalAccessChanged={() => setTerminalAccessVersion((current) => current + 1)}
            onInsertTerminalCommand={insertTerminalCommand}
            onCreateConsole={openNewConsole}
            onCreateConnection={openNewConnection}
          />
        </div>
      </div>
      <SearchDialog open={searchOpen} items={searchItems} onClose={() => setSearchOpen(false)} />
    </div>
  )
}

type ShellContentProps = {
  page: Page
  runtime: RuntimeStatus
  state: Bootstrap
  user: UserProfile
  windowActive: boolean
  terminalInsertion: CommandInsertion | null
  newConsoleRequest: number
  newConnectionRequest: number
  terminalAccessVersion: number
  onNavigate: (page: Page) => void
  onOpenModule: (page: Extract<Page, 'terminal' | 'sgbd' | 'docker'>) => void
  onRefresh: () => Promise<void>
  onProfileChange: (profile: UserProfile) => Promise<void>
  onPreferencesChange: (preferences: UserPreferences) => Promise<boolean>
  onActivitiesCleared: () => Promise<void>
  onApplyTheme: (theme: Theme) => void
  onNewConnectionHandled: () => void
  onTerminalAccessChanged: () => void
  onInsertTerminalCommand: (command: string) => void
  onCreateConsole: () => void
  onCreateConnection: () => void
}

function ShellContent(props: ShellContentProps) {
  const {
    page,
    runtime,
    state,
    user,
    windowActive,
    terminalInsertion,
    newConsoleRequest,
    newConnectionRequest,
    terminalAccessVersion,
    onNavigate,
    onOpenModule,
    onRefresh,
    onProfileChange,
    onPreferencesChange,
    onActivitiesCleared,
    onApplyTheme,
    onNewConnectionHandled,
    onTerminalAccessChanged,
    onInsertTerminalCommand,
    onCreateConsole,
    onCreateConnection,
  } = props
  const theme = resolveTheme(state.preferences.theme)
  const [asideWidth, setAsideWidth] = useState(loadAsideWidth)

  if (page === 'sgbd') {
    return (
      <ModuleSlot label="Bancos de dados">
        <SgbdModule
          runtime={runtime}
          isWindowActive={windowActive}
          newConnectionRequest={newConnectionRequest}
          onNewConnectionHandled={onNewConnectionHandled}
          onActivityChanged={onRefresh}
        />
      </ModuleSlot>
    )
  }

  if (page === 'docker') {
    return (
      <ModuleSlot label="Contêineres">
        <DockerModule
          runtime={runtime}
          isWindowActive={windowActive}
          theme={theme}
          onActivityChanged={onRefresh}
        />
      </ModuleSlot>
    )
  }

  if (page === 'api-client') {
    return (
      <ModuleSlot label="API Client">
        <ApiClientPage runtime={runtime} />
      </ModuleSlot>
    )
  }

  if (page === 'todo') {
    return (
      <ModuleSlot label="To-do">
        <TodoPage runtime={runtime} />
      </ModuleSlot>
    )
  }

  return (
    <Fragment>
      <main
        className={
          page === 'dashboard'
            ? 'dashboard-scroll min-w-0 flex-1 overflow-auto'
            : 'min-w-0 flex-1 overflow-auto'
        }
      >
        <div className="mx-auto h-full w-full max-w-520">
          {page === 'dashboard' && (
            <DashboardPage
              runtime={runtime}
              state={state}
              onNavigate={onOpenModule}
              onOpenActivity={() => onNavigate('activity')}
            />
          )}

          {page === 'activity' && (
            <ActivityPage activities={state.activities} onClear={onActivitiesCleared} />
          )}
          {page === 'settings' && (
            <SettingsPage
              runtime={runtime}
              preferences={state.preferences}
              onSave={onPreferencesChange}
              onApplyTheme={onApplyTheme}
              resolveTheme={resolveTheme}
            />
          )}
          {page === 'terminal' && (
            <ModuleSlot label="Console">
              <TerminalWorkspace
                runtime={runtime}
                system={state.system}
                theme={theme}
                insertion={terminalInsertion}
                newConsoleRequest={newConsoleRequest}
                onAccessChanged={onTerminalAccessChanged}
              />
            </ModuleSlot>
          )}
        </div>
      </main>
      {page !== 'activity' && (
        <>
          <div
            className="group relative flex h-full w-3 shrink-0 cursor-col-resize touch-none select-none items-center justify-center"
            onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
              const parent = e.currentTarget.parentElement
              if (!parent) return
              const rect = parent.getBoundingClientRect()
              const rawWidth = Math.round(rect.right - e.clientX)
              setAsideWidth(Math.max(MIN_ASIDE, Math.min(Math.floor(rect.width / 2), rawWidth)))
            }}
            onPointerUp={(e) => {
              const parent = e.currentTarget.parentElement
              if (!parent) return
              const rect = parent.getBoundingClientRect()
              const rawWidth = Math.round(rect.right - e.clientX)
              const w = Math.max(MIN_ASIDE, Math.min(Math.floor(rect.width / 2), rawWidth))
              setAsideWidth(w)
              saveAsideWidth(w)
            }}
            onDoubleClick={() => { setAsideWidth(DEFAULT_ASIDE); saveAsideWidth(DEFAULT_ASIDE) }}
          >
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
            <span className="relative z-10 flex items-center rounded-sm bg-card px-px">
              <LuGripVertical className="size-3.5 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
            </span>
          </div>
          <aside className="shrink-0 overflow-auto p-6" style={{ width: asideWidth }}>
            <div key={page} className="animate-in fade-in h-full duration-200">
              {page === 'settings' && (
                <ProfilePanel user={user} onSave={onProfileChange} />
              )}
              {page === 'dashboard' && (
                <DashboardPanel
                  state={state}
                  onCreateConsole={onCreateConsole}
                  onCreateContainer={() => onOpenModule('docker')}
                  onCreateConnection={onCreateConnection}
                  onRefresh={onRefresh}
                />
              )}
              {page === 'terminal' && (
                <ModuleSlot label="Painel do console">
                  <TerminalPanel
                    runtime={runtime}
                    system={state.system}
                    refreshKey={terminalAccessVersion}
                    onInsertCommand={onInsertTerminalCommand}
                  />
                </ModuleSlot>
              )}
            </div>
          </aside>
        </>
      )}
    </Fragment>
  )
}
