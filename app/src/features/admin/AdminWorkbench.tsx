import { AgentTokens } from './AgentTokens'
import './adminWorkbench.css'

export function AdminWorkbench() {
  return (
    <main className="admin-workbench" aria-label="管理台">
      <header className="admin-workbench-head">
        <h1>数据维护</h1>
        <p>内容生产在后台完成，这里只放低频维护工具。</p>
      </header>

      <AgentTokens />
    </main>
  )
}
