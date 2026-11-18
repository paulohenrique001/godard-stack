import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearConnectionToResume,
  cancelExecution,
  createConsole,
  fetchConnectionToResume,
  deleteConnection,
  deleteConsole,
  executeStatements,
  fetchConnections,
  fetchConsoles,
  fetchStructure,
  testConnection,
  toForm,
  saveActiveTab,
  saveConsoleResults,
  updateConsole,
  type ConnectionStatus,
  type ExecutionReport,
  type ResultTable,
  type SavedConsole,
  type SgbdConnection,
  type SqlStructure,
} from '@/features/sgbd/sgbd-api'
import { DRIVERS } from '@/features/sgbd/sgbd-drivers'
import { useSettings } from '@/features/settings/settings-provider'
const QUERY_SAVE_DELAY_MS = 600
const MAX_AUTOMATIC_PING_FAILURES = 3
const CHECKING: ConnectionStatus = { kind: 'checking' }
const EMPTY_STRUCTURE: SqlStructure = {}

export type SgbdEditor = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; connection: SgbdConnection; tab?: 'schemas' }

export type QueryConsole = SavedConsole

export type SgbdTab = 'schemas' | number

export type SgbdWorkspace = {
  consoles: QueryConsole[]
  activeTab: SgbdTab
  loaded: boolean
}

const EMPTY_WORKSPACE: SgbdWorkspace = { consoles: [], activeTab: 'schemas', loaded: false }

export type QueryLogEntry = {
  id: number
  at: string
  prompt: string
  query: string
  message: string
  failed: boolean
}

export type OpenResult = ResultTable & {
  id: number
  statement: string
  schema: string | null
  loading: boolean
}

export type ConsoleRun = {
  log: QueryLogEntry[]
  tables: OpenResult[]
  activeResult: 'output' | number
  running: boolean
  minimized: boolean
}

const EMPTY_RUN: ConsoleRun = { log: [], tables: [], activeResult: 'output', running: false, minimized: true }
const MAX_LOG_ENTRIES = 200
const MAX_SAVED_LOG_CHARS = 400_000
const MAX_SAVED_RESULTS_CHARS = 3_000_000
const NO_SAVED_RESULT = -1

function persistInBackground(task: Promise<unknown>) {
  void task.catch(() => undefined)
}

function savedLog(log: QueryLogEntry[]) {
  let kept = log
  while (JSON.stringify(kept).length > MAX_SAVED_LOG_CHARS) {
    kept = kept.slice(1)
  }
  return JSON.stringify(kept)
}

function savedResults({ tables, activeResult }: ConsoleRun) {
  let kept = tables
  const serialized = () =>
    JSON.stringify({
      active: kept.findIndex((table) => table.id === activeResult),
      tables: kept.map(({ id: _id, loading: _loading, ...table }) => table),
    })
  while (serialized().length > MAX_SAVED_RESULTS_CHARS) {
    kept = kept.slice(1)
  }
  return kept.length === 0 ? '' : serialized()
}

function parseResults(text: string): { active: number; tables: Omit<OpenResult, 'id' | 'loading'>[] } {
  try {
    return text === '' ? { active: NO_SAVED_RESULT, tables: [] } : JSON.parse(text)
  } catch {
    return { active: NO_SAVED_RESULT, tables: [] }
  }
}

function parseLog(text: string): Omit<QueryLogEntry, 'id'>[] {
  try {
    return text === '' ? [] : JSON.parse(text)
  } catch {
    return []
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

function currentTimestamp() {
  const now = new Date()
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `${date} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

export type Sgbd = ReturnType<typeof useSgbd>

export function useSgbd(active: boolean) {
  const { refreshInterval } = useSettings()
  const [connections, setConnections] = useState<SgbdConnection[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editor, setEditor] = useState<SgbdEditor>({ mode: 'closed' })
  const [statuses, setStatuses] = useState<Record<number, ConnectionStatus>>({})
  const [, setAutomaticFailures] = useState<Record<number, number>>({})
  const automaticFailuresRef = useRef<Record<number, number>>({})
  const latestPing = useRef<Record<number, number>>({})
  const [workspaces, setWorkspaces] = useState<Record<number, SgbdWorkspace>>({})
  const [structures, setStructures] = useState<Record<number, SqlStructure>>({})
  const loadedConsoles = useRef(new Set<number>())
  const querySaves = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const [runs, setRuns] = useState<Record<number, ConsoleRun>>({})
  const runsRef = useRef(runs)
  runsRef.current = runs
  const nextRunItem = useRef(1)
  const persistedRuns = useRef<Record<number, Pick<ConsoleRun, 'tables' | 'activeResult'>>>({})
  const runningRequests = useRef<Record<number, string>>({})

  const refresh = useCallback(async () => {
    try {
      const list = await fetchConnections()
      setConnections(list)
      automaticFailuresRef.current = {}
      setAutomaticFailures({})
      return list
    } catch {
      setConnections([])
      return []
    }
  }, [])

  useEffect(() => {
    refresh()
    fetchConnectionToResume().then((id) => setSelectedId((current) => current ?? id))
  }, [refresh])

  const selected = connections?.find((connection) => connection.id === selectedId) ?? null
  const selectedConnected = selected ? statuses[selected.id]?.kind === 'ok' : false
  const automaticFailureCount = useCallback(
    (connection: SgbdConnection) => automaticFailuresRef.current[connection.id] ?? connection.autoPingFailures,
    [],
  )
  const requiresManualPing = useCallback(
    (connection: SgbdConnection) => automaticFailureCount(connection) >= MAX_AUTOMATIC_PING_FAILURES,
    [automaticFailureCount],
  )
  const statusOf = (connection: SgbdConnection) => statuses[connection.id] ?? CHECKING

  const ping = useCallback(async (connection: SgbdConnection, automatic = false): Promise<ConnectionStatus> => {
    if (automatic && requiresManualPing(connection)) {
      const status: ConnectionStatus = {
        kind: 'failed',
        message: 'Verificação automática suspensa após três falhas. Use Atualizar para testar novamente.',
      }
      setStatuses((current) => ({ ...current, [connection.id]: status }))
      return status
    }
    const request = (latestPing.current[connection.id] ?? 0) + 1
    latestPing.current[connection.id] = request
    let status: ConnectionStatus
    try {
      status = { kind: 'ok', health: await testConnection(toForm(connection), connection.id, automatic) }
    } catch (failure) {
      status = { kind: 'failed', message: failure instanceof Error ? failure.message : 'Falha ao conectar.' }
    }
    if (automatic || status.kind === 'ok') {
      setAutomaticFailures((current) => {
        const previous = current[connection.id] ?? connection.autoPingFailures
        const next = status.kind === 'ok' ? 0 : Math.min(previous + 1, MAX_AUTOMATIC_PING_FAILURES)
        automaticFailuresRef.current = { ...automaticFailuresRef.current, [connection.id]: next }
        return { ...current, [connection.id]: next }
      })
    }
    if (latestPing.current[connection.id] === request) {
      setStatuses((current) => ({ ...current, [connection.id]: status }))
    }
    return status
  }, [requiresManualPing])

  useEffect(() => {
    if (!active || !selected) {
      return
    }
    const check = () => {
      if (!requiresManualPing(selected)) {
        void ping(selected, true)
      }
    }
    check()
    if (!selected.autoPing || requiresManualPing(selected) || refreshInterval === 0) {
      return
    }
    const timer = setInterval(check, refreshInterval)
    return () => clearInterval(timer)
  }, [active, ping, refreshInterval, requiresManualPing, selected])

  const workspaceOf = (connection: SgbdConnection) => workspaces[connection.id] ?? EMPTY_WORKSPACE

  const updateWorkspace = useCallback((id: number, change: (workspace: SgbdWorkspace) => SgbdWorkspace) => {
    setWorkspaces((current) => ({ ...current, [id]: change(current[id] ?? EMPTY_WORKSPACE) }))
  }, [])

  useEffect(() => {
    if (!selected || loadedConsoles.current.has(selected.id)) {
      return
    }
    const { id } = selected
    loadedConsoles.current.add(id)
    fetchConsoles(id).then((consoles) => {
      const saved = consoles.find((item) => item.active)?.id ?? 'schemas'
      const restored = consoles.map((item) => {
        const log = parseLog(item.log).map((entry) => ({ ...entry, id: nextRunItem.current++ }))
        const { active, tables: saved } = parseResults(item.results)
        const tables = saved.map((table) => ({ ...table, id: nextRunItem.current++, loading: false }))
        const activeResult = tables[active]?.id ?? EMPTY_RUN.activeResult
        persistedRuns.current[item.id] = { tables, activeResult }
        return [item.id, { ...EMPTY_RUN, log, tables, activeResult, minimized: item.resultsMinimized }]
      })
      setRuns((current) => ({ ...Object.fromEntries(restored), ...current }))
      updateWorkspace(id, (workspace) => ({
        ...workspace,
        consoles,
        activeTab: workspace.activeTab === 'schemas' ? saved : workspace.activeTab,
        loaded: true,
      }))
    })
  }, [selected, updateWorkspace])

  const savedTab = selectedId === null ? undefined : workspaces[selectedId]

  useEffect(() => {
    if (selectedId !== null && savedTab?.loaded) {
      persistInBackground(saveActiveTab(selectedId, savedTab.activeTab === 'schemas' ? null : savedTab.activeTab))
    }
  }, [selectedId, savedTab?.loaded, savedTab?.activeTab])

  const openConsole = useCallback(
    async (connectionId: number, schema: string | null) => {
      const created = await createConsole(connectionId, schema)
      updateWorkspace(connectionId, (workspace) => ({
        ...workspace,
        consoles: [...workspace.consoles, created],
        activeTab: created.id,
      }))
    },
    [updateWorkspace],
  )

  const closeConsole = useCallback(
    (connectionId: number, consoleId: number) => {
      clearTimeout(querySaves.current[consoleId])
      persistInBackground(deleteConsole(consoleId))
      updateWorkspace(connectionId, (workspace) => {
        const index = workspace.consoles.findIndex((item) => item.id === consoleId)
        const consoles = workspace.consoles.filter((item) => item.id !== consoleId)
        const neighbor = consoles[Math.min(index, consoles.length - 1)]?.id ?? 'schemas'
        return { ...workspace, consoles, activeTab: workspace.activeTab === consoleId ? neighbor : workspace.activeTab }
      })
    },
    [updateWorkspace],
  )

  const selectTab = useCallback(
    (connectionId: number, activeTab: SgbdTab) => {
      updateWorkspace(connectionId, (workspace) => ({ ...workspace, activeTab }))
    },
    [updateWorkspace],
  )

  const changeQuery = useCallback(
    (connectionId: number, consoleId: number, query: string) => {
      updateWorkspace(connectionId, (workspace) => ({
        ...workspace,
        consoles: workspace.consoles.map((item) => (item.id === consoleId ? { ...item, query } : item)),
      }))
      clearTimeout(querySaves.current[consoleId])
      querySaves.current[consoleId] = setTimeout(() => persistInBackground(updateConsole(consoleId, { query })), QUERY_SAVE_DELAY_MS)
    },
    [updateWorkspace],
  )

  const changeConsoleSchema = useCallback(
    (connectionId: number, consoleId: number, schema: string | null) => {
      persistInBackground(updateConsole(consoleId, { schema: schema ?? '' }))
      updateWorkspace(connectionId, (workspace) => ({
        ...workspace,
        consoles: workspace.consoles.map((item) => (item.id === consoleId ? { ...item, schema } : item)),
      }))
    },
    [updateWorkspace],
  )

  const changeEditorPercent = useCallback(
    (connectionId: number, consoleId: number, editorPercent: number) => {
      persistInBackground(updateConsole(consoleId, { editorPercent }))
      updateWorkspace(connectionId, (workspace) => ({
        ...workspace,
        consoles: workspace.consoles.map((item) => (item.id === consoleId ? { ...item, editorPercent } : item)),
      }))
    },
    [updateWorkspace],
  )

  const renameConsole = useCallback(
    (connectionId: number, consoleId: number, label: string) => {
      persistInBackground(updateConsole(consoleId, { label }))
      updateWorkspace(connectionId, (workspace) => ({
        ...workspace,
        consoles: workspace.consoles.map((item) => (item.id === consoleId ? { ...item, label } : item)),
      }))
    },
    [updateWorkspace],
  )

  const reloadStructure = useCallback(async (id: number) => {
    const structure = await fetchStructure(id)
    setStructures((current) => ({ ...current, [id]: structure }))
  }, [])

  useEffect(() => {
    if (selected) {
      reloadStructure(selected.id)
    }
  }, [selected, selectedConnected, reloadStructure])

  const runOf = (consoleId: number) => runs[consoleId] ?? EMPTY_RUN

  const updateRun = useCallback((consoleId: number, change: (run: ConsoleRun) => ConsoleRun) => {
    setRuns((current) => ({ ...current, [consoleId]: change(current[consoleId] ?? EMPTY_RUN) }))
  }, [])

  useEffect(() => {
    Object.entries(runs).forEach(([key, run]) => {
      const id = Number(key)
      const settled = !run.running && run.tables.every((table) => !table.loading)
      const persisted = persistedRuns.current[id] ?? EMPTY_RUN
      if (settled && (run.tables !== persisted.tables || run.activeResult !== persisted.activeResult)) {
        persistedRuns.current[id] = { tables: run.tables, activeResult: run.activeResult }
        persistInBackground(saveConsoleResults(id, savedResults(run)))
      }
    })
  }, [runs])

  const appendLog = useCallback(
    (consoleId: number, entries: QueryLogEntry[]) => {
      const log = [...(runsRef.current[consoleId]?.log ?? []), ...entries].slice(-MAX_LOG_ENTRIES)
      updateRun(consoleId, (run) => ({ ...run, log }))
      persistInBackground(updateConsole(consoleId, { log: savedLog(log) }))
    },
    [updateRun],
  )

  const clearLog = useCallback(
    (consoleId: number) => {
      updateRun(consoleId, (run) => ({ ...run, log: [] }))
      persistInBackground(updateConsole(consoleId, { log: '' }))
    },
    [updateRun],
  )

  const execute = useCallback(
    async (connection: SgbdConnection, item: QueryConsole, statements: string[]) => {
      persistInBackground(updateConsole(item.id, { resultsMinimized: false }))
      updateRun(item.id, (run) => ({ ...run, running: true, minimized: false }))
      let report: ExecutionReport
      const requestId = crypto.randomUUID()
      runningRequests.current[item.id] = requestId
      try {
        report = await executeStatements(connection.id, item.schema, statements, item.pageSize, 0, requestId)
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : 'Não foi possível executar.'
        const statement = statements.join('\n')
        const result = { at: currentTimestamp(), schema: item.schema, statement, message, failed: true, table: null }
        report = { schema: item.schema, results: [result] }
      } finally {
        if (runningRequests.current[item.id] === requestId) {
          delete runningRequests.current[item.id]
        }
      }
      const { results } = report
      if (report.schema !== item.schema) {
        changeConsoleSchema(connection.id, item.id, report.schema)
      }
      const entries = results.map(({ at, schema, statement, message, failed }) => ({
        id: nextRunItem.current++,
        at,
        prompt: schema ?? DRIVERS[connection.kind].noSchemaLabel,
        query: statement,
        message,
        failed,
      }))
      const found = results.flatMap(({ table, statement, schema }) => (table ? [{ ...table, statement, schema }] : []))
      const tables = found.map((table, index) => ({
        ...table,
        id: nextRunItem.current++,
        loading: false,
        title: table.title || (found.length === 1 ? 'Resultado' : `Resultado ${index + 1}`),
      }))
      appendLog(item.id, entries)
      persistInBackground(updateConsole(item.id, { resultsMinimized: false }))
      updateRun(item.id, (run) => ({
        ...run,
        ...(tables.length > 0
          ? { tables, activeResult: tables[tables.length - 1].id }
          : {}),
        running: false,
        minimized: false,
      }))
      if (results.some((result) => !result.failed && !result.table)) {
        reloadStructure(connection.id)
      }
    },
    [appendLog, changeConsoleSchema, reloadStructure, updateRun],
  )

  const loadPage = useCallback(
    async (connection: SgbdConnection, consoleId: number, table: OpenResult, offset: number, pageSize: number) => {
      const patch = (change: Partial<OpenResult>) =>
        updateRun(consoleId, (run) => ({
          ...run,
          tables: run.tables.map((item) => (item.id === table.id ? { ...item, ...change } : item)),
        }))
      if (!table.paged) {
        patch({ offset })
        return
      }
      patch({ loading: true })
      try {
        const { results } = await executeStatements(connection.id, table.schema, [table.statement], pageSize, offset)
        const page = results[0]?.table
        if (!page) {
          throw new Error(results[0]?.message ?? 'Não foi possível carregar a página.')
        }
        patch({ rows: page.rows, total: page.total, offset: page.offset, truncated: page.truncated, loading: false })
      } catch (failure) {
        patch({ loading: false })
        const entry = {
          id: nextRunItem.current++,
          at: currentTimestamp(),
          prompt: table.schema ?? DRIVERS[connection.kind].noSchemaLabel,
          query: table.statement,
          message: failure instanceof Error ? failure.message : 'Não foi possível carregar a página.',
          failed: true,
        }
        appendLog(consoleId, [entry])
      }
    },
    [appendLog, updateRun],
  )

  const cancelRun = useCallback((connectionId: number, consoleId: number) => {
    const requestId = runningRequests.current[consoleId]
    if (requestId) {
      persistInBackground(cancelExecution(connectionId, requestId))
    }
  }, [])

  const changePageSize = useCallback(
    (connection: SgbdConnection, consoleId: number, pageSize: number) => {
      persistInBackground(updateConsole(consoleId, { pageSize }))
      updateWorkspace(connection.id, (workspace) => ({
        ...workspace,
        consoles: workspace.consoles.map((item) => (item.id === consoleId ? { ...item, pageSize } : item)),
      }))
      runs[consoleId]?.tables.forEach((table) => loadPage(connection, consoleId, table, 0, pageSize))
    },
    [loadPage, runs, updateWorkspace],
  )

  const selectResult = useCallback(
    (consoleId: number, activeResult: ConsoleRun['activeResult']) => {
      updateRun(consoleId, (run) => ({ ...run, activeResult }))
    },
    [updateRun],
  )

  const closeResult = useCallback(
    (consoleId: number, id: number) => {
      updateRun(consoleId, (run) => {
        const index = run.tables.findIndex((table) => table.id === id)
        const tables = run.tables.filter((table) => table.id !== id)
        const neighbor = tables[Math.min(index, tables.length - 1)]?.id ?? 'output'
        return { ...run, tables, activeResult: run.activeResult === id ? neighbor : run.activeResult }
      })
    },
    [updateRun],
  )

  const setResultsMinimized = useCallback(
    (consoleId: number, minimized: boolean) => {
      persistInBackground(updateConsole(consoleId, { resultsMinimized: minimized }))
      updateRun(consoleId, (run) => ({ ...run, minimized }))
    },
    [updateRun],
  )

  const structureOf = (connection: SgbdConnection) => structures[connection.id] ?? EMPTY_STRUCTURE

  const select = useCallback((id: number | null) => {
    setSelectedId(id)
    setEditor({ mode: 'closed' })
    if (id === null) {
      persistInBackground(clearConnectionToResume())
    }
  }, [])

  const finishSaving = useCallback(
    async (id?: number, openSchemas = false) => {
      const list = await refresh()
      const saved = id === undefined
        ? list.reduce<SgbdConnection | null>((latest, connection) => !latest || connection.id > latest.id ? connection : latest, null)
        : list.find((connection) => connection.id === id) ?? null
      if (!saved) {
        setEditor({ mode: 'closed' })
        return
      }
      setSelectedId(saved.id)
      setEditor(openSchemas ? { mode: 'edit', connection: saved, tab: 'schemas' } : { mode: 'closed' })
    },
    [refresh],
  )

  const remove = useCallback(
    async (id: number) => {
      await deleteConnection(id)
      setSelectedId(null)
      await refresh()
    },
    [refresh],
  )

  return {
    connections,
    selected,
    editor,
    setEditor,
    select,
    finishSaving,
    remove,
    statusOf,
    requiresManualPing,
    ping,
    workspaceOf,
    openConsole,
    closeConsole,
    selectTab,
    changeQuery,
    renameConsole,
    changeConsoleSchema,
    changeEditorPercent,
    runOf,
    execute,
    cancelRun,
    clearLog,
    loadPage,
    changePageSize,
    selectResult,
    closeResult,
    setResultsMinimized,
    structureOf,
    reloadStructure,
  }
}
