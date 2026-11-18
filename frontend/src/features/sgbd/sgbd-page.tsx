import { useState } from 'react'
import { LuEye, LuLoaderCircle, LuRefreshCw, LuTrash2 } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { ContentLoader } from '@/components/ui/content-loader'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/features/docker/confirm-dialog'
import { SelectionPlaceholder } from '@/features/layout/selection-placeholder'
import { ConnectionForm } from '@/features/sgbd/connection-form'
import { QueryConsole } from '@/features/sgbd/query-console'
import { SchemaList } from '@/features/sgbd/schema-list'
import { SgbdTabs } from '@/features/sgbd/sgbd-tabs'
import { SgbdIcon } from '@/features/sgbd/sgbd-icon'
import type { ConnectionStatus, SgbdConnection } from '@/features/sgbd/sgbd-api'
import { DRIVERS } from '@/features/sgbd/sgbd-drivers'
import type { Sgbd } from '@/features/sgbd/use-sgbd'
import { cn } from '@/lib/utils'

const PING_WARNING_MS = 100
const PING_DANGER_MS = 500

export function StatusBadge({ status, requiresManualPing = false }: { status: ConnectionStatus; requiresManualPing?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase',
        requiresManualPing && 'bg-warning/15 text-warning',
        !requiresManualPing && status.kind === 'checking' && 'bg-muted text-muted-foreground',
        !requiresManualPing && status.kind === 'ok' && 'bg-success/15 text-success',
        !requiresManualPing && status.kind === 'failed' && 'bg-destructive/10 text-destructive',
      )}
    >
      {!requiresManualPing && status.kind === 'checking' && <LuLoaderCircle className="size-3 animate-spin" />}
      {requiresManualPing ? 'Verificação manual' : status.kind === 'checking' ? 'Conectando...' : status.kind === 'ok' ? 'Conectado' : 'Sem conexão'}
    </span>
  )
}

export function PingBadge({ pingMs }: { pingMs: number }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase',
        pingMs <= PING_WARNING_MS && 'bg-success/15 text-success',
        pingMs > PING_WARNING_MS && pingMs <= PING_DANGER_MS && 'bg-warning/15 text-warning',
        pingMs > PING_DANGER_MS && 'bg-destructive/10 text-destructive',
      )}
    >
      {pingMs} MS
    </span>
  )
}

function ConnectionDetail({ connection, sgbd }: { connection: SgbdConnection; sgbd: Sgbd }) {
  const status = sgbd.statusOf(connection)
  const requiresManualPing = sgbd.requiresManualPing(connection)
  const workspace = sgbd.workspaceOf(connection)
  const activeConsole = workspace.consoles.find((item) => item.id === workspace.activeTab)
  const [refreshing, setRefreshing] = useState(false)

  const refreshConnection = async () => {
    setRefreshing(true)
    await sgbd.ping(connection)
    setRefreshing(false)
  }

  return (
    <div className="animate-in fade-in flex h-full min-h-0 flex-col gap-4 p-6 duration-200">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <SgbdIcon kind={connection.kind} className="size-5" />
            <h2 className={cn('truncate text-xl font-semibold tracking-tight', requiresManualPing && 'text-warning')}>{connection.name}</h2>
            <StatusBadge status={status} requiresManualPing={requiresManualPing} />
            {status.kind === 'ok' && <PingBadge pingMs={status.health.pingMs} />}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {connection.host}:{connection.port}
            {status.kind === 'ok' && ` · ${DRIVERS[connection.kind].label} ${status.health.version}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Atualizar conexão"
            title="Atualizar conexão"
            disabled={refreshing}
            className={cn(requiresManualPing && 'border-warning/50 bg-warning/10 text-warning hover:bg-warning/15 hover:text-warning')}
            onClick={() => void refreshConnection()}
          >
            <LuRefreshCw className={cn(refreshing && 'animate-spin')} />
          </Button>
          <Button variant="outline" className="uppercase" onClick={() => sgbd.setEditor({ mode: 'edit', connection })}>
            <LuEye />
            Editar
          </Button>
          <ConfirmDialog
            title="Remover conexão"
            description={
              <>
                A conexão <strong className="font-semibold text-highlight">{connection.name}</strong> será removida.
                O banco de dados não é alterado.
              </>
            }
            onConfirm={() => sgbd.remove(connection.id)}
          >
            <Button variant="outline" className="uppercase text-destructive hover:text-destructive">
              <LuTrash2 />
              Remover
            </Button>
          </ConfirmDialog>
        </div>
      </header>
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <SgbdTabs
          kind={connection.kind}
          workspace={workspace}
          onSelect={(tab) => sgbd.selectTab(connection.id, tab)}
          onClose={(consoleId) => sgbd.closeConsole(connection.id, consoleId)}
          onRename={(consoleId, label) => sgbd.renameConsole(connection.id, consoleId, label)}
          onAdd={() => sgbd.openConsole(connection.id, null)}
        />
        {activeConsole ? (
          <QueryConsole
            key={activeConsole.id}
            console={activeConsole}
            connection={connection}
            structure={sgbd.structureOf(connection)}
            onChange={(query) => sgbd.changeQuery(connection.id, activeConsole.id, query)}
            onSchemaChange={(schema) => sgbd.changeConsoleSchema(connection.id, activeConsole.id, schema)}
            onEditorPercentChange={(percent) => sgbd.changeEditorPercent(connection.id, activeConsole.id, percent)}
            run={sgbd.runOf(activeConsole.id)}
            onRun={(statements) => sgbd.execute(connection, activeConsole, statements)}
            onCancel={() => sgbd.cancelRun(connection.id, activeConsole.id)}
            onSelectResult={(result) => sgbd.selectResult(activeConsole.id, result)}
            onPageChange={(table, offset) =>
              sgbd.loadPage(connection, activeConsole.id, table, offset, activeConsole.pageSize)
            }
            onPageSizeChange={(pageSize) => sgbd.changePageSize(connection, activeConsole.id, pageSize)}
            onClearLog={() => sgbd.clearLog(activeConsole.id)}
            onCloseResult={(id) => sgbd.closeResult(activeConsole.id, id)}
            onMinimizedChange={(minimized) => sgbd.setResultsMinimized(activeConsole.id, minimized)}
          />
        ) : (
          <SchemaList
            connection={connection}
            connected={status.kind === 'ok'}
            onOpen={(schema) => sgbd.openConsole(connection.id, schema)}
            onCreated={() => sgbd.reloadStructure(connection.id)}
          />
        )}
      </section>
    </div>
  )
}

export function SgbdPage({ sgbd }: { sgbd: Sgbd }) {
  const { connections, selected, editor, setEditor, finishSaving, ping } = sgbd
  const editing = editor.mode === 'edit' ? editor.connection : undefined
  const initialTab = editor.mode === 'edit' && editor.tab === 'schemas' ? 'schemas' : 'general'

  return (
    <>
      {selected && <ConnectionDetail key={selected.id} connection={selected} sgbd={sgbd} />}
      {!selected && connections !== null && connections.length > 0 && (
        <SelectionPlaceholder label="Selecione uma conexão" />
      )}
      {!selected && connections === null && <ContentLoader className="h-full p-6" />}
      {!selected && connections !== null && connections.length === 0 && (
        <div className="animate-in fade-in flex h-full items-center justify-center p-6 duration-200">
          <p className="text-sm text-muted-foreground">Nenhuma conexão. Use o + para criar a primeira.</p>
        </div>
      )}
      <Dialog open={editor.mode !== 'closed'} onOpenChange={(open) => !open && setEditor({ mode: 'closed' })}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-2xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className={editing ? 'flex min-w-0 items-center justify-between gap-3' : undefined}>
              {editing ? (
                <>
                  <span className="truncate">{editing.name}</span>
            <StatusBadge status={sgbd.statusOf(editing)} requiresManualPing={sgbd.requiresManualPing(editing)} />
                </>
              ) : 'Nova conexão'}
            </DialogTitle>
            <DialogDescription className="sr-only">Dados de acesso ao banco</DialogDescription>
          </DialogHeader>
          <ConnectionForm
            key={editing?.id ?? 'new'}
            connection={editing}
            initialTab={initialTab}
            onPing={(connection) => ping(connection, true)}
            onCancel={() => setEditor({ mode: 'closed' })}
            onSaved={finishSaving}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
