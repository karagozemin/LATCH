import { Wordmark } from './layout/Wordmark'

export function AppTransition({ phase }: { phase: 'exit' | 'entry' }) {
  return (
    <div
      className="app-transition"
      data-phase={phase}
      role={phase === 'exit' ? 'status' : undefined}
      aria-live={phase === 'exit' ? 'polite' : undefined}
      aria-label={phase === 'exit' ? 'Opening the LATCH application' : undefined}
      aria-hidden={phase === 'entry' ? true : undefined}
    >
      <div className="app-transition-panel panel-left" />
      <div className="app-transition-panel panel-right" />
      <div className="app-transition-grid" />
      <div className="app-transition-core">
        <div className="transition-rings" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <Wordmark className="transition-wordmark" />
        <div className="transition-status">
          <span />
          ENTERING SECURE MODE
        </div>
      </div>
    </div>
  )
}
