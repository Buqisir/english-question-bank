import { createRoot } from 'react-dom/client'
import { useEffect, useState, type FormEvent } from 'react'
import '../src/index.css'
import './abc.css'
import { Button } from '../src/shared-ui/Button.tsx'
import { TextField } from '../src/shared-ui/Field.tsx'
import otterLineSvg from '../src/auth/login-otter.svg?raw'
import otterFloatSvg from '../../design/brand-2026-10-13/mascot/otter-float.svg?raw'

type Variant = 'a' | 'b' | 'c'
const base = import.meta.env.BASE_URL

function readVariant(): Variant {
  const h = window.location.hash.replace('#', '')
  return h === 'b' || h === 'c' ? h : 'a'
}

function Brand() {
  return (
    <div className="abc-brand">
      <img src={`${base}brand/mark.svg`} width={32} height={20} alt="" />
      <img src={`${base}brand/wordmark.svg`} width={31} height={20} alt="獭石" />
    </div>
  )
}

/* 表单三个方向共用：真的 TextField（lg 高 36）和 Button（solid pill，Owner 2026-11-15 定的胶囊大号）。 */
function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setBusy(true)
    window.setTimeout(() => {
      setBusy(false)
      setError('样张不连账号，点登录只演示「忙」和出错的样子。')
    }, 1200)
  }
  return (
    <form className="abc-form" onSubmit={submit}>
      <TextField label="用户名" size="lg" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} disabled={busy} />
      <TextField label="密码" size="lg" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} error={error} announce />
      <Button className="abc-submit" type="submit" tone="solid" size="pill" busy={busy}>登录</Button>
    </form>
  )
}

function Heading({ level = 'card' }: { level?: 'card' | 'page' }) {
  return (
    <header className={`abc-heading abc-heading--${level}`}>
      <h1 id="abc-title">{level === 'page' ? <>题海三千，<br />只取一瓢</> : '题海三千，只取一瓢'}</h1>
      <p>登录后，接着上次的备课。</p>
    </header>
  )
}

function Footer() {
  return <p className="abc-footer">账号需邀请开通 · eqbank.cc</p>
}

/* A 纸在桌上：桌面色底，一张纸，没有獭獭（第 118 条：登录页探头不放）。顶栏位置和登录后首页一样。 */
function VariantA() {
  return (
    <div className="abc-page abc-a">
      <div className="abc-topbar"><Brand /></div>
      <main className="abc-a-main">
        <section className="abc-sheet" aria-labelledby="abc-title">
          <Heading />
          <LoginForm />
        </section>
        <Footer />
      </main>
    </div>
  )
}

/* B 收着的雾海：结构照旧，雾只留雾薄荷一种，去光束，海獭缩小、直接完整出场（不画线稿）。 */
function VariantB() {
  return (
    <div className="abc-page abc-b">
      <div className="abc-b-left">
        <Brand />
        <div className="abc-b-body">
          <Heading level="page" />
          <LoginForm />
        </div>
        <Footer />
      </div>
      <div className="abc-b-scene" aria-hidden="true">
        <div className="abc-b-mist" />
        <div className="abc-b-otter" dangerouslySetInnerHTML={{ __html: otterLineSvg }} />
      </div>
    </div>
  )
}

const SEA = [
  ['阅读 A · 细节理解', 'According to paragraph 2, why did the town close the old bridge?'],
  ['完形 · 第 41 题', 'She paused at the door, ______ whether to knock again.'],
  ['语法填空', 'The museum, ______ (build) in 1925, reopened last spring.'],
  ['七选五', 'Choose the sentence that best fits the gap after paragraph 3.'],
  ['阅读 B · 推理判断', 'What can be inferred about the author’s attitude to city farming?'],
  ['阅读 D · 词义猜测', 'What does the underlined word “resilient” probably mean?'],
  ['完形 · 第 52 题', 'Instead of giving up, the team ______ a new plan.'],
  ['短文改错', 'Last summer I have visited my grandparents in the countryside.'],
  ['阅读 A · 标题', 'Which is the best title for the text?'],
  ['语法填空', 'It was the first time that he ______ (see) the sea.'],
  ['阅读 B · 细节理解', 'How long did the volunteers stay on the island?'],
  ['七选五', 'Which sentence closes the passage most naturally?'],
]

/* C 把口号画出来：右边是一片题（题海），獭獭仰躺浮在上面（otter-float，第 114 条留下的那张），
   前面一张清楚的题就是「一瓢」。 */
function VariantC() {
  return (
    <div className="abc-page abc-c">
      <div className="abc-c-left">
        <Brand />
        <div className="abc-c-body">
          <section className="abc-sheet" aria-labelledby="abc-title">
            <Heading />
            <LoginForm />
          </section>
        </div>
        <Footer />
      </div>
      <div className="abc-c-sea" aria-hidden="true">
        <div className="abc-c-slips">
          {[...SEA, ...SEA.slice().reverse()].map(([tag, line], i) => (
            <div className="abc-c-slip" key={i}>
              <span>{tag}</span>
              <p>{line}</p>
            </div>
          ))}
        </div>
        <div className="abc-c-pick">
          <div className="abc-c-otter" dangerouslySetInnerHTML={{ __html: otterFloatSvg }} />
          <article className="abc-c-card">
            <span>阅读 C · 主旨概括</span>
            <p>What is the passage mainly about?</p>
            <ol>
              <li>How a river was brought back to life.</li>
              <li>Why farmers moved away from the valley.</li>
              <li>What scientists learned from old maps.</li>
              <li>When the first dam was built.</li>
            </ol>
          </article>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [variant, setVariant] = useState<Variant>(readVariant)
  useEffect(() => {
    const onHash = () => setVariant(readVariant())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const clean = new URLSearchParams(window.location.search).has('clean')
  return (
    <>
      {variant === 'a' && <VariantA />}
      {variant === 'b' && <VariantB />}
      {variant === 'c' && <VariantC />}
      {!clean && (
        <nav className="abc-switch" aria-label="切换样张">
          {(['a', 'b', 'c'] as const).map((v) => (
            <a key={v} href={`#${v}`} aria-current={v === variant ? 'page' : undefined}>
              {v === 'a' ? 'A 纸在桌上' : v === 'b' ? 'B 收着的雾海' : 'C 题海'}
            </a>
          ))}
        </nav>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
