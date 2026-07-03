import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { LoginPage } from './LoginPage.tsx'
import { fetchMe, type SessionUser } from './session.ts'

const CurrentUserContext = createContext<SessionUser | null>(null)

// Open-mode consumers (e.g. App.tsx topbar) call this to decide whether to
// render any auth UI at all — it returns null both while loading and in
// bootstrap-open mode, so the default (no context provider reached yet, or
// authRequired: false) safely renders zero auth UI.
export function useCurrentUser(): SessionUser | null {
  return useContext(CurrentUserContext)
}

type GateState =
  | { status: 'loading' }
  | { status: 'open' }
  | { status: 'authenticated'; user: SessionUser }
  | { status: 'unauthenticated' }

// Single mount point for the whole app's auth boundary (plan.md decision 7 /
// pa.md MF-3): wraps `<RootComponent />` at the createRoot().render() call in
// main.tsx, so both of RootComponent's branches (App and
// ReadingAnalysisDemoRoute) sit behind this gate — including the
// `?view=reading-analysis` route, which must show the login page rather than
// content when forced mode is on and the visitor has no session.
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchMe()
      .then((me) => {
        if (cancelled) return
        if (!me.authRequired) {
          setState({ status: 'open' })
        } else if (me.user) {
          setState({ status: 'authenticated', user: me.user })
        } else {
          setState({ status: 'unauthenticated' })
        }
      })
      .catch(() => {
        // If the session probe itself fails (network/server error), fail
        // closed to the login page rather than silently granting access.
        if (!cancelled) setState({ status: 'unauthenticated' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') {
    return <div className="auth-gate-loading" aria-busy="true" />
  }

  if (state.status === 'unauthenticated') {
    return <LoginPage />
  }

  const currentUser = state.status === 'authenticated' ? state.user : null
  return <CurrentUserContext.Provider value={currentUser}>{children}</CurrentUserContext.Provider>
}
