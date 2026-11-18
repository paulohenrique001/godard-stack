import { useEffect, useState } from 'react'

function windowIsActive() {
  return document.visibilityState === 'visible' && document.hasFocus()
}

export function useWindowActivity() {
  const [active, setActive] = useState(windowIsActive)

  useEffect(() => {
    const sync = () => setActive(windowIsActive())
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    window.addEventListener('blur', sync)
    sync()

    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
      window.removeEventListener('blur', sync)
    }
  }, [])

  return active
}
