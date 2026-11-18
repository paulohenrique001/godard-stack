import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SettingsProvider } from '@/features/settings/settings-provider'
import { ThemeProvider } from '@/features/theme/theme-provider'
import '@/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </SettingsProvider>
    </ThemeProvider>
  </StrictMode>,
)
