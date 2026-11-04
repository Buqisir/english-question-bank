import { useEffect, useState } from 'react'
import { useModalDialog } from '../../components/useModalDialog'
import { errorFromResponse } from '../../services/httpClient'

type AgentToken = { id: string; name: string; scope: 'published' | 'test'; createdAt: string; revokedAt: string | null; lastUsedAt: string | null }
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
  const [scope, setScope] = useState<AgentToken['scope']>('published')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<AgentToken | null>(null)
  const dialog = useModalDialog(Boolean(revoking))
  useEffect(() => {
    let active = true
    request().then(data => { if (active) setTokens(data.tokens) })
      .catch(() => { if (active) setError('加载口令失败，刷新页面后重试。') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function mutate(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await action() }
    catch { setError('口令操作失败，检查连接后重试。') }
    finally { setBusy(false) }
  }
  return <section className="agent-tokens" aria-labelledby="agent-tokens-heading">
    <h2 id="agent-tokens-heading">Agent 口令</h2>
    <p>正式范围只读已发布卷；测试范围另含待审卷。两种范围都包含答案。</p>
    <form onSubmit={event => {
      event.preventDefault()
      void mutate(async () => {
        const created = await request('', { name, scope })
        setSecret(created.token); setName('')
        const { token: _token, ...item } = created
        setTokens(current => [item, ...current])
      })
    }}>
      <label>名称<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="例如：组卷 Agent" /></label>
      <label>范围<select value={scope} onChange={event => setScope(event.target.value as AgentToken['scope'])}>
        <option value="published">正式</option><option value="test">测试</option>
      </select></label>
      <button className="ghost-button" type="submit" disabled={busy || !name.trim()}>{busy ? '保存中…' : '新建口令'}</button>
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
    {loading ? <p>加载中…</p> : tokens.length === 0 ? <p>还没有口令。填写名称并新建口令即可开始。</p> :
      <ul>{tokens.map(item => <li key={item.id}>
        <div><strong>{item.name}</strong><span>{item.scope === 'test' ? '测试' : '正式'} · {item.revokedAt ? '已作废' : '有效'}</span>
          <small>创建于 {new Date(item.createdAt).toLocaleDateString()} · {item.lastUsedAt ? `最近使用 ${new Date(item.lastUsedAt).toLocaleString()}` : '尚未使用'}</small></div>
        {!item.revokedAt && <button type="button" className="ghost-button" disabled={busy} onClick={() => setRevoking(item)}>作废口令</button>}
      </li>)}</ul>}
    {revoking && <dialog ref={dialog} className="agent-token-dialog" aria-labelledby="agent-revoke-title" onCancel={event => { event.preventDefault(); if (!busy) setRevoking(null) }}>
      <h2 id="agent-revoke-title">作废「{revoking.name}」？</h2>
      <p>使用这条口令的 Agent 将立即失去访问权限，作废后无法恢复。</p>
      <p role="alert" className="admin-backfill-error">{error}</p>
      <div>
        <button type="button" className="ghost-button" disabled={busy} onClick={() => setRevoking(null)}>保留口令</button>
        <button type="button" className="ghost-button" disabled={busy} onClick={() => void mutate(async () => {
          await request(`/${encodeURIComponent(revoking.id)}/revoke`, {})
          setTokens(current => current.map(item => item.id === revoking.id ? { ...item, revokedAt: new Date().toISOString() } : item))
          setRevoking(null); setSecret(''); setNotice(`已作废${revoking.name}`)
        })}>{busy ? '作废中…' : `作废「${revoking.name}」`}</button>
      </div>
    </dialog>}
  </section>
}
