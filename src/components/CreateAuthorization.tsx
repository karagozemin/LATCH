import { useMemo, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi, isAddress } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { LATCH_ADDRESS, LATCH_CHAIN_ID, LATCH_IS_MAINNET, USDC_ADDRESS, latchAbi } from '@/lib/latch'
import { fmtDate, fmtUsdc } from '@/lib/format'
import { networkLabel } from '@/lib/network'
import { parseUsdc } from '@/onchain-money'
import { useTx } from '@/hooks/useTx'
import { useNow } from '@/hooks/useHolds'
import { Label, Panel, PanelHeader } from '@/components/ui/Panel'
import { TxStatus } from './TxStatus'

type Unit = 'minutes' | 'hours' | 'days'
const UNIT_SECONDS: Record<Unit, number> = { minutes: 60, hours: 3600, days: 86400 }
const AMOUNT_PRESETS = ['0.02', '1', '10']
const DURATION_PRESETS: { label: string; value: string; unit: Unit }[] = [
  { label: '2 min', value: '2', unit: 'minutes' },
  { label: '1 hour', value: '1', unit: 'hours' },
  { label: '1 day', value: '1', unit: 'days' },
]

const inputBox =
  'rounded-xl border border-edge/[0.15] bg-canvas transition-colors focus-within:border-teal/60 hover:border-edge/30'

function tryParse(value: string): bigint | null {
  if (!value) return null
  try {
    const n = parseUsdc(value)
    return n > 0n ? n : null
  } catch {
    return null
  }
}

function Chip({ children, onClick, active }: { children: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-md border px-2.5 text-xs font-medium tabular-nums transition-colors ${
        active
          ? 'border-teal/40 bg-teal/[0.1] text-teal'
          : 'border-edge/[0.15] text-slate2 hover:border-edge/30 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function Step({ n, label, state }: { n: number; label: string; state: 'done' | 'current' | 'todo' }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
          state === 'done'
            ? 'bg-teal text-teal-ink'
            : state === 'current'
              ? 'border border-teal text-teal'
              : 'border border-edge/25 text-faint'
        }`}
      >
        {state === 'done' ? '✓' : n}
      </span>
      <span className={`text-xs font-medium ${state === 'todo' ? 'text-faint' : 'text-ink'}`}>{label}</span>
    </div>
  )
}

export function CreateAuthorization({ onCreated }: { onCreated: () => void }) {
  const { address, isConnected, chainId } = useAccount()
  const now = useNow()
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [duration, setDuration] = useState('2')
  const [unit, setUnit] = useState<Unit>('minutes')

  const balance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: LATCH_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 8000 },
  })
  const allowance = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && LATCH_ADDRESS ? [address, LATCH_ADDRESS] : undefined,
    chainId: LATCH_CHAIN_ID,
    query: { enabled: !!address && !!LATCH_ADDRESS },
  })

  const approveTx = useTx(() => void allowance.refetch())
  const createTx = useTx(() => {
    void balance.refetch()
    void allowance.refetch()
    setAmount('')
    onCreated()
  })

  const amountRaw = useMemo(() => tryParse(amount), [amount])
  const durationSec = Number(duration) * UNIT_SECONDS[unit]
  const durationOk = Number.isFinite(durationSec) && durationSec >= 60

  const recipientOk = isAddress(recipient)
  const isSelf = recipientOk && address?.toLowerCase() === recipient.toLowerCase()
  const bal = balance.data
  const overBalance = amountRaw !== null && bal !== undefined && amountRaw > bal
  const approved = allowance.data ?? 0n
  const needsApproval = amountRaw !== null && approved < amountRaw

  const formReady = recipientOk && !isSelf && amountRaw !== null && !overBalance && durationOk
  const wrongChain = isConnected && chainId !== LATCH_CHAIN_ID

  const errors = {
    recipient: recipient && !recipientOk ? 'Enter a valid wallet address.' : isSelf ? 'Recipient must differ from your own wallet.' : null,
    amount: amount && amountRaw === null ? 'Enter a positive amount (up to 6 decimals).' : overBalance ? 'More than your USDC balance.' : null,
    duration: !durationOk ? 'Minimum expiry is 1 minute.' : null,
  }

  const submitApprove = () => {
    if (amountRaw === null || !LATCH_ADDRESS) return
    const latch = LATCH_ADDRESS
    createTx.reset()
    void approveTx.run((write) =>
      write({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [latch, amountRaw],
        chainId: LATCH_CHAIN_ID,
      }),
    )
  }

  const submitCreate = () => {
    if (!formReady || amountRaw === null || !LATCH_ADDRESS) return
    const latch = LATCH_ADDRESS
    const expiry = BigInt(Math.floor(Date.now() / 1000) + Math.round(durationSec))
    approveTx.reset()
    void createTx.run((write) =>
      write({
        address: latch,
        abi: latchAbi,
        functionName: 'createHold',
        args: [recipient, amountRaw, expiry],
        chainId: LATCH_CHAIN_ID,
      }),
    )
  }

  const busy = approveTx.busy || createTx.busy
  const amountLabel = amountRaw !== null ? `${fmtUsdc(amountRaw)} USDC` : 'USDC'
  const primary =
    'flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal text-sm font-semibold text-teal-ink transition-colors hover:bg-teal-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-teal'

  return (
    <Panel>
      <PanelHeader
        title="Create Authorization"
        subtitle="Lock USDC for a recipient. They capture before expiry; you refund the rest after."
        right={
          isConnected && bal !== undefined ? (
            <div className="shrink-0 text-right">
              <Label>Balance</Label>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{fmtUsdc(bal)} USDC</div>
            </div>
          ) : undefined
        }
      />

      <div className="space-y-5 px-5 py-5 sm:px-6">
        {wrongChain && chainId !== undefined && (
          <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/[0.07] px-3.5 py-3 text-[13px]">
            <AlertTriangle className="mt-px size-4 shrink-0 text-warn" />
            <p className="text-pretty text-warn">
              Your wallet is on {networkLabel(chainId)}. Latch runs on {networkLabel(LATCH_CHAIN_ID)}. Use the button
              below to switch.
            </p>
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 flex items-center justify-between">
            <Label>Recipient wallet</Label>
          </span>
          <div className={`${inputBox} ${errors.recipient ? 'border-danger/50' : ''}`}>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              className="h-11 w-full bg-transparent px-3.5 font-mono text-[13px] text-ink outline-none placeholder:text-faint"
            />
          </div>
          {errors.recipient && <p className="mt-1.5 text-xs text-danger">{errors.recipient}</p>}
        </label>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label>Amount</Label>
            {isConnected && bal !== undefined && bal > 0n && (
              <button
                type="button"
                onClick={() => setAmount(fmtUsdc(bal).replace(/,/g, ''))}
                className="text-xs font-medium text-teal hover:underline"
              >
                Max
              </button>
            )}
          </div>
          <div className={`${inputBox} flex items-center gap-3 px-3.5 ${errors.amount ? 'border-danger/50' : ''}`}>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/,/g, '.')
                if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
              }}
              placeholder="0.00"
              aria-label="Amount in USDC"
              className="h-12 min-w-0 flex-1 bg-transparent text-xl font-semibold tabular-nums text-ink outline-none placeholder:text-faint"
            />
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate2">
              <TokenUSDC variant="branded" size={18} /> USDC
            </span>
          </div>
          {errors.amount && <p className="mt-1.5 text-xs text-danger">{errors.amount}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {AMOUNT_PRESETS.map((c) => (
              <Chip key={c} active={amount === c} onClick={() => setAmount(c)}>
                {c}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5">
            <Label>Expires in</Label>
          </div>
          <div className="flex gap-2">
            <div className={`${inputBox} w-24 ${errors.duration ? 'border-danger/50' : ''}`}>
              <input
                inputMode="numeric"
                value={duration}
                onChange={(e) => /^\d{0,5}$/.test(e.target.value) && setDuration(e.target.value)}
                aria-label="Expiry duration"
                className="h-11 w-full bg-transparent px-3.5 text-sm tabular-nums text-ink outline-none"
              />
            </div>
            <div className={`${inputBox} flex-1`}>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
                aria-label="Expiry unit"
                className="h-11 w-full bg-transparent px-3 text-sm text-ink outline-none"
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>
          {errors.duration && <p className="mt-1.5 text-xs text-danger">{errors.duration}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DURATION_PRESETS.map((c) => (
              <Chip
                key={c.label}
                active={duration === c.value && unit === c.unit}
                onClick={() => {
                  setDuration(c.value)
                  setUnit(c.unit)
                }}
              >
                {c.label}
              </Chip>
            ))}
          </div>
        </div>

        {amountRaw !== null && recipientOk && durationOk && (
          <dl className="space-y-2 rounded-xl border border-edge/[0.12] bg-canvas px-3.5 py-3 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-slate2">You lock</dt>
              <dd className="font-medium tabular-nums text-ink">{amountLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate2">Capturable until</dt>
              <dd className="tabular-nums text-ink">{fmtDate(BigInt(now + Math.round(durationSec)))}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate2">Approval</dt>
              <dd className="text-ink">{needsApproval ? 'Required (one extra transaction)' : 'Sufficient allowance'}</dd>
            </div>
          </dl>
        )}

        {isConnected && !wrongChain && amountRaw !== null && (
          <div className="flex items-center gap-4">
            <Step n={1} label="Approve USDC" state={needsApproval ? 'current' : 'done'} />
            <span className="h-px w-6 bg-edge/25" />
            <Step n={2} label="Reserve" state={needsApproval ? 'todo' : 'current'} />
          </div>
        )}

        {LATCH_IS_MAINNET && (
          <p className="rounded-xl border border-warn/30 bg-warn/[0.07] px-3.5 py-2.5 text-xs text-pretty text-warn">
            Arc Mainnet: this reserves real USDC and every transaction is irreversible. Check the recipient address and
            amount before you confirm in your wallet.
          </p>
        )}

        <div>
          {!isConnected ? (
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button onClick={show} className={primary}>
                  Connect wallet
                </button>
              )}
            </ConnectKitButton.Custom>
          ) : wrongChain ? (
            <button onClick={() => void createTx.run(() => undefined)} className={primary}>
              Switch to {networkLabel(LATCH_CHAIN_ID)}
            </button>
          ) : needsApproval ? (
            <button disabled={!formReady || busy} onClick={submitApprove} className={primary}>
              {approveTx.busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {approveTx.phase === 'signing' ? 'Confirm in wallet…' : 'Approving…'}
                </>
              ) : (
                `Approve ${amountLabel}`
              )}
            </button>
          ) : (
            <button disabled={!formReady || busy} onClick={submitCreate} className={primary}>
              {createTx.busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {createTx.phase === 'signing' ? 'Confirm in wallet…' : 'Reserving…'}
                </>
              ) : (
                'Reserve USDC'
              )}
            </button>
          )}
        </div>

        <div className="space-y-2">
          <TxStatus
            phase={approveTx.phase}
            hash={approveTx.hash}
            error={approveTx.error}
            pendingLabel="Approval"
            successLabel="USDC approved. You can now reserve."
          />
          <TxStatus
            phase={createTx.phase}
            hash={createTx.hash}
            error={createTx.error}
            pendingLabel="Reservation"
            successLabel="Authorization created."
          />
        </div>
      </div>
    </Panel>
  )
}
