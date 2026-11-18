import { useState } from 'react'
import { LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu'
import type { RuntimeStatus } from '../../api'
import { InlineInput } from './inline-input'
import { useSavedCommands } from './use-saved-commands'

const MAX_COMMAND_LENGTH = 500
const NEW_COMMAND = 'new'
const ROW_CLASS = 'flex h-9 items-center gap-2 rounded-lg px-2.5'
const INPUT_CLASS = 'font-mono text-xs'
const ACTION_CLASS =
  'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-foreground/10 hover:text-foreground'

export function SavedCommands({
  runtime,
  enabled,
  onInsert,
}: {
  runtime: RuntimeStatus
  enabled: boolean
  onInsert: (command: string) => void
}) {
  const { commands, createCommand, updateCommand, removeCommand } = useSavedCommands(
    runtime,
    enabled,
  )
  const [editing, setEditing] = useState<number | typeof NEW_COMMAND | null>(null)
  const [failed, setFailed] = useState(false)
  const stopEditing = () => setEditing(null)
  const run = (action: () => Promise<void>) => {
    setFailed(false)
    void action().catch(() => setFailed(true))
  }

  if (!enabled) {
    return (
      <p className="rounded-xl border bg-card p-3 text-xs leading-5 text-muted-foreground">
        Autorize o terminal para criar e reutilizar comandos salvos.
      </p>
    )
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Comandos salvos</h3>
      <ul className="space-y-1">
        {commands.map((saved) => (
          <li key={saved.id}>
            {editing === saved.id ? (
              <div className={`${ROW_CLASS} border border-highlight`}>
                <InlineInput
                  value={saved.command}
                  label="Editar comando"
                  maxLength={MAX_COMMAND_LENGTH}
                  className={INPUT_CLASS}
                  onCommit={(command) => {
                    run(() => updateCommand(saved.id, command))
                    stopEditing()
                  }}
                  onCancel={stopEditing}
                />
              </div>
            ) : (
              <div className="group flex h-9 items-center rounded-lg transition-colors hover:bg-muted">
                <button
                  type="button"
                  title={saved.command}
                  className="h-full min-w-0 flex-1 truncate rounded-lg px-2.5 text-left font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => onInsert(saved.command)}
                >
                  {saved.command}
                </button>
                <button
                  type="button"
                  aria-label={`Editar ${saved.command}`}
                  className={ACTION_CLASS}
                  onClick={() => setEditing(saved.id)}
                >
                  <LuPencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Excluir ${saved.command}`}
                  className={`${ACTION_CLASS} mr-1`}
                  onClick={() => run(() => removeCommand(saved.id))}
                >
                  <LuTrash2 className="size-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
        <li>
          {editing === NEW_COMMAND ? (
            <div className={`${ROW_CLASS} border border-highlight`}>
              <InlineInput
                value=""
                label="Novo comando"
                maxLength={MAX_COMMAND_LENGTH}
                className={INPUT_CLASS}
                onCommit={(command) => {
                  run(() => createCommand(command))
                  stopEditing()
                }}
                onCancel={stopEditing}
              />
            </div>
          ) : (
            <button
              type="button"
              aria-label="Novo comando"
              className="flex h-9 w-full items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-highlight hover:text-highlight"
              onClick={() => setEditing(NEW_COMMAND)}
            >
              <LuPlus className="size-4" />
            </button>
          )}
        </li>
      </ul>
      {failed && (
        <p role="status" className="text-xs text-destructive">
          Não foi possível salvar o comando.
        </p>
      )}
    </section>
  )
}
