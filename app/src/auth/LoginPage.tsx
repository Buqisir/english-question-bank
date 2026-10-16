import { useEffect, useState, type FormEvent } from 'react'
import './LoginPage.css'
import { login } from './session.ts'
import otterSvg from './login-otter.svg?raw'

/* 08 雾海（BRAND.md §4.7）：雾是背景图，海獭内联，好让描边能逐笔画出来。
   线稿自画只在这台设备第一次打开登录页时出现，之后直接静态出场。 */
const MIST_SRC = '/brand/login-mist.svg'
const DRAWN_KEY = 'eqb.login.otterDrawn'

function hasDrawnBefore(): boolean {
  try {
    return window.localStorage.getItem(DRAWN_KEY) !== null
  } catch {
    return true
  }
}

function MistScene() {
  const [drawing] = useState(() => !hasDrawnBefore())
  // 记号在挂载后再写：StrictMode 会把 useState 初始化跑两遍。
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAWN_KEY, '1')
    } catch {
      // 无痕模式写不进去也无妨，最多每次都画一遍。
    }
  }, [])
  return (
    <div className="login-scene-frame" aria-hidden="true">
      <div className="login-scene">
        <img className="login-mist" src={MIST_SRC} alt="" />
        <div className="login-otter-sway">
          <div
            className={drawing ? 'login-otter is-drawing' : 'login-otter'}
            dangerouslySetInnerHTML={{ __html: otterSvg }}
          />
        </div>
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
      <MistScene />
      <div className="login-content">
        <div className="login-brand">
          <img src="/brand/mark.svg" alt="" />
          <span>英语题库工作台</span>
        </div>
        <section className="login-card" aria-labelledby="login-title">
          <h1 id="login-title">题海三千，只取一瓢</h1>
          <p className="login-subtitle">登录后，接着上次的备课。</p>
          {error && <p className="login-error" role="alert">{error}</p>}
          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="login-username">用户名</label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                placeholder="用户名"
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
                placeholder="密码"
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
        </section>
        <p className="login-footer-hint">账号需邀请开通 · eqbank.cc</p>
      </div>
    </main>
  )
}
