import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  LuCheck,
  LuChevronDown,
  LuColumns3,
  LuCopy,
  LuDownload,
  LuEraser,
  LuKeyRound,
  LuLoaderCircle,
  LuPanelBottomClose,
  LuPanelBottomOpen,
  LuSquareTerminal,
  LuTable2,
  LuX,
} from 'react-icons/lu'
import { Select } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { EmptyPlaceholder } from '@/features/layout/selection-placeholder'
import { JsonText } from '@/features/sgbd/json-text'
import { exportLog, exportResult, formatLog, formatResult, RESULT_VIEWS, type ResultView } from '@/features/sgbd/query-result-format'
import { isPaginated, ResultPagination, visibleRows } from '@/features/sgbd/result-pagination'
import { ITEM_CLASS } from '@/features/sgbd/schema-select'
import type { ResultTable } from '@/features/sgbd/sgbd-api'
import { TAB_CLASS, tabColors } from '@/features/sgbd/sgbd-tabs'
import type { ConsoleRun, OpenResult, QueryLogEntry } from '@/features/sgbd/use-sgbd'
import { FLOATING_BUTTON_CLASS } from '@/features/terminal/terminal-search'
import { TERMINAL_FONT_FAMILY } from '@/features/terminal/terminal-view'
import { cn } from '@/lib/utils'

const QueryText = lazy(() => import('@/features/docker/code-editor').then((module) => ({ default: module.QueryText })))

const COPIED_FEEDBACK_MS = 1500
const RESULT_FONT = { fontFamily: TERMINAL_FONT_FAMILY }
const CELL_CLASS = 'border-r border-b px-2 py-1 whitespace-nowrap'
const PAGINATED_PADDING = 'pb-[50px]'
const PANEL_CLASS = 'min-h-0 flex-1 overflow-auto p-3 text-[13px] leading-relaxed'
const HEADER_ICON_CLASS =
  'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

type QueryOutputProps = {
  log: QueryLogEntry[]
  language: 'sql' | 'text'
  onClear: () => void
}

function QueryOutput({ log, language, onClear }: QueryOutputProps) {
  const panel = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    panel.current?.scrollTo({ top: panel.current.scrollHeight })
  }, [log])

  if (log.length === 0) {
    return (
      <div role="tabpanel" className="min-h-0 flex-1">
        <EmptyPlaceholder label="Nenhuma query executada" />
      </div>
    )
  }

  return (
    <div ref={panel} role="tabpanel" className={cn(PANEL_CLASS, PAGINATED_PADDING)} style={RESULT_FONT}>
      <Button
        variant="outline"
        size="icon"
        aria-label="Limpar logs"
        title="Limpar logs"
        className={cn(FLOATING_BUTTON_CLASS, 'absolute right-4 bottom-3')}
        onClick={onClear}
      >
        <LuEraser />
      </Button>
      {log.map(({ id, at, prompt, query, message, failed }) => (
        <div key={id}>
          <div className="flex whitespace-pre">
            <span className="shrink-0 text-muted-foreground">{`[${at}] ${prompt}> `}</span>
            <span>
              <Suspense fallback={query}>
                <QueryText query={query} language={language} />
              </Suspense>
            </span>
          </div>
          <p className={cn('whitespace-pre', failed ? 'text-destructive' : 'text-muted-foreground')}>
            {`[${at}] ${message}`}
          </p>
        </div>
      ))}
    </div>
  )
}

type ResultGridProps = {
  table: ResultTable
  paginated: boolean
}

function ResultGrid({ table, paginated }: ResultGridProps) {
  return (
    <div role="tabpanel" className="flex min-h-0 flex-1 flex-col" style={RESULT_FONT}>
      <div className={cn('min-h-0 flex-1 overflow-auto', paginated && PAGINATED_PADDING)}>
        <table className="border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th aria-label="Linha" className={cn(CELL_CLASS, 'min-w-10')} />
              {table.columns.map(({ name, key }, index) => {
                const Icon = key ? LuKeyRound : LuColumns3
                return (
                  <th key={index} className={cn(CELL_CLASS, 'min-w-36 text-left font-semibold')}>
                    <span className="flex items-center gap-1.5">
                      <Icon className={cn('size-3.5 shrink-0', key ? 'text-highlight' : 'text-muted-foreground')} />
                      {name}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className={cn(CELL_CLASS, 'text-right text-muted-foreground')}>{table.offset + rowIndex + 1}</td>
                {row.map((value, column) => (
                  <td
                    key={column}
                    className={cn(
                      CELL_CLASS,
                      'max-w-96 overflow-hidden text-ellipsis',
                      table.columns[column].numeric && 'text-right',
                    )}
                  >
                    {value ?? <span className="text-muted-foreground italic">NULL</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.truncated && <TruncatedNotice />}
    </div>
  )
}

function TruncatedNotice() {
  return (
    <p role="status" className="shrink-0 border-t px-3 py-1 font-sans text-xs text-muted-foreground">
      O resultado tem mais linhas do que as exibidas aqui.
    </p>
  )
}

type ResultViewSelectProps = {
  value: ResultView
  disabled: boolean
  onChange: (view: ResultView) => void
}

function ResultViewSelect({ value, disabled, onChange }: ResultViewSelectProps) {
  return (
    <Select.Root value={value} disabled={disabled} onValueChange={(view) => onChange(view as ResultView)}>
      <Select.Trigger
        aria-label="Formato de exibição"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <Select.Value />
        <Select.Icon>
          <LuChevronDown className="size-3" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          align="end"
          sideOffset={4}
          className="z-50 min-w-24 overflow-hidden rounded-lg border bg-popover p-1 shadow-md"
        >
          <Select.Viewport>
            {RESULT_VIEWS.map((view) => (
              <Select.Item key={view.value} value={view.value} className={ITEM_CLASS}>
                <Select.ItemText>{view.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

function CopyResultButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
  }

  return (
    <button
      type="button"
      aria-label="Copiar resultado"
      disabled={text === ''}
      className={cn(HEADER_ICON_CLASS, 'disabled:pointer-events-none disabled:opacity-50')}
      onClick={copy}
    >
      {copied ? <LuCheck className="size-4 text-success" /> : <LuCopy className="size-4" />}
    </button>
  )
}

type QueryResultsProps = {
  run: ConsoleRun
  language: 'sql' | 'text'
  heightPercent: number
  pageSize: number
  onSelect: (result: ConsoleRun['activeResult']) => void
  onPageChange: (table: OpenResult, offset: number) => void
  onPageSizeChange: (pageSize: number) => void
  onClearLog: () => void
  onCloseResult: (id: number) => void
  onMinimizedChange: (minimized: boolean) => void
  showRunLoading: boolean
}

export function QueryResults({
  run,
  language,
  heightPercent,
  pageSize,
  onSelect,
  onPageChange,
  onPageSizeChange,
  onClearLog,
  onCloseResult,
  onMinimizedChange,
  showRunLoading,
}: QueryResultsProps) {
  const [view, setView] = useState<ResultView>('table')
  const activeTable = run.tables.find((table) => table.id === run.activeResult)
  const tabClass = (active: boolean) => tabColors(active && !run.minimized)
  const pageTable = activeTable && { ...activeTable, rows: visibleRows(activeTable, pageSize) }
  const paginated = activeTable !== undefined && isPaginated(activeTable, pageSize)

  return (
    <section
      aria-label="Resultado"
      className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border bg-card"
      style={run.minimized ? undefined : { flex: `${heightPercent} 1 0` }}
    >
      <div className={cn('flex shrink-0 items-center gap-1 px-1', !run.minimized && 'border-b')}>
        <div
          role="tablist"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
          onWheel={(event) => {
            event.currentTarget.scrollLeft += event.deltaY + event.deltaX
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTable === undefined}
            className={cn(TAB_CLASS, 'px-3 py-2', tabClass(activeTable === undefined))}
            onClick={() => onSelect('output')}
          >
            <LuSquareTerminal className="size-4" />
            Output
          </button>
          {run.tables.map((table) => (
            <div key={table.id} className={cn(TAB_CLASS, 'max-w-72 min-w-0', tabClass(table === activeTable))}>
              <button
                type="button"
                role="tab"
                aria-selected={table === activeTable}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-3"
                onClick={() => onSelect(table.id)}
              >
                <LuTable2 className="size-4 shrink-0" />
                <span className="truncate">{table.title}</span>
              </button>
              <button
                type="button"
                aria-label={`Fechar ${table.title}`}
                className="mr-1 ml-2 flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-muted"
                onClick={() => onCloseResult(table.id)}
              >
                <LuX className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1 pr-1">
          <ResultViewSelect value={activeTable ? view : 'txt'} disabled={!activeTable} onChange={setView} />
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <CopyResultButton text={pageTable ? formatResult(pageTable, view) : formatLog(run.log)} />
          <button
            type="button"
            aria-label="Exportar resultado"
            disabled={!activeTable && run.log.length === 0}
            className={cn(HEADER_ICON_CLASS, 'disabled:pointer-events-none disabled:opacity-50')}
            onClick={() => (pageTable ? exportResult(pageTable, view) : exportLog(run.log))}
          >
            <LuDownload className="size-4" />
          </button>
          <button
            type="button"
            aria-label={run.minimized ? 'Expandir resultado' : 'Minimizar resultado'}
            className={HEADER_ICON_CLASS}
            onClick={() => onMinimizedChange(!run.minimized)}
          >
            {run.minimized ? <LuPanelBottomOpen className="size-4" /> : <LuPanelBottomClose className="size-4" />}
          </button>
        </div>
      </div>
      {!run.minimized && (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {!pageTable && <QueryOutput log={run.log} language={language} onClear={onClearLog} />}
          {pageTable && view === 'table' && <ResultGrid table={pageTable} paginated={paginated} />}
          {pageTable && view !== 'table' && (
            <div role="tabpanel" className="flex min-h-0 flex-1 flex-col" style={RESULT_FONT}>
              <pre
                className={cn(
                  PANEL_CLASS,
                  view === 'json' && 'text-muted-foreground',
                  paginated && PAGINATED_PADDING,
                )}
              >
                {view === 'json' ? <JsonText text={formatResult(pageTable, view)} /> : formatResult(pageTable, view)}
              </pre>
              {pageTable.truncated && <TruncatedNotice />}
            </div>
          )}
          {activeTable && paginated && (
            <ResultPagination
              table={activeTable}
              pageSize={pageSize}
              loading={activeTable.loading}
              className={activeTable.truncated ? 'bottom-9' : 'bottom-2'}
              onOffsetChange={(offset) => onPageChange(activeTable, offset)}
              onPageSizeChange={onPageSizeChange}
            />
          )}
          {showRunLoading && (
            <div
              role="status"
              aria-label="Executando query"
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-card/50"
            >
              <LuLoaderCircle className="size-7 animate-spin text-highlight" />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
