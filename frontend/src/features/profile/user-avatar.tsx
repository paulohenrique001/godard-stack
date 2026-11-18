import { useState } from 'react'
import { LuUser } from 'react-icons/lu'
import { cn } from '../../shared/lib/cn'

const AVATAR_URL =
  'https://api.dicebear.com/10.x/critters/svg?borderRadius=50&tags=none&translateY=10&scale=1.05&seed='
const RANDOM_SEED_LENGTH = 8
const SEED_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function randomAvatarSeed() {
  return Array.from(
    { length: RANDOM_SEED_LENGTH },
    () => SEED_CHARACTERS[Math.floor(Math.random() * SEED_CHARACTERS.length)],
  ).join('')
}

const EMPTY_AVATAR_SEED = randomAvatarSeed()

function avatarSeed(name: string) {
  return name.trim().toUpperCase() || EMPTY_AVATAR_SEED
}

function avatarUrl(seed: string) {
  return `${AVATAR_URL}${encodeURIComponent(seed)}`
}

type UserAvatarProps = {
  name: string
  seed?: string | null
  className?: string
}

export function UserAvatar({ name, seed: customSeed, className }: UserAvatarProps) {
  const [failedSeed, setFailedSeed] = useState<string | null>(null)
  const initial = name.trim().charAt(0).toUpperCase()
  const seed = customSeed ?? avatarSeed(name)
  const showImage = failedSeed !== seed

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
        showImage ? 'bg-muted' : 'bg-primary text-primary-foreground',
        className,
      )}
    >
      {showImage ? (
        <img
          src={avatarUrl(seed)}
          alt=""
          className="size-full"
          onError={() => setFailedSeed(seed)}
        />
      ) : (
        initial || <LuUser className="size-1/2" />
      )}
    </span>
  )
}
