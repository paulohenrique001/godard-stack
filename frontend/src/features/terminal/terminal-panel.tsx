import { SavedCommands } from '@/features/terminal/saved-commands'
import { useMachineInfo } from '@/features/terminal/use-machine-info'
import { cn } from '@/lib/utils'

function Usage({ label, total, available }: { label: string; total: number; available: number }) {
  const percent = Math.round(((total - available) / total) * 100)

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 overflow-hidden rounded-full bg-foreground/20"
      >
        <div
          className={cn('h-full rounded-full bg-highlight transition-[width] duration-500', percent >= 90 && 'bg-destructive')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export function MachineSummary() {
  const info = useMachineInfo()

  if (!info) {
    return <p className="text-sm text-muted-foreground">Dados da máquina indisponíveis</p>
  }

  return (
    <section className="space-y-5">
      <div className="min-w-0">
        <p className="truncate font-medium" title={`${info.user}@${info.hostname}`}>
          {info.user}@{info.hostname}
        </p>
        <p className="text-sm text-muted-foreground">
          {info.os.split(' ')[0]} · {info.shell.split('/').pop()} · {info.cpus} CPUs
        </p>
      </div>
      <div className="space-y-4">
        <Usage label="Memória" total={info.memoryTotal} available={info.memoryAvailable} />
        {info.diskTotal !== undefined && info.diskAvailable !== undefined && (
          <Usage label="Disco" total={info.diskTotal} available={info.diskAvailable} />
        )}
      </div>
    </section>
  )
}

export function TerminalPanel({ onInsertCommand }: { onInsertCommand: (command: string) => void }) {
  return (
    <div className="space-y-6">
      <h2 className="text-sm font-medium">Console</h2>
      <MachineSummary />
      <hr />
      <SavedCommands onInsert={onInsertCommand} />
    </div>
  )
}
