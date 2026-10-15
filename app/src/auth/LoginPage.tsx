import { useState, type FormEvent } from 'react'
import './LoginPage.css'
import { login } from './session.ts'

/* BRAND.md §4.7: the otter peeks over the card's top edge, which is the water
   line. The same drawing is layered twice: the back copy shows only what is
   above the edge and sits behind the card; the front copy shows only the paws
   below the edge and sits on top of it. Decorative, so hidden from readers. */
const OTTER_PEEK_SRC = '/brand/otter-peek-login.svg'

function OtterPeek() {
  return (
    <div className="login-peek" aria-hidden="true">
      <div className="login-peek-layer login-peek-back">
        <img src={OTTER_PEEK_SRC} alt="" />
      </div>
      <div className="login-peek-layer login-peek-front">
        <img src={OTTER_PEEK_SRC} alt="" />
      </div>
    </div>
  )
}

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      // Simplest correct option: full reload re-runs AuthGate's fetchMe() and
      // re-mounts the app with fresh session state, avoiding any need to thread
      // login state through the existing (auth-unaware) app reducer.
      window.location.reload()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '登录失败')
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-stage">
        <OtterPeek />
        <section className="login-card" aria-labelledby="login-title">
          <h1 id="login-title">英语题库工作台</h1>
          <p className="login-subtitle">输入账号，接着备课。</p>
          {error && <p className="login-error" role="alert">{error}</p>}
          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="login-username">用户名</label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={submitting}
                required
              />
            </div>
            <div className="login-field">
              <label htmlFor="login-password">密码</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                required
              />
            </div>
            <button className="login-submit" type="submit" disabled={submitting}>
              {submitting ? '登录中…' : '登录'}
            </button>
          </form>
          <p className="login-footer-hint">账号需邀请开通。</p>
        </section>
      </div>
    </main>
  )
}
