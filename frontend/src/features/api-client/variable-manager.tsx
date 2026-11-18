import { useEffect, useRef, useState } from 'react'
import { LuPencil, LuPlus, LuTrash2, LuX } from 'react-icons/lu'
import {
  createApiClientVariable,
  deleteApiClientVariable,
  updateApiClientVariable,
  type ApiClientVariable,
  type RuntimeStatus,
} from '../../api'
import { useModalDialog } from '../accessibility/use-modal-dialog'

type VariableManagerProps = {
  collectionId: number
  collectionName: string
  variables: ApiClientVariable[]
  runtime: RuntimeStatus
  onClose: () => void
  onChange: (variables: ApiClientVariable[]) => void
  initialNew?: string
}

type Row = { editing: boolean; name: string; value: string; saving: boolean; error: string }

export function VariableManager({
  collectionId,
  collectionName,
  variables,
  runtime,
  onClose,
  onChange,
  initialNew,
}: VariableManagerProps) {
  const dialogRef = useModalDialog(true, onClose)
  const [rows, setRows] = useState<Record<number, Row>>({})
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState(initialNew ?? '')
  const [newValue, setNewValue] = useState('')
  const [newError, setNewError] = useState('')
  const [savingNew, setSavingNew] = useState('')
  const newNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (creating || initialNew) {
      requestAnimationFrame(() => newNameRef.current?.focus())
    }
  }, [creating, initialNew])

  useEffect(() => {
    if (initialNew) setCreating(true)
  }, [initialNew])

  const updateRow = (id: number, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }))

  const startEdit = (v: ApiClientVariable) =>
    setRows((r) => ({ ...r, [v.id]: { editing: true, name: v.name, value: v.value, saving: false, error: '' } }))

  const cancelEdit = (id: number) =>
    setRows((r) => { const next = { ...r }; delete next[id]; return next })

  const saveEdit = async (v: ApiClientVariable) => {
    const row = rows[v.id]
    if (!row) return
    updateRow(v.id, { saving: true, error: '' })
    try {
      const updated = await updateApiClientVariable(runtime, v.id, row.name, row.value)
      onChange(variables.map((x) => (x.id === v.id ? updated : x)))
      cancelEdit(v.id)
    } catch (err) {
      updateRow(v.id, { saving: false, error: err instanceof Error ? err.message : 'Erro ao salvar.' })
    }
  }

  const remove = async (v: ApiClientVariable) => {
    updateRow(v.id, { saving: true, error: '' })
    try {
      await deleteApiClientVariable(runtime, v.id)
      onChange(variables.filter((x) => x.id !== v.id))
    } catch (err) {
      updateRow(v.id, { saving: false, error: err instanceof Error ? err.message : 'Erro ao excluir.' })
    }
  }

  const saveNew = async () => {
    setNewError('')
    setSavingNew('saving')
    try {
      const created = await createApiClientVariable(runtime, collectionId, newName.trim(), newValue)
      onChange([...variables, created])
      setNewName('')
      setNewValue('')
      setCreating(false)
      setSavingNew('')
    } catch (err) {
      setNewError(err instanceof Error ? err.message : 'Erro ao criar.')
      setSavingNew('')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-6 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="varman-title"
        className="flex w-full max-w-2xl flex-col rounded-2xl border bg-popover shadow-2xl"
        style={{ maxHeight: '80vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 id="varman-title" className="text-base font-semibold tracking-tight">
              Variáveis da coleção
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{collectionName}</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            onClick={onClose}
          >
            <LuX className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {variables.length === 0 && !creating && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma variável ainda. Crie uma para usar em requests desta coleção com{' '}
              <code className="rounded bg-muted px-1 font-mono text-xs">{'{{nome}}'}</code>.
            </p>
          )}

          {variables.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Nome</th>
                  <th className="pb-2 font-medium">Valor</th>
                  <th className="pb-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {variables.map((v) => {
                  const row = rows[v.id]
                  if (row?.editing) {
                    return (
                      <tr key={v.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-4">
                          <input
                            autoFocus
                            className="h-7 w-full rounded-md border bg-transparent px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-highlight"
                            value={row.name}
                            onChange={(e) => updateRow(v.id, { name: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveEdit(v)
                              if (e.key === 'Escape') cancelEdit(v.id)
                            }}
                          />
                        </td>
                        <td className="py-1.5">
                          <input
                            className="h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none focus:ring-1 focus:ring-highlight"
                            value={row.value}
                            onChange={(e) => updateRow(v.id, { value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveEdit(v)
                              if (e.key === 'Escape') cancelEdit(v.id)
                            }}
                          />
                          {row.error && <p className="mt-0.5 text-xs text-destructive">{row.error}</p>}
                        </td>
                        <td className="py-1.5 pl-2">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={row.saving}
                              className="h-6 rounded px-2 text-xs font-medium text-highlight transition-colors hover:bg-muted disabled:opacity-50"
                              onClick={() => void saveEdit(v)}
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              className="h-6 rounded px-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                              onClick={() => cancelEdit(v.id)}
                            >
                              <LuX className="size-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={v.id} className="group border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs font-semibold text-highlight">
                        {v.name}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {v.value || <span className="italic opacity-50">vazio</span>}
                        {rows[v.id]?.error && (
                          <p className="mt-0.5 text-xs text-destructive">{rows[v.id].error}</p>
                        )}
                      </td>
                      <td className="py-2 pl-2">
                        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted"
                            onClick={() => startEdit(v)}
                          >
                            <LuPencil className="size-3" />
                          </button>
                          <button
                            type="button"
                            disabled={rows[v.id]?.saving}
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                            onClick={() => void remove(v)}
                          >
                            <LuTrash2 className="size-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {creating && (
            <div className={`mt-3 flex gap-2 ${variables.length > 0 ? 'pt-3 border-t' : ''}`}>
              <input
                ref={newNameRef}
                placeholder="nome"
                className="h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-highlight"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setNewError('') }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveNew()
                  if (e.key === 'Escape') { setCreating(false); setNewName(initialNew ?? ''); setNewValue(''); setNewError('') }
                }}
              />
              <input
                placeholder="valor"
                className="h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-xs outline-none focus:ring-1 focus:ring-highlight"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveNew()
                  if (e.key === 'Escape') { setCreating(false); setNewName(initialNew ?? ''); setNewValue(''); setNewError('') }
                }}
              />
              <button
                type="button"
                disabled={savingNew === 'saving' || !newName.trim()}
                className="h-7 rounded-md bg-highlight px-3 text-xs font-medium text-white transition-colors hover:brightness-95 disabled:opacity-50"
                onClick={() => void saveNew()}
              >
                Criar
              </button>
              <button
                type="button"
                className="h-7 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
                onClick={() => { setCreating(false); setNewName(initialNew ?? ''); setNewValue(''); setNewError('') }}
              >
                <LuX className="size-3" />
              </button>
              {newError && <p className="mt-1 text-xs text-destructive">{newError}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t px-6 py-3">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-muted"
            onClick={() => { setCreating(true); setNewName(''); setNewValue('') }}
          >
            <LuPlus className="size-3.5" />
            Nova variável
          </button>
        </div>
      </section>
    </div>
  )
}
