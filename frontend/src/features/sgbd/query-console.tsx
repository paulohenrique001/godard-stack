import {
  lazy,
  Suspense,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  LuCheck,
  LuCircleDashed,
  LuColumns3,
  LuCopy,
  LuDownload,
  LuEraser,
  LuInbox,
  LuKeyRound,
  LuLoaderCircle,
  LuPanelBottomClose,
  LuPanelBottomOpen,
  LuPlay,
  LuSquare,
  LuSquareTerminal,
  LuTable2,
  LuTextSelect,
  LuX,
} from 'react-icons/lu'
import {
  type RuntimeStatus,
  type SgbdConnection,
  type SgbdQueryResult,
  type SgbdStructure,
  executeSgbdCommand,
  fetchSgbdStructure,
} from '../../api'
import { cn } from '../../shared/lib/cn'
import { useModalDialog } from '../accessibility/use-modal-dialog'
import { useExitGuard } from '../shell/exit-guard'
import { type QueryEditorHandle } from './query-editor'

type QueryConsoleProps = {
  consoleId: number
  runtime: RuntimeStatus
  connection: SgbdConnection
  database: string | null
  command: string
  editorPercent: number
  outputLog: string
  savedResult: string
  resultsMinimized: boolean
  onCommandChange: (command: string) => void
  onEditorPercentChange: (percent: number) => void
  onStateChange: (state: {
    outputLog?: string
    savedResult?: string
    resultsMinimized?: boolean
  }) => void
}

type QueryLogEntry = {
  id: number
  at: string
  query: string
  message: string
  failed: boolean
}

type ResultTab = 'output' | 'result'

function resultTabId(consoleId: number, tab: ResultTab) {
  return `sgbd-console-${consoleId}-result-tab-${tab}`
}

function resultPanelId(consoleId: number, tab: ResultTab) {
  return `sgbd-console-${consoleId}-result-panel-${tab}`
}

const MIN_EDITOR_PERCENT = 30
const MAX_EDITOR_PERCENT = 70
const MAX_LOG_ENTRIES = 200
const MAX_SAVED_LOG_CHARACTERS = 240 * 1024
const MAX_SAVED_RESULT_CHARACTERS = 900 * 1024
const DESTRUCTIVE_STATEMENT =
  /^\s*(DROP|TRUNCATE|DELETE\b|UPDATE\b|ALTER\b|RENAME\b|FLUSHDB\b|FLUSHALL\b)/i
const TAB_CLASS =
  'flex shrink-0 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors'
const FLOATING_BUTTON_CLASS =
  'z-10 grid size-8 place-items-center rounded-full border bg-card text-muted-foreground shadow-md transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50'
const EMPTY_STRUCTURE: SgbdStructure = { schemas: [] }
const QueryEditor = lazy(() =>
  import('./query-editor').then((module) => ({ default: module.QueryEditor })),
)

function limitPercent(percent: number) {
  return Math.min(MAX_EDITOR_PERCENT, Math.max(MIN_EDITOR_PERCENT, percent))
}

function timestamp() {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date())
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível executar o comando.'
}

function schemaLabel(connection: SgbdConnection, database: string | null) {
  if (database) return database
  if (connection.database) return connection.database
  return connection.kind === 'redis' ? 'sem banco' : 'sem schema'
}

function tabColors(active: boolean) {
  return active ? 'border-highlight text-highlight' : 'border-transparent text-muted-foreground'
}

function resultText(result: SgbdQueryResult | null, log: QueryLogEntry[]) {
  if (result?.columns.length) {
    return [
      result.columns.join('\t'),
      ...result.rows.map((row) => row.map((value) => value ?? 'NULL').join('\t')),
    ].join('\n')
  }
  return log
    .map((entry) => `[${entry.at}] ${entry.query}\n[${entry.at}] ${entry.message}`)
    .join('\n')
}

function parseLog(serialized: string): QueryLogEntry[] {
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (!Array.isArray(parsed)) return []
    return parsed
      .flatMap((entry, index) => {
        if (!entry || typeof entry !== 'object') return []
        const value = entry as Record<string, unknown>
        if (
          typeof value.at !== 'string' ||
          typeof value.query !== 'string' ||
          typeof value.message !== 'string'
        )
          return []
        return [
          {
            id:
              typeof value.id === 'number' && Number.isSafeInteger(value.id) ? value.id : index + 1,
            at: value.at,
            query: value.query,
            message: value.message,
            failed: value.failed === true,
          },
        ]
      })
      .slice(-MAX_LOG_ENTRIES)
  } catch {
    return []
  }
}

function savedLog(log: QueryLogEntry[]) {
  const entries: QueryLogEntry[] = []
  let length = 2
  for (const entry of [...log].reverse()) {
    const encoded = JSON.stringify(entry)
    if (entries.length > 0 && length + encoded.length + 1 > MAX_SAVED_LOG_CHARACTERS) break
    if (entries.length === 0 && encoded.length > MAX_SAVED_LOG_CHARACTERS) continue
    entries.push(entry)
    length += encoded.length + 1
  }
  return JSON.stringify(entries.reverse())
}

function isQueryResult(value: unknown): value is SgbdQueryResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return (
    typeof result.message === 'string' &&
    Array.isArray(result.columns) &&
    result.columns.every((column) => typeof column === 'string') &&
    Array.isArray(result.rows) &&
    result.rows.every(
      (row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string' || cell === null),
    ) &&
    (typeof result.affectedRows === 'number' || result.affectedRows === null) &&
    typeof result.truncated === 'boolean' &&
    typeof result.elapsedMs === 'number'
  )
}

function parseSavedResult(serialized: string): {
  result: SgbdQueryResult | null
  activeResult: ResultTab
} {
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (!parsed || typeof parsed !== 'object') return { result: null, activeResult: 'output' }
    const value = parsed as Record<string, unknown>
    if (!isQueryResult(value.result)) return { result: null, activeResult: 'output' }
    return {
      result: value.result,
      activeResult:
        value.activeResult === 'result' && value.result.columns.length > 0 ? 'result' : 'output',
    }
  } catch {
    return { result: null, activeResult: 'output' }
  }
}

function savedResult(result: SgbdQueryResult | null, activeResult: ResultTab) {
  if (!result) return ''
  const serialized = JSON.stringify({ result, activeResult })
  return serialized.length <= MAX_SAVED_RESULT_CHARACTERS ? serialized : ''
}

export function QueryConsole({
  consoleId,
  runtime,
  connection,
  database,
  command,
  editorPercent,
  outputLog,
  savedResult: storedResult,
  resultsMinimized,
  onCommandChange,
  onEditorPercentChange,
  onStateChange,
}: QueryConsoleProps) {
  const [height, setHeight] = useState(() => limitPercent(editorPercent))
  const [hasSelection, setHasSelection] = useState(false)
  const [result, setResult] = useState<SgbdQueryResult | null>(
    () => parseSavedResult(storedResult).result,
  )
  const [log, setLog] = useState<QueryLogEntry[]>(() => parseLog(outputLog))
  const [activeResult, setActiveResult] = useState<ResultTab>(
    () => parseSavedResult(storedResult).activeResult,
  )
  const [running, setRunning] = useState(false)
  useExitGuard('sgbd-query', running)
  const [minimized, setMinimized] = useState(resultsMinimized)
  const [pendingCommand, setPendingCommand] = useState<string | null>(null)
  const [structure, setStructure] = useState<SgbdStructure>(EMPTY_STRUCTURE)
  const editor = useRef<QueryEditorHandle | null>(null)
  const nextLogId = useRef(Math.max(0, ...parseLog(outputLog).map((entry) => entry.id)) + 1)

  useEffect(() => {
    setHeight(limitPercent(editorPercent))
  }, [editorPercent])

  const runtimeKey = `${runtime.status}:${runtime.apiBase ?? ''}:${runtime.sessionToken ?? ''}`
  const schemaSettingsKey = `${connection.showAllSchemas}:${connection.showSystemSchemas}:${connection.selectedSchemas.join('\u0000')}`

  useEffect(() => {
    if (connection.kind === 'redis') {
      setStructure(EMPTY_STRUCTURE)
      return
    }
    let active = true
    fetchSgbdStructure(runtime, connection.id)
      .then((next) => {
        if (active) setStructure(next)
      })
      .catch(() => {
        if (active) setStructure(EMPTY_STRUCTURE)
      })
    return () => {
      active = false
    }
  }, [connection.id, connection.kind, runtimeKey, schemaSettingsKey])

  const outputText = useMemo(() => resultText(result, log), [result, log])

  const run = async (source: string) => {
    const query = source.trim()
    if (!query || running) return
    setRunning(true)
    setMinimized(false)
    onStateChange({ resultsMinimized: false })
    try {
      const response = await executeSgbdCommand(runtime, connection.id, query, database)
      const nextLog = [
        ...log,
        {
          id: nextLogId.current++,
          at: timestamp(),
          query,
          message: response.message,
          failed: false,
        },
      ].slice(-MAX_LOG_ENTRIES)
      const nextActiveResult: ResultTab = response.columns.length > 0 ? 'result' : 'output'
      setResult(response)
      setLog(nextLog)
      setActiveResult(nextActiveResult)
      onStateChange({
        outputLog: savedLog(nextLog),
        savedResult: savedResult(response, nextActiveResult),
        resultsMinimized: false,
      })
    } catch (error) {
      const message = errorMessage(error)
      const nextLog = [
        ...log,
        { id: nextLogId.current++, at: timestamp(), query, message, failed: true },
      ].slice(-MAX_LOG_ENTRIES)
      setResult(null)
      setLog(nextLog)
      setActiveResult('output')
      onStateChange({ outputLog: savedLog(nextLog), savedResult: '', resultsMinimized: false })
    } finally {
      setRunning(false)
    }
  }

  const runStatements = (source: string) => {
    if (!source.trim() || running) return
    if (DESTRUCTIVE_STATEMENT.test(source)) {
      setPendingCommand(source)
      return
    }
    void run(source)
  }

  const runSelection = () => {
    const selection = editor.current?.selected()
    if (selection) runStatements(selection)
  }

  const percentAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const parent = event.currentTarget.parentElement
    if (!parent) return height
    const { top, height: total } = parent.getBoundingClientRect()
    return limitPercent(Math.round(((event.clientY - top) / total) * 100))
  }

  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) setHeight(percentAt(event))
  }

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const percent = percentAt(event)
    setHeight(percent)
    if (percent !== editorPercent) onEditorPercentChange(percent)
  }

  const clearLog = () => {
    setLog([])
    setResult(null)
    setActiveResult('output')
    onStateChange({ outputLog: '', savedResult: '' })
  }

  const selectResult = (tab: ResultTab) => {
    setActiveResult(tab)
    onStateChange({ savedResult: savedResult(result, tab) })
  }

  const closeResult = () => {
    setResult(null)
    setActiveResult('output')
    onStateChange({ savedResult: '' })
    window.requestAnimationFrame(() =>
      document.getElementById(resultTabId(consoleId, 'output'))?.focus(),
    )
  }

  const changeMinimized = (value: boolean) => {
    setMinimized(value)
    onStateChange({ resultsMinimized: value })
  }

  const copy = async () => {
    if (!outputText) return
    try {
      await navigator.clipboard.writeText(outputText)
    } catch {
      return
    }
  }

  const download = () => {
    if (!outputText) return
    const url = URL.createObjectURL(new Blob([outputText], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'godard-query-result.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="relative flex min-h-0 overflow-hidden rounded-xl border bg-card py-2"
        style={{ flex: `${height} 1 0` }}
      >
        <span
          aria-label={`Schema do console: ${schemaLabel(connection, database)}`}
          className="absolute top-3 right-4 z-10 inline-flex max-w-52 items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-highlight opacity-60 shadow-sm"
        >
          <LuCircleDashed className="size-3" />
          <span className="truncate">{schemaLabel(connection, database)}</span>
        </span>
        <Suspense
          fallback={
            <div className="grid min-h-0 flex-1 place-items-center">
              <LuLoaderCircle className="size-5 animate-spin text-muted-foreground/50" />
            </div>
          }
        >
          <QueryEditor
            value={command}
            kind={connection.kind}
            database={database}
            structure={structure}
            label="Consulta ou comando"
            editorRef={editor}
            onChange={onCommandChange}
            onSelectionChange={setHasSelection}
            onRun={runStatements}
          />
        </Suspense>
        <div className="absolute right-4 bottom-3 z-10 flex items-center gap-2">
          {running && (
            <button
              type="button"
              aria-label="Executando query"
              title="Executando query"
              className={FLOATING_BUTTON_CLASS}
              disabled
            >
              <LuSquare className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            aria-label="Executar linha"
            title="Executar linha"
            disabled={running || !command.trim()}
            className={FLOATING_BUTTON_CLASS}
            onClick={() => runStatements(command)}
          >
            {running ? (
              <LuLoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <LuPlay className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            aria-label="Executar seleção"
            title="Executar seleção"
            disabled={running || !hasSelection}
            className={FLOATING_BUTTON_CLASS}
            onClick={runSelection}
          >
            <LuTextSelect className="size-3.5" />
          </button>
        </div>
      </div>
      {minimized ? (
        <div className="h-3 shrink-0" />
      ) : (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Ajustar altura do console e do resultado"
          aria-valuenow={height}
          className="group flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center"
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={resize}
          onPointerUp={finishResize}
          onDoubleClick={() => {
            const mid = limitPercent(50)
            setHeight(mid)
            if (mid !== editorPercent) onEditorPercentChange(mid)
          }}
        >
          <span className="h-1 w-10 rounded-full bg-border transition-colors group-hover:bg-highlight" />
        </div>
      )}
      <QueryResults
        consoleId={consoleId}
        result={result}
        log={log}
        activeResult={activeResult}
        minimized={minimized}
        running={running}
        heightPercent={100 - height}
        onSelect={selectResult}
        onClear={clearLog}
        onCloseResult={closeResult}
        onCopy={() => void copy()}
        onDownload={download}
        onMinimizedChange={changeMinimized}
      />
      {pendingCommand !== null && (
        <DestructiveDialog
          command={pendingCommand}
          onCancel={() => setPendingCommand(null)}
          onConfirm={() => {
            const query = pendingCommand
            setPendingCommand(null)
            void run(query)
          }}
        />
      )}
    </div>
  )
}

function QueryResults({
  consoleId,
  result,
  log,
  activeResult,
  minimized,
  running,
  heightPercent,
  onSelect,
  onClear,
  onCloseResult,
  onCopy,
  onDownload,
  onMinimizedChange,
}: {
  consoleId: number
  result: SgbdQueryResult | null
  log: QueryLogEntry[]
  activeResult: ResultTab
  minimized: boolean
  running: boolean
  heightPercent: number
  onSelect: (tab: ResultTab) => void
  onClear: () => void
  onCloseResult: () => void
  onCopy: () => void
  onDownload: () => void
  onMinimizedChange: (value: boolean) => void
}) {
  const hasTable = Boolean(result && result.columns.length > 0)
  const text = resultText(result, log)
  const tabs: ResultTab[] = hasTable ? ['output', 'result'] : ['output']
  const moveFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, current: ResultTab) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const currentIndex = tabs.indexOf(current)
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    const next = tabs[nextIndex]
    onSelect(next)
    window.requestAnimationFrame(() =>
      document.getElementById(resultTabId(consoleId, next))?.focus(),
    )
  }

  return (
    <section
      aria-label="Resultado"
      className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border bg-card"
      style={minimized ? undefined : { flex: `${heightPercent} 1 0` }}
    >
      <div className={cn('flex shrink-0 items-center gap-1 px-1', !minimized && 'border-b')}>
        <div
          role="tablist"
          aria-label="Saída da consulta"
          aria-orientation="horizontal"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
          onWheel={(event) => {
            event.currentTarget.scrollLeft += event.deltaY + event.deltaX
          }}
        >
          <button
            id={resultTabId(consoleId, 'output')}
            type="button"
            role="tab"
            aria-selected={activeResult === 'output'}
            aria-controls={resultPanelId(consoleId, 'output')}
            tabIndex={activeResult === 'output' ? 0 : -1}
            className={cn(
              TAB_CLASS,
              'px-3 py-2',
              tabColors(activeResult === 'output' && !minimized),
            )}
            onClick={() => onSelect('output')}
            onKeyDown={(event) => moveFocus(event, 'output')}
          >
            <LuSquareTerminal className="size-4" />
            Output
          </button>
          {hasTable && (
            <div
              className={cn(
                TAB_CLASS,
                'max-w-72 min-w-0',
                tabColors(activeResult === 'result' && !minimized),
              )}
            >
              <button
                id={resultTabId(consoleId, 'result')}
                type="button"
                role="tab"
                aria-selected={activeResult === 'result'}
                aria-controls={resultPanelId(consoleId, 'result')}
                tabIndex={activeResult === 'result' ? 0 : -1}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-3"
                onClick={() => onSelect('result')}
                onKeyDown={(event) => moveFocus(event, 'result')}
              >
                <LuTable2 className="size-4 shrink-0" />
                <span className="truncate">resultado</span>
              </button>
              <button
                type="button"
                aria-label="Fechar resultado"
                className="mr-1 ml-2 flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-muted"
                onClick={onCloseResult}
              >
                <LuX className="size-3.5" />
              </button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 pr-1">
          <span className="px-2 text-xs font-medium text-muted-foreground">
            {hasTable ? 'Tabela' : 'TXT'}
          </span>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <ResultControl label="Copiar resultado" disabled={!text} onClick={onCopy}>
            <LuCopy className="size-4" />
          </ResultControl>
          <ResultControl label="Exportar resultado" disabled={!text} onClick={onDownload}>
            <LuDownload className="size-4" />
          </ResultControl>
          <ResultControl
            label={minimized ? 'Expandir resultado' : 'Minimizar resultado'}
            onClick={() => onMinimizedChange(!minimized)}
          >
            {minimized ? (
              <LuPanelBottomOpen className="size-4" />
            ) : (
              <LuPanelBottomClose className="size-4" />
            )}
          </ResultControl>
        </div>
      </div>
      <div hidden={minimized} className="relative flex min-h-0 flex-1 flex-col">
        <QueryOutput
          log={log}
          onClear={onClear}
          tabId={resultTabId(consoleId, 'output')}
          panelId={resultPanelId(consoleId, 'output')}
          hidden={activeResult !== 'output'}
        />
        {hasTable && result && (
          <ResultGrid
            result={result}
            tabId={resultTabId(consoleId, 'result')}
            panelId={resultPanelId(consoleId, 'result')}
            hidden={activeResult !== 'result'}
          />
        )}
        {running && (
          <div
            role="status"
            aria-label="Executando query"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-card/50"
          >
            <LuLoaderCircle className="size-7 animate-spin text-highlight" />
          </div>
        )}
      </div>
    </section>
  )
}

function ResultControl({
  label,
  disabled = false,
  children,
  onClick,
}: {
  label: string
  disabled?: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function QueryOutput({
  log,
  onClear,
  tabId,
  panelId,
  hidden,
}: {
  log: QueryLogEntry[]
  onClear: () => void
  tabId: string
  panelId: string
  hidden: boolean
}) {
  if (log.length === 0)
    return (
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId}
        hidden={hidden}
        className="flex min-h-0 flex-1 items-center justify-center p-6"
      >
        <LuInbox
          aria-label="Nenhuma query executada"
          className="size-20 text-muted-foreground/40"
          strokeWidth={1.25}
        />
      </div>
    )

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      hidden={hidden}
      className="relative min-h-0 flex-1 overflow-auto p-3 text-[13px] leading-relaxed font-mono"
    >
      <button
        type="button"
        aria-label="Limpar logs"
        title="Limpar logs"
        className={cn(FLOATING_BUTTON_CLASS, 'absolute right-4 bottom-3')}
        onClick={onClear}
      >
        <LuEraser className="size-3.5" />
      </button>
      {log.map((entry) => (
        <div key={entry.id}>
          <div className="whitespace-pre-wrap">
            <span className="text-muted-foreground">
              [{entry.at}] {'> '}
            </span>
            {entry.query}
          </div>
          <p
            className={cn(
              'whitespace-pre-wrap',
              entry.failed ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            [{entry.at}] {entry.message}
          </p>
        </div>
      ))}
    </div>
  )
}

function ResultGrid({
  result,
  tabId,
  panelId,
  hidden,
}: {
  result: SgbdQueryResult
  tabId: string
  panelId: string
  hidden: boolean
}) {
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      hidden={hidden}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th aria-label="Linha" className="min-w-10 border-r border-b px-2 py-1" />
              {result.columns.map((column, index) => (
                <th
                  key={`${column}-${index}`}
                  className="min-w-36 border-r border-b px-2 py-1 text-left font-semibold"
                >
                  <span className="flex items-center gap-1.5">
                    {index === 0 ? (
                      <LuKeyRound className="size-3.5 shrink-0 text-highlight" />
                    ) : (
                      <LuColumns3 className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    {column || `Coluna ${index + 1}`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 && (
              <tr>
                <td
                  colSpan={result.columns.length + 1}
                  className="border-b px-3 py-8 text-center text-muted-foreground"
                >
                  Nenhuma linha retornada
                </td>
              </tr>
            )}
            {result.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="border-r border-b px-2 py-1 text-right text-muted-foreground">
                  {rowIndex + 1}
                </td>
                {row.map((value, column) => (
                  <td
                    key={column}
                    className="max-w-96 overflow-hidden text-ellipsis border-r border-b px-2 py-1 whitespace-nowrap"
                  >
                    {value ?? <span className="text-muted-foreground italic">NULL</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.truncated && (
        <p role="status" className="shrink-0 border-t px-3 py-1 text-xs text-muted-foreground">
          O resultado tem mais linhas do que as exibidas aqui.
        </p>
      )}
    </div>
  )
}

function DestructiveDialog({
  command,
  onCancel,
  onConfirm,
}: {
  command: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useModalDialog(true, onCancel)
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onCancel}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="destructive-query-title"
        className="w-full max-w-lg rounded-lg border bg-popover p-6 shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="space-y-2">
          <h2 id="destructive-query-title" className="text-lg font-semibold">
            Confirmar operação destrutiva
          </h2>
          <p className="text-sm text-muted-foreground">
            Esta execução pode alterar ou remover dados do banco.
          </p>
        </header>
        <pre className="mt-4 max-h-36 overflow-auto rounded-lg border bg-muted/50 p-3 text-xs whitespace-pre-wrap">
          {command}
        </pre>
        <footer className="mt-6 flex justify-end gap-2">
          <button
            data-dialog-initial-focus
            type="button"
            className="h-9 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="h-9 rounded-lg bg-destructive px-3 text-sm font-medium text-white transition-colors hover:brightness-95"
            onClick={onConfirm}
          >
            Executar
          </button>
        </footer>
      </section>
    </div>
  )
}
