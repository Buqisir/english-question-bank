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
  return (
    <main className="admin-workbench" aria-label="管理台">
      <section className="library-panel admin-panel" aria-label="数据维护">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>数据维护</h2>
          </div>
        </div>
        <p className="admin-panel-note">
          内容生产在后台 Agent 完成，这里只放低频维护工具。
        </p>
        <div className="admin-action-row">
          <button
            className="ghost-button"
            type="button"
            disabled={backfillStatus === 'loading'}
            onClick={onBackfillTopicLabels}
            title="用 AI 为所有无主题标签的题组批量打标（可安全重跑）"
          >
            <Tag size={16} />
            {backfillStatus === 'loading' ? '打标中…' : '给题库打主题标签'}
          </button>
          {backfillResult !== null && (
            <span
              className="backfill-summary"
              style={{ color: 'var(--muted)', fontSize: 13, alignSelf: 'center' }}
              title="主题标签回填结果"
            >
              已标 {backfillResult.labeled} / 跳过 {backfillResult.skipped} / 失败 {backfillResult.failed.length}
            </span>
          )}
          {backfillError && (
            <span
              className="backfill-error"
              style={{ color: 'var(--coral-text)', fontSize: 13, alignSelf: 'center' }}
              title={backfillError}
            >
              打标失败
            </span>
          )}
        </div>
      </section>
    </main>
  )
}
