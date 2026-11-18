import { createElement, type RefObject, useEffect, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LuColumns3, LuDatabase, LuHash, LuTable2 } from 'react-icons/lu'
import {
  acceptCompletion,
  autocompletion,
  type Completion,
  type CompletionContext,
} from '@codemirror/autocomplete'
import { indentWithTab } from '@codemirror/commands'
import {
  keywordCompletionSource,
  MariaSQL,
  schemaCompletionSource,
  sql,
  type SQLNamespace,
} from '@codemirror/lang-sql'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { keymap, EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { basicSetup } from 'codemirror'
import { type SgbdKind, type SgbdStructure } from '../../api'

const EDITOR_THEME = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", monospace',
    lineHeight: '1.5',
  },
  '.cm-content': { caretColor: 'var(--highlight)', padding: '0.75rem 11rem 0.75rem 1rem' },
  '.cm-cursor': { borderLeftColor: 'var(--highlight)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    border: 'none',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--muted)' },
  '&:has(.cm-selectionBackground) .cm-activeLine, &:has(.cm-selectionBackground) .cm-activeLineGutter':
    {
      backgroundColor: 'transparent',
    },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    {
      backgroundColor: 'color-mix(in srgb, var(--highlight) 25%, transparent)',
    },
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgb(0 0 0 / 0.16)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", monospace',
    fontSize: '13px',
    maxHeight: '13rem',
    padding: '4px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    borderRadius: '6px',
    lineHeight: '1.5',
    padding: '3px 8px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--primary-soft)',
    color: 'var(--highlight)',
  },
  '.cm-completionIcon': { display: 'none' },
  '.cm-godard-stack-kind': {
    display: 'inline-flex',
    fontSize: '14px',
    marginRight: '6px',
    opacity: '0.7',
    verticalAlign: '-2px',
  },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700' },
  '.cm-completionDetail': { color: 'var(--muted-foreground)', fontStyle: 'normal' },
})

const SYNTAX_COLORS = HighlightStyle.define([
  {
    tag: [tags.definition(tags.propertyName), tags.propertyName],
    color: 'var(--highlight)',
    fontWeight: '600',
  },
  { tag: [tags.string, tags.content], color: 'var(--foreground)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--success)' },
  { tag: tags.keyword, color: 'var(--highlight)', fontWeight: '600' },
  { tag: tags.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
])

const LOWER_KEYWORDS = keywordCompletionSource(MariaSQL, false)
const UPPER_KEYWORDS = keywordCompletionSource(MariaSQL, true)
const REDIS_COMMANDS = [
  'PING',
  'INFO',
  'GET',
  'SET',
  'DEL',
  'EXISTS',
  'EXPIRE',
  'TTL',
  'KEYS',
  'SCAN',
  'TYPE',
  'RENAME',
  'INCR',
  'DECR',
  'HGET',
  'HSET',
  'HGETALL',
  'HDEL',
  'LPUSH',
  'RPUSH',
  'LRANGE',
  'SADD',
  'SMEMBERS',
  'ZADD',
  'ZRANGE',
  'PUBLISH',
  'SUBSCRIBE',
]

const KIND_ICONS: Record<string, string> = {
  namespace: renderToStaticMarkup(createElement(LuDatabase)),
  class: renderToStaticMarkup(createElement(LuTable2)),
  property: renderToStaticMarkup(createElement(LuColumns3)),
  keyword: renderToStaticMarkup(createElement(LuHash)),
}
const KIND_TITLES: Record<string, string> = {
  namespace: 'Schema',
  class: 'Tabela',
  property: 'Coluna',
  keyword: 'Palavra-chave',
}

export type QueryEditorHandle = {
  selected: () => string | null
}

type QueryEditorProps = {
  value: string
  kind: SgbdKind
  database: string | null
  structure: SgbdStructure
  label: string
  editorRef?: RefObject<QueryEditorHandle | null>
  onChange: (value: string) => void
  onSelectionChange: (hasSelection: boolean) => void
  onRun: (query: string) => void
}

function matchingCaseKeywords(context: CompletionContext) {
  const match = context.matchBefore(/\w*/)
  if (match && context.state.sliceDoc(match.from - 1, match.from) === '.') {
    return null
  }
  const word = match?.text ?? ''
  return (/[A-Z]/.test(word) && word === word.toUpperCase() ? UPPER_KEYWORDS : LOWER_KEYWORDS)(
    context,
  )
}

function completionKind(completion: Completion) {
  const kind = completion.type ?? 'keyword'
  const element = document.createElement('span')
  element.className = 'cm-godard-stack-kind'
  element.title = KIND_TITLES[kind] ?? ''
  element.innerHTML = KIND_ICONS[kind] ?? KIND_ICONS.keyword
  return element
}

function sqlNamespace(structure: SgbdStructure): SQLNamespace {
  return Object.fromEntries(
    structure.schemas.map((schema) => [
      schema.name,
      {
        self: { label: schema.name, type: 'namespace' },
        children: Object.fromEntries(
          schema.tables.map((table) => [
            table.name,
            {
              self: { label: table.name, type: 'class' },
              children: table.columns.map((column) => ({
                label: column.name,
                detail: column.type,
                type: 'property',
              })),
            },
          ]),
        ),
      },
    ]),
  )
}

function redisCompletions(context: CompletionContext) {
  const match = context.matchBefore(/[A-Za-z]*/)
  if (!match || (match.from === match.to && !context.explicit)) {
    return null
  }
  return {
    from: match.from,
    options: REDIS_COMMANDS.map((label) => ({ label, type: 'keyword' })),
  }
}

function languageExtensions(kind: SgbdKind, structure: SgbdStructure, database: string | null) {
  if (kind === 'redis') {
    return [
      autocompletion({
        override: [redisCompletions],
        addToOptions: [{ render: completionKind, position: 20 }],
      }),
    ]
  }
  const schemas = schemaCompletionSource({
    dialect: MariaSQL,
    schema: sqlNamespace(structure),
    defaultSchema: database ?? undefined,
  })
  return [
    sql({ dialect: MariaSQL }),
    autocompletion({
      override: [schemas, matchingCaseKeywords],
      addToOptions: [{ render: completionKind, position: 20 }],
    }),
  ]
}

const TAB_KEYS = Prec.high(keymap.of([{ key: 'Tab', run: acceptCompletion }, indentWithTab]))

export function QueryEditor({
  value,
  kind,
  database,
  structure,
  label,
  editorRef,
  onChange,
  onSelectionChange,
  onRun,
}: QueryEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const languageCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const onRunRef = useRef(onRun)
  onChangeRef.current = onChange
  onSelectionChangeRef.current = onSelectionChange
  onRunRef.current = onRun

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          TAB_KEYS,
          Prec.high(
            keymap.of([
              {
                key: 'Mod-Enter',
                run: ({ state }) => {
                  const selection = state.selection.main
                  onRunRef.current(
                    selection.empty
                      ? state.doc.toString()
                      : state.sliceDoc(selection.from, selection.to),
                  )
                  return true
                },
              },
            ]),
          ),
          EDITOR_THEME,
          syntaxHighlighting(SYNTAX_COLORS),
          languageCompartment.current.of(languageExtensions(kind, structure, database)),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
            if (update.selectionSet)
              onSelectionChangeRef.current(!update.state.selection.main.empty)
          }),
        ],
      }),
    })
    viewRef.current = view
    if (editorRef) {
      editorRef.current = {
        selected: () => {
          const selection = view.state.selection.main
          return selection.empty ? null : view.state.sliceDoc(selection.from, selection.to)
        },
      }
    }
    return () => {
      if (editorRef) editorRef.current = null
      viewRef.current = null
      view.destroy()
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartment.current.reconfigure(
        languageExtensions(kind, structure, database),
      ),
    })
  }, [kind, structure, database])

  return <div ref={hostRef} className="min-h-0 flex-1" />
}
