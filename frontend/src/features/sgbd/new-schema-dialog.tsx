import { useState, type FormEvent } from 'react'
import { LuX } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createSchema } from '@/features/sgbd/sgbd-api'

const MAX_SCHEMA_NAME_LENGTH = 64

type NewSchemaDialogProps = {
  connectionId: number
  onClose: () => void
  onCreated: () => Promise<void>
}

export function NewSchemaDialog({ connectionId, onClose, onCreated }: NewSchemaDialogProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createSchema(connectionId, name.trim())
      await onCreated()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível criar o schema.')
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Novo schema</DialogTitle>
          <DialogDescription className="sr-only">Nome do schema que será criado no banco</DialogDescription>
        </DialogHeader>
        <form className="flex min-w-0 flex-col gap-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="schema-name">Nome</Label>
            <Input
              id="schema-name"
              autoComplete="off"
              className="h-10 rounded-lg"
              maxLength={MAX_SCHEMA_NAME_LENGTH}
              value={name}
              onChange={(event) => {
                setName(event.target.value.replace(/\s/g, '_'))
                setError('')
              }}
            />
          </div>
          <div className="h-11 overflow-y-auto text-sm">
            {error && (
              <p role="alert" className="flex gap-1.5 text-destructive">
                <LuX className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 wrap-anywhere">{error}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
