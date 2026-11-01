import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setDone(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setDone(false), 1500)
    } catch {
      toast.error('Copy is blocked in this view. Select the text and copy it manually.')
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      title={label}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-edge/[0.12] hover:text-ink"
    >
      {done ? <Check className="size-3.5 text-teal" /> : <Copy className="size-3.5" />}
    </button>
  )
}
