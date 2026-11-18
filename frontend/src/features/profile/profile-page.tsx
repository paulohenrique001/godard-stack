import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { MIN_NAME_LENGTH, ProfileFields } from '@/features/profile/profile-fields'
import { saveAvatarSeed, saveUserName } from '@/lib/api'

type SaveStatus = 'idle' | 'saving' | 'failed'

type ProfilePageProps = {
  name: string
  avatarSeed: string | null
  onSaved: (name: string, avatarSeed: string | null) => void
}

export function ProfilePage({ name, avatarSeed, onSaved }: ProfilePageProps) {
  const [draftName, setDraftName] = useState(name)
  const [draftSeed, setDraftSeed] = useState(avatarSeed)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const trimmedName = draftName.trim().toUpperCase()
  const changed = trimmedName !== name || draftSeed !== avatarSeed

  const changeName = (value: string) => {
    setDraftName(value)
    setStatus('idle')
  }

  const changeSeed = (seed: string | null) => {
    setDraftSeed(seed)
    setStatus('idle')
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setStatus('saving')
    try {
      const savedName = await saveUserName(trimmedName)
      await saveAvatarSeed(draftSeed)
      onSaved(savedName, draftSeed)
      setStatus('idle')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <div className="animate-in fade-in flex h-full items-center justify-center p-6 duration-200">
      <form
        className="w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-lg shadow-black/5"
        onSubmit={save}
      >
        <div className="flex flex-col gap-6 px-8 py-8">
          <ProfileFields
            name={draftName}
            avatarSeed={draftSeed}
            label="Seu nome"
            onNameChange={changeName}
            onAvatarSeedChange={changeSeed}
          />
        </div>
        <div className="flex items-center justify-between gap-4 border-t px-6 py-4">
          <p role="status" className="text-sm text-destructive">
            {status === 'failed' && 'Não foi possível salvar.'}
          </p>
          <Button
            className="h-10 min-w-32 rounded-lg"
            type="submit"
            disabled={status === 'saving' || !changed || trimmedName.length < MIN_NAME_LENGTH}
          >
            {status === 'saving' ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </form>
    </div>
  )
}
