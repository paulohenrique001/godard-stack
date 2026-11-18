import { type PointerEvent, lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { DashboardPanel } from '@/features/dashboard/dashboard-panel'
import { useDashboardRefresh } from '@/features/dashboard/use-dashboard-refresh'
import { DockerPanel } from '@/features/docker/docker-panel'
import { useDockerContainers } from '@/features/docker/use-docker-containers'
import { ContentLoader } from '@/components/ui/content-loader'
import { AppNavbar } from '@/features/layout/app-navbar'
import { AppSidebar } from '@/features/layout/app-sidebar'
import { savePageForCurrentTab } from '@/features/layout/page-preference'
import { PAGES, PAGES_WITHOUT_ASIDE, type Page } from '@/features/layout/pages'
import { useNotifications } from '@/features/notifications/use-notifications'
import { ProfilePage } from '@/features/profile/profile-page'
import { buildSearchCatalog } from '@/features/search/search-catalog'
import { SettingsPage } from '@/features/settings/settings-page'
import { SgbdPanel } from '@/features/sgbd/sgbd-panel'
import { useSgbd } from '@/features/sgbd/use-sgbd'
import { TerminalPanel } from '@/features/terminal/terminal-panel'
import type { CommandInsertion } from '@/features/terminal/terminal-view'
import { useTerminalTabs } from '@/features/terminal/use-terminal-tabs'
import { useTheme } from '@/features/theme/theme-provider'
import { cn } from '@/lib/utils'

const MIN_ASIDE_WIDTH = 180
const MAX_ASIDE_WIDTH = 520
const DEFAULT_ASIDE_WIDTH = 280

const clampAside = (width: number) => Math.max(MIN_ASIDE_WIDTH, Math.min(MAX_ASIDE_WIDTH, width))

const ActivityPage = lazy(() => import('@/features/dashboard/activity-page').then(({ ActivityPage }) => ({ default: ActivityPage })))
const DockerPage = lazy(() => import('@/features/docker/docker-page').then(({ DockerPage }) => ({ default: DockerPage })))
const HttpClientPage = lazy(() => import('@/features/tools/http-client').then(({ HttpClientPage }) => ({ default: HttpClientPage })))
const SgbdPage = lazy(() => import('@/features/sgbd/sgbd-page').then(({ SgbdPage }) => ({ default: SgbdPage })))
const TerminalWorkspace = lazy(() => import('@/features/terminal/terminal-workspace').then(({ TerminalWorkspace }) => ({ default: TerminalWorkspace })))

function PageLoader() {
  return <ContentLoader className="h-full p-6" />
}

type AppLayoutProps = {
  userName: string
  avatarSeed: string | null
  initialPage: Page
}

export function AppLayout({ userName, avatarSeed, initialPage }: AppLayoutProps) {
  const [page, setPage] = useState<Page>(initialPage)
  const [profile, setProfile] = useState({ name: userName, avatarSeed })
  const terminal = useTerminalTabs()
  const docker = useDockerContainers(page === 'docker')
  const sgbd = useSgbd(page === 'sgbd')
  const dashboard = useDashboardRefresh(page === 'dashboard' || page === 'activity')
  const [terminalFocusRequest, setTerminalFocusRequest] = useState(0)
  const [commandInsertion, setCommandInsertion] = useState<CommandInsertion | null>(null)
  const [terminalLoaded, setTerminalLoaded] = useState(initialPage === 'terminal')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [asideWidth, setAsideWidth] = useState(DEFAULT_ASIDE_WIDTH)
  const { toggleTheme } = useTheme()
  const notifications = useNotifications()
  const { addTab } = terminal
  const { setCreating } = docker
  const { setEditor } = sgbd

  const navigate = useCallback((target: Page) => {
    setPage(target)
    savePageForCurrentTab(target)
  }, [])

  const openContainer = useCallback((name: string) => {
    docker.selectContainerByName(name)
    navigate('docker')
  }, [docker, navigate])

  const openConnection = useCallback((id: number) => {
    sgbd.select(id)
    navigate('sgbd')
  }, [navigate, sgbd])

  const createConsole = useCallback(async () => {
    navigate('terminal')
    await addTab()
    setTerminalFocusRequest((request) => request + 1)
  }, [addTab, navigate])

  const createContainer = useCallback(() => {
    setCreating(true)
    navigate('docker')
  }, [navigate, setCreating])

  const createConnection = useCallback(() => {
    setEditor({ mode: 'new' })
    navigate('sgbd')
  }, [navigate, setEditor])

  const openNotifications = useCallback(() => setNotificationsOpen(true), [])
  const openSettings = useCallback(() => navigate('settings'), [navigate])

  const searchItems = useMemo(
    () => buildSearchCatalog({
      navigate,
      toggleTheme,
      createConsole,
      createContainer,
      createConnection,
      openNotifications,
      openSettings,
    }),
    [createConnection, createConsole, createContainer, navigate, openNotifications, openSettings, toggleTheme],
  )
  const title = PAGES.find((item) => item.id === page)!.title

  useEffect(() => {
    document.title = `${title} - Godard Stack`
  }, [title])

  useEffect(() => {
    if (page === 'terminal' || terminal.tabs.some((tab) => tab.alive)) {
      setTerminalLoaded(true)
    }
  }, [page, terminal.tabs])

  return (
    <div className="animate-in fade-in flex h-full duration-300">
      <AppSidebar page={page} onNavigate={navigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppNavbar
          title={title}
          userName={profile.name}
          avatarSeed={profile.avatarSeed}
          profileActive={page === 'profile'}
          searchItems={searchItems}
          onOpenProfile={() => navigate('profile')}
          notifications={notifications}
          notificationsOpen={notificationsOpen}
          onNotificationsOpenChange={setNotificationsOpen}
          onOpenActivity={() => {
            setNotificationsOpen(false)
            navigate('activity')
          }}
          onOpenSettings={openSettings}
          onSearchClosed={() => setTerminalFocusRequest((request) => request + 1)}
        />
        <div className="flex min-h-0 flex-1">
          <main className={cn('min-w-0 flex-1 overflow-auto', page === 'dashboard' && 'dashboard-scroll')}>
            <div className="mx-auto h-full w-full max-w-520">
              {page === 'dashboard' && (
                <DashboardPage
                  onNavigate={navigate}
                  onOpenContainer={openContainer}
                  onOpenConnection={openConnection}
                  dashboard={dashboard}
                />
              )}
              {page === 'activity' && <Suspense fallback={<PageLoader />}><ActivityPage onCleared={dashboard.reloadActivities} /></Suspense>}
              {page === 'docker' && <Suspense fallback={<PageLoader />}><DockerPage docker={docker} /></Suspense>}
              {page === 'sgbd' && <Suspense fallback={<PageLoader />}><SgbdPage sgbd={sgbd} /></Suspense>}
              {page === 'http' && <Suspense fallback={<PageLoader />}><HttpClientPage /></Suspense>}
              {page === 'profile' && (
                <ProfilePage
                  name={profile.name}
                  avatarSeed={profile.avatarSeed}
                  onSaved={(name, seed) => setProfile({ name, avatarSeed: seed })}
                />
              )}
              {page === 'settings' && <SettingsPage />}
              {terminalLoaded && (
                <Suspense fallback={page === 'terminal' ? <PageLoader /> : null}>
                  <TerminalWorkspace
                    terminal={terminal}
                    visible={page === 'terminal'}
                    focusRequest={terminalFocusRequest}
                    insertion={commandInsertion}
                  />
                </Suspense>
              )}
            </div>
          </main>
          {!PAGES_WITHOUT_ASIDE.has(page) && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Ajustar largura do painel lateral"
                className="group flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center"
                onPointerDown={(event: PointerEvent<HTMLDivElement>) => event.currentTarget.setPointerCapture(event.pointerId)}
                onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
                  const { right } = event.currentTarget.parentElement!.getBoundingClientRect()
                  setAsideWidth(clampAside(right - event.clientX))
                }}
              >
                <span className="h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-highlight" />
              </div>
              <aside className="shrink-0 overflow-auto p-6" style={{ width: asideWidth }}>
                <div key={page} className="animate-in fade-in h-full duration-200">
                  {page === 'dashboard' && (
                    <DashboardPanel
                      onCreateConsole={() => { void createConsole() }}
                      onCreateContainer={createContainer}
                      onCreateConnection={createConnection}
                      dashboard={dashboard}
                    />
                  )}
                  {page === 'docker' && <DockerPanel docker={docker} />}
                  {page === 'sgbd' && <SgbdPanel sgbd={sgbd} />}
                  {page === 'terminal' && (
                    <TerminalPanel onInsertCommand={(command) => setCommandInsertion({ command })} />
                  )}
                </div>
              </aside>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
