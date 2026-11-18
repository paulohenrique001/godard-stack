import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { yaml } from '@codemirror/lang-yaml'
import { tags } from '@lezer/highlight'
import { basicSetup } from 'codemirror'

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

type DockerCodeEditorProps = {
  value: string
  label: string
  language?: 'yaml' | 'text'
  readOnly?: boolean
  onChange?: (value: string) => void
}

export function DockerCodeEditor({
  value,
  label,
  language = 'text',
  readOnly = false,
  onChange,
}: DockerCodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
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
          keymap.of([indentWithTab]),
          EDITOR_THEME,
          syntaxHighlighting(SYNTAX_COLORS),
          ...(language === 'yaml' ? [yaml()] : []),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])

  return <div ref={hostRef} className="h-full min-h-0" />
}
