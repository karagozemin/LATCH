import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'
import { config } from './config'
import App from './App'
import { StudioWatermark } from './components/StudioWatermark'

const queryClient = new QueryClient()

export default function DashboardRoot() {
  return (
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
  )
}
