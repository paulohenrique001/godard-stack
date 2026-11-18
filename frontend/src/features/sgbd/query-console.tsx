import { type PointerEvent, Suspense, useEffect, useRef, useState } from 'react'
import { LuPlay, LuSquare, LuTextSelect } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { ContentLoader } from '@/components/ui/content-loader'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { EditorStatements } from '@/features/docker/code-editor'
import { CodeEditor } from '@/features/docker/container-file-editor'
import { QueryResults } from '@/features/sgbd/query-results'
import { SchemaSelect } from '@/features/sgbd/schema-select'
import type { SgbdConnection, SqlStructure } from '@/features/sgbd/sgbd-api'
import { DRIVERS } from '@/features/sgbd/sgbd-drivers'
import type { ConsoleRun, OpenResult, QueryConsole as QueryConsoleData } from '@/features/sgbd/use-sgbd'
import { FLOATING_BUTTON_CLASS } from '@/features/terminal/terminal-search'

const MIN_EDITOR_PERCENT = 30
const MAX_EDITOR_PERCENT = 70
const RUN_LOADING_DELAY_MS = 250
const DESTRUCTIVE_STATEMENT = /^\s*(DROP|TRUNCATE|DELETE\b|UPDATE\b|ALTER\b|RENAME\b|FLUSHDB\b|FLUSHALL\b)/i

const limitPercent = (percent: number) => Math.min(MAX_EDITOR_PERCENT, Math.max(MIN_EDITOR_PERCENT, percent))

type QueryConsoleProps = {
  console: QueryConsoleData
  connection: SgbdConnection
  structure: SqlStructure
  onChange: (query: string) => void
  onSchemaChange: (schema: string | null) => void
  onEditorPercentChange: (percent: number) => void
  run: ConsoleRun
  onRun: (statements: string[]) => void
  onCancel: () => void
  onSelectResult: (result: ConsoleRun['activeResult']) => void
  onPageChange: (table: OpenResult, offset: number) => void
  onPageSizeChange: (pageSize: number) => void
  onClearLog: () => void
  onCloseResult: (id: number) => void
  onMinimizedChange: (minimized: boolean) => void
}

export function QueryConsole({
  console,
  connection,
  structure,
  onChange,
  onSchemaChange,
  onEditorPercentChange,
  run,
  onRun,
  onCancel,
  onSelectResult,
  onPageChange,
  onPageSizeChange,
  onClearLog,
  onCloseResult,
  onMinimizedChange,
}: QueryConsoleProps) {
  const [editorPercent, setEditorPercent] = useState(limitPercent(console.editorPercent))
  const statementsRef = useRef<EditorStatements | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [showRunLoading, setShowRunLoading] = useState(false)
  const [pendingStatements, setPendingStatements] = useState<string[] | null>(null)

  useEffect(() => {
    if (!run.running) {
      setShowRunLoading(false)
      return
    }
    const timer = setTimeout(() => setShowRunLoading(true), RUN_LOADING_DELAY_MS)
    return () => clearTimeout(timer)
  }, [run.running])

  const runStatements = (statements: string[]) => {
    if (statements.length === 0 || run.running) return
    if (statements.some((statement) => DESTRUCTIVE_STATEMENT.test(statement))) {
      setPendingStatements(statements)
      return
    }
    onRun(statements)
  }

  const percentAt = (event: PointerEvent<HTMLDivElement>) => {
    const { top, height } = event.currentTarget.parentElement!.getBoundingClientRect()
    return limitPercent(Math.round(((event.clientY - top) / height) * 100))
  }

  const resize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      setEditorPercent(percentAt(event))
    }
  }

  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    const percent = percentAt(event)
    setEditorPercent(percent)
    if (percent !== console.editorPercent) {
      onEditorPercentChange(percent)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="relative min-h-0 overflow-hidden rounded-xl border bg-card py-2"
        style={{ flex: `${editorPercent} 1 0` }}
      >
        <SchemaSelect connection={connection} value={console.schema} onChange={onSchemaChange} />
        <Suspense fallback={<ContentLoader className="h-full" />}>
          <CodeEditor
            key={console.id}
            value={console.query}
            language={DRIVERS[connection.kind].queryLanguage}
            sqlStructure={structure}
            defaultSchema={console.schema}
            label={`Console de ${console.schema ?? DRIVERS[connection.kind].noSchemaLabel}`}
            statementsRef={statementsRef}
            onSelectionChange={setHasSelection}
            onRun={runStatements}
            onChange={onChange}
          />
        </Suspense>
        <div className="absolute right-4 bottom-3 z-10 flex items-center gap-2">
          {run.running && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Cancelar execução"
              title="Cancelar execução"
              className={FLOATING_BUTTON_CLASS}
              onClick={onCancel}
            >
              <LuSquare />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Executar linha"
            title="Executar linha"
            disabled={run.running}
            className={FLOATING_BUTTON_CLASS}
            onClick={() => runStatements(statementsRef.current?.atCursor() ?? [])}
          >
            <LuPlay />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Executar seleção"
            title="Executar seleção"
            disabled={run.running || !hasSelection}
            className={FLOATING_BUTTON_CLASS}
            onClick={() => runStatements(statementsRef.current?.selected() ?? [])}
          >
            <LuTextSelect />
          </Button>
        </div>
      </div>
      {run.minimized ? (
        <div className="h-3 shrink-0" />
      ) : (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Ajustar altura do console e do resultado"
          aria-valuenow={editorPercent}
          className="group flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center"
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={resize}
          onPointerUp={finishResize}
        >
          <span className="h-1 w-10 rounded-full bg-border transition-colors group-hover:bg-highlight" />
        </div>
      )}
      <QueryResults
        run={run}
        language={DRIVERS[connection.kind].queryLanguage}
        heightPercent={100 - editorPercent}
        pageSize={console.pageSize}
        onSelect={(result) => {
          onSelectResult(result)
          onMinimizedChange(false)
        }}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        onClearLog={onClearLog}
        onCloseResult={onCloseResult}
        onMinimizedChange={onMinimizedChange}
        showRunLoading={showRunLoading}
      />
      <Dialog open={pendingStatements !== null} onOpenChange={(open) => !open && setPendingStatements(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar operação destrutiva</DialogTitle>
            <DialogDescription>Esta execução pode alterar ou remover dados do banco.</DialogDescription>
          </DialogHeader>
          <pre className="max-h-36 overflow-auto rounded-lg border bg-muted/50 p-3 text-xs whitespace-pre-wrap">{pendingStatements?.join('\n\n')}</pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingStatements(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => {
              const statements = pendingStatements
              setPendingStatements(null)
              if (statements) onRun(statements)
            }}>Executar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
