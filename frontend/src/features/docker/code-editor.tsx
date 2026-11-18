import { createElement, type RefObject, useEffect, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LuColumns3, LuDatabase, LuHash, LuTable2 } from 'react-icons/lu'
import { acceptCompletion, autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete'
import { copyLineDown, indentWithTab } from '@codemirror/commands'
import { keywordCompletionSource, MariaSQL, schemaCompletionSource, sql, type SQLNamespace } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { highlightCode, tags } from '@lezer/highlight'
import { basicSetup, EditorView } from 'codemirror'
import { TERMINAL_FONT_FAMILY } from '@/features/terminal/terminal-view'

const EDITOR_THEME = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent', color: 'var(--foreground)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: TERMINAL_FONT_FAMILY, lineHeight: '1.5' },
  '.cm-content': { caretColor: 'var(--highlight)' },
  '.cm-cursor': { borderLeftColor: 'var(--highlight)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted-foreground)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--muted)' },
  '&:has(.cm-selectionBackground) .cm-activeLine, &:has(.cm-selectionBackground) .cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
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
    fontFamily: TERMINAL_FONT_FAMILY,
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

const LOWER_KEYWORDS = keywordCompletionSource(MariaSQL, false)
const UPPER_KEYWORDS = keywordCompletionSource(MariaSQL, true)

function matchingCaseKeywords(context: CompletionContext) {
  const match = context.matchBefore(/\w*/)
  if (match && context.state.sliceDoc(match.from - 1, match.from) === '.') {
    return null
  }
  const word = match?.text ?? ''
  const typedUpper = /[A-Z]/.test(word) && word === word.toUpperCase()
  return (typedUpper ? UPPER_KEYWORDS : LOWER_KEYWORDS)(context)
}

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
const KIND_ICON_POSITION = 20

function completionKind(completion: Completion) {
  const kind = completion.type ?? 'keyword'
  const element = document.createElement('span')
  element.className = 'cm-godard-stack-kind'
  element.title = KIND_TITLES[kind] ?? ''
  element.innerHTML = KIND_ICONS[kind] ?? KIND_ICONS.keyword
  return element
}

function sqlExtensions(structure: SQLNamespace, defaultSchema: string | null) {
  const schemaCompletions = schemaCompletionSource({
    dialect: MariaSQL,
    schema: structure,
    defaultSchema: defaultSchema ?? undefined,
  })
  return [
    sql({ dialect: MariaSQL }),
    autocompletion({
      override: [schemaCompletions, matchingCaseKeywords],
      addToOptions: [{ render: completionKind, position: KIND_ICON_POSITION }],
    }),
  ]
}

const BLANK_LINE = /\n[ \t]*\n\s*/g

function firstStatement(text: string) {
  for (let node = MariaSQL.language.parser.parse(text).topNode.firstChild; node; node = node.nextSibling) {
    if (node.name === 'Statement') {
      return text.slice(node.from, node.to).trim().replace(/;$/, '').trim()
    }
  }
  return ''
}

function sqlStatementsIn(text: string) {
  const tree = MariaSQL.language.parser.parse(text)
  const pieces: string[] = []
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== 'Statement') {
      continue
    }
    let start = node.from
    for (const blank of text.slice(node.from, node.to).matchAll(BLANK_LINE)) {
      const position = node.from + blank.index
      if (tree.resolveInner(position, 1).name === 'Statement') {
        pieces.push(text.slice(start, position))
        start = position + blank[0].length
      }
    }
    pieces.push(text.slice(start, node.to))
  }
  return pieces.map(firstStatement).filter((statement) => statement !== '')
}

export type EditorStatements = {
  atCursor: () => string[]
  selected: () => string[]
}

const cursorLine = (state: EditorState) => state.doc.lineAt(state.selection.main.head).text

const selectedText = (state: EditorState) => state.sliceDoc(state.selection.main.from, state.selection.main.to)

const sqlStatementAtCursor = (state: EditorState) => sqlStatementsIn(cursorLine(state))

const sqlStatementsSelected = (state: EditorState) => sqlStatementsIn(selectedText(state))

const filledLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')

const lineAtCursor = (state: EditorState) => filledLines(cursorLine(state))

const linesSelected = (state: EditorState) => filledLines(selectedText(state))

const TAB_KEYS = Prec.high(keymap.of([{ key: 'Tab', run: acceptCompletion }, indentWithTab]))

const SYNTAX_COLORS = HighlightStyle.define([
  { tag: [tags.definition(tags.propertyName), tags.propertyName], color: 'var(--highlight)', fontWeight: '600' },
  { tag: [tags.string, tags.content], color: 'var(--foreground)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--success)' },
  { tag: tags.keyword, color: 'var(--highlight)', fontWeight: '600' },
  { tag: tags.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
])

type CodeEditorProps = {
  value: string
  language: 'yaml' | 'sql' | 'text'
  label: string
  readOnly?: boolean
  sqlStructure?: SQLNamespace
  defaultSchema?: string | null
  statementsRef?: RefObject<EditorStatements | null>
  onSelectionChange?: (hasSelection: boolean) => void
  onRun?: (statements: string[]) => void
  onChange?: (value: string) => void
}

type QueryTextProps = {
  query: string
  language: 'sql' | 'text'
}

export function QueryText({ query, language }: QueryTextProps) {
  if (language === 'text') {
    return query
  }
  const parts: { text: string; classes: string }[] = []
  highlightCode(
    query,
    MariaSQL.language.parser.parse(query),
    SYNTAX_COLORS,
    (text, classes) => parts.push({ text, classes }),
    () => parts.push({ text: '\n', classes: '' }),
  )
  return parts.map(({ text, classes }, index) => (
    <span key={index} className={classes}>
      {text}
    </span>
  ))
}

export default function CodeEditor({
  value,
  language,
  label,
  readOnly = false,
  sqlStructure = {},
  defaultSchema = null,
  statementsRef,
  onSelectionChange,
  onRun,
  onChange,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onRunRef = useRef(onRun)
  onRunRef.current = onRun
  const onSelectionChangeRef = useRef(onSelectionChange)
  onSelectionChangeRef.current = onSelectionChange
  const viewRef = useRef<EditorView | null>(null)
  const sqlCompartment = useRef(new Compartment())

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    const atCursor = language === 'sql' ? sqlStatementAtCursor : lineAtCursor
    const selected = language === 'sql' ? sqlStatementsSelected : linesSelected
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          TAB_KEYS,
          Prec.high(
            keymap.of([
              { key: 'Mod-d', run: copyLineDown, preventDefault: true },
              {
                key: 'Mod-Enter',
                run: ({ state }) => {
                  onRunRef.current?.(state.selection.main.empty ? atCursor(state) : selected(state))
                  return onRunRef.current !== undefined
                },
              },
            ]),
          ),
          EDITOR_THEME,
          syntaxHighlighting(SYNTAX_COLORS),
          ...(language === 'yaml' ? [yaml()] : []),
          ...(language === 'sql' ? [sqlCompartment.current.of(sqlExtensions(sqlStructure, defaultSchema))] : []),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString())
            }
            if (update.selectionSet) {
              onSelectionChangeRef.current?.(!update.state.selection.main.empty)
            }
          }),
        ],
      }),
    })
    viewRef.current = view
    if (statementsRef) {
      statementsRef.current = { atCursor: () => atCursor(view.state), selected: () => selected(view.state) }
    }
    return () => {
      if (statementsRef) {
        statementsRef.current = null
      }
      viewRef.current = null
      view.destroy()
    }
  }, [])

  useEffect(() => {
    if (language === 'sql') {
      viewRef.current?.dispatch({
        effects: sqlCompartment.current.reconfigure(sqlExtensions(sqlStructure, defaultSchema)),
      })
    }
  }, [language, sqlStructure, defaultSchema])

  return <div ref={hostRef} className="h-full min-h-0" />
}
