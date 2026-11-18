import type { IconType } from 'react-icons'
import { LuArchiveX, LuHardDrive, LuKeyRound, LuTable2, LuTimer, LuTrash2 } from 'react-icons/lu'

export type SgbdKind = 'mariadb' | 'mysql' | 'redis'

export type SchemaField = {
  label: string
  value: string
}

export type SchemaStat = SchemaField & {
  icon: IconType
}

export type SchemaRow = {
  name: string
  system: boolean
  deletable: boolean
  stats: SchemaStat[]
  details: SchemaField[]
}

export type SchemaDeletion = {
  action: string
  title: string
  icon: IconType
  messageBefore: string
  messageAfter: string
}

export type SgbdDriver = {
  label: string
  defaults: { port: string; username: string; password: string }
  databaseField: { label: string; placeholder: string }
  schemasLabel: string
  noSchemaLabel: string
  queryLanguage: 'sql' | 'text'
  canCreateSchema: boolean
  showsLastSync: boolean
  deletion: SchemaDeletion
  parseSchema: (fields: string[]) => SchemaRow
}

const MARIADB_SYSTEM_SCHEMAS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys'])
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']
const BYTES_PER_UNIT = 1024

const formatCount = (value: string) => Number(value).toLocaleString('pt-BR')

function formatSize(bytes: number) {
  const unit = bytes === 0 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT)), SIZE_UNITS.length - 1)
  const value = bytes / BYTES_PER_UNIT ** unit
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${SIZE_UNITS[unit]}`
}

export const DRIVERS: Record<SgbdKind, SgbdDriver> = {
  mariadb: {
    label: 'MariaDB',
    defaults: { port: '3306', username: 'root', password: 'root' },
    databaseField: { label: 'Banco padrão', placeholder: 'Opcional' },
    schemasLabel: 'Schemas',
    noSchemaLabel: 'sem schema',
    queryLanguage: 'sql',
    canCreateSchema: true,
    showsLastSync: true,
    deletion: {
      action: 'Remover',
      title: 'Remover schema',
      icon: LuTrash2,
      messageBefore: 'O schema ',
      messageAfter: ' e todas as suas tabelas serão removidos do banco. Essa ação não pode ser desfeita.',
    },
    parseSchema: ([name, charset, collation, tables, views, rows, data, indexes]) => {
      const total = formatSize(Number(data) + Number(indexes))
      return {
        name,
        system: MARIADB_SYSTEM_SCHEMAS.has(name),
        deletable: !MARIADB_SYSTEM_SCHEMAS.has(name),
        stats: [
          { label: 'Tabelas', value: formatCount(tables), icon: LuTable2 },
          { label: 'Tamanho', value: total, icon: LuHardDrive },
        ],
        details: [
          { label: 'Tabelas', value: formatCount(tables) },
          { label: 'Views', value: formatCount(views) },
          { label: 'Linhas (estimativa)', value: formatCount(rows) },
          { label: 'Dados', value: formatSize(Number(data)) },
          { label: 'Índices', value: formatSize(Number(indexes)) },
          { label: 'Tamanho total', value: total },
          { label: 'Charset', value: charset },
          { label: 'Collation', value: collation },
        ],
      }
    },
  },
  mysql: {
    label: 'MySQL',
    defaults: { port: '3306', username: 'root', password: 'root' },
    databaseField: { label: 'Banco padrão', placeholder: 'Opcional' },
    schemasLabel: 'Schemas',
    noSchemaLabel: 'sem schema',
    queryLanguage: 'sql',
    canCreateSchema: true,
    showsLastSync: true,
    deletion: {
      action: 'Remover',
      title: 'Remover schema',
      icon: LuTrash2,
      messageBefore: 'O schema ',
      messageAfter: ' e todas as suas tabelas serão removidos do banco. Essa ação não pode ser desfeita.',
    },
    parseSchema: ([name, charset, collation, tables, views, rows, data, indexes]) => {
      const total = formatSize(Number(data) + Number(indexes))
      return {
        name,
        system: MARIADB_SYSTEM_SCHEMAS.has(name),
        deletable: !MARIADB_SYSTEM_SCHEMAS.has(name),
        stats: [
          { label: 'Tabelas', value: formatCount(tables), icon: LuTable2 },
          { label: 'Tamanho', value: total, icon: LuHardDrive },
        ],
        details: [
          { label: 'Tabelas', value: formatCount(tables) },
          { label: 'Views', value: formatCount(views) },
          { label: 'Linhas (estimativa)', value: formatCount(rows) },
          { label: 'Dados', value: formatSize(Number(data)) },
          { label: 'Índices', value: formatSize(Number(indexes)) },
          { label: 'Tamanho total', value: total },
          { label: 'Charset', value: charset },
          { label: 'Collation', value: collation },
        ],
      }
    },
  },
  redis: {
    label: 'Redis',
    defaults: { port: '6379', username: '', password: '' },
    databaseField: { label: 'Banco (número)', placeholder: '0' },
    schemasLabel: 'Bancos',
    noSchemaLabel: 'sem banco',
    queryLanguage: 'text',
    canCreateSchema: false,
    showsLastSync: false,
    deletion: {
      action: 'Esvaziar',
      title: 'Esvaziar banco',
      icon: LuArchiveX,
      messageBefore: 'Todas as chaves do banco ',
      messageAfter: ' serão apagadas. Essa ação não pode ser desfeita.',
    },
    parseSchema: ([name, keys, expires, averageTtl]) => ({
      name,
      system: false,
      deletable: Number(keys) > 0,
      stats: [
        { label: 'Chaves', value: formatCount(keys), icon: LuKeyRound },
        { label: 'Com expiração', value: formatCount(expires), icon: LuTimer },
      ],
      details: [
        { label: 'Chaves', value: formatCount(keys) },
        { label: 'Com expiração', value: formatCount(expires) },
        { label: 'TTL médio', value: `${formatCount(averageTtl)} ms` },
      ],
    }),
  },
}

export const DRIVER_KINDS: SgbdKind[] = ['mariadb', 'mysql', 'redis']
