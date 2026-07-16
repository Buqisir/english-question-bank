import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { LoginPage } from './LoginPage.tsx'
import { fetchMe, type SessionUser } from './session.ts'

const CurrentUserContext = createContext<SessionUser | null>(null)

// M0-3 (docs/cuts/m0-3-role-gate/plan.md 2a): the ONLY place that translates
// "open mode" into product semantics. Bootstrap-open mode (empty users table) and
// an authenticated owner both render the full curatorial surface; a member does
// not. Consumers must use this boolean rather than re-deriving it from
// `currentUser === null` (that would misread open mode as "no permissions").
// Defaults to `true` (matches CurrentUserContext's default / pre-M0-2 behavior)
// so any future consumer added before this context reaches its provider fails
// open to the pre-M0-2 single-user shape, not closed to a phantom member view.
const IsOwnerViewContext = createContext<boolean>(true)

// Open-mode consumers (e.g. App.tsx topbar) call this to decide whether to
// render any auth UI at all — it returns null both while loading and in
// bootstrap-open mode, so the default (no context provider reached yet, or
// authRequired: false) safely renders zero auth UI.
export function useCurrentUser(): SessionUser | null {
  return useContext(CurrentUserContext)
}

// M0-3 (plan.md 2a): true for bootstrap-open mode and for an authenticated owner;
// false only for an authenticated member. Use this instead of inspecting
// `useCurrentUser()` for role decisions.
export function useIsOwnerView(): boolean {
  return useContext(IsOwnerViewContext)
}

type GateState =
  | { status: 'loading' }
  | { status: 'open' }
  | { status: 'authenticated'; user: SessionUser }
  | { status: 'unauthenticated' }

// Single mount point for the whole app's auth boundary (plan.md decision 7 /
// pa.md MF-3): wraps `<App />` at the createRoot().render() call in
// main.tsx, so the whole app sits behind this gate — it must show the login
// page rather than content when forced mode is on and the visitor has no
// session.
// reading-analysis-retire (2026-07-16): this gate used to also wrap a
// second RootComponent branch (`ReadingAnalysisDemoRoute`, mounted on
// `?view=reading-analysis`). That branch and its route parser are retired;
// main.tsx now self-heals the old URL to the home route before render, so
// `<App />` is the only child this gate ever wraps.
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
  // plan.md 2a: open mode (`state.status === 'open'`) and an owner both render the
  // full surface; only an authenticated member does not.
  const isOwnerView = state.status !== 'authenticated' || state.user.role === 'owner'
  return (
    <CurrentUserContext.Provider value={currentUser}>
      <IsOwnerViewContext.Provider value={isOwnerView}>{children}</IsOwnerViewContext.Provider>
    </CurrentUserContext.Provider>
  )
}
