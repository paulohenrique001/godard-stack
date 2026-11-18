import { useState, type ReactNode } from 'react'
import type { IconType } from 'react-icons'
import {
  LuCheck,
  LuCopy,
  LuDownload,
  LuFileCode,
  LuFileKey,
  LuLoaderCircle,
  LuLock,
  LuPlay,
  LuRotateCw,
  LuScrollText,
  LuSquare,
  LuSquareTerminal,
  LuTrash2,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { ContentLoader } from '@/components/ui/content-loader'
import { ConfirmDialog } from '@/features/docker/confirm-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ContainerFileEditor } from '@/features/docker/container-file-editor'
import { ContainerLogs } from '@/features/docker/container-logs'
import { ContainerOutput } from '@/features/docker/container-output'
import { ContainerShell } from '@/features/docker/container-shell'
import { stateLabel, type ContainerAction, type DockerContainer, type DockerDetailTab } from '@/features/docker/docker-api'
import { NewContainer } from '@/features/docker/new-container'
import { ErrorPlaceholder, SelectionPlaceholder } from '@/features/layout/selection-placeholder'
import type { DockerContainers } from '@/features/docker/use-docker-containers'
import { cn } from '@/lib/utils'

const PENDING_LABELS: Record<ContainerAction, string> = {
  start: 'Iniciando...',
  stop: 'Parando...',
  restart: 'Reiniciando...',
  update: 'Atualizando...',
  remove: 'Excluindo...',
}

const PROTECTED_MESSAGE = 'Este é o container da própria aplicação'
const SHORT_ID_LENGTH = 12
const COPIED_FEEDBACK_MS = 1500
const NO_FILE_REASON = 'Disponível só para containers com arquivo de configuração'

type DetailTabItem = { id: DockerDetailTab; label: string; icon: IconType }

const DETAIL_TABS: DetailTabItem[] = [
  { id: 'logs', label: 'Logs', icon: LuScrollText },
  { id: 'shell', label: 'Shell', icon: LuSquareTerminal },
  { id: 'compose', label: 'docker-compose.yml', icon: LuFileCode },
  { id: 'env', label: '.env', icon: LuFileKey },
]

const OUTPUT_TAB: DetailTabItem = { id: 'output', label: 'Saída', icon: LuDownload }

function StateBadge({ container, action }: { container: DockerContainer; action?: ContainerAction }) {
  const running = container.running
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium uppercase',
        action && 'bg-muted text-muted-foreground',
        !action && running && 'bg-success/15 text-success',
        !action && !running && 'bg-muted text-muted-foreground',
      )}
    >
      {action && <LuLoaderCircle className="size-3 animate-spin" />}
      {action ? PENDING_LABELS[action] : stateLabel(container.state)}
    </span>
  )
}

function ProtectedBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex cursor-help items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-highlight uppercase"
        >
          <LuLock className="size-3" />
          Não editável
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="whitespace-nowrap">
        {PROTECTED_MESSAGE}
      </TooltipContent>
    </Tooltip>
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
  const shortId = id.slice(0, SHORT_ID_LENGTH)

  const copy = async () => {
    await navigator.clipboard.writeText(shortId)
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
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

function Guarded({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (reason === null) {
    return children
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{children}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {reason}
      </TooltipContent>
    </Tooltip>
  )
}

export function DockerPage({ docker }: { docker: DockerContainers }) {
  const {
    visible,
    selected,
    selectedTab,
    pending,
    loading,
    unavailable,
    actionError,
    logsEpoch,
    outputs,
    metrics,
    creating,
    files,
    setCreating,
    selectTab,
    runAction,
    updateContainer,
    followRecreated,
  } = docker
  if (creating) {
    return (
      <NewContainer
        onCancel={() => setCreating(false)}
        onCreated={async (composeFile) => {
          await followRecreated((container) => container.composeFile === composeFile)
          setCreating(false)
        }}
      />
    )
  }

  if (!selected && unavailable) {
    return <ErrorPlaceholder label="Docker indisponível" />
  }

  if (!selected && !loading && visible.length > 0) {
    return <SelectionPlaceholder label="Selecione um container" />
  }

  if (!selected) {
    if (loading) {
      return <ContentLoader className="h-full p-6" />
    }
    return (
      <div className="animate-in fade-in flex h-full items-center justify-center p-6 duration-200">
        <p className="text-sm text-muted-foreground">Nenhum container encontrado.</p>
      </div>
    )
  }

  const action = pending[selected.id]
  const running = selected.running
  const output = outputs[selected.name]
  const tabBlocked =
    (selectedTab === 'output' && output === undefined) || (selectedTab === 'shell' && selected.protected)
  const tab = tabBlocked ? 'logs' : selectedTab
  const tabs = output === undefined ? DETAIL_TABS : [...DETAIL_TABS, OUTPUT_TAB]
  const noFileReason = selected.composeFile === null ? NO_FILE_REASON : null

  return (
    <div className="animate-in fade-in flex h-full min-h-0 flex-col gap-4 p-6 duration-200">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-xl font-semibold tracking-tight">{selected.name}</h2>
            <StateBadge container={selected} action={action} />
            {selected.protected && <ProtectedBadge />}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            Criado em {selected.createdAt} · {selected.image}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {running ? (
            <>
              <Button
                variant="outline"
                className="uppercase"
                disabled={action !== undefined || selected.protected}
                onClick={() => runAction(selected, 'stop')}
              >
                <LuSquare />
                Parar
              </Button>
              <Button
                variant="outline"
                className="uppercase"
                disabled={action !== undefined}
                onClick={() => runAction(selected, 'restart')}
              >
                <LuRotateCw />
                Reiniciar
              </Button>
            </>
          ) : (
            <Button className="uppercase" disabled={action !== undefined} onClick={() => runAction(selected, 'start')}>
              <LuPlay />
              Iniciar
            </Button>
          )}
          <Guarded reason={noFileReason}>
            <Button
              variant="outline"
              className="uppercase"
              disabled={action !== undefined || selected.protected || noFileReason !== null}
              onClick={() => {
                selectTab('output')
                updateContainer(selected)
              }}
            >
              <LuDownload />
              Atualizar
            </Button>
          </Guarded>
          {selected.protected ? (
            <Button variant="outline" disabled className="uppercase text-destructive">
              <LuTrash2 />
              Excluir
            </Button>
          ) : (
            <ConfirmDialog
              title="Excluir container"
              description={
                <>
                  O container <strong className="font-semibold text-highlight">{selected.name}</strong> será
                  excluído. Os volumes e os arquivos de configuração serão mantidos.
                </>
              }
              onConfirm={() => runAction(selected, 'remove')}
            >
              <Button
                variant="outline"
                disabled={action !== undefined}
                className="uppercase text-destructive hover:text-destructive"
              >
                <LuTrash2 />
                Excluir
              </Button>
            </ConfirmDialog>
          )}
        </div>
      </header>
      {actionError?.id === selected.id && (
        <p role="alert" className="shrink-0 text-sm wrap-anywhere text-destructive">
          {actionError.message}
        </p>
      )}
      {unavailable && (
        <p role="alert" className="shrink-0 text-sm text-destructive">
          Docker indisponível. Os dados abaixo podem estar desatualizados.
        </p>
      )}
      <div className="grid shrink-0 grid-cols-3 gap-3">
        <Detail label="Status">{selected.status}</Detail>
        <Detail label="Saúde">{selected.health === 'healthy' ? 'Saudável' : selected.health === 'unhealthy' ? 'Com problemas' : selected.health === 'starting' ? 'Iniciando' : 'Não informado'}</Detail>
        <Detail label="Portas">
          <span title={selected.ports.join(', ')}>{selected.ports.join(', ') || 'Nenhuma'}</span>
        </Detail>
        <Detail label="CPU">{metrics?.cpuPercent === null || metrics === null ? '—' : `${metrics.cpuPercent}%`}</Detail>
        <Detail label="Memória">{metrics?.memoryUsage ?? '—'}{metrics?.memoryPercent === null || metrics === null ? '' : ` (${metrics.memoryPercent}%)`}</Detail>
        <IdDetail key={selected.id} id={selected.id} />
      </div>
      <section className="flex min-h-48 flex-1 flex-col gap-3">
        <div role="tablist" className="flex gap-1 border-b">
          {tabs.map(({ id, label, icon: Icon }) => {
            const locked = id === 'shell' && selected.protected
            const TabIcon = locked ? LuLock : Icon
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                disabled={locked}
                className={cn(
                  '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                  tab === id ? 'border-highlight text-highlight' : 'border-transparent text-muted-foreground',
                )}
                onClick={() => selectTab(id)}
              >
                <TabIcon className="size-4" />
                {label}
              </button>
            )
          })}
        </div>
        {tab === 'logs' && (
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card p-3">
            <ContainerLogs key={`${selected.id}:${logsEpoch}:${running}`} id={selected.id} name={selected.name} />
          </div>
        )}
        {tab === 'output' && (
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card p-3">
            <ContainerOutput key={selected.name} text={output ?? ''} />
          </div>
        )}
        {tab === 'shell' && (
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-card p-3">
            {running ? (
              <ContainerShell key={selected.id} id={selected.id} name={selected.name} />
            ) : (
              <p className="m-auto text-sm text-muted-foreground">Inicie o container para abrir o shell.</p>
            )}
          </div>
        )}
        {(tab === 'compose' || tab === 'env') && (
          <ContainerFileEditor key={`${selected.id}:${tab}`} container={selected} kind={tab} files={files} />
        )}
      </section>
    </div>
  )
}
