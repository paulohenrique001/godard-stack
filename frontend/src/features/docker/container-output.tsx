import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { TERMINAL_FONT_FAMILY, TERMINAL_THEMES } from '@/features/terminal/terminal-view'
import { useTheme } from '@/features/theme/theme-provider'

const HIDE_CURSOR = '\x1b[?25l'

export function ContainerOutput({ text }: { text: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const writtenRef = useRef(0)
  const { theme } = useTheme()

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    const terminal = new Terminal({
      convertEol: true,
      disableStdin: true,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: 13,
      lineHeight: 1.25,
      theme: TERMINAL_THEMES[theme],
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host)
    terminal.write(HIDE_CURSOR)
    fit.fit()
    terminalRef.current = terminal
    writtenRef.current = 0
    const observer = new ResizeObserver(() => fit.fit())
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
    if (terminalRef.current) {
      terminalRef.current.options.theme = TERMINAL_THEMES[theme]
    }
  }, [theme])

  return <div ref={hostRef} aria-label="Saída da atualização" className="h-full w-full" />
}
