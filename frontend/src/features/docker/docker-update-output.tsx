import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

const HIDE_CURSOR = '\x1b[?25l'

const TERMINAL_THEMES: Record<'light' | 'dark', ITheme> = {
  light: {
    background: '#ffffff',
    foreground: '#23262b',
    cursor: '#9a6a00',
    cursorAccent: '#ffffff',
    selectionBackground: '#ffb40033',
    black: '#1f2328',
    red: '#cf222e',
    green: '#1a7f37',
    yellow: '#7d4e00',
    blue: '#0550ae',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#1a7f37',
    brightYellow: '#633c01',
    brightBlue: '#0969da',
    brightMagenta: '#8250df',
    brightCyan: '#1b7c83',
    brightWhite: '#6e7781',
  },
  dark: {
    background: '#1b1e23',
    foreground: '#eceef0',
    cursor: '#ffd166',
    cursorAccent: '#1b1e23',
    selectionBackground: '#ffd16640',
    black: '#23262c',
    red: '#e8796d',
    green: '#62c79a',
    yellow: '#e5b567',
    blue: '#7fb2e5',
    magenta: '#ffd166',
    cyan: '#6fc3c9',
    white: '#c9cdd2',
    brightBlack: '#8d939b',
    brightRed: '#f09a90',
    brightGreen: '#85d9b3',
    brightYellow: '#f0cb8c',
    brightBlue: '#a2c9ef',
    brightMagenta: '#ffe39b',
    brightCyan: '#92d6da',
    brightWhite: '#eceef0',
  },
}

export function DockerUpdateOutput({ text, theme }: { text: string; theme: 'light' | 'dark' }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const writtenRef = useRef(0)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const terminal = new Terminal({
      convertEol: true,
      disableStdin: true,
      fontFamily: 'ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 10_000,
      theme: TERMINAL_THEMES[theme],
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host)
    terminal.write(HIDE_CURSOR)
    terminalRef.current = terminal
    writtenRef.current = 0
    if (host.offsetWidth > 0) fit.fit()
    const observer = new ResizeObserver(() => {
      if (host.offsetWidth > 0) fit.fit()
    })
    observer.observe(host)
    return () => {
      observer.disconnect()
      terminalRef.current = null
      terminal.dispose()
    }
  }, [])

  useEffect(() => {
    terminalRef.current?.write(text.slice(writtenRef.current))
    writtenRef.current = text.length
  }, [text])

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = TERMINAL_THEMES[theme]
  }, [theme])

  return <div ref={hostRef} aria-label="Saída da atualização" className="h-full w-full" />
}
