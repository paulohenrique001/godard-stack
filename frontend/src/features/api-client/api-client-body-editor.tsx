import { useEffect, useRef } from 'react'
import { acceptCompletion } from '@codemirror/autocomplete'
import { indentWithTab } from '@codemirror/commands'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { linter } from '@codemirror/lint'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { keymap, EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { basicSetup } from 'codemirror'

export type BodyMode = 'json' | 'xml' | 'text'

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
  '.cm-content': { caretColor: 'var(--highlight)', padding: '0.75rem 1rem' },
  '.cm-cursor': { borderLeftColor: 'var(--highlight)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground)',
    border: 'none',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--muted)' },
  '&:has(.cm-selectionBackground) .cm-activeLine, &:has(.cm-selectionBackground) .cm-activeLineGutter':
    { backgroundColor: 'transparent' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: 'color-mix(in srgb, var(--highlight) 25%, transparent)' },
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
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700' },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    borderBottom: '2px wavy var(--destructive)',
    paddingBottom: '1px',
  },
  '.cm-lintRange-warning': {
    backgroundImage: 'none',
    borderBottom: '2px wavy var(--warning)',
    paddingBottom: '1px',
  },
  '.cm-gutter.cm-lint': { display: 'none' },
  '.cm-lint-marker': { display: 'none' },
  '.cm-panel.cm-panel-lint': { display: 'none' },
  '.cm-tooltip.cm-tooltip-lint': {
    padding: '0',
    maxWidth: '24rem',
  },
  '.cm-tooltip.cm-tooltip-lint .cm-diagnostic': {
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: '12px',
    lineHeight: '1.4',
    padding: '5px 10px 5px 8px',
    borderLeft: '3px solid transparent',
  },
  '.cm-tooltip.cm-tooltip-lint .cm-diagnostic-error': {
    borderLeftColor: 'var(--destructive)',
  },
  '.cm-tooltip.cm-tooltip-lint .cm-diagnostic-warning': {
    borderLeftColor: 'var(--warning)',
  },
})

const SYNTAX_COLORS = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--highlight)', fontWeight: '600' },
  { tag: [tags.string, tags.content], color: 'var(--foreground)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--success)' },
  { tag: tags.tagName, color: 'var(--highlight)', fontWeight: '600' },
  { tag: tags.attributeName, color: 'var(--warning)' },
  { tag: tags.angleBracket, color: 'var(--muted-foreground)' },
  { tag: tags.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: tags.meta, color: 'var(--muted-foreground)' },
  { tag: tags.processingInstruction, color: 'var(--muted-foreground)' },
])

function modeExtensions(mode: BodyMode) {
  if (mode === 'json') return [json(), linter(jsonParseLinter())]
  if (mode === 'xml') return [xml()]
  return []
}

const TAB_KEYS = Prec.high(keymap.of([{ key: 'Tab', run: acceptCompletion }, indentWithTab]))

export type BodyEditorProps = {
  value: string
  mode: BodyMode
  disabled?: boolean
  onChange: (value: string) => void
}

export function BodyEditor({ value, mode, disabled = false, onChange }: BodyEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartment = useRef(new Compartment())
  const readOnlyCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

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
          EDITOR_THEME,
          syntaxHighlighting(SYNTAX_COLORS),
          langCompartment.current.of(modeExtensions(mode)),
          readOnlyCompartment.current.of(EditorState.readOnly.of(disabled)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: langCompartment.current.reconfigure(modeExtensions(mode)),
    })
  }, [mode])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(disabled)),
    })
  }, [disabled])

  return <div ref={hostRef} className="min-h-0 flex-1" />
}
