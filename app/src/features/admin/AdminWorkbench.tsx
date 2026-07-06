import { FileText, Plus, RefreshCw, Sparkles, Tag } from 'lucide-react'
import type {
  BasketItem,
  PaperSetSummary,
  PaperWorkflow,
  QuestionGroupCard,
} from '../../domain/questionBank'
import { groupTypeLabel } from '../../domain/questionBank'
import type { BackfillTopicLabelsResult } from '../../services/questionGroups'
import './adminWorkbench.css'

type AdminWorkbenchProps = {
  onOpenImportPanel: () => void
  onOpenPaperImportAiWorkbench: () => void
  backfillStatus: 'idle' | 'loading'
  backfillResult: BackfillTopicLabelsResult | null
  backfillError: string
  onBackfillTopicLabels: () => void
  paperWorkflows: PaperWorkflow[]
  paperWorkflowsStatus: 'loading' | 'loaded' | 'error'
  paperWorkflowsError: string
  paperWorkflowStatusHint: Record<PaperWorkflow['status'], string>
  workflowSummary: { total: number; ready: number; review: number; closed: number }
  workflowProgress: (workflow: PaperWorkflow) => number
  sortedWorkflowBankGroups: (workflow: PaperWorkflow) => PaperWorkflow['bank']['groups']
  workflowSectionLabel: (groupTitle: string, paperTitle: string) => string
  formatWorkflowExport: (file: PaperWorkflow['exports']['studentDocx']) => string
  onRefreshPaperWorkflows: () => void
  basket: BasketItem[]
  questionGroupById: Map<string, QuestionGroupCard>
  onAddWorkflowGroupsToBasket: (workflow: PaperWorkflow) => void
  onAddToBasket: (group: QuestionGroupCard) => void
  paperBuildStatus: 'idle' | 'saving' | 'saved' | 'error'
  paperBuildResult: PaperSetSummary | null
  onBuildWorkflowPaperSet: (workflow: PaperWorkflow) => void
  draftStatusByBundleId: Record<string, 'idle' | 'generating' | 'generated' | 'error'>
  onOpenWorkflowDraft: (workflow: PaperWorkflow) => void
}

export function AdminWorkbench({
  onOpenImportPanel,
  onOpenPaperImportAiWorkbench,
  backfillStatus,
  backfillResult,
  backfillError,
  onBackfillTopicLabels,
  paperWorkflows,
  paperWorkflowsStatus,
  paperWorkflowsError,
  paperWorkflowStatusHint,
  workflowSummary,
  workflowProgress,
  sortedWorkflowBankGroups,
  workflowSectionLabel,
  formatWorkflowExport,
  onRefreshPaperWorkflows,
  basket,
  questionGroupById,
  onAddWorkflowGroupsToBasket,
  onAddToBasket,
  paperBuildStatus,
  paperBuildResult,
  onBuildWorkflowPaperSet,
  draftStatusByBundleId,
  onOpenWorkflowDraft,
}: AdminWorkbenchProps) {
  return (
    <main className="admin-workbench" aria-label="管理台">
      <section className="library-panel admin-panel" aria-label="导入">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>导入</h2>
          </div>
        </div>
        <div className="admin-action-row">
          <button className="ghost-button" type="button" onClick={onOpenImportPanel}>
            <FileText size={18} />
            导入资料
          </button>
          <button className="ghost-button" type="button" onClick={onOpenPaperImportAiWorkbench}>
            <Sparkles size={18} />
            AI 导题
          </button>
        </div>
      </section>

      <section className="library-panel admin-panel" aria-label="数据维护">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Admin</p>
            <h2>数据维护</h2>
          </div>
        </div>
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

        <div className="workflow-view">
          <section className="workflow-overview" aria-label="试卷闭环总览">
            <div>
              <p className="eyebrow">Paper Pipeline</p>
              <h3>多卷闭环状态</h3>
            </div>
            <div className="workflow-summary-grid">
              <div>
                <strong>{workflowSummary.total}</strong>
                <span>试卷</span>
              </div>
              <div>
                <strong>{workflowSummary.ready}</strong>
                <span>可推进</span>
              </div>
              <div>
                <strong>{workflowSummary.review}</strong>
                <span>需核对</span>
              </div>
              <div>
                <strong>{workflowSummary.closed}</strong>
                <span>已闭环</span>
              </div>
            </div>
            <button
              className="detail-button"
              disabled={paperWorkflowsStatus === 'loading'}
              type="button"
              onClick={onRefreshPaperWorkflows}
            >
              <RefreshCw size={16} />
              {paperWorkflowsStatus === 'loading' ? '刷新中' : '刷新状态'}
            </button>
          </section>

          {paperWorkflowsStatus === 'loading' && <p className="detail-message">正在读取试卷闭环状态...</p>}
          {paperWorkflowsStatus === 'error' && <p className="detail-message error">{paperWorkflowsError}</p>}
          {paperWorkflowsStatus === 'loaded' && paperWorkflows.length === 0 && (
            <p className="empty-state">导入试卷后，这里会按资料组和题集自动汇总闭环状态。</p>
          )}

          {paperWorkflows.length > 0 && (
            <div className="workflow-list">
              {paperWorkflows.map((workflow) => {
                const progress = workflowProgress(workflow)
                const canGenerateDraft = Boolean(workflow.bundleId && workflow.importFiles.parsedCount > 0)

                return (
                  <article className={`workflow-card ${workflow.status}`} key={workflow.id}>
                    <div className="workflow-card-head">
                      <div>
                        <div className="source-line">
                          <span>{workflow.importFiles.fileCount} 文件</span>
                          <span>{workflow.bank.objectiveGroupCount}/{workflow.bank.expectedObjectiveGroupCount} 客观题组</span>
                          <span>{workflow.bank.objectiveQuestionCount} 小题</span>
                        </div>
                        <h3>{workflow.title}</h3>
                      </div>
                      <span className={`workflow-status ${workflow.status}`}>
                        {paperWorkflowStatusHint[workflow.status] || workflow.statusLabel}
                      </span>
                    </div>

                    <div className="workflow-progress" aria-label="闭环进度">
                      {['导入', '入库', '题集', '导出'].map((label, index) => (
                        <span className={index < progress ? 'done' : ''} key={label}>
                          {label}
                        </span>
                      ))}
                    </div>

                    <div className="workflow-stage-grid">
                      <div>
                        <span>资料</span>
                        <strong>
                          {workflow.importFiles.parsedCount}/{workflow.importFiles.fileCount}
                        </strong>
                        <p>
                          题目 {workflow.importFiles.roleCounts.question} · 解析{' '}
                          {workflow.importFiles.roleCounts.answerAnalysis} · 同文件{' '}
                          {workflow.importFiles.roleCounts.questionWithAnalysis}
                        </p>
                      </div>
                      <div>
                        <span>入库</span>
                        <strong>
                          {workflow.bank.objectiveGroupCount}/{workflow.bank.expectedObjectiveGroupCount}
                        </strong>
                        <p>
                          缺答案 {workflow.bank.missingAnswerCount} · 缺选项组{' '}
                          {workflow.bank.missingOptionGroupCount}
                        </p>
                      </div>
                      <div>
                        <span>题集</span>
                        <strong>{workflow.paperSet ? workflow.paperSet.itemCount : 0}</strong>
                        <p>
                          {workflow.paperSet
                            ? `${workflow.paperSet.totalQuestions} 题 · ${Number(workflow.paperSet.totalScore).toFixed(1)} 分`
                            : '尚未保存整卷题集'}
                        </p>
                      </div>
                      <div>
                        <span>成品</span>
                        <strong>
                          {[workflow.exports.studentDocx.exists, workflow.exports.teacherDocx.exists].filter(Boolean).length}/2
                        </strong>
                        <p>
                          学生 {formatWorkflowExport(workflow.exports.studentDocx)} · 教师{' '}
                          {formatWorkflowExport(workflow.exports.teacherDocx)}
                        </p>
                      </div>
                    </div>

                    {workflow.bank.missingSections.length > 0 && (
                      <div className="workflow-missing">
                        <strong>缺板块</strong>
                        {workflow.bank.missingSections.map((section) => (
                          <span key={section}>{section}</span>
                        ))}
                      </div>
                    )}

                    {workflow.bank.groups.length > 0 && (
                      <section className="workflow-question-panel" aria-label={`${workflow.title} 篇章题`}>
                        <div className="workflow-question-head">
                          <div>
                            <strong>篇章题</strong>
                            <span>{workflow.bank.groups.length} 题，可逐题加入草稿卷</span>
                          </div>
                          <button
                            className="detail-button"
                            disabled={sortedWorkflowBankGroups(workflow).every((group) => basket.some((item) => item.id === group.id))}
                            type="button"
                            onClick={() => onAddWorkflowGroupsToBasket(workflow)}
                          >
                            <Plus size={15} />
                            全部加入
                          </button>
                          <button
                            className="add-button"
                            disabled={workflow.bank.objectiveGroupCount === 0 || paperBuildStatus === 'saving'}
                            style={{ marginLeft: 8 }}
                            type="button"
                            onClick={() => onBuildWorkflowPaperSet(workflow)}
                          >
                            {paperBuildStatus === 'saving'
                              ? '更新中'
                              : workflow.paperSet
                                ? '更新整卷题集'
                                : '生成整卷题集'}
                          </button>
                          {paperBuildStatus === 'saved' && paperBuildResult && (
                            <span className="workflow-build-feedback success">
                              已保存：{paperBuildResult.title} · {paperBuildResult.itemCount} 题组
                            </span>
                          )}
                          {paperBuildStatus === 'error' && (
                            <span className="workflow-build-feedback error">保存失败，请重试</span>
                          )}
                        </div>
                        <div className="workflow-question-list">
                          {sortedWorkflowBankGroups(workflow).map((group) => {
                            const card = questionGroupById.get(group.id)
                            const inBasket = basket.some((item) => item.id === group.id)
                            const missingCount = group.missingAnswerCount + group.missingOptionQuestionCount

                            return (
                              <article className="workflow-question-item" key={group.id}>
                                <div>
                                  <strong>{workflowSectionLabel(group.title, workflow.title)}</strong>
                                  <span>
                                    {groupTypeLabel[group.groupType]} · {group.questionCount} 小题 · 每题{' '}
                                    {group.defaultScore} 分
                                  </span>
                                  {missingCount > 0 && (
                                    <p>
                                      缺答案 {group.missingAnswerCount} · 缺选项小题{' '}
                                      {group.missingOptionQuestionCount}
                                    </p>
                                  )}
                                </div>
                                <button
                                  className="add-button"
                                  disabled={!card || inBasket}
                                  type="button"
                                  onClick={() => card && onAddToBasket(card)}
                                >
                                  {inBasket ? '已加入' : '加入'}
                                </button>
                              </article>
                            )
                          })}
                        </div>
                      </section>
                    )}

                    {workflow.importFiles.qualityWarnings.length > 0 && (
                      <div className="bundle-quality-warnings">
                        {workflow.importFiles.qualityWarnings.map((warning) => (
                          <span key={warning}>{warning}</span>
                        ))}
                      </div>
                    )}

                    <p className="workflow-next">{workflow.nextAction}</p>

                    <div className="workflow-actions">
                      <button
                        className="detail-button"
                        disabled={!canGenerateDraft || draftStatusByBundleId[workflow.bundleId] === 'generating'}
                        type="button"
                        onClick={() => onOpenWorkflowDraft(workflow)}
                      >
                        {draftStatusByBundleId[workflow.bundleId] === 'generating' ? '生成中' : '生成草稿'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
