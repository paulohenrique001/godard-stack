import { useEffect, useRef, useState } from 'react'
import { recoverAdvanced, recoverBasic, recoverIntermediate } from '../../api'

export type RecoveryPhase =
  | { kind: 'idle' }
  | { kind: 'recovering'; level: 1 | 2 | 3; message: string }
  | { kind: 'failed'; backupPath: string }

export function useAutoRecovery(
  failed: boolean,
  retry: () => Promise<void>,
): RecoveryPhase {
  const [phase, setPhase] = useState<RecoveryPhase>({ kind: 'idle' })
  const stageRef = useRef(0)
  const inProgressRef = useRef(false)
  const backupPathRef = useRef('')

  useEffect(() => {
    if (!failed) return
    if (inProgressRef.current) return

    const stage = stageRef.current

    if (stage >= 3) {
      setPhase({ kind: 'failed', backupPath: backupPathRef.current })
      return
    }

    inProgressRef.current = true

    async function run() {
      try {
        if (stage === 0) {
          setPhase({ kind: 'recovering', level: 1, message: 'Limpando arquivos temporários...' })
          await recoverBasic().catch(() => {})
        } else if (stage === 1) {
          setPhase({ kind: 'recovering', level: 2, message: 'Encerrando processos travados...' })
          await recoverIntermediate().catch(() => {})
        } else {
          setPhase({ kind: 'recovering', level: 3, message: 'Recriando banco de dados...' })
          backupPathRef.current = await recoverAdvanced().catch(() => '')
        }
        stageRef.current = stage + 1
        await retry().catch(() => {})
      } finally {
        inProgressRef.current = false
      }
    }

    void run()
  }, [failed, retry])

  return phase
}
