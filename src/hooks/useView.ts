import { useCallback, useEffect, useState } from 'react'

export const VIEWS = ['overview', 'create', 'holds', 'history'] as const
export type View = (typeof VIEWS)[number]

function read(): View {
  const v = new URLSearchParams(window.location.search).get('view')
  return (VIEWS as readonly string[]).includes(v ?? '') ? (v as View) : 'overview'
}

/** Tiny query-string router (`?view=holds`) so every page can be opened directly and shared. */
export function useView() {
  const [view, setView] = useState<View>(read)

  useEffect(() => {
    const onPop = () => setView(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((next: View) => {
    const url = next === 'overview' ? window.location.pathname : `${window.location.pathname}?view=${next}`
    window.history.pushState(null, '', url)
    setView(next)
    window.scrollTo({ top: 0 })
  }, [])

  return { view, navigate }
}
