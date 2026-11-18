import { Suspense, type ReactNode } from 'react'
import { LuRefreshCw } from 'react-icons/lu'
import { ModuleBoundary } from './module-boundary'

export function ModuleSlot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ModuleBoundary label={label}>
      <Suspense fallback={<ModuleLoading label={label} />}>{children}</Suspense>
    </ModuleBoundary>
  )
}

function ModuleLoading({ label }: { label: string }) {
  return (
    <div
      className="grid h-full min-h-72 flex-1 place-items-center gap-3 p-6 text-sm text-muted-foreground"
      role="status"
    >
      <LuRefreshCw className="size-5 animate-spin" />
      <span>Carregando {label.toLocaleLowerCase('pt-BR')}…</span>
    </div>
  )
}
