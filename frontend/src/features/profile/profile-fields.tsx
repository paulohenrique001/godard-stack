import { useEffect, useState } from 'react'
import { LuRefreshCw } from 'react-icons/lu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { randomSeed, UserAvatar } from '@/features/profile/user-avatar'

export const MIN_NAME_LENGTH = 3
export const MAX_NAME_LENGTH = 25

const AVATAR_DELAY_MS = 400

type ProfileFieldsProps = {
  name: string
  avatarSeed: string | null
  label: string
  autoFocus?: boolean
  onNameChange: (name: string) => void
  onAvatarSeedChange: (seed: string | null) => void
}

export function ProfileFields({
  name,
  avatarSeed,
  label,
  autoFocus = false,
  onNameChange,
  onAvatarSeedChange,
}: ProfileFieldsProps) {
  const [avatarName, setAvatarName] = useState(name)

  useEffect(() => {
    const timer = setTimeout(() => setAvatarName(name), AVATAR_DELAY_MS)
    return () => clearTimeout(timer)
  }, [name])

  return (
    <>
      <button
        type="button"
        aria-label="Gerar outra foto"
        className="group relative mx-auto block rounded-full outline-none"
        onClick={() => onAvatarSeedChange(randomSeed())}
      >
        <UserAvatar name={avatarName} seed={avatarSeed} className="size-24 text-3xl ring-4 ring-primary-soft" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <LuRefreshCw className="size-10" />
        </span>
      </button>
      <div className="space-y-2">
        <Label htmlFor="user-label">{label}</Label>
        <Input
          id="user-label"
          autoFocus={autoFocus}
          autoComplete="off"
          className="h-11 rounded-lg px-3.5 uppercase placeholder:normal-case"
          maxLength={MAX_NAME_LENGTH}
          placeholder="Digite seu nome"
          value={name}
          onChange={(event) => {
            onNameChange(event.target.value)
            onAvatarSeedChange(null)
          }}
        />
        <p className="flex justify-between text-xs text-muted-foreground">
          <span>Mínimo de {MIN_NAME_LENGTH} caracteres</span>
          <span>
            {name.trim().length}/{MAX_NAME_LENGTH}
          </span>
        </p>
      </div>
    </>
  )
}
