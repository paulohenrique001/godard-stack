import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { TERMINAL_FONT_FAMILY, TERMINAL_THEMES } from '@/features/terminal/terminal-view'
import { useTheme } from '@/features/theme/theme-provider'

const CONTROL_PREFIX = '\u0001'
const CONNECT_DELAY_MS = 50
const SESSION_ENDED = '\r\n[sessão encerrada]\r\n'

export function ContainerShell({ id, name }: { id: string; name: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: 13,
      lineHeight: 1.25,
      theme: TERMINAL_THEMES[theme],
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host)
    fit.fit()
    terminal.focus()
    terminalRef.current = terminal

    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    let session: WebSocket | null = null
    const sendSize = () => {
      if (session?.readyState === WebSocket.OPEN) {
        session.send(`r${terminal.cols},${terminal.rows}`)
      }
    }
    const connectTimer = setTimeout(() => {
      session = new WebSocket(`${scheme}://${location.host}/api/docker/shell?container=${id}`)
      session.onopen = sendSize
      session.onmessage = (event) => {
        if (!event.data.startsWith(CONTROL_PREFIX)) {
          terminal.write(event.data)
        }
      }
      session.onclose = () => terminal.write(SESSION_ENDED)
    }, CONNECT_DELAY_MS)
    const input = terminal.onData((data) => {
      if (session?.readyState === WebSocket.OPEN) {
        session.send(`i${data}`)
      }
    })
    const resize = terminal.onResize(sendSize)
    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(host)

    return () => {
      clearTimeout(connectTimer)
      if (session) {
        session.onclose = null
        session.onmessage = null
        session.close()
      }
      input.dispose()
      resize.dispose()
      observer.disconnect()
      terminalRef.current = null
      terminal.dispose()
    }
  }, [id])

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = TERMINAL_THEMES[theme]
    }
  }, [theme])

  return <div ref={hostRef} aria-label={`Shell de ${name}`} className="h-full w-full" />
}
