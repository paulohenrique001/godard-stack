import { useState } from 'react'
import { LuUser } from 'react-icons/lu'
import { cn } from '@/lib/utils'

const AVATAR_URL = 'https://api.dicebear.com/10.x/critters/svg?borderRadius=50&tags=animation&translateY=10&scale=1.05&seed='
const RANDOM_SEED_LENGTH = 8
const SEED_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export const randomSeed = () =>
  Array.from(
    { length: RANDOM_SEED_LENGTH },
    () => SEED_CHARACTERS[Math.floor(Math.random() * SEED_CHARACTERS.length)],
  ).join('')

const EMPTY_SEED = randomSeed()

const avatarSeed = (name: string) => name.trim().toUpperCase() || EMPTY_SEED
const avatarUrl = (seed: string) => `${AVATAR_URL}${encodeURIComponent(seed)}`

export function preloadAvatar(name: string) {
  new Image().src = avatarUrl(avatarSeed(name))
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
