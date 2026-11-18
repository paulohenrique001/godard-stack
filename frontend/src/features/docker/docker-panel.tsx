import { LuContainer, LuLock, LuPlus, LuSearch } from 'react-icons/lu'
import { Input } from '@/components/ui/input'
import { stateLabel } from '@/features/docker/docker-api'
import type { DockerContainers } from '@/features/docker/use-docker-containers'
import { cn } from '@/lib/utils'

export function DockerPanel({ docker }: { docker: DockerContainers }) {
  const {
    visible,
    selected,
    query,
    showStopped,
    creating,
    setCreating,
    setQuery,
    selectContainer,
    toggleShowStopped,
  } = docker

  return (
    <div className="flex h-full flex-col gap-4">
      <h2 className="text-sm font-medium">Containers</h2>
      <div className="relative">
        <LuSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Buscar container"
          autoComplete="off"
          className="h-9 rounded-lg pl-9"
          placeholder="Buscar"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={showStopped}
        className="flex items-center justify-between gap-3 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={toggleShowStopped}
      >
        <span>Incluir parados</span>
        <span
          className={cn(
            'flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
            showStopped ? 'bg-primary dark:bg-highlight' : 'bg-input',
          )}
        >
          <span
            className={cn(
              'size-4 rounded-full bg-white shadow-sm transition-transform duration-200',
              showStopped && 'translate-x-4',
            )}
          />
        </span>
      </button>
      <hr />
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {visible.map((container) => {
          const active = !creating && container.id === selected?.id
          return (
            <li key={container.id}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-highlight text-highlight' : 'border-transparent',
                )}
                onClick={() => selectContainer(active ? null : container.id)}
              >
                <LuContainer
                  aria-label={stateLabel(container.state)}
                  className={cn('size-4 shrink-0', container.running && 'text-success')}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{container.name}</span>
                  <span className={cn('block truncate text-xs', !active && 'text-muted-foreground')}>
                    {container.image}
                  </span>
                </span>
                {container.protected && <LuLock aria-label="Protegido" className="size-3.5 shrink-0" />}
              </button>
            </li>
          )
        })}
        {visible.length === 0 && <li className="text-sm text-muted-foreground">Nenhum container encontrado.</li>}
        <li>
          <button
            type="button"
            aria-label="Novo container"
            title="Novo container"
            className="flex h-9 w-full cursor-pointer items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-highlight hover:text-highlight"
            onClick={() => setCreating(true)}
          >
            <LuPlus className="size-4" />
          </button>
        </li>
      </ul>
    </div>
  )
}
