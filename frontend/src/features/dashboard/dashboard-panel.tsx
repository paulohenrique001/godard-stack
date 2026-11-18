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
import type { DashboardRefresh } from '@/features/dashboard/use-dashboard-refresh'
import { cn } from '@/lib/utils'

function MiniStat({ icon: Icon, value, label }: { icon: IconType; value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl border bg-card px-2 py-3 text-center">
      <Icon className="size-4 text-highlight" /><span className="text-sm font-semibold leading-none">{value}</span><span className="truncate text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}

function Tool({ icon: Icon, label, color, available }: { icon: IconType; label: string; color: string; available: boolean }) {
  return <div className={cn('flex flex-col items-center gap-1.5 rounded-xl border bg-card px-2 py-3 text-xs font-medium transition-opacity', !available && 'opacity-40')}><Icon className={cn('size-5', color)} />{label}</div>
}

function QuickAction({ icon: Icon, label, onClick, wide = false }: { icon: IconType; label: string; onClick: () => void; wide?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={wide ? 'flex h-11 w-full items-center justify-center gap-2 rounded-xl border bg-card text-sm font-medium transition-colors hover:border-highlight hover:bg-muted' : 'grid h-10 w-full place-items-center rounded-xl border bg-card text-muted-foreground transition-colors hover:border-highlight hover:bg-muted hover:text-foreground'}
      onClick={onClick}
    >
      <Icon className="size-5" />{wide && label}
    </button>
  )
}

type DashboardPanelProps = {
  onCreateConsole: () => void
  onCreateContainer: () => void
  onCreateConnection: () => void
  dashboard: DashboardRefresh
}

export function DashboardPanel({
  onCreateConsole,
  onCreateContainer,
  onCreateConnection,
  dashboard,
}: DashboardPanelProps) {
  const { status, apiOnline, machine, tools, issues, refreshNow } = dashboard
  const statusStyle = status === 'operational'
    ? 'border-success/25 bg-success/10 text-success'
    : status === 'warning'
      ? 'border-warning/25 bg-primary-soft text-warning'
      : 'border-primary/25 bg-primary-soft text-highlight'
  const statusLabel = status === 'operational' ? 'Tudo operacional' : status === 'warning' ? 'Verifique o ambiente' : 'Atualizando dados'
  const connectionLabel = apiOnline === false ? 'Offline' : apiOnline === true ? 'Online' : 'Verificando'
  const connectionStyle = apiOnline === false
    ? 'bg-destructive/15 text-destructive'
    : apiOnline === true
      ? 'bg-success/15 text-success'
      : 'bg-muted text-muted-foreground'
  const identity = machine ? `${machine.user}@${machine.hostname}` : 'Máquina indisponível'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-5">
      <section className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-highlight"><LuLaptop className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2"><p className="truncate"><span className="font-bold">Godard</span> Stack</p><span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ${connectionStyle}`}><span className={`size-1.5 rounded-full ${apiOnline === false ? 'bg-destructive' : apiOnline === true ? 'bg-success' : 'bg-muted-foreground'}`} />{connectionLabel}</span></div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{identity}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2"><MiniStat icon={LuCpu} value={machine ? String(machine.cpus) : '—'} label="CPUs" /><MiniStat icon={LuBoxes} value="dev" label="Ambiente" /></div>
      </section>
      <hr />
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><LuZap className="size-4 text-highlight" />Ações rápidas</h3>
        <div className="space-y-1.5">
          <QuickAction icon={LuPlus} label="Novo console" wide onClick={onCreateConsole} />
          <QuickAction icon={LuBoxes} label="Novo contêiner" wide onClick={onCreateContainer} />
          <QuickAction icon={LuLink} label="Nova conexão" wide onClick={onCreateConnection} />
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><LuWrench className="size-4 text-highlight" />Ferramentas</h3>
        <div className="grid grid-cols-3 gap-2"><Tool icon={SiGit} label="Git" color="text-[#f05032]" available={tools.includes('git')} /><Tool icon={SiDocker} label="Docker" color="text-[#2496ed]" available={tools.includes('docker')} /><Tool icon={FaAws} label="AWS" color="text-[#ff9900]" available={tools.includes('aws')} /></div>
      </section>
      {status === 'warning' && issues.length > 0 && (
        <section>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {issues.map((issue) => <li key={issue} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-warning" />{issue}</li>)}
          </ul>
        </section>
      )}
      </div>
      <div className="mt-auto pt-5">
        <button
          type="button"
          aria-label="Atualizar dados do dashboard"
          title="Atualizar dados"
          className={`flex h-12 w-full items-center justify-center overflow-hidden rounded-xl border px-3 text-sm font-medium whitespace-nowrap transition-colors hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring ${statusStyle}`}
          onClick={() => void refreshNow()}
        >
          {status === 'refreshing' ? <LuRefreshCw className="size-5 animate-spin" /> : statusLabel}
        </button>
      </div>
    </div>
  )
}
