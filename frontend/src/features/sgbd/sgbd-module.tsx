import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  LuCheck,
  LuCircleAlert,
  LuDatabase,
  LuEye,
  LuHardDrive,
  LuInbox,
  LuLoaderCircle,
  LuMousePointerClick,
  LuPlus,
  LuRefreshCw,
  LuSquareCode,
  LuTable2,
  LuTrash2,
  LuX,
} from 'react-icons/lu'
import {
  type RuntimeStatus,
  type SgbdConnection,
  type SgbdConsoleUpdate,
  type SgbdHealth,
  type SgbdQueryResult,
  deleteSgbdConnection,
  deleteSgbdConsole,
  createSgbdConsole,
  executeSgbdCommand,
  fetchSgbdConsoles,
  fetchSgbdConnections,
  selectSgbdConnection,
  selectSgbdConsoleTab,
  testSavedSgbdConnection,
  updateSgbdConsole,
} from '../../api'
import { InlineInput } from '../terminal/inline-input'
import { cn } from '../../shared/lib/cn'
import { useModalDialog } from '../accessibility/use-modal-dialog'
import { ConnectionDialog, type ConnectionDialogTab } from './connection-dialog'
import { QueryConsole } from './query-console'
import { SgbdIcon } from './sgbd-icon'

type Editor =
  | { mode: 'new' }
  | { mode: 'edit'; connection: SgbdConnection; tab: ConnectionDialogTab }
  | null
type WorkspaceTab = 'schemas' | number

type ConsoleItem = {
  id: number
  label: string
  database: string | null
  query: string
  editorPercent: number
  outputLog: string
  savedResult: string
  resultsMinimized: boolean
}

type Workspace = {
  consoles: ConsoleItem[]
  activeTab: WorkspaceTab
  loaded: boolean
}

type ConnectionTest =
  | { id: number; status: 'checking' }
  | { id: number; status: 'success'; health: SgbdHealth }
  | { id: number; status: 'failed'; message: string }
  | null

type SgbdModuleProps = {
  runtime: RuntimeStatus
  isWindowActive: boolean
  newConnectionRequest: number
  onNewConnectionHandled: () => void
  onActivityChanged: () => void
}

const EMPTY_WORKSPACE: Workspace = { consoles: [], activeTab: 'schemas', loaded: false }
const PING_WARNING_MS = 100
const PING_DANGER_MS = 500
const MAX_CONSOLE_NAME_LENGTH = 40
const TAB_CLASS =
  'flex shrink-0 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors'
const SQL_SYSTEM_SCHEMAS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys'])
const SQL_SCHEMAS_QUERY =
  'SELECT s.SCHEMA_NAME AS name, COUNT(t.TABLE_NAME) AS tables, COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) AS bytes FROM information_schema.SCHEMATA s LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = s.SCHEMA_NAME GROUP BY s.SCHEMA_NAME ORDER BY s.SCHEMA_NAME'

type SchemaItem = {
  database: string
  name: string
  system: boolean
  primaryLabel: string
  primaryValue: string
  secondaryLabel: string
  secondaryValue: string
}

function schemaLabel(connection: SgbdConnection) {
  return connection.kind === 'redis' ? 'Bancos' : 'Schemas'
}

function workspaceTabId(connectionId: number, tab: WorkspaceTab) {
  return `sgbd-${connectionId}-workspace-tab-${tab === 'schemas' ? 'schemas' : tab}`
}

function workspacePanelId(connectionId: number, tab: WorkspaceTab) {
  return `sgbd-${connectionId}-workspace-panel-${tab === 'schemas' ? 'schemas' : tab}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}

export function SgbdModule({
  runtime,
  isWindowActive,
  newConnectionRequest,
  onNewConnectionHandled,
  onActivityChanged,
}: SgbdModuleProps) {
  const [connections, setConnections] = useState<SgbdConnection[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor>(null)
  const [test, setTest] = useState<ConnectionTest>(null)
  const [refreshingId, setRefreshingId] = useState<number | null>(null)
  const [workspaces, setWorkspaces] = useState<Record<number, Workspace>>({})
  const [confirmDelete, setConfirmDelete] = useState<SgbdConnection | null>(null)
  const [deleting, setDeleting] = useState(false)
  const loadedWorkspaces = useRef(new Set<string>())
  const querySaves = useRef<Record<number, number>>({})
  const pendingQueries = useRef<Record<number, string>>({})
  const runtimeKey = `${runtime.status}:${runtime.apiBase ?? ''}:${runtime.sessionToken ?? ''}`

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchSgbdConnections(runtime)
      setConnections(list)
      setSelectedId((current) => {
        if (current !== null && list.some((connection) => connection.id === current)) return current
        return list.find((connection) => connection.selected)?.id ?? null
      })
      setFailure(null)
    } catch (error) {
      setFailure(errorMessage(error))
      setConnections([])
      setSelectedId(null)
    } finally {
      setLoading(false)
    }
  }, [runtimeKey])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (newConnectionRequest === 0) return
    setEditor({ mode: 'new' })
    onNewConnectionHandled()
  }, [newConnectionRequest, onNewConnectionHandled])

  const selected = useMemo(
    () => connections?.find((connection) => connection.id === selectedId) ?? null,
    [connections, selectedId],
  )

  useEffect(() => {
    if (!isWindowActive || !selected) return
    let active = true
    setTest({ id: selected.id, status: 'checking' })
    testSavedSgbdConnection(runtime, selected.id)
      .then((health) => {
        if (active) setTest({ id: selected.id, status: 'success', health })
      })
      .catch((error: unknown) => {
        if (active) setTest({ id: selected.id, status: 'failed', message: errorMessage(error) })
      })
    return () => {
      active = false
    }
  }, [isWindowActive, runtimeKey, selected?.id])

  useEffect(() => {
    if (!isWindowActive || !selected?.autoPing) return
    let active = true
    const ping = () => {
      testSavedSgbdConnection(runtime, selected.id)
        .then((health) => {
          if (active) setTest({ id: selected.id, status: 'success', health })
        })
        .catch((error: unknown) => {
          if (active) setTest({ id: selected.id, status: 'failed', message: errorMessage(error) })
        })
    }
    const timer = window.setInterval(ping, 60_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [isWindowActive, runtimeKey, selected?.autoPing, selected?.id])

  const select = async (connection: SgbdConnection) => {
    if (connection.id === selectedId) {
      setSelectedId(null)
      setTest(null)
      return
    }
    setSelectedId(connection.id)
    setTest({ id: connection.id, status: 'checking' })
    try {
      await selectSgbdConnection(runtime, connection.id)
      setConnections(
        (current) =>
          current?.map((item) => ({ ...item, selected: item.id === connection.id })) ?? null,
      )
    } catch (error) {
      setFailure(errorMessage(error))
      void reload()
    }
  }

  const testConnection = async (connection: SgbdConnection) => {
    setRefreshingId(connection.id)
    try {
      const health = await testSavedSgbdConnection(runtime, connection.id)
      setTest({ id: connection.id, status: 'success', health })
    } catch (error) {
      setTest({ id: connection.id, status: 'failed', message: errorMessage(error) })
    } finally {
      setRefreshingId((current) => (current === connection.id ? null : current))
    }
  }

  const updateWorkspace = useCallback(
    (connectionId: number, change: (workspace: Workspace) => Workspace) => {
      setWorkspaces((current) => ({
        ...current,
        [connectionId]: change(current[connectionId] ?? EMPTY_WORKSPACE),
      }))
    },
    [],
  )

  const persistConsole = useCallback(
    (consoleId: number, update: SgbdConsoleUpdate) => {
      void updateSgbdConsole(runtime, consoleId, update).catch(() => undefined)
    },
    [runtimeKey],
  )

  useEffect(() => {
    if (!selected) return
    const loadKey = `${runtimeKey}:${selected.id}`
    if (loadedWorkspaces.current.has(loadKey)) return
    loadedWorkspaces.current.add(loadKey)
    let current = true
    let settled = false
    void fetchSgbdConsoles(runtime, selected.id)
      .then((savedConsoles) => {
        settled = true
        if (!current) return
        const consoles: ConsoleItem[] = savedConsoles.map((item) => ({
          id: item.id,
          label: item.label,
          database: item.database || null,
          query: item.query,
          editorPercent: item.editorPercent,
          outputLog: item.outputLog,
          savedResult: item.savedResult,
          resultsMinimized: item.resultsMinimized,
        }))
        const activeTab = savedConsoles.find((item) => item.active)?.id ?? 'schemas'
        updateWorkspace(selected.id, (workspace) => ({
          ...workspace,
          consoles,
          activeTab,
          loaded: true,
        }))
      })
      .catch(() => {
        settled = true
        if (current) updateWorkspace(selected.id, (workspace) => ({ ...workspace, loaded: true }))
      })
    return () => {
      current = false
      if (!settled) loadedWorkspaces.current.delete(loadKey)
    }
  }, [runtimeKey, selected?.id, updateWorkspace])

  useEffect(
    () => () => {
      Object.values(querySaves.current).forEach((timer) => window.clearTimeout(timer))
      Object.entries(pendingQueries.current).forEach(([id, query]) => {
        persistConsole(Number(id), { query })
      })
    },
    [persistConsole],
  )

  const openConsole = async (connection: SgbdConnection, database: string | null = null) => {
    try {
      const created = await createSgbdConsole(runtime, connection.id, database)
      const item: ConsoleItem = {
        id: created.id,
        label: created.label,
        database: created.database || null,
        query: created.query,
        editorPercent: created.editorPercent,
        outputLog: created.outputLog,
        savedResult: created.savedResult,
        resultsMinimized: created.resultsMinimized,
      }
      updateWorkspace(connection.id, (workspace) => ({
        ...workspace,
        consoles: [...workspace.consoles, item],
        activeTab: item.id,
        loaded: true,
      }))
    } catch (error) {
      setFailure(errorMessage(error))
    }
  }

  const selectTab = (connectionId: number, tab: WorkspaceTab) => {
    updateWorkspace(connectionId, (workspace) => ({ ...workspace, activeTab: tab }))
    void selectSgbdConsoleTab(runtime, connectionId, typeof tab === 'number' ? tab : null).catch(
      () => undefined,
    )
  }

  const closeConsole = async (connectionId: number, consoleId: number) => {
    const workspace = workspaces[connectionId] ?? EMPTY_WORKSPACE
    const index = workspace.consoles.findIndex((item) => item.id === consoleId)
    const consoles = workspace.consoles.filter((item) => item.id !== consoleId)
    const nextActive =
      workspace.activeTab === consoleId
        ? (consoles[Math.min(index, consoles.length - 1)]?.id ?? 'schemas')
        : workspace.activeTab
    window.clearTimeout(querySaves.current[consoleId])
    delete querySaves.current[consoleId]
    delete pendingQueries.current[consoleId]
    try {
      if (workspace.activeTab === consoleId) {
        await selectSgbdConsoleTab(
          runtime,
          connectionId,
          typeof nextActive === 'number' ? nextActive : null,
        )
      }
      await deleteSgbdConsole(runtime, consoleId)
      updateWorkspace(connectionId, (current) => {
        const currentIndex = current.consoles.findIndex((item) => item.id === consoleId)
        const remaining = current.consoles.filter((item) => item.id !== consoleId)
        const neighbor = remaining[Math.min(currentIndex, remaining.length - 1)]?.id ?? 'schemas'
        return {
          ...current,
          consoles: remaining,
          activeTab: current.activeTab === consoleId ? neighbor : current.activeTab,
        }
      })
    } catch (error) {
      setFailure(errorMessage(error))
    }
  }

  const renameConsole = (connectionId: number, consoleId: number, label: string) => {
    updateWorkspace(connectionId, (workspace) => ({
      ...workspace,
      consoles: workspace.consoles.map((item) =>
        item.id === consoleId ? { ...item, label } : item,
      ),
    }))
    persistConsole(consoleId, { label })
  }

  const changeConsoleQuery = (connectionId: number, consoleId: number, query: string) => {
    updateWorkspace(connectionId, (workspace) => ({
      ...workspace,
      consoles: workspace.consoles.map((item) =>
        item.id === consoleId ? { ...item, query } : item,
      ),
    }))
    pendingQueries.current[consoleId] = query
    window.clearTimeout(querySaves.current[consoleId])
    querySaves.current[consoleId] = window.setTimeout(() => {
      const pending = pendingQueries.current[consoleId]
      delete querySaves.current[consoleId]
      delete pendingQueries.current[consoleId]
      if (pending !== undefined) persistConsole(consoleId, { query: pending })
    }, 500)
  }

  const changeConsoleEditorPercent = (
    connectionId: number,
    consoleId: number,
    editorPercent: number,
  ) => {
    updateWorkspace(connectionId, (workspace) => ({
      ...workspace,
      consoles: workspace.consoles.map((item) =>
        item.id === consoleId ? { ...item, editorPercent } : item,
      ),
    }))
    persistConsole(consoleId, { editorPercent })
  }

  const changeConsoleState = (
    connectionId: number,
    consoleId: number,
    state: Pick<SgbdConsoleUpdate, 'outputLog' | 'savedResult' | 'resultsMinimized'>,
  ) => {
    updateWorkspace(connectionId, (workspace) => ({
      ...workspace,
      consoles: workspace.consoles.map((item) =>
        item.id === consoleId ? { ...item, ...state } : item,
      ),
    }))
    persistConsole(consoleId, state)
  }

  const saved = (connection: SgbdConnection, showSchemas: boolean) => {
    setEditor(showSchemas ? { mode: 'edit', connection, tab: 'schemas' } : null)
    setSelectedId(connection.id)
    setConnections((current) => {
      const otherConnections = (current ?? [])
        .filter((item) => item.id !== connection.id)
        .map((item) => (connection.selected ? { ...item, selected: false } : item))
      return [...otherConnections, connection].sort(
        (left, right) => left.name.localeCompare(right.name, 'pt-BR') || left.id - right.id,
      )
    })
    onActivityChanged()
  }

  const remove = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteSgbdConnection(runtime, confirmDelete.id)
      setConnections(
        (current) => current?.filter((connection) => connection.id !== confirmDelete.id) ?? null,
      )
      setWorkspaces((current) => {
        const { [confirmDelete.id]: _deleted, ...rest } = current
        return rest
      })
      if (selectedId === confirmDelete.id) setSelectedId(null)
      setTest(null)
      setConfirmDelete(null)
      onActivityChanged()
    } catch (error) {
      setFailure(errorMessage(error))
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const workspace = selected ? (workspaces[selected.id] ?? EMPTY_WORKSPACE) : EMPTY_WORKSPACE
  const activeConsole = workspace.consoles.find((item) => item.id === workspace.activeTab)

  return (
    <Fragment>
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto h-full w-full max-w-520">
          {loading && connections === null && <LoadingState />}
          {!loading && failure && <FailureState message={failure} onRetry={() => void reload()} />}
          {!loading && !failure && connections?.length === 0 && <EmptyState />}
          {!loading && !failure && connections && connections.length > 0 && !selected && (
            <SelectionState />
          )}
          {!loading && !failure && selected && (
            <ConnectionWorkspace
              runtime={runtime}
              connection={selected}
              test={test?.id === selected.id ? test : null}
              refreshing={refreshingId === selected.id}
              workspace={workspace}
              activeConsole={activeConsole}
              onTest={() => void testConnection(selected)}
              onEdit={() => setEditor({ mode: 'edit', connection: selected, tab: 'general' })}
              onDelete={() => setConfirmDelete(selected)}
              onSelectTab={(tab) => selectTab(selected.id, tab)}
              onAddConsole={(database) => void openConsole(selected, database)}
              onCloseConsole={(consoleId) => void closeConsole(selected.id, consoleId)}
              onRenameConsole={(consoleId, label) => renameConsole(selected.id, consoleId, label)}
              onConsoleQueryChange={(consoleId, query) =>
                changeConsoleQuery(selected.id, consoleId, query)
              }
              onConsoleEditorPercentChange={(consoleId, editorPercent) =>
                changeConsoleEditorPercent(selected.id, consoleId, editorPercent)
              }
              onConsoleStateChange={(consoleId, state) =>
                changeConsoleState(selected.id, consoleId, state)
              }
            />
          )}
        </div>
      </main>
      <aside className="w-70 shrink-0 overflow-auto border-l p-6">
        <ConnectionPanel
          connections={connections}
          selectedId={selectedId}
          loading={loading}
          onSelect={(connection) => void select(connection)}
          onNew={() => setEditor({ mode: 'new' })}
        />
      </aside>
      {editor && (
        <ConnectionDialog
          key={editor.mode === 'new' ? 'new' : `${editor.connection.id}-${editor.tab}`}
          runtime={runtime}
          connection={editor.mode === 'new' ? null : editor.connection}
          initialTab={editor.mode === 'new' ? 'general' : editor.tab}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {confirmDelete && (
        <DeleteDialog
          connection={confirmDelete}
          deleting={deleting}
          onCancel={() => !deleting && setConfirmDelete(null)}
          onConfirm={() => void remove()}
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

function FailureState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="animate-in fade-in flex h-full items-center justify-center p-6 duration-200">
      <div className="max-w-md text-center">
        <LuCircleAlert className="mx-auto size-20 text-destructive/50" strokeWidth={1.25} />
        <p role="alert" className="mt-4 text-sm text-muted-foreground">
          {message}
        </p>
        <button
          type="button"
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted"
          onClick={onRetry}
        >
          <LuRefreshCw className="size-4" />
          Tentar novamente
        </button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="animate-in fade-in flex h-full items-center justify-center p-6 duration-200">
      <p className="text-sm text-muted-foreground">
        Nenhuma conexão. Use o + para criar a primeira.
      </p>
    </div>
  )
}

function SelectionState() {
  return (
    <div className="animate-in fade-in flex h-full w-full items-center justify-center p-6 duration-200">
      <LuMousePointerClick
        aria-label="Selecione uma conexão"
        className="size-20 text-muted-foreground/40"
        strokeWidth={1.25}
      />
    </div>
  )
}

function ConnectionWorkspace({
  runtime,
  connection,
  test,
  refreshing,
  workspace,
  activeConsole,
  onTest,
  onEdit,
  onDelete,
  onSelectTab,
  onAddConsole,
  onCloseConsole,
  onRenameConsole,
  onConsoleQueryChange,
  onConsoleEditorPercentChange,
  onConsoleStateChange,
}: {
  runtime: RuntimeStatus
  connection: SgbdConnection
  test: ConnectionTest
  refreshing: boolean
  workspace: Workspace
  activeConsole: ConsoleItem | undefined
  onTest: () => void
  onEdit: () => void
  onDelete: () => void
  onSelectTab: (tab: WorkspaceTab) => void
  onAddConsole: (database?: string | null) => void
  onCloseConsole: (id: number) => void
  onRenameConsole: (id: number, label: string) => void
  onConsoleQueryChange: (id: number, query: string) => void
  onConsoleEditorPercentChange: (id: number, percent: number) => void
  onConsoleStateChange: (
    id: number,
    state: Pick<SgbdConsoleUpdate, 'outputLog' | 'savedResult' | 'resultsMinimized'>,
  ) => void
}) {
  const health = test?.status === 'success' ? test.health : null

  return (
    <div className="animate-in fade-in flex h-full min-h-0 flex-col gap-4 p-6 duration-200">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <SgbdIcon kind={connection.kind} className="size-5" />
            <h2 className="truncate text-xl font-semibold tracking-tight">{connection.name}</h2>
            <StatusBadge test={test} />
            {health && <PingBadge pingMs={health.latencyMs} />}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {connection.host}:{connection.port}
            {health && ` · ${health.product}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Atualizar conexão"
            title="Atualizar conexão"
            disabled={refreshing}
            className="grid size-9 place-items-center rounded-lg border transition-colors hover:bg-muted disabled:opacity-50"
            onClick={onTest}
          >
            <LuRefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium uppercase transition-colors hover:bg-muted"
            onClick={onEdit}
          >
            <LuEye className="size-4" />
            Editar
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium text-destructive uppercase transition-colors hover:bg-muted hover:text-destructive"
            onClick={onDelete}
          >
            <LuTrash2 className="size-4" />
            Remover
          </button>
        </div>
      </header>
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <SgbdTabs
          connection={connection}
          workspace={workspace}
          disabled={!workspace.loaded}
          onSelect={onSelectTab}
          onClose={onCloseConsole}
          onRename={onRenameConsole}
          onAdd={onAddConsole}
        />
        {!workspace.loaded ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <LuLoaderCircle
              aria-label="Restaurando consoles"
              className="size-7 animate-spin text-muted-foreground/50"
            />
          </div>
        ) : activeConsole ? (
          workspace.consoles.map((item) => (
            <div
              key={item.id}
              id={workspacePanelId(connection.id, item.id)}
              role="tabpanel"
              aria-labelledby={workspaceTabId(connection.id, item.id)}
              className={cn(
                'flex min-h-0 flex-1 flex-col',
                item.id !== activeConsole.id && 'hidden',
              )}
            >
              <QueryConsole
                consoleId={item.id}
                runtime={runtime}
                connection={connection}
                database={item.database}
                command={item.query}
                editorPercent={item.editorPercent}
                outputLog={item.outputLog}
                savedResult={item.savedResult}
                resultsMinimized={item.resultsMinimized}
                onCommandChange={(query) => onConsoleQueryChange(item.id, query)}
                onEditorPercentChange={(percent) => onConsoleEditorPercentChange(item.id, percent)}
                onStateChange={(state) => onConsoleStateChange(item.id, state)}
              />
            </div>
          ))
        ) : (
          <div
            id={workspacePanelId(connection.id, 'schemas')}
            role="tabpanel"
            aria-labelledby={workspaceTabId(connection.id, 'schemas')}
            className="flex min-h-0 flex-1"
          >
            <SchemaList
              runtime={runtime}
              connection={connection}
              connected={test?.status === 'success'}
              onOpenConsole={onAddConsole}
            />
          </div>
        )}
      </section>
    </div>
  )
}

function StatusBadge({ test }: { test: ConnectionTest }) {
  const className =
    test?.status === 'success'
      ? 'bg-success/15 text-success'
      : test?.status === 'failed'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-muted text-muted-foreground'
  const label =
    test?.status === 'success'
      ? 'Conectado'
      : test?.status === 'failed'
        ? 'Sem conexão'
        : 'Conectando...'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase',
        className,
      )}
    >
      {test?.status === 'checking' && <LuLoaderCircle className="size-3 animate-spin" />}
      {label}
    </span>
  )
}

function PingBadge({ pingMs }: { pingMs: number }) {
  const className =
    pingMs <= PING_WARNING_MS
      ? 'bg-success/15 text-success'
      : pingMs <= PING_DANGER_MS
        ? 'bg-primary-soft text-warning'
        : 'bg-destructive/10 text-destructive'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase',
        className,
      )}
    >
      {pingMs} MS
    </span>
  )
}

function SgbdTabs({
  connection,
  workspace,
  disabled,
  onSelect,
  onClose,
  onRename,
  onAdd,
}: {
  connection: SgbdConnection
  workspace: Workspace
  disabled: boolean
  onSelect: (tab: WorkspaceTab) => void
  onClose: (id: number) => void
  onRename: (id: number, label: string) => void
  onAdd: (database?: string | null) => void
}) {
  const tabs: WorkspaceTab[] = ['schemas', ...workspace.consoles.map((item) => item.id)]
  const moveFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, current: WorkspaceTab) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const currentIndex = tabs.findIndex((tab) => tab === current)
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    const next = tabs[nextIndex]
    onSelect(next)
    window.requestAnimationFrame(() =>
      document.getElementById(workspaceTabId(connection.id, next))?.focus(),
    )
  }
  return (
    <div
      role="tablist"
      aria-label="Área de trabalho do banco"
      aria-orientation="horizontal"
      className="flex items-center gap-1 border-b"
    >
      <button
        id={workspaceTabId(connection.id, 'schemas')}
        type="button"
        role="tab"
        aria-selected={workspace.activeTab === 'schemas'}
        aria-controls={workspacePanelId(connection.id, 'schemas')}
        tabIndex={workspace.activeTab === 'schemas' ? 0 : -1}
        disabled={disabled}
        className={cn(
          TAB_CLASS,
          'px-3 py-2 disabled:pointer-events-none disabled:opacity-50',
          tabColors(workspace.activeTab === 'schemas'),
        )}
        onClick={() => onSelect('schemas')}
        onKeyDown={(event) => moveFocus(event, 'schemas')}
      >
        <LuDatabase className="size-4" />
        {schemaLabel(connection)}
      </button>
      <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />
      <div
        className="flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        onWheel={(event) => {
          event.currentTarget.scrollLeft += event.deltaY + event.deltaX
        }}
      >
        {workspace.consoles.map((item) => (
          <ConsoleTab
            key={item.id}
            item={item}
            active={workspace.activeTab === item.id}
            disabled={disabled}
            tabId={workspaceTabId(connection.id, item.id)}
            panelId={workspacePanelId(connection.id, item.id)}
            onSelect={() => onSelect(item.id)}
            onClose={() => onClose(item.id)}
            onRename={(label) => onRename(item.id, label)}
            onKeyDown={(event) => moveFocus(event, item.id)}
          />
        ))}
      </div>
      <button
        type="button"
        aria-label="Novo console"
        title="Novo console"
        disabled={disabled}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        onClick={() => onAdd()}
      >
        <LuPlus className="size-4" />
      </button>
    </div>
  )
}

function ConsoleTab({
  item,
  active,
  disabled,
  tabId,
  panelId,
  onSelect,
  onClose,
  onRename,
  onKeyDown,
}: {
  item: ConsoleItem
  active: boolean
  disabled: boolean
  tabId: string
  panelId: string
  onSelect: () => void
  onClose: () => void
  onRename: (label: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const closeButton = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!confirming) return
    const cancelOutside = (event: PointerEvent) => {
      if (!closeButton.current?.contains(event.target as Node)) setConfirming(false)
    }
    document.addEventListener('pointerdown', cancelOutside)
    return () => document.removeEventListener('pointerdown', cancelOutside)
  }, [confirming])

  return (
    <div className={cn(TAB_CLASS, 'w-56', tabColors(active))}>
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-3">
          <LuSquareCode className="size-4 shrink-0" />
          <InlineInput
            value={item.label}
            label="Nome do console"
            maxLength={MAX_CONSOLE_NAME_LENGTH}
            className="rounded-sm"
            onCommit={(label) => {
              onRename(label)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <button
          id={tabId}
          type="button"
          role="tab"
          aria-selected={active}
          aria-controls={panelId}
          tabIndex={active ? 0 : -1}
          disabled={disabled}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-3 disabled:pointer-events-none"
          onClick={onSelect}
          onKeyDown={onKeyDown}
          onDoubleClick={() => setEditing(true)}
        >
          <LuSquareCode className="size-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </button>
      )}
      <button
        ref={closeButton}
        type="button"
        aria-label={confirming ? `Confirmar fechar ${item.label}` : `Fechar ${item.label}`}
        disabled={disabled}
        className={cn(
          'mr-1 ml-2 flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50',
          confirming && 'text-destructive',
        )}
        onClick={() => (confirming ? onClose() : setConfirming(true))}
      >
        {confirming ? <LuCheck className="size-3.5" /> : <LuX className="size-3.5" />}
      </button>
    </div>
  )
}

function tabColors(active: boolean) {
  return active ? 'border-highlight text-highlight' : 'border-transparent text-muted-foreground'
}

function SchemaList({
  runtime,
  connection,
  connected,
  onOpenConsole,
}: {
  runtime: RuntimeStatus
  connection: SgbdConnection
  connected: boolean
  onOpenConsole: (database: string) => void
}) {
  const [schemas, setSchemas] = useState<SchemaItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const runtimeKey = `${runtime.status}:${runtime.apiBase ?? ''}:${runtime.sessionToken ?? ''}`

  const reload = useCallback(async () => {
    try {
      const command = connection.kind === 'redis' ? 'INFO keyspace' : SQL_SCHEMAS_QUERY
      const result = await executeSgbdCommand(runtime, connection.id, command)
      setSchemas(parseSchemas(connection, result))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [connection.id, connection.kind, runtimeKey])

  useEffect(() => {
    setSchemas(null)
    setFailed(false)
    if (connected) void reload()
  }, [connected, reload])

  if (!connected && !failed) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <LuLoaderCircle
          aria-label="Carregando schemas"
          className="size-7 animate-spin text-muted-foreground/50"
        />
      </div>
    )
  }

  if (failed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <LuCircleAlert
          aria-label="Não foi possível carregar os schemas"
          className="size-20 text-destructive/50"
          strokeWidth={1.25}
        />
        <p role="alert" className="text-sm text-muted-foreground">
          Não foi possível carregar os {schemaLabel(connection).toLowerCase()}.
        </p>
      </div>
    )
  }

  if (schemas === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <LuLoaderCircle
          aria-label="Carregando schemas"
          className="size-7 animate-spin text-muted-foreground/50"
        />
      </div>
    )
  }

  const visibleSchemas = schemas.filter(
    (schema) =>
      (connection.showSystemSchemas || !schema.system) &&
      (connection.showAllSchemas || connection.selectedSchemas.includes(schema.name)),
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(max(13rem,calc((100%-2.25rem)/4)),1fr))] gap-3">
        {visibleSchemas.map((schema) => (
          <SchemaCard
            key={schema.database}
            schema={schema}
            onOpen={() => onOpenConsole(schema.database)}
          />
        ))}
        {visibleSchemas.length === 0 && (
          <div className="col-span-full flex min-h-24 items-center justify-center text-muted-foreground">
            <LuInbox
              aria-label={`Nenhum ${schemaLabel(connection).toLowerCase()} encontrado`}
              className="size-5"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function SchemaCard({ schema, onOpen }: { schema: SchemaItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Abrir console de ${schema.name}`}
      className="relative rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:border-highlight focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
    >
      <p className="truncate pr-8 text-sm font-semibold">{schema.name}</p>
      <span
        aria-hidden="true"
        className="absolute top-2.5 right-2.5 flex size-7 items-center justify-center text-muted-foreground"
      >
        <LuEye className="size-[18px]" />
      </span>
      <dl className="mt-3 flex items-center gap-4 pr-8">
        <div className="flex shrink-0 items-center gap-1.5">
          <dt className="shrink-0 text-muted-foreground">
            <LuTable2 className="size-[18px]" />
          </dt>
          <dd className="text-sm font-medium whitespace-nowrap" title={schema.primaryLabel}>
            {schema.primaryValue}
          </dd>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <dt className="shrink-0 text-muted-foreground">
            <LuHardDrive className="size-[18px]" />
          </dt>
          <dd className="text-sm font-medium whitespace-nowrap" title={schema.secondaryLabel}>
            {schema.secondaryValue}
          </dd>
        </div>
      </dl>
    </button>
  )
}

function parseSchemas(connection: SgbdConnection, result: SgbdQueryResult): SchemaItem[] {
  if (connection.kind === 'redis') {
    const source = result.rows.flat().join('\n')
    return source.split('\n').flatMap((line) => {
      const match = /^db(\d+):keys=(\d+),expires=(\d+)/.exec(line.trim())
      if (!match) return []
      return [
        {
          database: match[1],
          name: `db${match[1]}`,
          system: false,
          primaryLabel: 'Chaves',
          primaryValue: number(match[2]),
          secondaryLabel: 'Com expiração',
          secondaryValue: number(match[3]),
        },
      ]
    })
  }

  const indexes = Object.fromEntries(
    result.columns.map((column, index) => [column.toLowerCase(), index]),
  )
  const nameIndex = indexes.name ?? 0
  const tableIndex = indexes.tables ?? 1
  const sizeIndex = indexes.bytes ?? 2
  return result.rows.flatMap((row) => {
    const name = row[nameIndex]?.trim()
    if (!name) return []
    return [
      {
        database: name,
        name,
        system: SQL_SYSTEM_SCHEMAS.has(name.toLowerCase()),
        primaryLabel: 'Tabelas',
        primaryValue: number(row[tableIndex]),
        secondaryLabel: 'Tamanho',
        secondaryValue: formatBytes(row[sizeIndex]),
      },
    ]
  })
}

function number(value: string | null | undefined) {
  return Number(value ?? 0).toLocaleString('pt-BR')
}

function formatBytes(value: string | null | undefined) {
  const bytes = Math.max(0, Number(value ?? 0))
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toLocaleString('pt-BR', { maximumFractionDigits: index === 0 ? 0 : 1 })} ${units[index]}`
}

function ConnectionPanel({
  connections,
  selectedId,
  loading,
  onSelect,
  onNew,
}: {
  connections: SgbdConnection[] | null
  selectedId: number | null
  loading: boolean
  onSelect: (connection: SgbdConnection) => void
  onNew: () => void
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <h2 className="text-sm font-medium">Conexões</h2>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {loading && (
          <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <LuLoaderCircle className="size-3.5 animate-spin" />
            Carregando...
          </li>
        )}
        {connections?.map((connection) => {
          const active = connection.id === selectedId
          return (
            <li key={connection.id}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-highlight text-highlight' : 'border-transparent',
                )}
                onClick={() => onSelect(connection)}
              >
                <SgbdIcon kind={connection.kind} className="size-4" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {connection.name}
                </span>
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            aria-label="Nova conexão"
            title="Nova conexão"
            className="flex h-9 w-full items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-highlight hover:text-highlight"
            onClick={onNew}
          >
            <LuPlus className="size-4" />
          </button>
        </li>
      </ul>
    </div>
  )
}

function DeleteDialog({
  connection,
  deleting,
  onCancel,
  onConfirm,
}: {
  connection: SgbdConnection
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const close = () => {
    if (!deleting) onCancel()
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
        aria-labelledby="delete-connection-title"
        className="w-full max-w-md rounded-lg border bg-popover p-6 shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="space-y-2">
          <h2 id="delete-connection-title" className="text-lg font-semibold">
            Remover conexão
          </h2>
          <p className="text-sm text-muted-foreground">
            A conexão <strong className="font-semibold text-highlight">{connection.name}</strong>{' '}
            será removida. O banco de dados não é alterado.
          </p>
        </header>
        <footer className="mt-6 flex justify-end gap-2">
          <button
            data-dialog-initial-focus
            type="button"
            disabled={deleting}
            className="h-9 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            onClick={close}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={deleting}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-destructive px-3 text-sm font-medium text-white transition-colors hover:brightness-95 disabled:opacity-50"
            onClick={onConfirm}
          >
            {deleting && <LuLoaderCircle className="size-4 animate-spin" />}Confirmar
          </button>
        </footer>
      </section>
    </div>
  )
}
