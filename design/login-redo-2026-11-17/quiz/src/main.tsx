import { createRoot } from 'react-dom/client'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import '../src/index.css'
import './quiz.css'
import { Button } from '../src/shared-ui/Button.tsx'
import { AlertTriangle, Check } from '../src/icons'
import otterFloatSvg from '../../design/brand-2026-10-13/mascot/otter-float.svg?raw'

/* 登录页「题卡」样张（2026-11-17，提案 · 单一来源）。四个方向：1 完形填空卡、2 答题卡、3 阅读题加去向、4 批改反馈。
   用户名、口令只做成空（真输入框，带 autocomplete，读屏念「用户名」「密码」），不做成选项。 */

type Variant = '1' | '2' | '3' | '4'
type Status = 'idle' | 'busy' | 'error' | 'success'
const base = import.meta.env.BASE_URL
const DEMO_KEY = '1234'

function readVariant(): Variant {
  const h = window.location.hash.replace('#', '')
  return h === '2' || h === '3' || h === '4' ? h : '1'
}

/* ---------- 共用 ---------- */

function useLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === 'busy') return
    setStatus('busy')
    window.setTimeout(() => setStatus(password === DEMO_KEY && username ? 'success' : 'error'), 900)
  }
  function edit(next: () => void) {
    next()
    if (status === 'error') setStatus('idle')
  }
  return {
    username, password, status, setStatus, submit,
    setUsername: (v: string) => edit(() => setUsername(v)),
    setPassword: (v: string) => edit(() => setPassword(v)),
  }
}
type Login = ReturnType<typeof useLogin>

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

function Sea() {
  const slips = Array.from({ length: 72 }, (_, i) => SEA[(i * 5) % SEA.length])
  return (
    <div className="q-sea" aria-hidden="true">
      {slips.map(([tag, line], i) => (
        <div className="q-slip" key={i}><span>{tag}</span><p>{line}</p></div>
      ))}
    </div>
  )
}

function Brand() {
  return (
    <div className="q-brand">
      <img src={`${base}brand/mark.svg`} width={32} height={20} alt="" />
      <img src={`${base}brand/wordmark.svg`} width={31} height={20} alt="獭石" />
    </div>
  )
}

function Shell({ children, otter }: { children: ReactNode; otter: boolean }) {
  return (
    <div className="q-page">
      <Sea />
      <div className="q-topbar"><Brand /></div>
      <main className="q-main">
        {otter && <div className="q-otter" aria-hidden="true" dangerouslySetInnerHTML={{ __html: otterFloatSvg }} />}
        {children}
        <p className="q-footer">账号需邀请开通 · eqbank.cc</p>
      </main>
    </div>
  )
}

/* 卷面上的一个空：题号 + 下划线输入。批改时出错标红线，对了后面打一个墨色小勾。 */
function Blank({ no, label, type = 'text', autoComplete, value, onChange, login, width = '9em' }: {
  no: string; label: string; type?: string; autoComplete: string; value: string; onChange: (v: string) => void; login: Login; width?: string
}) {
  const id = useId()
  return (
    <span className="q-blank" data-invalid={login.status === 'error' ? '' : undefined} data-ok={login.status === 'success' ? '' : undefined}>
      <span className="q-no" aria-hidden="true">{no}</span>
      <label className="visually-hidden" htmlFor={id}>{label}</label>
      <input
        id={id} type={type} autoComplete={autoComplete} value={value} style={{ width }}
        onChange={(e) => onChange(e.target.value)} disabled={login.status === 'busy' || login.status === 'success'}
        aria-invalid={login.status === 'error' || undefined} required
      />
      {login.status === 'success' && <Check className="q-tick" size={16} aria-hidden="true" />}
    </span>
  )
}

/* 批改的那一行：出错不说是哪一空错了（不告诉别人这个用户名存不存在），两空一起标。 */
function Marking({ login, nos, success = '两空都对，正在进入。', idle }: { login: Login; nos: string; success?: string; idle?: string }) {
  return (
    <div className="q-marking" role="status" aria-live="polite">
      {(login.status === 'idle' || login.status === 'busy') && idle && <span className="q-aside">{idle}</span>}
      {login.status === 'error' && (
        <p data-kind="error"><AlertTriangle size={16} aria-hidden="true" /><span>{nos.includes('、') && /\d/.test(nos) ? `第 ${nos} 空再看看：用户名或口令不对。` : nos}</span></p>
      )}
      {login.status === 'success' && (
        <p data-kind="ok"><Check size={16} aria-hidden="true" /><span>{success}</span></p>
      )}
    </div>
  )
}

function Submit({ login }: { login: Login }) {
  return (
    <Button className="q-submit" type="submit" tone="solid" size="pill" busy={login.status === 'busy' || login.status === 'success'}>
      登录
    </Button>
  )
}

/* ---------- 1 完形填空卡 ---------- */

function ClozeCard({ login, forced }: { login: Login; forced?: boolean }) {
  const [lang, setLang] = useState<'zh' | 'en'>('zh')
  const u = <Blank no="41" label="用户名" autoComplete="username" value={login.username} onChange={login.setUsername} login={login} />
  const p = <Blank no="42" label="密码" type="password" autoComplete="current-password" value={login.password} onChange={login.setPassword} login={login} width="7em" />
  return (
    <form className="q-card q-card--cloze" onSubmit={login.submit} aria-labelledby="q-title">
      <header className="q-card-head">
        <span className="q-tag">阅读 · 完形填空</span>
        <div className="q-lang" role="group" aria-label="正文语言">
          <button type="button" aria-pressed={lang === 'zh'} onClick={() => setLang('zh')}>中</button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
        </div>
      </header>
      <h1 id="q-title" className="visually-hidden">登录獭石</h1>
      {lang === 'zh' ? (
        <p className="q-passage">题海三千，只取一瓢。<br />今天来取这一瓢的是 {u}，<br />口令是 {p}。</p>
      ) : (
        <p className="q-passage q-passage--en">A sea of questions; take just one scoop.<br />Today’s scoop is for {u},<br />and the key is {p}.</p>
      )}
      <div className="q-actions">
        <Submit login={login} />
        <Marking login={login} nos="41、42" idle={forced ? undefined : '回车也能交卷'} />
      </div>
    </form>
  )
}

/* ---------- 2 答题卡 ---------- */

const BUBBLES = 'BADCCABDBACDDBCA'
function AnswerSheet({ login }: { login: Login }) {
  const uid = useId()
  const pid = useId()
  return (
    <form className="q-card q-sheet" onSubmit={login.submit} aria-labelledby="q-sheet-title">
      <span className="q-reg q-reg--tl" aria-hidden="true" /><span className="q-reg q-reg--tr" aria-hidden="true" />
      <span className="q-reg q-reg--bl" aria-hidden="true" /><span className="q-reg q-reg--br" aria-hidden="true" />
      <header className="q-sheet-head">
        <h1 id="q-sheet-title">獭石 · 答题卡</h1>
        <p>题海三千，只取一瓢</p>
      </header>
      <div className="q-sheet-top">
        <div className="q-sheet-fields">
          <div className="q-box" data-invalid={login.status === 'error' ? '' : undefined}>
            <label htmlFor={uid}>姓名<span className="visually-hidden">（用户名）</span></label>
            <input id={uid} autoComplete="username" value={login.username} onChange={(e) => login.setUsername(e.target.value)}
              disabled={login.status === 'busy' || login.status === 'success'} aria-invalid={login.status === 'error' || undefined} required />
            {login.status === 'success' && <Check className="q-tick" size={16} aria-hidden="true" />}
            <small aria-hidden="true">填用户名</small>
          </div>
          <div className="q-box" data-invalid={login.status === 'error' ? '' : undefined}>
            <label htmlFor={pid}>考号<span className="visually-hidden">（密码）</span></label>
            <input id={pid} className="q-cells" type="password" autoComplete="current-password" value={login.password} onChange={(e) => login.setPassword(e.target.value)}
              disabled={login.status === 'busy' || login.status === 'success'} aria-invalid={login.status === 'error' || undefined} required />
            {login.status === 'success' && <Check className="q-tick" size={16} aria-hidden="true" />}
            <small aria-hidden="true">填口令，一格一个字</small>
          </div>
        </div>
        <div className="q-barcode" aria-hidden="true">
          <span>条形码粘贴区</span>
          <div className="q-barcode-mark"><Brand /></div>
        </div>
      </div>
      <div className="q-rules">
        <strong>注意事项</strong>
        <ol>
          <li>姓名填用户名，考号填口令。</li>
          <li>账号需邀请开通。</li>
          <li>回车也能交卷。</li>
        </ol>
      </div>
      <div className="q-bubbles" aria-hidden="true">
        {BUBBLES.split('').map((ans, i) => (
          <div className="q-bubble-row" key={i}>
            <span className="q-bubble-no">{i + 1}</span>
            {'ABCD'.split('').map((c) => <span key={c} className="q-bubble" data-filled={c === ans && i < 7 ? '' : undefined}>{c}</span>)}
          </div>
        ))}
      </div>
      <div className="q-actions">
        <Submit login={login} />
        <Marking login={login} nos="姓名、考号再看看：用户名或口令不对。" success="对上了，正在进入。" />
      </div>
    </form>
  )
}

/* ---------- 3 阅读题 + 去向 ---------- */

const PLACES = [
  ['last', '接着上次的备课'],
  ['find', '找题'],
  ['compose', '组卷'],
  ['words', '过生词'],
] as const

function ReadingCard({ login, showWhere }: { login: Login; showWhere: boolean }) {
  const uid = useId()
  const pid = useId()
  const [where, setWhere] = useState<(typeof PLACES)[number][0]>('last')
  const place = PLACES.find(([k]) => k === where)![1]
  return (
    <form className="q-card q-card--reading" onSubmit={login.submit} aria-labelledby="q-reading-title">
      <header className="q-card-head"><span className="q-tag">阅读 C · 细节理解</span></header>
      <h1 id="q-reading-title" className="visually-hidden">登录獭石</h1>
      <p className="q-passage q-passage--small">獭石是给英语老师用的题库。题海三千，只取一瓢：从里面挑出今天要用的那几道，排成一份卷子，导出就能打印。</p>
      <ol className="q-items">
        <li>
          <label htmlFor={uid} className="q-stem"><span className="q-qno">41.</span>你是哪位老师？<span className="visually-hidden">（用户名）</span></label>
          <span className="q-answer" data-invalid={login.status === 'error' ? '' : undefined}>
            <input id={uid} autoComplete="username" value={login.username} onChange={(e) => login.setUsername(e.target.value)}
              disabled={login.status === 'busy' || login.status === 'success'} aria-invalid={login.status === 'error' || undefined} required />
            {login.status === 'success' && <Check className="q-tick" size={16} aria-hidden="true" />}
          </span>
        </li>
        <li>
          <label htmlFor={pid} className="q-stem"><span className="q-qno">42.</span>你的口令是？<span className="visually-hidden">（密码）</span></label>
          <span className="q-answer" data-invalid={login.status === 'error' ? '' : undefined}>
            <input id={pid} type="password" autoComplete="current-password" value={login.password} onChange={(e) => login.setPassword(e.target.value)}
              disabled={login.status === 'busy' || login.status === 'success'} aria-invalid={login.status === 'error' || undefined} required />
            {login.status === 'success' && <Check className="q-tick" size={16} aria-hidden="true" />}
          </span>
        </li>
        {showWhere && (
          <li>
            <fieldset className="q-choices">
              <legend className="q-stem"><span className="q-qno">43.</span>今天先做什么？</legend>
              {PLACES.map(([key, text], i) => (
                <label key={key} className="q-choice" data-checked={where === key ? '' : undefined}>
                  <input type="radio" name="where" value={key} checked={where === key} onChange={() => setWhere(key)} />
                  <span className="q-choice-letter">{'ABCD'[i]}</span>
                  <span>{text}</span>
                </label>
              ))}
            </fieldset>
          </li>
        )}
      </ol>
      <div className="q-actions">
        <Submit login={login} />
        <Marking login={login} nos="41、42" success={showWhere ? `两题都对，正在去「${place}」。` : '两题都对，正在进入。'} />
      </div>
    </form>
  )
}

/* ---------- 4 批改反馈：同一张完形填空卡，四种状态并排 ---------- */

function useForcedLogin(status: Status) {
  const login = useLogin()
  return { ...login, username: 'wang.laoshi', password: 'abcdefgh', status, submit: (e: FormEvent<HTMLFormElement>) => e.preventDefault() }
}

function Feedback() {
  const states: Array<[Status, string]> = [['idle', '填好了'], ['busy', '等待中'], ['error', '用户名或口令不对'], ['success', '对了，进入']]
  return (
    <div className="q-feedback-grid">
      {states.map(([s, title]) => <FeedbackCell key={s} status={s} title={title} />)}
    </div>
  )
}
function FeedbackCell({ status, title }: { status: Status; title: string }) {
  const login = useForcedLogin(status)
  return (
    <figure className="q-feedback-cell">
      <figcaption>{title}</figcaption>
      <ClozeCard login={login} forced />
    </figure>
  )
}

/* ---------- 页面 ---------- */

function App() {
  const [variant, setVariant] = useState<Variant>(readVariant)
  const [otter, setOtter] = useState(false)
  const [showWhere, setShowWhere] = useState(true)
  const login = useLogin()
  useEffect(() => {
    const onHash = () => setVariant(readVariant())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => { login.setStatus('idle') }, [variant]) // eslint-disable-line react-hooks/exhaustive-deps
  const params = new URLSearchParams(window.location.search)
  const clean = params.has('clean')
  const forceOtter = params.has('otter')
  return (
    <>
      <Shell otter={(otter || forceOtter) && variant !== '4'}>
        {variant === '1' && <ClozeCard login={login} />}
        {variant === '2' && <AnswerSheet login={login} />}
        {variant === '3' && <ReadingCard login={login} showWhere={showWhere} />}
        {variant === '4' && <Feedback />}
      </Shell>
      {!clean && (
        <aside className="q-switch" aria-label="样张控制">
          <nav aria-label="切换样张">
            {(['1', '2', '3', '4'] as const).map((v) => (
              <a key={v} href={`#${v}`} aria-current={v === variant ? 'page' : undefined}>
                {v === '1' ? '1 完形填空' : v === '2' ? '2 答题卡' : v === '3' ? '3 阅读题 + 去向' : '4 批改反馈'}
              </a>
            ))}
          </nav>
          <div className="q-switch-row">
            <label><input type="checkbox" checked={otter} onChange={(e) => setOtter(e.target.checked)} /> 獭獭</label>
            {variant === '3' && <label><input type="checkbox" checked={showWhere} onChange={(e) => setShowWhere(e.target.checked)} /> 第 43 题</label>}
            <span>样张不连账号：口令填 {DEMO_KEY} 看「对了」，别的看「出错」</span>
          </div>
        </aside>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
