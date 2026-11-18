import { LuLoaderCircle } from 'react-icons/lu'
import { cn } from '@/lib/utils'

type ContentLoaderProps = {
  className?: string
}

export function ContentLoader({ className }: ContentLoaderProps) {
  return (
    <div role="status" aria-label="Carregando conteúdo" className={cn('grid min-h-24 place-items-center', className)}>
      <LuLoaderCircle aria-hidden="true" className="size-7 animate-spin text-highlight" />
    </div>
  )
}
