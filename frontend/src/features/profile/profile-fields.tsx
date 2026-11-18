import { Fragment, useEffect, useState, type ChangeEventHandler } from 'react'
import { LuDices, LuRefreshCw } from 'react-icons/lu'
import { cn } from '../../shared/lib/cn'
import { randomAvatarSeed, UserAvatar } from './user-avatar'

const ICONS = [
  'Turing', 'Tesla', 'Dijkstra', 'Shannon', 'Euler',
  'Lovelace', 'Boole', 'Feynman', 'Knuth', 'Neumann',
  'Darwin', 'Newton', 'Gauss', 'Faraday', 'Leibniz',
  'Babbage', 'Curie', 'Hopper', 'Ritchie', 'Torvalds',
  'Wozniak', 'Kernighan', 'Thompson', 'Liskov', 'Lamport',
  'McCarthy', 'Codd', 'Backus', 'Huffman', 'Rivest',
  'Diffie', 'Hellman', 'Kay', 'Engelbart', 'Chomsky',
  'Hamming', 'Nyquist', 'Godel', 'Church', 'Hoare',
  'Milner', 'Stroustrup', 'Gosling', 'Rossum', 'Minsky',
  'Wirth', 'Dahl', 'Nygaard', 'Steele', 'Naur',
]

const TECHS = [
  'Rust', 'Docker', 'Python', 'Linux', 'Redis',
  'Kotlin', 'TypeScript', 'Kafka', 'Elixir', 'Go',
  'GraphQL', 'Kubernetes', 'PostgreSQL', 'MongoDB', 'React',
  'Vue', 'Angular', 'Node', 'Deno', 'Bun',
  'Swift', 'Scala', 'Clojure', 'Haskell', 'Erlang',
  'Terraform', 'Ansible', 'Nginx', 'Traefik', 'Cassandra',
  'Elasticsearch', 'RabbitMQ', 'gRPC', 'WebAssembly', 'Prometheus',
  'Grafana', 'Jenkins', 'GitLab', 'Nats', 'Pulsar',
  'Flink', 'Spark', 'Airflow', 'Next', 'Vite',
  'Tauri', 'Gleam', 'Zig', 'Lisp', 'Prolog',
]

export function randomComposedName(): string {
  const icon = ICONS[Math.floor(Math.random() * ICONS.length)]
  const tech = TECHS[Math.floor(Math.random() * TECHS.length)]
  return `${icon} ${tech}`
}

type ProfileFieldsProps = {
  name: string
  avatarSeed: string | null
  label: string
  autoFocus?: boolean
  horizontal?: boolean
  onNameChange: (name: string) => void
  onAvatarSeedChange: (seed: string | null) => void
}

export function ProfileFields({
  name,
  avatarSeed,
  label,
  autoFocus = false,
  horizontal = false,
  onNameChange,
  onAvatarSeedChange,
}: ProfileFieldsProps) {
  const [avatarName, setAvatarName] = useDebouncedValue(name, 400)
  const onNameInput: ChangeEventHandler<HTMLInputElement> = (event) => {
    onNameChange(event.target.value)
    onAvatarSeedChange(null)
  }

  const fields = (
    <Fragment>
      <button
        type="button"
        aria-label="Gerar outra foto"
        className={cn(
          'group relative block rounded-full outline-none',
          horizontal ? 'shrink-0 self-center sm:self-start' : 'mx-auto',
        )}
        onClick={() => onAvatarSeedChange(randomAvatarSeed())}
      >
        <UserAvatar
          name={avatarName}
          seed={avatarSeed}
          className="size-24 text-3xl ring-4 ring-primary-soft"
        />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <LuRefreshCw className="size-10" />
        </span>
      </button>
      <div className={cn('space-y-2', horizontal && 'min-w-0 flex-1')}>
        <label htmlFor="user-label" className="text-sm font-medium">
          {label}
        </label>
        <div className="relative">
          <input
            id="user-label"
            autoFocus={autoFocus}
            autoComplete="off"
            maxLength={25}
            value={name}
            onChange={onNameInput}
            placeholder="Digite seu nome"
            className="h-11 w-full rounded-lg border bg-background pl-3.5 pr-10 uppercase outline-none transition-colors placeholder:normal-case placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            aria-label="Gerar nome aleatório"
            title="Gerar nome aleatório"
            className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              const generated = randomComposedName()
              onNameChange(generated)
              onAvatarSeedChange(null)
            }}
          >
            <LuDices className="size-4" />
          </button>
        </div>
        <p className="flex justify-between text-xs text-muted-foreground">
          <span>Mínimo de 3 caracteres</span>
          <span>{name.trim().length}/25</span>
        </p>
      </div>
    </Fragment>
  )

  return horizontal ? (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">{fields}</div>
  ) : (
    fields
  )
}

function useDebouncedValue(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])

  return [debouncedValue, setDebouncedValue] as const
}
