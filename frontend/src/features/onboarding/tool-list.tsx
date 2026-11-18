import type { IconType } from 'react-icons'
import { FaAws } from 'react-icons/fa'
import { SiDocker, SiGit } from 'react-icons/si'
import { cn } from '@/lib/utils'

type Tool = {
  id: string
  label: string
  icon: IconType
  color: string
}

const TOOLS: Tool[] = [
  { id: 'git', label: 'Git', icon: SiGit, color: 'text-[#f05032]' },
  { id: 'docker', label: 'Docker', icon: SiDocker, color: 'text-[#2496ed]' },
  { id: 'aws', label: 'AWS', icon: FaAws, color: 'text-[#ff9900]' },
]

export function ToolList({ installed }: { installed: string[] }) {
  return (
    <ul className="grid grid-cols-3 gap-1" aria-label="Ferramentas">
      {TOOLS.map(({ id, label, icon: Icon, color }) => {
        const available = installed.includes(id)
        return (
          <li
            key={id}
            aria-label={`${label}: ${available ? 'instalado' : 'não instalado'}`}
            className={cn(
              'flex flex-col items-center gap-1.5 text-xs transition-colors',
              !available && 'text-muted-foreground',
            )}
          >
            <Icon className={cn('size-6 transition-colors', available ? color : 'opacity-50')} />
            {label}
          </li>
        )
      })}
    </ul>
  )
}
