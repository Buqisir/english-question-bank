import { useEffect, useRef, useState } from 'react'
import { Button } from '../../shared-ui/Button.tsx'
import { Dialog } from '../../shared-ui/Dialog.tsx'
import { TextField } from '../../shared-ui/Field.tsx'
import { Notice } from '../../shared-ui/Notice.tsx'
import { planFocusAfterRemoval, programmaticFocusTarget } from '../../shared-ui/focusAfterRemoval.ts'
import { Skeleton, SkeletonGate } from '../../shared-ui/Skeleton.tsx'
import { Surface } from '../../shared-ui/Surface.tsx'
import { useDelayedBusy } from '../../shared-ui/useDelayedBusy.ts'
import { useRowReveal } from '../../shared-ui/useRowReveal.ts'
import { errorFromResponse } from '../../services/httpClient'

const scopeLabels = { read: '读取试卷', 'report:append': '上报问题', 'drafts:write': '写入草稿' }
type AgentScope = keyof typeof scopeLabels
type AgentToken = { id: string; name: string; scope: AgentScope[]; createdAt: string; revokedAt: string | null; lastUsedAt: string | null }
const endpoint = '/api/admin/agent-tokens'
async function request(path = '', body?: object) {
  const response = await fetch(endpoint + path, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : undefined)
  if (!response.ok) throw await errorFromResponse(response, '口令操作失败，请重试。')
  return response.json()
}

// 口令列表在等时的灰块（等待第六轮，2026-11-15；原来是一行「加载中」）。照真列表画 3 行：名字和状态一行、创建时间一行小字、
// 右边「作废口令」的字；用真列表的 ul / li / strong / span / small（adminWorkbench.css .agent-tokens li，一行 64 高），灰块放在字的位置。
const TOKEN_SKELETON_NAME_WIDTHS = [72, 64, 80]

function AgentTokenListSkeleton() {
  return <ul aria-hidden="true">{TOKEN_SKELETON_NAME_WIDTHS.map((width, index) => <li key={index}>
    <div><strong><Skeleton inline width={width} height={12} /></strong><span><Skeleton inline width={28} height={10} /></span>
      <small><Skeleton inline width={160} height={10} /></small></div>
    <Skeleton className="agent-token-skeleton-action" width={52} height={12} />
  </li>)}</ul>
}

export function AgentTokens() {
  const [tokens, setTokens] = useState<AgentToken[]>([])
  const [name, setName] = useState('')
  const [scope, setScope] = useState<AgentScope[]>(['read'])
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  // 正在新建（和作废分开记）：只有新建时「新建口令」键才显示在等。
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [revoking, setRevoking] = useState<AgentToken | null>(null)
  // 作废以后这一行的「作废口令」键没了，焦点照 shared-ui/focusAfterRemoval.ts 的规则落到下一行 / 上一行的同一个键，
  // 都没有就落到「Agent 口令」标题（构件收尾 2026-11-15）。取消、Esc 不走这条，回到打开它的键。
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusAfterRevokeRef = useRef<(() => HTMLElement | null) | null>(null)
  const revokedRef = useRef(false)
  // 等待第四轮（2026-11-15）：口令列表第一次读回来时一行行依次淡入；新建、作废、重试都不再演（once）。
  const sectionRef = useRef<HTMLElement>(null)
  // 等待第六轮（2026-11-15）：读取中画 3 行灰块，走门槛（300ms 内不出、出了至少留 500ms，这期间列表到了也先不换上）。
  // listWaiting = 灰块那一块还占着位置；列表等它走了才挂，淡入也等那一拍。
  const listPhase = useDelayedBusy(loading)
  const listWaiting = loading || listPhase === 'waiting'
  useRowReveal(sectionRef, ':scope > ul > li', !listWaiting && !loadFailed && tokens.length > 0, { once: true })
  useEffect(() => {
    let active = true
    request().then(data => { if (active) { setTokens(data.tokens); setLoadFailed(false) } })
      .catch(() => { if (active) setLoadFailed(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadAttempt])

  async function mutate(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await action() }
    catch { setError('口令操作失败，检查连接后重试。') }
    finally { setBusy(false) }
  }
  return <section ref={sectionRef} className="agent-tokens" aria-labelledby="agent-tokens-heading">
    <h2 id="agent-tokens-heading" ref={headingRef}>Agent 口令</h2>
    <form onSubmit={event => {
      event.preventDefault()
      setCreating(true)
      setSecret('')
      void mutate(async () => {
        const { token, ...item }: AgentToken & { token: string } = await request('', { name, scope })
        if (!Array.isArray(item.scope) || item.scope.length !== scope.length || !scope.every(value => item.scope.includes(value))) {
          try {
            await request(`/${encodeURIComponent(item.id)}/revoke`, {})
            setError('口令权限与所选权限不符，已作废新口令。')
          } catch {
            setLoading(true)
            setLoadAttempt(n => n + 1)
            setError('口令权限与所选权限不符。自动作废失败，请在列表中作废新口令。')
          }
          return
        }
        setSecret(token); setName(''); setScope(['read'])
        setTokens(current => [item, ...current])
      }).finally(() => setCreating(false))
    }}>
      {/* 字段构件第二轮（2026-11-15）：换成 shared-ui/TextField 大号（36，和旁边「新建口令」同高），字没改。 */}
      <TextField className="agent-token-name" label="名称" size="lg" required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="例如：组卷 Agent" />
      {/* 等待第二轮（2026-11-15，DESIGN.md §5 Waiting）：原生 .ghost-button 换成 Button 墨字大号（同高 36、同 13 / 500、墨字），
          一圈边照旧由 .agent-token-submit 画。新建中用 busy：字不换（原来换成「保存中…」）、宽度不变，字隐去、所以点在正中。 */}
      <Button tone="strong" size="lg" className="agent-token-submit" type="submit" busy={creating} disabled={!creating && (busy || !name.trim() || !scope.length)}>新建口令</Button>
      <fieldset className="agent-token-scopes" disabled={busy}>
        <legend>权限</legend>
        {(Object.keys(scopeLabels) as AgentScope[]).map(item => <label key={item}>
          <input type="checkbox" checked={scope.includes(item)} onChange={event => {
            const checked = event.target.checked
            setScope(current => checked ? [...current, item] : current.filter(value => value !== item))
          }} />
          {scopeLabels[item]}
        </label>)}
      </fieldset>
    </form>
    {secret && <Surface padding="md" className="agent-token-secret">
      <p>口令只显示这一次，请妥善保存。离开页面后无法再次查看。</p>
      <code>{secret}</code>
      <button className="ghost-button" type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(secret); setNotice('已复制口令') }
        catch { setError('复制失败，请选中口令后手动复制。') }
      }}>复制口令</button>
      <button className="ghost-button" type="button" onClick={() => setSecret('')}>隐藏口令</button>
    </Surface>}
    {/* 口令操作出错（界面收尾 2026-11-16）：原来是常驻的空 <p role="alert">，换成共用 Notice，有错才挂，字没改。
        新挂上的 role="alert" 读屏照样立刻念；每次操作前 mutate 先清空 error，同一句错连出两次也会重新挂、重新念。
        不上危险色：口令没建成 / 没作废，名称还在框里，不算 §5 说的「没保存」「会丢东西」。 */}
    {error ? <Notice kind="error">{error}</Notice> : null}
    <p role="status">{notice}</p>
    {/* 读取失败换成共用 Notice（构件收尾 2026-11-15），字没改；「重试」由 Notice 行尾的键画。
        读取中原来也是一行 Notice「加载中」，等待第六轮换成 3 行灰块。 */}
    {listWaiting ? <SkeletonGate pending={loading} phase={listPhase} label="口令列表加载中" skeleton={<AgentTokenListSkeleton />} /> : loadFailed ? <Notice kind="error" className="agent-token-load-failed"
      action={{ label: '重试', onClick: () => { setLoading(true); setLoadAttempt(n => n + 1) } }}>口令列表没有加载出来。</Notice> : tokens.length === 0 ? <p>还没有口令。</p> :
      <ul>{tokens.map(item => <li key={item.id} data-token-id={item.id}>
        <div><strong>{item.name}</strong><span>{item.revokedAt ? '已作废' : '有效'}</span>
          <small>创建于 {new Date(item.createdAt).toLocaleDateString()} · {item.lastUsedAt ? `最近使用 ${new Date(item.lastUsedAt).toLocaleString()}` : '尚未使用'}</small>
          <small>{(item.scope ?? ['read']).map(scope => scopeLabels[scope]).join(' · ')}</small></div>
        {!item.revokedAt && <button type="button" className="ghost-button agent-token-revoke" disabled={busy} onClick={(event) => {
          focusAfterRevokeRef.current = planFocusAfterRemoval(event.currentTarget, {
            item: '.agent-tokens li', key: 'data-token-id', control: '.agent-token-revoke',
            fallback: () => programmaticFocusTarget(headingRef.current),
          })
          revokedRef.current = false
          setRevoking(item)
        }}>作废口令</button>}
      </li>)}</ul>}
    {/* 作废确认：共用 Dialog 的 alert 语气（读屏 alertdialog、确认键危险字），见 design/components-2026-11-13/migrate-dialog/README.md。
      一直挂着、只切 open，退场动画播完再卸载；作废中（busy）Esc 和「保留口令」都不关。 */}
    <Dialog
      tone="alert"
      size="md"
      open={Boolean(revoking)}
      onClose={() => setRevoking(null)}
      returnFocus={() => (revokedRef.current ? focusAfterRevokeRef.current?.() ?? null : null)}
      busy={busy}
      className="agent-token-dialog"
      title={`作废「${revoking?.name ?? ''}」？`}
      description="使用这条口令的 Agent 将立即失去访问权限，作废后无法恢复。"
      cancel={{ label: '保留口令' }}
      confirm={{
        // 作废中：键上的字不换、不变淡，用 Button busy（门槛过了字隐去、所以点放在正中；DESIGN.md §5 Waiting）。
        label: `作废「${revoking?.name ?? ''}」`,
        busy,
        onClick: () => {
          if (!revoking) return
          void mutate(async () => {
            await request(`/${encodeURIComponent(revoking.id)}/revoke`, {})
            setTokens(current => current.map(item => item.id === revoking.id ? { ...item, revokedAt: new Date().toISOString() } : item))
            revokedRef.current = true
            setRevoking(null); setSecret(''); setNotice(`已作废${revoking.name}`)
          })
        },
      }}
    >
      {/* 作废没成功：写在框里（框不关），同样换成 Notice，字没改。 */}
      {error ? <Notice kind="error">{error}</Notice> : null}
    </Dialog>
  </section>
}

type AgentReport = {
  id: string; tokenName: string; paperId: string; questionId: string | null; groupId: string | null
  kind: string; note: string; createdAt: string; status: 'pending'
}

export function AgentReports() {
  const [reports, setReports] = useState<AgentReport[]>([])
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [pageRequest, setPageRequest] = useState({ offset: 0 })
  useEffect(() => {
    const controller = new AbortController()
    const { offset } = pageRequest
    const query = offset === 0 ? '' : `?offset=${offset}`
    fetch(`/api/admin/agent-reports${query}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw await errorFromResponse(response, '上报列表读取失败。')
      const data: { reports: AgentReport[]; nextOffset: number | null } = await response.json()
      if (controller.signal.aborted) return
      setReports(current => {
        if (offset === 0) return data.reports
        const seen = new Set(current.map(report => report.id))
        return [...current, ...data.reports.filter(report => !seen.has(report.id))]
      })
      setNextOffset(data.nextOffset ?? null)
      setLoading(false)
    }).catch(() => {
      if (!controller.signal.aborted) { setFailed(true); setLoading(false) }
    })
    return () => controller.abort()
  }, [pageRequest])

  function loadPage(offset: number) {
    setFailed(false)
    setLoading(true)
    setPageRequest({ offset })
  }

  return <section className="agent-reports" aria-labelledby="agent-reports-heading">
    <h2 id="agent-reports-heading">Agent 上报</h2>
    {loading && reports.length === 0 ? <Notice kind="waiting">正在读取上报</Notice> :
      failed && reports.length === 0 ? <Notice kind="error" action={{ label: '重试', onClick: () => loadPage(0) }}>上报列表没有加载出来。</Notice> :
      reports.length === 0 ? <p>还没有上报记录。</p> :
      <ul>{reports.map(item => <li key={item.id}>
        <div>
          <strong>{item.kind}</strong><span>{item.status === 'pending' ? '待处理' : item.status}</span>
          <p>{item.note}</p>
          <small><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time> · {item.tokenName}</small>
          <small>卷 {item.paperId} · {item.questionId ? `题 ${item.questionId}` : `题组 ${item.groupId}`}</small>
        </div>
      </li>)}</ul>}
    {failed && reports.length > 0 && <Notice kind="error">更多上报没有加载出来。</Notice>}
    {nextOffset !== null && <Button tone="strong" size="sm" busy={loading} onClick={() => loadPage(nextOffset)}>加载更多</Button>}
  </section>
}
