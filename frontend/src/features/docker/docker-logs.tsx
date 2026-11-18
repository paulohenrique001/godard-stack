import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Terminal, type ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { LuEraser, LuSearch } from 'react-icons/lu'
import { createDockerLogTicket, dockerLogSocketUrl, type RuntimeStatus } from '../../api'
import { TerminalSearch } from '../terminal/terminal-search'

const HIDE_CURSOR = '\x1b[?25l'
const SCROLLBACK_LINES = 5_000
const LOGS_UNAVAILABLE = '\r\n[logs indisponíveis]\r\n'

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

export function DockerLogs({
  runtime,
  id,
  name,
  theme,
}: {
  runtime: RuntimeStatus
  id: string
  name: string
  theme: 'light' | 'dark'
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const terminal = new Terminal({
      convertEol: true,
      disableStdin: true,
      fontFamily: 'ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: SCROLLBACK_LINES,
      theme: TERMINAL_THEMES[theme],
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    terminal.loadAddon(fit)
    terminal.loadAddon(search)
    terminal.open(host)
    terminal.write(HIDE_CURSOR)
    terminalRef.current = terminal
    searchRef.current = search
    const fitIfVisible = () => {
      if (host.offsetWidth > 0) fit.fit()
    }
    fitIfVisible()
    const observer = new ResizeObserver(fitIfVisible)
    observer.observe(host)
    let disposed = false
    let stream: WebSocket | null = null
    let failed = false

    const connect = async () => {
      try {
        const { ticket } = await createDockerLogTicket(runtime, id)
        if (disposed) return
        stream = new WebSocket(dockerLogSocketUrl(runtime, id, ticket))
        stream.onmessage = (event) => {
          if (!disposed && typeof event.data === 'string') terminal.write(event.data)
        }
        stream.onerror = () => {
          if (!disposed && !failed) {
            failed = true
            terminal.write(LOGS_UNAVAILABLE)
          }
        }
        stream.onclose = () => {
          if (!disposed && !failed) terminal.write('\r\n[fluxo de logs encerrado]\r\n')
        }
      } catch {
        if (!disposed) terminal.write(LOGS_UNAVAILABLE)
      }
    }
    void connect()

    return () => {
      disposed = true
      observer.disconnect()
      if (stream) {
        stream.onmessage = null
        stream.onerror = null
        stream.onclose = null
        stream.close()
      }
      terminal.dispose()
      terminalRef.current = null
      searchRef.current = null
    }
  }, [id, runtime.apiBase, runtime.sessionToken])

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = TERMINAL_THEMES[theme]
  }, [theme])

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.shiftKey && event.code === 'KeyF') {
        event.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', openSearch, true)
    return () => window.removeEventListener('keydown', openSearch, true)
  }, [])

  const clearLogs = () => {
    terminalRef.current?.reset()
    terminalRef.current?.write(HIDE_CURSOR)
  }

  const closeSearch = () => {
    searchRef.current?.clearDecorations()
    setSearching(false)
  }

  return (
    <div className="relative h-full w-full">
      {searching && searchRef.current && (
        <TerminalSearch addon={searchRef.current} label="Buscar nos logs" onClose={closeSearch} />
      )}
      <button
        type="button"
        aria-label="Buscar nos logs"
        title="Buscar nos logs"
        className="absolute right-14 bottom-1 z-10 flex size-7 items-center justify-center rounded-md border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => setSearching(true)}
      >
        <LuSearch className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Limpar logs"
        title="Limpar logs"
        className="absolute right-4 bottom-1 z-10 flex size-7 items-center justify-center rounded-md border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
        onClick={clearLogs}
      >
        <LuEraser className="size-3.5" />
      </button>
      <div ref={hostRef} aria-label={`Logs de ${name}`} className="h-full w-full" />
    </div>
  )
}
