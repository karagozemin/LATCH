import { useEffect, useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'
import { config } from './config'
import App from './App'
import { StudioWatermark } from './components/StudioWatermark'
import { AppTransition } from './components/AppTransition'

const queryClient = new QueryClient()

export default function DashboardRoot() {
  const [entering, setEntering] = useState(() => {
    try {
      return window.sessionStorage.getItem('latch:launch-transition') === '1' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      window.sessionStorage.removeItem('latch:launch-transition')
    } catch {
      // Storage may be unavailable in privacy-restricted contexts.
    }
    if (!entering) return
    const timer = window.setTimeout(() => setEntering(false), 1100)
    return () => window.clearTimeout(timer)
  }, [entering])

  return (
    <>
      <div className={entering ? 'dashboard-entry-content' : undefined}>
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <ConnectKitProvider
              mode="dark"
              customTheme={{
                '--ck-font-family': "'Geist', sans-serif",
                '--ck-body-background': '#111B2A',
                '--ck-body-color': '#E8EEF6',
                '--ck-primary-button-background': '#16233A',
                '--ck-secondary-button-background': '#16233A',
                '--ck-focus-color': '#3FE0C0',
              }}
            >
              <App />
              <StudioWatermark />
              <Toaster position="top-center" theme="dark" />
            </ConnectKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </div>
      {entering && <AppTransition phase="entry" />}
    </>
  )
}
