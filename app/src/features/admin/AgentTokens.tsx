import { useEffect, useRef, useState } from 'react'
import { Dialog } from '../../shared-ui/Dialog.tsx'
import { TextField } from '../../shared-ui/Field.tsx'
import { Notice } from '../../shared-ui/Notice.tsx'
import { planFocusAfterRemoval, programmaticFocusTarget } from '../../shared-ui/focusAfterRemoval.ts'
import { Surface } from '../../shared-ui/Surface.tsx'
import { errorFromResponse } from '../../services/httpClient'

type AgentToken = { id: string; name: string; createdAt: string; revokedAt: string | null; lastUsedAt: string | null }
const endpoint = '/api/admin/agent-tokens'
async function request(path = '', body?: object) {
  const response = await fetch(endpoint + path, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : undefined)
  if (!response.ok) throw await errorFromResponse(response, '口令操作失败，请重试。')
  return response.json()
}

export function AgentTokens() {
  const [tokens, setTokens] = useState<AgentToken[]>([])
  const [name, setName] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [revoking, setRevoking] = useState<AgentToken | null>(null)
  // 作废以后这一行的「作废口令」键没了，焦点照 shared-ui/focusAfterRemoval.ts 的规则落到下一行 / 上一行的同一个键，
  // 都没有就落到「Agent 口令」标题（构件收尾 2026-11-15）。取消、Esc 不走这条，回到打开它的键。
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusAfterRevokeRef = useRef<(() => HTMLElement | null) | null>(null)
  const revokedRef = useRef(false)
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
  return <section className="agent-tokens" aria-labelledby="agent-tokens-heading">
    <h2 id="agent-tokens-heading" ref={headingRef}>Agent 口令</h2>
    <p>口令可只读访问已发布卷，包含来源答案。</p>
    <form onSubmit={event => {
      event.preventDefault()
      void mutate(async () => {
        const created = await request('', { name })
        setSecret(created.token); setName('')
        const { token: _token, ...item } = created
        setTokens(current => [item, ...current])
      })
    }}>
      {/* 字段构件第二轮（2026-11-15）：换成 shared-ui/TextField 大号（36，和旁边「新建口令」同高），字没改。 */}
      <TextField className="agent-token-name" label="名称" size="lg" required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="例如：组卷 Agent" />
      <button className="ghost-button agent-token-submit" type="submit" disabled={busy || !name.trim()}>{busy ? '保存中…' : '新建口令'}</button>
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
    <p role="alert" className="admin-backfill-error">{error}</p>
    <p role="status">{notice}</p>
    {/* 读取中、读取失败两行换成共用 Notice（构件收尾 2026-11-15），字没改；「重试」由 Notice 行尾的键画。 */}
    {loading ? <Notice kind="waiting">加载中…</Notice> : loadFailed ? <Notice kind="error" className="agent-token-load-failed"
      action={{ label: '重试', onClick: () => { setLoading(true); setLoadAttempt(n => n + 1) } }}>口令列表没有加载出来。</Notice> : tokens.length === 0 ? <p>还没有口令。</p> :
      <ul>{tokens.map(item => <li key={item.id} data-token-id={item.id}>
        <div><strong>{item.name}</strong><span>{item.revokedAt ? '已作废' : '有效'}</span>
          <small>创建于 {new Date(item.createdAt).toLocaleDateString()} · {item.lastUsedAt ? `最近使用 ${new Date(item.lastUsedAt).toLocaleString()}` : '尚未使用'}</small></div>
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
        label: busy ? '作废中…' : `作废「${revoking?.name ?? ''}」`,
        disabled: busy,
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
      {error ? <p role="alert" className="admin-backfill-error">{error}</p> : null}
    </Dialog>
  </section>
}
