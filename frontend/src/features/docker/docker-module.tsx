import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { IconType } from 'react-icons'
import {
  LuCheck,
  LuCircleAlert,
  LuContainer,
  LuCopy,
  LuDownload,
  LuFileCode,
  LuFileKey,
  LuLoaderCircle,
  LuLock,
  LuMousePointerClick,
  LuPlay,
  LuPlus,
  LuRefreshCw,
  LuRotateCw,
  LuScrollText,
  LuSearch,
  LuSquare,
  LuSquareTerminal,
  LuTrash2,
} from 'react-icons/lu'
import {
  type DockerAction,
  type DockerContainer,
  type DockerDetailTab,
  type DockerMetrics,
  type DockerViewState,
  type RuntimeStatus,
  createDockerUpdateTicket,
  dockerUpdateSocketUrl,
  fetchDockerContainers,
  fetchDockerMetrics,
  fetchDockerViewState,
  runDockerAction,
  saveDockerViewState,
} from '../../api'
import { cn } from '../../shared/lib/cn'
import { useModalDialog } from '../accessibility/use-modal-dialog'
import { DockerFileEditor } from './docker-file-editor'
import { DockerLogs } from './docker-logs'
import { DockerShell } from './docker-shell'
import { DockerUpdateOutput } from './docker-update-output'
import { NewDockerContainer } from './new-docker-container'

type DockerModuleProps = {
  runtime: RuntimeStatus
  isWindowActive: boolean
  theme: 'light' | 'dark'
  onActivityChanged: () => void
}

type DockerPendingAction = DockerAction | 'update'

type DetailTabItem = {
  id: Exclude<DockerDetailTab, 'output'>
  label: string
  icon: IconType
}

const PENDING_LABELS: Record<DockerPendingAction, string> = {
  start: 'Iniciando...',
  stop: 'Parando...',
  restart: 'Reiniciando...',
  update: 'Atualizando...',
  remove: 'Excluindo...',
}

const DETAIL_TABS: DetailTabItem[] = [
  { id: 'logs', label: 'Logs', icon: LuScrollText },
  { id: 'shell', label: 'Shell', icon: LuSquareTerminal },
  { id: 'compose', label: 'docker-compose.yml', icon: LuFileCode },
  { id: 'env', label: '.env', icon: LuFileKey },
]

const STATE_LABELS: Record<string, string> = {
  running: 'Ativo',
  exited: 'Parado',
  created: 'Criado',
  paused: 'Pausado',
  restarting: 'Reiniciando',
  removing: 'Removendo',
  dead: 'Com falha',
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}

function stateLabel(state: string) {
  return STATE_LABELS[state] ?? (state || 'Desconhecido')
}

async function streamDockerUpdate(
  runtime: RuntimeStatus,
  id: string,
  onOutput: (text: string) => void,
) {
  const { ticket } = await createDockerUpdateTicket(runtime, id)
  return new Promise<boolean>((resolve, reject) => {
    let settled = false
    let completed: boolean | null = null
    const finish = (value: boolean, failure?: Error) => {
      if (settled) return
      settled = true
      if (failure) reject(failure)
      else resolve(value)
    }
    let socket: WebSocket
    try {
      socket = new WebSocket(dockerUpdateSocketUrl(runtime, id, ticket))
    } catch {
      reject(new Error('Não foi possível iniciar a atualização do container.'))
      return
    }
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      if (event.data === '\u0001updated') completed = true
      else if (event.data === '\u0001failed') completed = false
      else onOutput(event.data)
    }
    socket.onerror = () =>
      finish(false, new Error('O fluxo de atualização do container foi interrompido.'))
    socket.onclose = () => finish(completed ?? false)
  })
}

export function DockerModule({
  runtime,
  isWindowActive,
  theme,
  onActivityChanged,
}: DockerModuleProps) {
  const [containers, setContainers] = useState<DockerContainer[] | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [showStopped, setShowStopped] = useState(true)
  const [selectedTab, setSelectedTab] = useState<DockerViewState['tab']>('logs')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState<Record<string, DockerPendingAction>>({})
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null)
  const [metrics, setMetrics] = useState<Record<string, DockerMetrics>>({})
  const [logsEpoch, setLogsEpoch] = useState(0)
  const [outputs, setOutputs] = useState<Record<string, string>>({})
  const [confirmRemove, setConfirmRemove] = useState<DockerContainer | null>(null)
  const [creating, setCreating] = useState(false)
  const refreshInFlight = useRef(false)
  const wasWindowActive = useRef(isWindowActive)
  const runtimeKey = `${runtime.status}:${runtime.apiBase ?? ''}:${runtime.sessionToken ?? ''}`

  const persistView = useCallback(
    (containerName: string | null, tab: DockerViewState['tab'], stopped: boolean) => {
      void saveDockerViewState(runtime, {
        containerName,
        tab: tab === 'output' ? 'logs' : tab,
        showStopped: stopped,
      }).catch(() => undefined)
    },
    [runtimeKey],
  )

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      const list = await fetchDockerContainers(runtime)
      setContainers(list)
      setSelectedName((current) =>
        current !== null && list.some((container) => container.name === current) ? current : null,
      )
      setFailure(null)
      return list
    } catch (error) {
      setFailure(errorMessage(error))
      setContainers((current) => current ?? [])
      return null
    } finally {
      setRefreshing(false)
    }
  }, [runtimeKey])

  useEffect(() => {
    if (!isWindowActive) return
    let active = true
    setLoading(true)
    setFailure(null)
    Promise.all([fetchDockerViewState(runtime), fetchDockerContainers(runtime)])
      .then(([view, list]) => {
        if (!active) return
        const restoredName =
          view.containerName !== null &&
          list.some((container) => container.name === view.containerName)
            ? view.containerName
            : null
        setContainers(list)
        setSelectedName(restoredName)
        const restoredTab = view.tab === 'output' ? 'logs' : view.tab
        setSelectedTab(restoredTab)
        setShowStopped(view.showStopped)
        if (view.containerName !== restoredName || view.tab !== restoredTab)
          persistView(restoredName, restoredTab, view.showStopped)
      })
      .catch((error: unknown) => {
        if (!active) return
        setContainers([])
        setSelectedName(null)
        setFailure(errorMessage(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [isWindowActive, persistView, runtimeKey])

  useEffect(() => {
    if (
      containers === null ||
      selectedName === null ||
      containers.some((container) => container.name === selectedName)
    )
      return
    setSelectedName(null)
    persistView(null, selectedTab, showStopped)
  }, [containers, persistView, selectedName, selectedTab, showStopped])

  const selected = useMemo(
    () => containers?.find((container) => container.name === selectedName) ?? null,
    [containers, selectedName],
  )
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR')
    return (containers ?? []).filter(
      (container) =>
        (showStopped || container.running) &&
        container.name.toLocaleLowerCase('pt-BR').includes(term),
    )
  }, [containers, query, showStopped])

  const reloadMetrics = useCallback(async () => {
    if (!selected?.running) return
    try {
      const current = await fetchDockerMetrics(runtime, selected.id)
      setMetrics((previous) => ({ ...previous, [selected.id]: current }))
    } catch {
      return
    }
  }, [runtimeKey, selected?.id, selected?.running])

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    try {
      await Promise.all([reload(), reloadMetrics()])
    } finally {
      refreshInFlight.current = false
    }
  }, [reload, reloadMetrics])

  useEffect(() => {
    if (!isWindowActive) return
    void reloadMetrics()
  }, [isWindowActive, reloadMetrics])

  useEffect(() => {
    const resumed = isWindowActive && !wasWindowActive.current
    wasWindowActive.current = isWindowActive
    if (resumed && containers !== null) {
      void refresh()
    }
  }, [containers, isWindowActive, refresh])

  useEffect(() => {
    if (!isWindowActive) return
    const timer = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(timer)
  }, [isWindowActive, refresh])

  const selectContainer = (container: DockerContainer) => {
    const next = selectedName === container.name ? null : container.name
    setSelectedName(next)
    persistView(next, selectedTab, showStopped)
  }

  const toggleShowStopped = () => {
    const next = !showStopped
    setShowStopped(next)
    persistView(selectedName, selectedTab, next)
  }

  const runAction = async (container: DockerContainer, action: DockerAction) => {
    setPending((current) => ({ ...current, [container.id]: action }))
    setActionError(null)
    try {
      await runDockerAction(runtime, container.id, action)
      onActivityChanged()
      if (action === 'remove') setConfirmRemove(null)
    } catch (error) {
      setActionError({ id: container.id, message: errorMessage(error) })
    } finally {
      await refresh()
      setPending(({ [container.id]: _finished, ...rest }) => rest)
      setLogsEpoch((current) => current + 1)
    }
  }

  const updateContainer = async (container: DockerContainer) => {
    setPending((current) => ({ ...current, [container.id]: 'update' }))
    setActionError(null)
    setOutputs((current) => ({ ...current, [container.name]: '' }))
    setSelectedTab('output')
    persistView(container.name, 'logs', showStopped)
    try {
      const completed = await streamDockerUpdate(runtime, container.id, (text) =>
        setOutputs((current) => ({
          ...current,
          [container.name]: (current[container.name] ?? '') + text,
        })),
      )
      if (!completed) throw new Error('Não foi possível atualizar. Veja a aba Saída.')
      onActivityChanged()
    } catch (error) {
      setActionError({ id: container.id, message: errorMessage(error) })
    } finally {
      await refresh()
      setPending(({ [container.id]: _finished, ...rest }) => rest)
      setLogsEpoch((current) => current + 1)
    }
  }

  const selectTab = (tab: DockerViewState['tab']) => {
    setSelectedTab(tab)
    persistView(selectedName, tab, showStopped)
  }

  const selectedMetrics = selected ? (metrics[selected.id] ?? null) : null
  const showUnavailable = !loading && failure !== null && containers?.length === 0

  return (
    <Fragment>
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto h-full w-full max-w-520">
          {creating ? (
            <NewDockerContainer
              runtime={runtime}
              onCancel={() => setCreating(false)}
              onCreated={async (composePath) => {
                const list = await reload()
                const created = list?.find((container) => container.composeFile === composePath)
                if (created) {
                  setSelectedName(created.name)
                  persistView(created.name, selectedTab, showStopped)
                }
                setCreating(false)
              }}
            />
          ) : (
            <Fragment>
              {loading && containers === null && <LoadingState />}
              {showUnavailable && (
                <UnavailableState message={failure ?? ''} onRetry={() => void refresh()} />
              )}
              {!loading && !failure && containers?.length === 0 && <EmptyState />}
              {!loading && containers && containers.length > 0 && !selected && (
                <SelectionState warning={failure} />
              )}
              {selected && (
                <ContainerWorkspace
                  runtime={runtime}
                  theme={theme}
                  container={selected}
                  metrics={selectedMetrics}
                  pending={pending[selected.id]}
                  refreshing={refreshing}
                  actionError={actionError?.id === selected.id ? actionError.message : null}
                  warning={failure}
                  logsEpoch={logsEpoch}
                  output={outputs[selected.name]}
                  onRefresh={() => void refresh()}
                  onAction={(action) => void runAction(selected, action)}
                  onUpdate={() => void updateContainer(selected)}
                  onRemove={() => setConfirmRemove(selected)}
                  tab={selectedTab}
                  onSelectTab={selectTab}
                  onActivityChanged={onActivityChanged}
                />
              )}
            </Fragment>
          )}
        </div>
      </main>
      <aside className="w-70 shrink-0 overflow-auto border-l p-6">
        <ContainerPanel
          containers={visible}
          selectedId={selected?.id ?? null}
          query={query}
          loading={loading}
          unavailable={failure !== null}
          showStopped={showStopped}
          creating={creating}
          onQueryChange={setQuery}
          onSelect={selectContainer}
          onToggleStopped={toggleShowStopped}
          onCreate={() => {
            setCreating(true)
            setSelectedName(null)
          }}
        />
      </aside>
      {confirmRemove && (
        <RemoveDialog
          container={confirmRemove}
          removing={pending[confirmRemove.id] === 'remove'}
          onCancel={() => pending[confirmRemove.id] === undefined && setConfirmRemove(null)}
          onConfirm={() => void runAction(confirmRemove, 'remove')}
        />
      )}
    </Fragment>
  )
}

function LoadingState() {
  return (
    <div className="grid h-full min-h-72 place-items-center p-6 text-sm text-muted-foreground">
      <LuLoaderCircle className="size-6 animate-spin" />
    </div>
  )
}

function UnavailableState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="animate-in fade-in flex h-full items-center justify-center p-6 text-center duration-200">
      <div className="max-w-md space-y-4">
        <LuCircleAlert className="mx-auto size-20 text-destructive/50" strokeWidth={1.25} />
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Docker local
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">Docker indisponível</h2>
        <p role="alert" className="text-muted-foreground">
          {message}
        </p>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted"
          onClick={onRetry}
        >
          <LuRefreshCw className="size-4" />
          Tentar novamente
        </button>
      </div>
    </section>
  )
}

function EmptyState() {
  return (
    <div className="animate-in fade-in flex h-full items-center justify-center p-6 duration-200">
      <p className="text-sm text-muted-foreground">Nenhum container encontrado.</p>
    </div>
  )
}

function SelectionState({ warning }: { warning: string | null }) {
  return (
    <div className="animate-in fade-in flex h-full w-full flex-col items-center justify-center gap-4 p-6 duration-200">
      <LuMousePointerClick
        aria-label="Selecione um container"
        className="size-20 text-muted-foreground/40"
        strokeWidth={1.25}
      />
      {warning && (
        <p role="alert" className="max-w-md text-center text-sm text-destructive">
          Docker indisponível. Os dados exibidos podem estar desatualizados.
        </p>
      )}
    </div>
  )
}

function ContainerWorkspace({
  runtime,
  theme,
  container,
  metrics,
  pending,
  refreshing,
  actionError,
  warning,
  logsEpoch,
  output,
  onRefresh,
  onAction,
  onUpdate,
  onRemove,
  tab,
  onSelectTab,
  onActivityChanged,
}: {
  runtime: RuntimeStatus
  theme: 'light' | 'dark'
  container: DockerContainer
  metrics: DockerMetrics | null
  pending: DockerPendingAction | undefined
  refreshing: boolean
  actionError: string | null
  warning: string | null
  logsEpoch: number
  output: string | undefined
  onRefresh: () => void
  onAction: (action: DockerAction) => void
  onUpdate: () => void
  onRemove: () => void
  tab: DockerDetailTab
  onSelectTab: (tab: DockerDetailTab) => void
  onActivityChanged: () => void
}) {
  const actionsLocked = pending !== undefined
  const canOperate = !container.protectedContainer
  const canUpdate = canOperate && container.composeManaged
  const visibleTab = tab === 'output' && output === undefined ? 'logs' : tab
  const tabs =
    output === undefined
      ? DETAIL_TABS
      : [...DETAIL_TABS, { id: 'output' as const, label: 'Saída', icon: LuDownload }]
  const selectableTabs = tabs.filter((item) => item.id !== 'shell' || !container.protectedContainer)
  const tabId = (id: DockerDetailTab) => `docker-${container.id}-tab-${id}`
  const panelId = (id: DockerDetailTab) => `docker-${container.id}-panel-${id}`
  const moveTab = (event: ReactKeyboardEvent<HTMLButtonElement>, current: DockerDetailTab) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const currentIndex = selectableTabs.findIndex((item) => item.id === current)
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? selectableTabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + selectableTabs.length) %
            selectableTabs.length
    const next = selectableTabs[nextIndex]
    onSelectTab(next.id)
    window.requestAnimationFrame(() => document.getElementById(tabId(next.id))?.focus())
  }
  return (
    <div className="animate-in fade-in flex h-full min-h-0 flex-col gap-4 p-6 duration-200">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-xl font-semibold tracking-tight">{container.name}</h2>
            <StateBadge container={container} action={pending} />
            {container.protectedContainer && (
              <span
                title="Este é o container da própria aplicação"
                className="inline-flex cursor-help items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-highlight uppercase"
              >
                <LuLock className="size-3" />
                Não editável
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            Criado em {container.createdAt} · {container.image}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Atualizar containers"
            title="Atualizar containers"
            disabled={refreshing || actionsLocked}
            className="grid size-9 place-items-center rounded-lg border bg-card transition-colors hover:bg-muted disabled:opacity-50"
            onClick={onRefresh}
          >
            <LuRefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </button>
          {container.running ? (
            <Fragment>
              <button
                type="button"
                disabled={actionsLocked || !canOperate}
                title={!canOperate ? 'Este é o container da própria aplicação' : undefined}
                className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium uppercase transition-colors hover:bg-muted disabled:opacity-50"
                onClick={() => onAction('stop')}
              >
                <LuSquare className="size-4" />
                Parar
              </button>
              <button
                type="button"
                disabled={actionsLocked || !canOperate}
                title={!canOperate ? 'Este é o container da própria aplicação' : undefined}
                className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium uppercase transition-colors hover:bg-muted disabled:opacity-50"
                onClick={() => onAction('restart')}
              >
                <LuRotateCw className="size-4" />
                Reiniciar
              </button>
            </Fragment>
          ) : (
            <button
              type="button"
              disabled={actionsLocked || !canOperate}
              title={!canOperate ? 'Este é o container da própria aplicação' : undefined}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground uppercase transition-colors hover:bg-primary/90 disabled:opacity-50"
              onClick={() => onAction('start')}
            >
              <LuPlay className="size-4" />
              Iniciar
            </button>
          )}
          <button
            type="button"
            disabled={actionsLocked || !canUpdate}
            title={
              !canOperate
                ? 'Este é o container da própria aplicação'
                : !container.composeManaged
                  ? 'Disponível só para containers com arquivo de configuração'
                  : undefined
            }
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium uppercase transition-colors hover:bg-muted disabled:opacity-50"
            onClick={onUpdate}
          >
            <LuDownload className="size-4" />
            Atualizar
          </button>
          <button
            type="button"
            disabled={actionsLocked || !canOperate}
            title={!canOperate ? 'Este é o container da própria aplicação' : undefined}
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium text-destructive uppercase transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
            onClick={onRemove}
          >
            <LuTrash2 className="size-4" />
            Excluir
          </button>
        </div>
      </header>
      {actionError && (
        <p role="alert" className="shrink-0 text-sm wrap-anywhere text-destructive">
          {actionError}
        </p>
      )}
      {warning && (
        <p role="alert" className="shrink-0 text-sm text-destructive">
          Docker indisponível. Os dados abaixo podem estar desatualizados.
        </p>
      )}
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Detail label="Status">{container.status || stateLabel(container.state)}</Detail>
        <Detail label="Saúde">{healthLabel(container.health)}</Detail>
        <Detail label="Portas">
          <span title={container.ports.join(', ')}>{container.ports.join(', ') || 'Nenhuma'}</span>
        </Detail>
        <Detail label="CPU">
          {metrics?.cpuPercent === null || metrics === null ? '—' : `${metrics.cpuPercent}%`}
        </Detail>
        <Detail label="Memória">
          {metrics?.memoryUsage ?? '—'}
          {metrics?.memoryPercent === null || metrics === null
            ? ''
            : ` (${metrics.memoryPercent}%)`}
        </Detail>
        <IdDetail key={container.id} id={container.id} />
      </div>
      <section className="flex min-h-48 flex-1 flex-col gap-3">
        <div
          role="tablist"
          aria-label="Detalhes do container"
          className="flex overflow-x-auto border-b"
        >
          {tabs.map(({ id, label, icon: Icon }) => {
            const locked = id === 'shell' && container.protectedContainer
            const TabIcon = locked ? LuLock : Icon
            return (
              <button
                key={id}
                id={tabId(id)}
                type="button"
                role="tab"
                aria-selected={visibleTab === id}
                aria-controls={panelId(id)}
                tabIndex={visibleTab === id ? 0 : -1}
                disabled={locked}
                className={cn(
                  '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                  visibleTab === id
                    ? 'border-highlight text-highlight'
                    : 'border-transparent text-muted-foreground',
                )}
                onClick={() => onSelectTab(id)}
                onKeyDown={(event) => moveTab(event, id)}
              >
                <TabIcon className="size-4" />
                {label}
              </button>
            )
          })}
        </div>
        {visibleTab === 'logs' && (
          <div
            id={panelId('logs')}
            role="tabpanel"
            aria-labelledby={tabId('logs')}
            className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card p-3"
          >
            <DockerLogs
              key={`${container.id}:${logsEpoch}:${container.running}`}
              runtime={runtime}
              id={container.id}
              name={container.name}
              theme={theme}
            />
          </div>
        )}
        {visibleTab === 'output' && output !== undefined && (
          <div
            id={panelId('output')}
            role="tabpanel"
            aria-labelledby={tabId('output')}
            className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card p-3"
          >
            <DockerUpdateOutput key={container.name} text={output} theme={theme} />
          </div>
        )}
        {visibleTab === 'shell' && (
          <div
            id={panelId('shell')}
            role="tabpanel"
            aria-labelledby={tabId('shell')}
            className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-card p-3"
          >
            {container.running ? (
              <DockerShell
                key={container.id}
                runtime={runtime}
                id={container.id}
                name={container.name}
                theme={theme}
              />
            ) : (
              <p className="m-auto text-sm text-muted-foreground">
                Inicie o container para abrir o shell.
              </p>
            )}
          </div>
        )}
        {(visibleTab === 'compose' || visibleTab === 'env') && (
          <div
            id={panelId(visibleTab)}
            role="tabpanel"
            aria-labelledby={tabId(visibleTab)}
            className="flex min-h-0 flex-1"
          >
            <DockerFileEditor
              key={container.id}
              runtime={runtime}
              container={container}
              kind={visibleTab}
              onSaved={onActivityChanged}
            />
          </div>
        )}
      </section>
    </div>
  )
}

function StateBadge({
  container,
  action,
}: {
  container: DockerContainer
  action: DockerPendingAction | undefined
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase',
        action
          ? 'bg-muted text-muted-foreground'
          : container.running
            ? 'bg-success/15 text-success'
            : 'bg-muted text-muted-foreground',
      )}
    >
      {action && <LuLoaderCircle className="size-3 animate-spin" />}
      {action ? PENDING_LABELS[action] : stateLabel(container.state)}
    </span>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 truncate text-sm font-medium">{children}</div>
    </div>
  )
}

function IdDetail({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)
  const shortId = id.slice(0, 12)
  const copy = () => {
    void navigator.clipboard
      .writeText(shortId)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1_500)
      })
      .catch(() => undefined)
  }
  return (
    <button
      type="button"
      aria-label="Copiar ID"
      className="flex min-w-0 items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-left transition-colors outline-none hover:border-highlight focus-visible:ring-2 focus-visible:ring-ring"
      onClick={copy}
    >
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">ID</span>
        <span className="mt-1 block truncate font-mono text-sm font-medium">{shortId}</span>
      </span>
      {copied ? (
        <LuCheck className="size-4 shrink-0 text-success" />
      ) : (
        <LuCopy className="size-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  )
}

function healthLabel(health: DockerContainer['health']) {
  if (health === 'healthy') return 'Saudável'
  if (health === 'unhealthy') return 'Com problemas'
  if (health === 'starting') return 'Iniciando'
  return 'Não informado'
}

function ContainerPanel({
  containers,
  selectedId,
  query,
  loading,
  unavailable,
  showStopped,
  creating,
  onQueryChange,
  onSelect,
  onToggleStopped,
  onCreate,
}: {
  containers: DockerContainer[]
  selectedId: string | null
  query: string
  loading: boolean
  unavailable: boolean
  showStopped: boolean
  creating: boolean
  onQueryChange: (query: string) => void
  onSelect: (container: DockerContainer) => void
  onToggleStopped: () => void
  onCreate: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <h2 className="text-sm font-medium">Containers</h2>
      <div className="relative">
        <LuSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          aria-label="Buscar container"
          autoComplete="off"
          className="h-9 w-full rounded-lg border bg-card pr-3 pl-9 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Buscar"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={showStopped}
        className="flex items-center justify-between gap-3 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToggleStopped}
      >
        <span>Incluir parados</span>
        <span
          className={cn(
            'flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
            showStopped ? 'bg-primary dark:bg-highlight' : 'bg-input',
          )}
        >
          <span
            className={cn(
              'size-4 rounded-full bg-white shadow-sm transition-transform duration-200',
              showStopped && 'translate-x-4',
            )}
          />
        </span>
      </button>
      <hr />
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {loading && (
          <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <LuLoaderCircle className="size-3.5 animate-spin" />
            Carregando...
          </li>
        )}
        {!loading && unavailable && containers.length === 0 && (
          <li className="text-xs leading-5 text-destructive">
            Docker indisponível nesta conta local.
          </li>
        )}
        {containers.map((container) => {
          const active = container.id === selectedId
          return (
            <li key={container.id}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-highlight text-highlight' : 'border-transparent',
                )}
                onClick={() => onSelect(container)}
              >
                <LuContainer
                  aria-label={stateLabel(container.state)}
                  className={cn('size-4 shrink-0', container.running && 'text-success')}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{container.name}</span>
                  <span
                    className={cn('block truncate text-xs', !active && 'text-muted-foreground')}
                  >
                    {container.image}
                  </span>
                </span>
                {container.protectedContainer && (
                  <LuLock aria-label="Protegido" className="size-3.5 shrink-0" />
                )}
              </button>
            </li>
          )
        })}
        {!loading && !unavailable && containers.length === 0 && (
          <li className="text-sm text-muted-foreground">Nenhum container encontrado.</li>
        )}
      </ul>
      <button
        type="button"
        aria-label="Novo container"
        title="Novo container"
        disabled={creating}
        className="grid size-9 shrink-0 place-items-center self-end rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        onClick={onCreate}
      >
        <LuPlus className="size-4" />
      </button>
    </div>
  )
}

function RemoveDialog({
  container,
  removing,
  onCancel,
  onConfirm,
}: {
  container: DockerContainer
  removing: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const close = () => {
    if (!removing) onCancel()
  }
  const dialogRef = useModalDialog(true, close)
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={close}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-container-title"
        className="w-full max-w-md rounded-lg border bg-popover p-6 shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="space-y-2">
          <h2 id="remove-container-title" className="text-lg font-semibold">
            Excluir container
          </h2>
          <p className="text-sm text-muted-foreground">
            O container <strong className="font-semibold text-highlight">{container.name}</strong>{' '}
            será excluído. Os volumes e os arquivos de configuração serão mantidos.
          </p>
        </header>
        <footer className="mt-6 flex justify-end gap-2">
          <button
            data-dialog-initial-focus
            type="button"
            disabled={removing}
            className="h-9 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            onClick={close}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={removing}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-destructive px-3 text-sm font-medium text-white transition-colors hover:brightness-95 disabled:opacity-50"
            onClick={onConfirm}
          >
            {removing && <LuLoaderCircle className="size-4 animate-spin" />}Confirmar
          </button>
        </footer>
      </section>
    </div>
  )
}
