import { Tag } from 'lucide-react'
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
        <button
          className="primary-button"
          type="button"
          disabled={backfillStatus === 'loading'}
          onClick={onBackfillTopicLabels}
          title="用 AI 为所有无主题标签的题组批量打标（可安全重跑）"
        >
          <Tag size={14} />
          {backfillStatus === 'loading' ? '打标中…' : '给题库打主题标签'}
        </button>

        {backfillResult !== null && (
          <p className="admin-backfill-summary">
            已标 {backfillResult.labeled}
            <span aria-hidden="true"> · </span>
            跳过 {backfillResult.skipped}
            <span aria-hidden="true"> · </span>
            <span className={failedCount > 0 ? 'admin-backfill-fail' : undefined}>
              失败 {failedCount}
            </span>
          </p>
        )}

        {backfillError ? (
          <p className="admin-backfill-error">{backfillError} 可再试一次。</p>
        ) : null}
      </section>
    </main>
  )
}
