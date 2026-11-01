interface Props<T extends string> {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}

export function Segmented<T extends string>({ value, onChange, options, label }: Props<T>) {
  return (
    <div className="inline-flex rounded-lg border border-edge/[0.12] bg-canvas p-0.5" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-7 rounded-md px-3 text-xs font-medium transition-colors ${
            value === o.value ? 'bg-raised text-ink' : 'text-slate2 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
