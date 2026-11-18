import { LuPlus } from 'react-icons/lu'
import { SgbdIcon } from '@/features/sgbd/sgbd-icon'
import type { Sgbd } from '@/features/sgbd/use-sgbd'
import { cn } from '@/lib/utils'

export function SgbdPanel({ sgbd }: { sgbd: Sgbd }) {
  const { connections, selected, setEditor, select, requiresManualPing } = sgbd

  return (
    <div className="flex h-full flex-col gap-4">
      <h2 className="text-sm font-medium">Conexões</h2>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {connections?.map((connection) => {
          const active = connection.id === selected?.id
          return (
            <li key={connection.id}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-highlight text-highlight' : 'border-transparent',
                )}
                onClick={() => select(active ? null : connection.id)}
              >
                <SgbdIcon kind={connection.kind} className="size-4" />
                <span className={cn('min-w-0 flex-1 truncate text-sm font-medium', requiresManualPing(connection) && 'text-warning')}>
                  {connection.name}
                </span>
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            aria-label="Nova conexão"
            title="Nova conexão"
            className="flex h-9 w-full cursor-pointer items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-highlight hover:text-highlight"
            onClick={() => setEditor({ mode: 'new' })}
          >
            <LuPlus className="size-4" />
          </button>
        </li>
      </ul>
    </div>
  )
}
