import { useCallback, useState } from 'react'
import { useAccount } from 'wagmi'
import { useHolds, useNow } from '@/hooks/useHolds'
import { useActivity } from '@/hooks/useActivity'
import { useView } from '@/hooks/useView'
import { LATCH_ADDRESS } from '@/lib/latch'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { MobileNav } from '@/components/layout/MobileNav'
import { NAV } from '@/components/layout/nav'
import { Hero } from '@/components/Hero'
import { SummaryCards } from '@/components/SummaryCards'
import { CreateAuthorization } from '@/components/CreateAuthorization'
import { HoldDetail } from '@/components/HoldDetail'
import { HoldsTable } from '@/components/HoldsTable'
import { HistoryTable } from '@/components/HistoryTable'
import { Panel } from '@/components/ui/Panel'

export default function App() {
  const now = useNow()
  const { view, navigate } = useView()
  const { address } = useAccount()
  const { holds, total, isLoading, isError, refetch } = useHolds()
  const activity = useActivity()
  const [selectedId, setSelectedId] = useState<bigint | null>(null)

  const me = address?.toLowerCase()
  // Default selection: the newest hold the connected wallet is a party to, else the newest overall.
  const fallback =
    holds.find((h) => h.payer.toLowerCase() === me || h.recipient.toLowerCase() === me) ?? holds[0]
  const selected = holds.find((h) => h.id === selectedId) ?? fallback

  const select = useCallback((id: bigint) => {
    setSelectedId(id)
    requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 1023px)').matches) {
        document.getElementById('hold-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  }, [])

  const onCreated = useCallback(() => {
    setSelectedId(null)
    refetch()
  }, [refetch])

  const title = NAV.find((n) => n.view === view)?.title ?? 'Overview'

  const create = <CreateAuthorization onCreated={onCreated} />
  const detail = (
    <HoldDetail
      hold={selected}
      now={now}
      isLoading={isLoading}
      hasHolds={holds.length > 0}
      events={activity.events}
      activitySyncing={activity.syncing}
      onChanged={refetch}
    />
  )
  const goCreate = () => navigate('create')

  return (
    <div className="min-h-dvh bg-canvas text-ink lg:flex">
      <Sidebar view={view} onNavigate={navigate} />
      <div className="min-w-0 flex-1">
        <TopBar title={title} />
        <MobileNav view={view} onNavigate={navigate} />

        <main className="mx-auto max-w-[1240px] space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:space-y-8 lg:px-8 lg:pt-8">
          {!LATCH_ADDRESS ? (
            <Panel className="p-6 text-sm text-danger">
              No contract address configured. Set VITE_LATCH_ADDRESS in .env to your deployed Latch address and
              restart the dev server.
            </Panel>
          ) : (
            <div key={view} className="animate-fade-up space-y-6 lg:space-y-8">
              {view === 'overview' && (
                <>
                  <Hero />
                  <SummaryCards holds={holds} total={total} now={now} isLoading={isLoading} isError={isError} />
                  <div className="grid items-start gap-6 lg:grid-cols-2">
                    {create}
                    {detail}
                  </div>
                  <HoldsTable
                    title="Authorizations"
                    subtitle="Every hold, read live from the contract."
                    holds={holds}
                    total={total}
                    now={now}
                    isLoading={isLoading}
                    isError={isError}
                    selectedId={selected?.id}
                    onSelect={select}
                    onCreate={goCreate}
                  />
                </>
              )}

              {view === 'create' && (
                <div className="grid items-start gap-6 lg:grid-cols-2">
                  {create}
                  {detail}
                </div>
              )}

              {view === 'holds' && (
                <>
                  <HoldsTable
                    title="Active Holds"
                    subtitle="Authorizations that still hold funds: capturable now, or refundable after expiry."
                    holds={holds}
                    total={total}
                    now={now}
                    isLoading={isLoading}
                    isError={isError}
                    selectedId={selected?.id}
                    onSelect={select}
                    openOnly
                    onCreate={goCreate}
                  />
                  {detail}
                </>
              )}

              {view === 'history' && (
                <HistoryTable
                  events={activity.events}
                  progress={activity.progress}
                  error={activity.error}
                  syncing={activity.syncing}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
