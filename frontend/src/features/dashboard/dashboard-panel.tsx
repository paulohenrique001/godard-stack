import { useState } from 'react'
import type { IconType } from 'react-icons'
import { FaAws } from 'react-icons/fa'
import { SiDocker, SiGit } from 'react-icons/si'
import {
  LuBoxes,
  LuCpu,
  LuLaptop,
  LuLink,
  LuPlus,
  LuRefreshCw,
  LuWrench,
  LuZap,
} from 'react-icons/lu'
import type { Bootstrap } from '../../api'
import { cn } from '../../shared/lib/cn'

type DashboardPanelProps = {
  state: Bootstrap
  onCreateConsole: () => void
  onCreateContainer: () => void
  onCreateConnection: () => void
  onRefresh: () => void
}

export function DashboardPanel({
  state,
  onCreateConsole,
  onCreateContainer,
  onCreateConnection,
  onRefresh,
}: DashboardPanelProps) {
  const [refreshing, setRefreshing] = useState(false)

  const refresh = () => {
    setRefreshing(true)
    onRefresh()
    window.setTimeout(() => setRefreshing(false), 500)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-5">
        <SystemSummary state={state} />
        <hr />
        <QuickActions
          onCreateConsole={onCreateConsole}
          onCreateContainer={onCreateContainer}
          onCreateConnection={onCreateConnection}
        />
        <AvailableTools tools={state.system.tools ?? []} />
      </div>
      <div className="mt-auto pt-5">
        <button
          type="button"
          className="flex h-12 w-full items-center justify-center overflow-hidden rounded-xl border border-success/25 bg-success/10 px-3 text-sm font-medium whitespace-nowrap text-success transition-colors hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={refresh}
        >
          {refreshing ? <LuRefreshCw className="size-5 animate-spin" /> : 'Tudo operacional'}
        </button>
      </div>
    </div>
  )
}

function SystemSummary({ state }: { state: Bootstrap }) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-highlight">
          <LuLaptop className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate">
              <span className="font-bold">Godard</span> Stack
            </p>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success/15 px-2 py-1 text-xs font-semibold text-success">
              <span className="size-1.5 rounded-full bg-success" />
              Online
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {state.system.user}@{state.system.hostname}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniStat icon={LuCpu} value={String(state.system.processors)} label="CPUs" />
        <MiniStat icon={LuBoxes} value="dev" label="Ambiente" />
      </div>
    </section>
  )
}

function QuickActions({
  onCreateConsole,
  onCreateContainer,
  onCreateConnection,
}: Pick<DashboardPanelProps, 'onCreateConsole' | 'onCreateContainer' | 'onCreateConnection'>) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <LuZap className="size-4 text-highlight" />
        Ações rápidas
      </h3>
      <div className="space-y-1.5">
        <QuickAction icon={LuPlus} label="Novo console" onClick={onCreateConsole} />
        <QuickAction icon={LuBoxes} label="Abrir contêineres" onClick={onCreateContainer} />
        <QuickAction icon={LuLink} label="Nova conexão" onClick={onCreateConnection} />
      </div>
    </section>
  )
}

function AvailableTools({ tools }: { tools: string[] }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <LuWrench className="size-4 text-highlight" />
        Ferramentas
      </h3>
      <div className="grid grid-cols-3 gap-2">
        <Tool icon={SiGit} label="Git" color="text-[#f05032]" available={tools.includes('git')} />
        <Tool
          icon={SiDocker}
          label="Docker"
          color="text-[#2496ed]"
          available={tools.includes('docker')}
        />
        <Tool icon={FaAws} label="AWS" color="text-[#ff9900]" available={tools.includes('aws')} />
      </div>
    </section>
  )
}

function MiniStat({ icon: Icon, value, label }: { icon: IconType; value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl border bg-card px-2 py-3 text-center">
      <Icon className="size-4 text-highlight" />
      <span className="text-sm font-semibold leading-none">{value}</span>
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}

function Tool({
  icon: Icon,
  label,
  color,
  available,
}: {
  icon: IconType
  label: string
  color: string
  available: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-xl border bg-card px-2 py-3 text-xs font-medium transition-opacity',
        !available && 'opacity-40',
      )}
    >
      <Icon className={cn('size-5', color)} />
      {label}
    </div>
  )
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: IconType
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border bg-card text-sm font-medium transition-colors hover:border-highlight hover:bg-muted"
      onClick={onClick}
    >
      <Icon className="size-5" />
      {label}
    </button>
  )
}
