import { useEffect, useRef, useState } from 'react'
import {
  LuCircleAlert,
  LuEraser,
  LuLoaderCircle,
  LuPlus,
  LuRefreshCw,
  LuSearch,
  LuSquareTerminal,
  LuX,
} from 'react-icons/lu'
import {
  acceptTerminalAccess,
  fetchTerminalAccess,
  type RuntimeStatus,
  type SystemSnapshot,
} from '../../api'
import { TerminalTabBar } from './terminal-tab-bar'
import { TerminalView } from './terminal-view'
import type { CommandInsertion, TerminalMachine, TerminalStatus } from './types'
import { tabTitle, useTerminalTabs } from './use-terminal-tabs'
import { cn } from '../../shared/lib/cn'

const SESSION_STATUS: Record<TerminalStatus, { label: string; className: string }> = {
  idle: { label: 'Pronto', className: 'bg-muted text-muted-foreground' },
  connecting: { label: 'Conectando...', className: 'bg-muted text-muted-foreground' },
  connected: { label: 'Sessão ativa', className: 'bg-success/15 text-success' },
  disconnected: { label: 'Sessão interrompida', className: 'bg-destructive/15 text-destructive' },
}

type TerminalWorkspaceProps = {
  runtime: RuntimeStatus
  system: SystemSnapshot
  theme: 'light' | 'dark'
  insertion: CommandInsertion | null
  newConsoleRequest: number
  onAccessChanged: () => void
}

export function TerminalWorkspace({
  runtime,
  system,
  theme,
  insertion,
  newConsoleRequest,
  onAccessChanged,
}: TerminalWorkspaceProps) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setChecking(true)
    setFailed(false)
    fetchTerminalAccess(runtime)
      .then(async (next) => {
        if (!active) return
        if (!next.available) {
          setAvailable(false)
          setUnavailableReason(next.reason)
          return
        }
        if (!next.accepted) {
          try {
            await acceptTerminalAccess(runtime)
            onAccessChanged()
          } catch {
            if (active) setFailed(true)
          }
        }
        if (active) setAvailable(true)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => {
      active = false
    }
  }, [runtime])

  if (checking) {
    return (
      <TerminalStatusScreen
        icon={LuLoaderCircle}
        title="Preparando o terminal"
        detail="Verificando o shell local disponível."
        spinning
      />
    )
  }
  if (failed || available === false) {
    return (
      <TerminalStatusScreen
        icon={LuCircleAlert}
        title="Terminal indisponível"
        detail={
          failed
            ? 'Não foi possível consultar o serviço local. Atualize a aplicação e tente novamente.'
            : (unavailableReason ?? 'Não foi possível encontrar um shell seguro nesta máquina.')
        }
      />
    )
  }
  return (
    <TerminalConsole
      runtime={runtime}
      system={system}
      theme={theme}
      insertion={insertion}
      newConsoleRequest={newConsoleRequest}
    />
  )
}

function TerminalStatusScreen({
  icon: Icon,
  title,
  detail,
  spinning = false,
}: {
  icon: typeof LuCircleAlert
  title: string
  detail: string
  spinning?: boolean
}) {
  return (
    <section className="animate-in fade-in flex h-full w-full items-center justify-center p-6 text-center duration-200">
      <div className="max-w-md space-y-4">
        <Icon
          className={cn('mx-auto size-16 text-muted-foreground/50', spinning && 'animate-spin')}
          strokeWidth={1.25}
        />
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Terminal local
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground">{detail}</p>
      </div>
    </section>
  )
}

function TerminalConsole({
  runtime,
  system,
  theme,
  insertion,
  newConsoleRequest,
}: Omit<TerminalWorkspaceProps, 'onAccessChanged'>) {
  const terminal = useTerminalTabs(runtime)
  const [starting, setStarting] = useState(false)
  const [clearRequest, setClearRequest] = useState(0)
  const [searchRequest, setSearchRequest] = useState(0)
  const [openedIds, setOpenedIds] = useState<number[]>([])
  const [renameFocus, setRenameFocus] = useState(0)
  const [reconnectRequest, setReconnectRequest] = useState(0)
  const handledNewConsole = useRef(0)
  const activeTab = terminal.tabs.find((tab) => tab.active)
  const activeId = activeTab?.id
  const status = SESSION_STATUS[activeTab?.status ?? 'idle']
  const machine: TerminalMachine = { identity: `${system.user}@${system.hostname}` }

  useEffect(() => {
    if (activeId !== undefined) {
      setOpenedIds((current) => (current.includes(activeId) ? current : [...current, activeId]))
    }
  }, [activeId])

  useEffect(() => {
    if (terminal.loaded && newConsoleRequest > handledNewConsole.current) {
      handledNewConsole.current = newConsoleRequest
      void terminal.addTab()
    }
  }, [newConsoleRequest, terminal])

  const newTab = async () => {
    setStarting(true)
    await terminal.addTab()
    setStarting(false)
  }

  return (
    <div className="animate-in fade-in flex h-full min-h-0 flex-col gap-4 p-6 duration-200">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-xl font-semibold tracking-tight">
              {activeTab ? tabTitle(activeTab) : 'Console'}
            </h2>
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase',
                status.className,
              )}
            >
              {status.label}
            </span>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {activeTab?.cwd ?? machine.identity}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Buscar no console"
            title="Buscar no console"
            disabled={activeId === undefined}
            className="grid size-9 place-items-center rounded-lg border bg-card transition-colors hover:bg-muted disabled:opacity-50"
            onClick={() => setSearchRequest((request) => request + 1)}
          >
            <LuSearch className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Limpar histórico"
            title="Limpar histórico"
            disabled={activeId === undefined}
            className="grid size-9 place-items-center rounded-lg border bg-card transition-colors hover:bg-muted disabled:opacity-50"
            onClick={() => setClearRequest((request) => request + 1)}
          >
            <LuEraser className="size-4" />
          </button>
          <button
            type="button"
            disabled={starting}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            onClick={() => void newTab()}
          >
            {starting ? (
              <LuLoaderCircle className="size-4 animate-spin" />
            ) : (
              <LuPlus className="size-4" />
            )}
            Novo console
          </button>
          {activeTab?.status === 'disconnected' && (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted"
              onClick={() => setReconnectRequest((request) => request + 1)}
            >
              <LuRefreshCw className="size-4" />
              Reconectar
            </button>
          )}
        </div>
      </header>
      {terminal.persistenceError && (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span>{terminal.persistenceError}</span>
          <button
            type="button"
            aria-label="Fechar aviso"
            className="rounded-sm p-0.5 hover:bg-destructive/15"
            onClick={terminal.clearPersistenceError}
          >
            <LuX className="size-4" />
          </button>
        </div>
      )}
      <TerminalTabBar
        tabs={terminal.tabs}
        onSelect={terminal.selectTab}
        onClose={terminal.closeTab}
        onRename={terminal.renameTab}
        onEditEnd={() => setRenameFocus((request) => request + 1)}
      />
      <div className="relative min-h-0 flex-1">
        {terminal.tabs
          .filter((tab) => openedIds.includes(tab.id))
          .map((tab) => (
            <div
              key={tab.id}
              id={`terminal-panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`terminal-tab-${tab.id}`}
              className={cn('h-full', !tab.active && 'hidden')}
            >
              <TerminalView
                runtime={runtime}
                tabId={tab.id}
                active={tab.active}
                alive={tab.alive}
                cwd={tab.cwd}
                machine={machine}
                theme={theme}
                insertion={insertion}
                clearRequest={clearRequest}
                searchRequest={searchRequest}
                focusRequest={renameFocus}
                reconnectRequest={reconnectRequest}
                onStatusChange={(next) => terminal.setTabStatus(tab.id, next)}
                onPersistenceError={terminal.reportPersistenceError}
              />
            </div>
          ))}
      </div>
    </div>
  )
}
