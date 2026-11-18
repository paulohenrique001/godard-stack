import { SiMariadb, SiMysql, SiRedis } from 'react-icons/si'
import type { SgbdKind } from '../../api'

const ICONS = {
  mariadb: SiMariadb,
  mysql: SiMysql,
  redis: SiRedis,
}

const COLORS = {
  mariadb: 'text-[#c0765a] dark:text-[#e0a58d]',
  mysql: 'text-[#4479a1] dark:text-[#73add7]',
  redis: 'text-[#dc382d] dark:text-[#f0736a]',
}

export function SgbdIcon({ kind, className = '' }: { kind: SgbdKind; className?: string }) {
  const Icon = ICONS[kind]
  return <Icon aria-hidden="true" className={`${COLORS[kind]} ${className}`} />
}
