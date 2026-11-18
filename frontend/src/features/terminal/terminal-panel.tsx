import { useEffect, useState } from 'react'
import { LuHardDrive, LuMemoryStick, LuSquareTerminal } from 'react-icons/lu'
import {
  fetchTerminalAccess,
  type RuntimeStatus,
  type SystemSnapshot,
  type TerminalAccess,
} from '../../api'
import { SavedCommands } from './saved-commands'

function percentage(total: number, available: number) {
  return total > 0 ? Math.round(((total - available) / total) * 100) : 0
}

function Usage({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof LuMemoryStick
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </span>
        <span className="font-medium tabular-nums">{value}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-foreground/15">
        <div
          className={
            value >= 90 ? 'h-full rounded-full bg-destructive' : 'h-full rounded-full bg-highlight'
          }
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

export function TerminalPanel({
  runtime,
  system,
  refreshKey,
  onInsertCommand,
}: {
  runtime: RuntimeStatus
  system: SystemSnapshot
  refreshKey: number
  onInsertCommand: (command: string) => void
}) {
  const [access, setAccess] = useState<TerminalAccess | null>(null)

  useEffect(() => {
    let active = true
    fetchTerminalAccess(runtime)
      .then((next) => {
        if (active) setAccess(next)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [refreshKey, runtime])

  const enabled = access?.available === true
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-5">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-highlight">
              <LuSquareTerminal className="size-4" />
            </span>
            <h2 className="text-sm font-semibold">Console</h2>
          </div>
          <div>
            <p className="truncate font-medium" title={`${system.user}@${system.hostname}`}>
              {system.user}@{system.hostname}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {system.operatingSystem.split(' ')[0]} · {system.processors} CPUs
            </p>
          </div>
        </section>
        <section className="space-y-3">
          <Usage
            label="Memória"
            value={percentage(system.memoryTotal, system.memoryAvailable)}
            icon={LuMemoryStick}
          />
          <Usage
            label="Disco"
            value={percentage(system.diskTotal, system.diskAvailable)}
            icon={LuHardDrive}
          />
        </section>
        <hr />
        <SavedCommands runtime={runtime} enabled={enabled} onInsert={onInsertCommand} />
      </div>
    </div>
  )
}
