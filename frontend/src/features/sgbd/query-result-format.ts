import type { ResultColumn, ResultTable } from '@/features/sgbd/sgbd-api'
import type { QueryLogEntry } from '@/features/sgbd/use-sgbd'

export type ResultView = 'txt' | 'json' | 'table'

export const RESULT_VIEWS: { value: ResultView; label: string }[] = [
  { value: 'txt', label: 'TXT' },
  { value: 'json', label: 'JSON' },
  { value: 'table', label: 'TABLE' },
]

const COLUMN_GAP = '  '
const NULL_TEXT = 'NULL'

const jsonValue = (value: string | null, { numeric }: ResultColumn) => {
  if (value === null) {
    return 'null'
  }
  return numeric ? value : JSON.stringify(value)
}

const toJson = ({ columns, rows }: ResultTable) => {
  const objects = rows.map((row) => {
    const fields = columns.map((column, index) => `    ${JSON.stringify(column.name)}: ${jsonValue(row[index], column)}`)
    return `  {\n${fields.join(',\n')}\n  }`
  })
  return objects.length === 0 ? '[]' : `[\n${objects.join(',\n')}\n]`
}

const textRows = ({ columns, rows }: ResultTable) => [
  columns.map(({ name }) => name),
  ...rows.map((row) => row.map((value) => value ?? NULL_TEXT)),
]

function toText(table: ResultTable) {
  const [names, ...rows] = textRows(table)
  const widths = names.map((name, index) => Math.max(name.length, ...rows.map((row) => row[index].length)))
  const line = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index])).join(COLUMN_GAP).trimEnd()
  return [line(names), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join('\n')
}

const toTabSeparated = (table: ResultTable) =>
  textRows(table)
    .map((row) => row.join('\t'))
    .join('\n')

const FORMATS: Record<ResultView, (table: ResultTable) => string> = {
  txt: toText,
  json: toJson,
  table: toTabSeparated,
}

export const formatResult = (table: ResultTable, view: ResultView) => FORMATS[view](table)

export const formatLog = (log: QueryLogEntry[]) =>
  log
    .flatMap(({ at, prompt, query, message }) => {
      const start = `[${at}] ${prompt}> `
      return [start + query.replaceAll('\n', `\n${' '.repeat(start.length)}`), `[${at}] ${message}`]
    })
    .join('\n')

function downloadText(fileName: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export const exportLog = (log: QueryLogEntry[]) => downloadText('output.txt', formatLog(log), 'text/plain')

const csvCell = (value: string | null) => {
  if (value === null) {
    return ''
  }
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

const toCsv = ({ columns, rows }: ResultTable) =>
  [columns.map(({ name }) => name), ...rows].map((row) => row.map(csvCell).join(',')).join('\n')

const EXPORTS: Record<ResultView, { extension: string; type: string; format: (table: ResultTable) => string }> = {
  txt: { extension: 'txt', type: 'text/plain', format: toText },
  json: { extension: 'json', type: 'application/json', format: toJson },
  table: { extension: 'csv', type: 'text/csv', format: toCsv },
}

export function exportResult(table: ResultTable, view: ResultView) {
  const { extension, type, format } = EXPORTS[view]
  downloadText(`${table.title.replace(/[^\w.-]+/g, '_')}.${extension}`, format(table), type)
}
