import { useEffect, useState } from 'react'
import { LuEraser, LuLoaderCircle, LuPlus, LuRefreshCw, LuSearch, LuX } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { TerminalTabBar } from '@/features/terminal/terminal-tab-bar'
import { TerminalView, type CommandInsertion, type TerminalMachine, type TerminalStatus } from '@/features/terminal/terminal-view'
import { tabTitle, type useTerminalTabs } from '@/features/terminal/use-terminal-tabs'
import { fetchMachineInfo } from '@/lib/api'
import { cn } from '@/lib/utils'

const START_DELAY_MS = 500

const SESSION_STATUS: Record<TerminalStatus, { label: string; className: string }> = {
  idle: { label: 'Pronto', className: 'bg-muted text-muted-foreground' },
  connecting: { label: 'Conectando...', className: 'bg-muted text-muted-foreground' },
  connected: { label: 'Sessão ativa', className: 'bg-success/15 text-success' },
  disconnected: { label: 'Sessão interrompida', className: 'bg-destructive/15 text-destructive' },
}

type TerminalWorkspaceProps = {
  terminal: ReturnType<typeof useTerminalTabs>
  visible: boolean
  focusRequest: number
  insertion: CommandInsertion | null
}

export function TerminalWorkspace({ terminal, visible, focusRequest, insertion }: TerminalWorkspaceProps) {
  const {
    tabs,
    persistenceError,
    selectTab,
    addTab,
    closeTab,
    renameTab,
    setTabStatus,
    reportPersistenceError,
    clearPersistenceError,
  } = terminal
  const [starting, setStarting] = useState(false)
  const [machine, setMachine] = useState<TerminalMachine | null>(null)
  const [clearRequest, setClearRequest] = useState(0)
  const [searchRequest, setSearchRequest] = useState(0)
  const [openedIds, setOpenedIds] = useState<number[]>([])
  const [renameFocus, setRenameFocus] = useState(0)
  const [reconnectRequest, setReconnectRequest] = useState(0)
  const activeTab = tabs.find((tab) => tab.active)
  const activeId = activeTab?.id
  const status = SESSION_STATUS[activeTab?.status ?? 'idle']

  useEffect(() => {
    fetchMachineInfo().then((info) =>
      setMachine({ identity: info ? `${info.user}@${info.hostname}` : '', home: info?.home ?? '' }),
    )
  }, [])

  const sessionRunning = tabs.some((tab) => tab.status !== 'idle')

  useEffect(() => {
    if (!sessionRunning) {
      return
    }
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [sessionRunning])

  useEffect(() => {
    if (visible && activeId !== undefined && !openedIds.includes(activeId)) {
      setOpenedIds([...openedIds, activeId])
    }
  }, [visible, activeId, openedIds])

  const newTab = () => {
    setStarting(true)
    setTimeout(async () => {
      try {
        await addTab()
      } finally {
        setStarting(false)
      }
    }, START_DELAY_MS)
  }

  return (
    <div className={cn('animate-in fade-in flex h-full min-h-0 flex-col gap-4 p-6 duration-200', !visible && 'hidden')}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-xl font-semibold tracking-tight">
              {activeTab ? tabTitle(activeTab) : 'Console'}
            </h2>
            <span className={cn('inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase', status.className)}>
              {status.label}
            </span>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {activeTab?.cwd ?? machine?.identity ?? 'Nenhuma sessão selecionada'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Buscar no console"
            title="Buscar no console"
            disabled={activeId === undefined}
            onClick={() => setSearchRequest((request) => request + 1)}
          >
            <LuSearch />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Limpar histórico"
            title="Limpar histórico"
            disabled={activeId === undefined}
            onClick={() => setClearRequest((request) => request + 1)}
          >
            <LuEraser />
          </Button>
          <Button className="uppercase" disabled={starting} onClick={newTab}>
            {starting ? <LuLoaderCircle className="animate-spin" /> : <LuPlus />}
            Novo console
          </Button>
          {activeTab?.status === 'disconnected' && (
            <Button className="uppercase" variant="outline" onClick={() => setReconnectRequest((request) => request + 1)}>
              <LuRefreshCw />
              Reconectar
            </Button>
          )}
        </div>
      </header>
      {persistenceError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{persistenceError}</span>
          <button
            type="button"
            aria-label="Fechar aviso"
            className="rounded-sm p-0.5 hover:bg-destructive/15"
            onClick={clearPersistenceError}
          >
            <LuX className="size-4" />
          </button>
        </div>
      )}
      <TerminalTabBar
        tabs={tabs}
        onSelect={selectTab}
        onClose={closeTab}
        onRename={renameTab}
        onEditEnd={() => setRenameFocus((request) => request + 1)}
      />
      <div className="relative min-h-0 flex-1">
        {machine !== null &&
          tabs
            .filter((tab) => openedIds.includes(tab.id))
            .map((tab) => (
              <div key={tab.id} className={cn('h-full', !tab.active && 'hidden')}>
                <TerminalView
                  tabId={tab.id}
                  active={visible && tab.active}
                  alive={tab.alive}
                  cwd={tab.cwd}
                  machine={machine}
                  insertion={insertion}
                  clearRequest={clearRequest}
                  searchRequest={searchRequest}
                  focusRequest={focusRequest + renameFocus}
                  reconnectRequest={reconnectRequest}
                  onStatusChange={(status) => setTabStatus(tab.id, status)}
                  onPersistenceError={reportPersistenceError}
                />
              </div>
            ))}
      </div>
    </div>
  )
}
