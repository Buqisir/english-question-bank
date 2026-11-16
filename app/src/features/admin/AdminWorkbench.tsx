import { Tag } from '../../icons'
import { Button } from '../../shared-ui/Button.tsx'
import { AgentTokens } from './AgentTokens'
import type { BackfillTopicLabelsResult } from '../../services/questionGroups'
import './adminWorkbench.css'

type AdminWorkbenchProps = {
  backfillStatus: 'idle' | 'loading'
  backfillResult: BackfillTopicLabelsResult | null
  backfillError: string
  onBackfillTopicLabels: () => void
}

export function AdminWorkbench({
  backfillStatus,
  backfillResult,
  backfillError,
  onBackfillTopicLabels,
}: AdminWorkbenchProps) {
  const failedCount = backfillResult?.failed.length ?? 0

  return (
    <main className="admin-workbench" aria-label="管理台">
      <header className="admin-workbench-head">
        <h1>数据维护</h1>
        <p>内容生产在后台完成，这里只放低频维护工具。</p>
      </header>

      <section className="admin-tool" aria-label="给题库打主题标签">
        {/* 等待第二轮（2026-11-15，DESIGN.md §5 Waiting）：原生 .primary-button 换成 Button 石板墨填充（solid，同高 32、
            同 13 / 600、同 6px 图标间距、同禁用样子）。打标中用 busy：字不换（原来换成「打标中…」）、宽度不变，
            过了门槛图标换成所以点；读屏的「正在打标」仍在下面那行 status 里。 */}
        <Button
          tone="solid"
          icon={<Tag size={14} />}
          busy={backfillStatus === 'loading'}
          onClick={onBackfillTopicLabels}
          title="用 AI 为所有无主题标签的题组批量打标（可安全重跑）"
        >
          给题库打主题标签
        </Button>

        <p className="admin-backfill-summary" role="status" aria-atomic="true">
          {backfillStatus === 'loading' ? <span className="visually-hidden">正在打标…</span> : backfillResult !== null && <>
            已标 {backfillResult.labeled}
            <span aria-hidden="true"> · </span>
            跳过 {backfillResult.skipped}
            <span aria-hidden="true"> · </span>
            <span className={failedCount > 0 ? 'admin-backfill-fail' : undefined}>
              失败 {failedCount}
            </span>
          </>}
        </p>

        <p className="admin-backfill-error" role="alert" aria-atomic="true">
          {backfillError ? `${backfillError} 可再试一次。` : null}
        </p>
      </section>
      <AgentTokens />
    </main>
  )
}
