import { useState, type FormEvent } from 'react'
import { LuUser } from 'react-icons/lu'
import type { UserProfile } from '../../api'
import { ProfileFields } from './profile-fields'

type ProfilePanelProps = {
  user: UserProfile
  onSave: (profile: UserProfile) => Promise<void>
}

export function ProfilePanel({ user, onSave }: ProfilePanelProps) {
  const [name, setName] = useState(user.name)
  const [avatarSeed, setAvatarSeed] = useState(user.avatarSeed)
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle')
  const trimmedName = name.trim().toUpperCase()
  const changed = trimmedName !== user.name || avatarSeed !== user.avatarSeed

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('saving')
    try {
      await onSave({ ...user, name: trimmedName, avatarSeed })
      setStatus('idle')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <form onSubmit={submit}>
      <h3 className="mb-4 flex items-center gap-2 font-semibold">
        <LuUser className="size-4 text-highlight" />
        Perfil
      </h3>
      <ProfileFields
        name={name}
        avatarSeed={avatarSeed}
        label="Seu nome"
        onNameChange={(value) => {
          setName(value)
          setStatus('idle')
        }}
        onAvatarSeedChange={(seed) => {
          setAvatarSeed(seed)
          setStatus('idle')
        }}
      />
      {status === 'failed' && (
        <p role="status" className="mt-3 text-xs text-destructive">
          Não foi possível salvar o perfil.
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'saving' || !changed || trimmedName.length < 3}
        className="mt-4 h-9 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {status === 'saving' ? 'Salvando...' : 'Salvar'}
      </button>
    </form>
  )
}
