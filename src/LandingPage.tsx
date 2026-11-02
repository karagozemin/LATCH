import { useCallback, useEffect, useState, type MouseEventHandler, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowRight,
  Check,
  Code2,
  ExternalLink,
  Gauge,
  Github,
  LockKeyhole,
  Menu,
  RotateCcw,
  ShieldCheck,
  TimerReset,
  WalletCards,
  X,
  Zap,
} from 'lucide-react'
import { Wordmark } from '@/components/layout/Wordmark'
import { StudioWatermark } from '@/components/StudioWatermark'
import { AppTransition } from '@/components/AppTransition'

const GITHUB_URL = 'https://github.com/karagozemin/LATCH'
const ARCHITECTURE_URL = `${GITHUB_URL}/blob/main/docs/ARCHITECTURE.md`
const CONTRACT_URL = 'https://explorer.arc.io/address/0xd09EAC2f4eF49A5E918bB49884189c37793a7CC2'

type ChamberStage = 'reserve' | 'capture' | 'refund'

const chamberStages: Record<
  ChamberStage,
  { index: string; title: string; eyebrow: string; caption: string; captured: number; remaining: number; refunded: number }
> = {
  reserve: {
    index: '01',
    title: 'Reserve',
    eyebrow: 'Funds secured',
    caption: '100.00 USDC is committed to one recipient.',
    captured: 0,
    remaining: 100,
    refunded: 0,
  },
  capture: {
    index: '02',
    title: 'Capture',
    eyebrow: 'Partial settlement',
    caption: '65.00 USDC settles. The rest stays protected.',
    captured: 65,
    remaining: 35,
    refunded: 0,
  },
  refund: {
    index: '03',
    title: 'Refund',
    eyebrow: 'Remainder reclaimed',
    caption: 'After expiry, the payer reclaims 35.00 USDC.',
    captured: 65,
    remaining: 0,
    refunded: 35,
  },
}

function AppLink({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick: MouseEventHandler<HTMLAnchorElement> }) {
  return (
    <a href="./app" className={className} onClick={onClick}>
      {children}
    </a>
  )
}

function ExternalLinkAnchor({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  )
}

function AuthorizationChamber() {
  const [stage, setStage] = useState<ChamberStage>('capture')
  const current = chamberStages[stage]

  return (
    <div className="chamber-shell" aria-label="Illustration of a LATCH payment authorization">
      <div className="chamber-glow" aria-hidden />
      <div className="chamber-topline">
        <div className="chamber-status">
          <span className="status-pulse" />
          <span>AUTHORIZATION CHAMBER</span>
        </div>
        <span className="chamber-id">LATCH / 0042</span>
      </div>

      <div className="chamber-body">
        <div className="chamber-stage-meta">
          <div>
            <span className="chamber-kicker">{current.eyebrow}</span>
            <h2 key={`${stage}-title`}>{current.title}</h2>
          </div>
          <div className="chamber-total">
            <span>AUTHORIZED</span>
            <strong>100.00</strong>
            <small>USDC</small>
          </div>
        </div>

        <div className="fund-rail" data-stage={stage} aria-label={`${current.captured} USDC captured, ${current.remaining} USDC remaining`}>
          <div className="fund-track">
            <div className="fund-segment fund-captured" style={{ width: `${current.captured}%` }}>
              {current.captured > 0 && <span>{current.captured}.00</span>}
            </div>
            <div className="fund-segment fund-remaining" style={{ width: `${current.remaining}%` }}>
              {current.remaining > 0 && <span>{current.remaining}.00</span>}
            </div>
            <div className="fund-segment fund-refunded" style={{ width: `${current.refunded}%` }}>
              {current.refunded > 0 && <span>{current.refunded}.00</span>}
            </div>
            <div className="fund-gate" style={{ left: `${current.captured}%` }} aria-hidden>
              <span />
            </div>
          </div>
          <div className="fund-labels">
            <span>0 USDC</span>
            <span>CONTROLLED ALLOCATION</span>
            <span>100 USDC</span>
          </div>
        </div>

        <div className="chamber-readouts">
          <div>
            <span className="readout-dot captured" />
            <span>CAPTURED</span>
            <strong>{current.captured}.00</strong>
          </div>
          <div>
            <span className="readout-dot remaining" />
            <span>REMAINING</span>
            <strong>{current.remaining}.00</strong>
          </div>
          <div>
            <span className="readout-dot refunded" />
            <span>REFUNDED</span>
            <strong>{current.refunded}.00</strong>
          </div>
        </div>

        <p className="chamber-caption" key={`${stage}-caption`}>
          {current.caption}
        </p>
      </div>

      <div className="chamber-controls" role="group" aria-label="Authorization illustration stage">
        {(Object.keys(chamberStages) as ChamberStage[]).map((key) => (
          <button key={key} type="button" data-active={stage === key} onClick={() => setStage(key)}>
            <span>{chamberStages[key].index}</span>
            {chamberStages[key].title}
          </button>
        ))}
      </div>
      <div className="chamber-disclaimer">
        <span>ILLUSTRATIVE MODEL</span>
        <span>NO ONCHAIN ACTION</span>
      </div>
    </div>
  )
}

function ComparisonVisual() {
  return (
    <div className="comparison-visual" aria-label="Comparison of payment models">
      <div className="comparison-row comparison-muted">
        <div className="comparison-label">
          <span>01</span>
          <strong>Pay upfront</strong>
        </div>
        <div className="comparison-line">
          <span className="comparison-fill full" />
          <i className="comparison-marker end" />
        </div>
        <small>Full risk to payer</small>
      </div>
      <div className="comparison-row comparison-muted">
        <div className="comparison-label">
          <span>02</span>
          <strong>Pay after</strong>
        </div>
        <div className="comparison-line">
          <span className="comparison-fill none" />
          <i className="comparison-marker start" />
        </div>
        <small>No payment assurance</small>
      </div>
      <div className="comparison-row comparison-latch">
        <div className="comparison-label">
          <span>03</span>
          <strong>Authorize with LATCH</strong>
        </div>
        <div className="comparison-line">
          <span className="comparison-fill latch" />
          <i className="comparison-marker split" />
        </div>
        <small>Funded, then settled precisely</small>
      </div>
    </div>
  )
}

const steps = [
  {
    index: '01',
    label: 'RESERVE',
    title: 'Commit the funds.',
    copy: 'The payer locks USDC for one designated recipient and chooses an expiry.',
    icon: LockKeyhole,
  },
  {
    index: '02',
    label: 'CAPTURE',
    title: 'Settle what is earned.',
    copy: 'The recipient withdraws any portion of the authorization before expiry.',
    icon: Zap,
  },
  {
    index: '03',
    label: 'REFUND',
    title: 'Reclaim the rest.',
    copy: 'After expiry, the payer submits a transaction to recover the unused balance.',
    icon: RotateCcw,
  },
]

function HowItWorks() {
  const [active, setActive] = useState(0)

  return (
    <section className="landing-section how-section" id="how-it-works">
      <div className="section-heading">
        <span className="section-index">02 / MECHANISM</span>
        <h2>One authorization.<br />Three actions.</h2>
      </div>
      <div className="mechanism-grid">
        <div className="mechanism-steps" role="tablist" aria-label="How LATCH works">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <button
                key={step.label}
                type="button"
                role="tab"
                aria-selected={active === index}
                className="mechanism-step"
                data-active={active === index}
                onClick={() => setActive(index)}
                onMouseEnter={() => setActive(index)}
              >
                <span className="step-number">{step.index}</span>
                <span className="step-copy">
                  <span className="step-label">{step.label}</span>
                  <strong>{step.title}</strong>
                  <small>{step.copy}</small>
                </span>
                <span className="step-icon"><Icon size={18} strokeWidth={1.8} /></span>
              </button>
            )
          })}
        </div>
        <div className="mechanism-display" data-active={active}>
          <div className="mechanism-orbit orbit-outer" />
          <div className="mechanism-orbit orbit-inner" />
          <div className="mechanism-node payer-node">
            <WalletCards size={18} />
            <span>PAYER</span>
          </div>
          <div className="mechanism-core">
            <span className="core-top">LATCH</span>
            <strong>{steps[active].index}</strong>
            <span>{steps[active].label}</span>
          </div>
          <div className="mechanism-node recipient-node">
            <Check size={18} />
            <span>RECIPIENT</span>
          </div>
          <div className="mechanism-flow flow-in" />
          <div className="mechanism-flow flow-out" />
          <div className="mechanism-expiry">
            <TimerReset size={15} />
            <span>{active === 2 ? 'EXPIRY REACHED' : 'EXPIRY PROTECTED'}</span>
          </div>
        </div>
      </div>
      <p className="refund-note"><span>Important</span> Refunds are available after expiry and require a transaction from the payer. They are not automatic.</p>
    </section>
  )
}

const guarantees = [
  'USDC-backed authorizations',
  'Partial captures',
  'Expiry-based refunds',
  'Recipient-specific permissions',
  'Immutable smart contract',
  'No protocol fees or admin withdrawal',
]

function Infrastructure() {
  return (
    <section className="landing-section infrastructure-section" id="architecture">
      <div className="infrastructure-copy">
        <span className="section-index">04 / INFRASTRUCTURE</span>
        <h2>Small surface.<br />Strong guarantees.</h2>
        <p>LATCH does one thing: hold USDC under simple, verifiable rules until it is captured or reclaimed.</p>
        <div className="guarantee-list">
          {guarantees.map((guarantee) => (
            <div key={guarantee}><Check size={14} />{guarantee}</div>
          ))}
        </div>
        <ExternalLinkAnchor href={ARCHITECTURE_URL} className="text-link">
          Explore Architecture <ArrowRight size={16} />
        </ExternalLinkAnchor>
      </div>
      <div className="architecture-map" aria-label="Wallet to LATCH to Arc USDC architecture">
        <div className="architecture-grid" aria-hidden />
        <div className="architecture-node wallet-node">
          <WalletCards size={24} />
          <span>WALLET</span>
          <small>Authorize</small>
        </div>
        <div className="architecture-connector">
          <span /><i /><span />
        </div>
        <div className="architecture-node latch-node">
          <ShieldCheck size={29} />
          <span>LATCH</span>
          <small>Enforce</small>
        </div>
        <div className="architecture-connector">
          <span /><i /><span />
        </div>
        <div className="architecture-node usdc-node">
          <div className="usdc-mark">$</div>
          <span>ARC USDC</span>
          <small>Settle</small>
        </div>
        <div className="architecture-caption">
          <span>ARC MAINNET</span>
          <code>0xd09E...7CC2</code>
        </div>
      </div>
    </section>
  )
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [launchTarget, setLaunchTarget] = useState<string | null>(null)
  const launching = launchTarget !== null

  const launchApp: MouseEventHandler<HTMLAnchorElement> = useCallback((event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (launching) return

    const target = event.currentTarget.href
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.location.assign(target)
      return
    }

    try {
      window.sessionStorage.setItem('latch:launch-transition', '1')
    } catch {
      // The transition still works if storage is unavailable.
    }
    setMenuOpen(false)
    setLaunchTarget(target)
  }, [launching])

  useEffect(() => {
    if (!launchTarget) return
    const timer = window.setTimeout(() => window.location.assign(launchTarget), 850)
    return () => window.clearTimeout(timer)
  }, [launchTarget])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener('resize', close)
    return () => window.removeEventListener('resize', close)
  }, [menuOpen])

  return (
    <div className="landing-page" data-launching={launching}>
      <header className="landing-nav" data-scrolled={scrolled}>
        <div className="landing-nav-inner">
          <a href="./" aria-label="LATCH home" className="landing-wordmark"><Wordmark /></a>
          <nav className="desktop-links" aria-label="Primary navigation">
            <a href="#how-it-works">How It Works</a>
            <a href="#architecture">Architecture</a>
            <ExternalLinkAnchor href={GITHUB_URL}>GitHub</ExternalLinkAnchor>
          </nav>
          <div className="nav-actions">
            <AppLink className="nav-launch" onClick={launchApp}>Launch App <ArrowRight size={15} /></AppLink>
            <button
              type="button"
              className="menu-toggle"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="mobile-links" aria-label="Mobile navigation">
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How It Works</a>
            <a href="#architecture" onClick={() => setMenuOpen(false)}>Architecture</a>
            <ExternalLinkAnchor href={GITHUB_URL}>GitHub</ExternalLinkAnchor>
            <AppLink onClick={launchApp}>Launch App <ArrowRight size={15} /></AppLink>
          </nav>
        )}
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-ambient hero-ambient-one" aria-hidden />
          <div className="hero-ambient hero-ambient-two" aria-hidden />
          <div className="hero-spectrum" aria-hidden />
          <div className="hero-grid-lines" aria-hidden />
          <div className="hero-copy">
            <div className="eyebrow"><span /> BUILT ON ARC · POWERED BY USDC</div>
            <h1><span>Authorize first.</span><span>Settle only what’s owed.</span></h1>
            <p>Programmable USDC payment holds for onchain commerce. Reserve funds upfront, let recipients capture what they earn, and reclaim the unused balance after expiry.</p>
            <div className="hero-actions">
              <AppLink className="primary-cta" onClick={launchApp}>Launch App <ArrowRight size={18} /></AppLink>
              <a href="#how-it-works" className="secondary-cta">Explore the Protocol <ArrowDown size={16} /></a>
            </div>
            <div className="hero-proof">
              <span><ShieldCheck size={15} /> Immutable contract</span>
              <span><Gauge size={15} /> No protocol fees</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-float-badge badge-secured" aria-hidden>
              <ShieldCheck size={14} /> FUNDS SECURED
            </div>
            <div className="hero-float-badge badge-settlement" aria-hidden>
              <span>65%</span> SETTLED
            </div>
            <AuthorizationChamber />
          </div>
        </section>

        <div className="signal-rail" aria-hidden>
          <div className="signal-track">
            {[0, 1].map((group) => (
              <div className="signal-group" key={group}>
                <span>FUNDED AUTHORIZATION</span><i />
                <span>PARTIAL CAPTURE</span><i />
                <span>EXPIRY REFUND</span><i />
                <span>ARC USDC</span><i />
                <span>ZERO PROTOCOL FEES</span><i />
              </div>
            ))}
          </div>
        </div>

        <section className="landing-section problem-section">
          <div className="problem-copy">
            <span className="section-index">01 / THE GAP</span>
            <h2>Payments shouldn’t be all or nothing.</h2>
            <p>Traditional crypto transfers settle immediately. But services often have uncertain final costs or are delivered over time.</p>
            <p className="problem-accent">LATCH creates a funded authorization layer between payment commitment and final settlement.</p>
          </div>
          <ComparisonVisual />
        </section>

        <HowItWorks />

        <section className="landing-section usecases-section">
          <div className="usecases-heading">
            <span className="section-index">03 / POSSIBILITIES</span>
            <h2>Payment commitments for a world that runs onchain.</h2>
            <p>Use cases made possible by funded, programmable authorization—not claims of existing integrations.</p>
          </div>
          <div className="usecase-list">
            <article className="usecase usecase-api">
              <div className="usecase-visual api-visual">
                <div><span>REQUEST</span><code>POST /authorize</code></div>
                <div><span>USAGE</span><strong>65.00</strong></div>
                <div className="api-pulse" />
              </div>
              <div><Code2 size={17} /><span>01</span></div>
              <h3>Usage-based API payments</h3>
              <p>Reserve a maximum budget, then capture against real consumption.</p>
            </article>
            <article className="usecase usecase-service">
              <div className="usecase-visual service-visual">
                <div className="service-ring"><ShieldCheck size={25} /></div>
                <span className="service-line line-one" />
                <span className="service-line line-two" />
                <small>FUNDS VERIFIED</small>
              </div>
              <div><ShieldCheck size={17} /><span>02</span></div>
              <h3>Service provider authorizations</h3>
              <p>Give providers payment assurance without settling the entire amount upfront.</p>
            </article>
            <article className="usecase usecase-commerce">
              <div className="usecase-visual commerce-visual">
                <div className="commerce-stack stack-one">100</div>
                <div className="commerce-stack stack-two">65</div>
                <div className="commerce-stack stack-three">35</div>
                <small>VARIABLE COST</small>
              </div>
              <div><Zap size={17} /><span>03</span></div>
              <h3>Onchain commerce</h3>
              <p>Handle variable-cost transactions with explicit, enforceable settlement rules.</p>
            </article>
          </div>
        </section>

        <Infrastructure />

        <section className="final-cta-section">
          <div className="final-cta-mark" aria-hidden>L</div>
          <div className="final-cta-aurora" aria-hidden />
          <span className="section-index">READY WHEN YOU ARE</span>
          <h2>Make every payment intentional.</h2>
          <p>Reserve what you can spend. Settle what you actually owe.</p>
          <div className="final-actions">
            <AppLink className="primary-cta" onClick={launchApp}>Launch LATCH <ArrowRight size={18} /></AppLink>
            <ExternalLinkAnchor href={CONTRACT_URL} className="secondary-cta">
              View Smart Contract <ExternalLink size={15} />
            </ExternalLinkAnchor>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-brand">
          <Wordmark />
          <span>Built with Arc Studio</span>
        </div>
        <div className="footer-network"><span className="status-pulse" /> ARC MAINNET</div>
        <nav aria-label="Footer navigation">
          <ExternalLinkAnchor href={GITHUB_URL}><Github size={14} /> GitHub</ExternalLinkAnchor>
          <ExternalLinkAnchor href={ARCHITECTURE_URL}>Architecture</ExternalLinkAnchor>
          <ExternalLinkAnchor href={CONTRACT_URL}>Contract Explorer <ExternalLink size={13} /></ExternalLinkAnchor>
        </nav>
      </footer>
      <StudioWatermark />
      {launching && <AppTransition phase="exit" />}
    </div>
  )
}
