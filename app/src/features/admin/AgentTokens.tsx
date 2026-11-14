import { useEffect, useState } from 'react'
import { Dialog } from '../../shared-ui/Dialog.tsx'
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
    <h2 id="agent-tokens-heading">Agent 口令</h2>
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
      <label>名称<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="例如：组卷 Agent" /></label>
      <button className="ghost-button agent-token-submit" type="submit" disabled={busy || !name.trim()}>{busy ? '保存中…' : '新建口令'}</button>
    </form>
    {secret && <div className="agent-token-secret">
      <p>口令只显示这一次，请妥善保存。离开页面后无法再次查看。</p>
      <code>{secret}</code>
      <button className="ghost-button" type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(secret); setNotice('已复制口令') }
        catch { setError('复制失败，请选中口令后手动复制。') }
      }}>复制口令</button>
      <button className="ghost-button" type="button" onClick={() => setSecret('')}>隐藏口令</button>
    </div>}
    <p role="alert" className="admin-backfill-error">{error}</p>
    <p role="status">{notice}</p>
    {loading ? <p>加载中…</p> : loadFailed ? <p className="agent-token-load-failed">
      口令列表没有加载出来。
      <button type="button" className="ghost-button" onClick={() => { setLoading(true); setLoadAttempt(n => n + 1) }}>重试</button>
    </p> : tokens.length === 0 ? <p>还没有口令。</p> :
      <ul>{tokens.map(item => <li key={item.id}>
        <div><strong>{item.name}</strong><span>{item.revokedAt ? '已作废' : '有效'}</span>
          <small>创建于 {new Date(item.createdAt).toLocaleDateString()} · {item.lastUsedAt ? `最近使用 ${new Date(item.lastUsedAt).toLocaleString()}` : '尚未使用'}</small></div>
        {!item.revokedAt && <button type="button" className="ghost-button" disabled={busy} onClick={() => setRevoking(item)}>作废口令</button>}
      </li>)}</ul>}
    {/* 作废确认：共用 Dialog 的 alert 语气（读屏 alertdialog、确认键危险字），见 design/components-2026-11-13/migrate-dialog/README.md。
      一直挂着、只切 open，退场动画播完再卸载；作废中（busy）Esc 和「保留口令」都不关。 */}
    <Dialog
      tone="alert"
      size="md"
      open={Boolean(revoking)}
      onClose={() => setRevoking(null)}
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
            setRevoking(null); setSecret(''); setNotice(`已作废${revoking.name}`)
          })
        },
      }}
    >
      {error ? <p role="alert" className="admin-backfill-error">{error}</p> : null}
    </Dialog>
  </section>
}
