import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { createDockerShellTicket, dockerShellSocketUrl, type RuntimeStatus } from '../../api'

const SESSION_ENDED = '\r\n[sessão encerrada]\r\n'

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

export function DockerShell({
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

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 5_000,
      theme: TERMINAL_THEMES[theme],
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host)
    terminalRef.current = terminal
    if (host.offsetWidth > 0) fit.fit()
    terminal.focus()

    let disposed = false
    let session: WebSocket | null = null
    const sendSize = () => {
      if (session?.readyState === WebSocket.OPEN) session.send(`r${terminal.cols},${terminal.rows}`)
    }
    const connect = async () => {
      try {
        const { ticket } = await createDockerShellTicket(runtime, id)
        if (disposed) return
        session = new WebSocket(dockerShellSocketUrl(runtime, id, ticket))
        session.onopen = sendSize
        session.onmessage = (event) => {
          if (!disposed && typeof event.data === 'string' && !event.data.startsWith('\u0001'))
            terminal.write(event.data)
        }
        session.onclose = () => {
          if (!disposed) terminal.write(SESSION_ENDED)
        }
      } catch {
        if (!disposed) terminal.write('\r\n[shell indisponível]\r\n')
      }
    }
    void connect()
    const input = terminal.onData((data) => {
      if (session?.readyState === WebSocket.OPEN) session.send(`i${data}`)
    })
    const resize = terminal.onResize(sendSize)
    const observer = new ResizeObserver(() => {
      if (host.offsetWidth > 0) fit.fit()
    })
    observer.observe(host)

    return () => {
      disposed = true
      observer.disconnect()
      input.dispose()
      resize.dispose()
      if (session) {
        session.onclose = null
        session.onmessage = null
        session.close()
      }
      terminalRef.current = null
      terminal.dispose()
    }
  }, [id, runtime.apiBase, runtime.sessionToken])

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = TERMINAL_THEMES[theme]
  }, [theme])

  return <div ref={hostRef} aria-label={`Shell de ${name}`} className="h-full w-full" />
}
