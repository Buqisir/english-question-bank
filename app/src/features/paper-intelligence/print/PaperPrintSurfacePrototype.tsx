/**
 * PaperPrintSurfacePrototype — Issue #21-A spike / prototype.
 *
 * This is NOT the production `PaperSurface` module. It is an isolated
 * print-like surface activated only by `?view=paper-intelligence&
 * paperId=paper-2024-xkb1-reading&surface=print`. Its only job is to
 * validate that we can render a 1:1-feeling 广东一模 / 高考真题 卷面 from
 * the existing PI report.json + input.json fixtures, with the required
 * 宋体 / Times New Roman font stacks, before committing to a real
 * rewrite of the production left column.
 *
 * Hard scope:
 *   - Read-only. No basket, no draft, no export, no insight popover, no
 *     evidence line, no model calls, no DB.
 *   - Bundled sample only. The component fetches the same two static
 *     JSON files the default PI surface uses, but renders a different
 *     visual treatment.
 *   - Minimum interaction: clicking a question number / question block
 *     sets a local `activeQuestionId`. A small side rail shows the
 *     active question's stem + options for sanity-check; it is NOT a
 *     reimplementation of the right Question Analysis panel.
 *
 * Anchor reservations for future B/C/D wiring:
 *   - Each section root          → `data-pi-paper-section`
 *   - Each question root         → `data-pi-question-id`
 *   - Each option label          → `data-pi-option-label`
 *   - (Evidence marks reserved   → `data-pi-evidence-id` if added later;
 *     this prototype does not paint them.)
 *
 * Forbidden in this file (intentionally):
 *   - Importing the basket / draft modules under the workbench's paper
 *     assembly folder, or anything inside concierge / services / App.
 *   - Importing the bundled sample-question-group dataset that the
 *     workbench uses for development. The spike reads only the static
 *     PI report.json + input.json fixtures.
 *   - Importing the existing PI evidence adapter, evidence line, or
 *     popover modules. The whole point of the spike is to prove the
 *     surface in isolation.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import './paperPrintSurface.css'

/* ─── Local fixture types ────────────────────────────────────────────
 *
 * We deliberately re-declare the narrow shape the prototype needs from
 * the existing report.json / input.json instead of reusing
 * `paperIntelligenceTypes` so the spike can be deleted in one rm -rf
 * without churning the production typing.
 */

type PrintReport = {
  schemaVersion?: string
  sourcePaper: {
    paperId: string
    paperName: string
    year: number
    region: string
    section: string
  }
  passages: ReadonlyArray<{
    paperSection: string
    passageTitle: string
  }>
}

type PrintInputOption = {
  label: string
  content: string
}

type PrintInputQuestion = {
  questionNo: string
  stem: string
  answer?: string
  options: ReadonlyArray<PrintInputOption>
}

type PrintInputPassage = {
  paperSection: string
  passageTitle: string
  passageBody: string
  questions: ReadonlyArray<PrintInputQuestion>
}

type PrintInput = {
  sourcePaper?: PrintReport['sourcePaper']
  passages: ReadonlyArray<PrintInputPassage>
}

/* ─── View model ─────────────────────────────────────────────────────
 *
 * The merged view model joins the two fixtures by `paperSection`. The
 * report carries the metadata header; the input carries the prose,
 * stems, and options the prototype actually paints. If either side is
 * missing for a section, we still render whatever the input fixture
 * has, because the spike's value is in the typography, not the
 * dashboard chrome.
 */

type PrintQuestionView = {
  questionId: string
  questionNo: string
  stem: string
  options: ReadonlyArray<PrintInputOption>
}

type PrintPassageView = {
  paperSection: string
  passageTitle: string
  passageBody: string
  questions: ReadonlyArray<PrintQuestionView>
}

type PrintSurfaceView = {
  paperName: string
  year: number
  region: string
  section: string
  passages: ReadonlyArray<PrintPassageView>
  totalQuestionCount: number
}

function buildPrintSurfaceView(args: {
  report: PrintReport | null
  input: PrintInput
}): PrintSurfaceView {
  const { report, input } = args
  const header = report?.sourcePaper || input.sourcePaper || {
    paperId: '',
    paperName: '',
    year: 0,
    region: '',
    section: '',
  }

  const passages: PrintPassageView[] = input.passages.map((p) => ({
    paperSection: p.paperSection,
    passageTitle: p.passageTitle || `篇章 ${p.paperSection}`,
    passageBody: p.passageBody || '',
    questions: p.questions.map((q) => ({
      questionId: `${p.paperSection}-${q.questionNo}`,
      questionNo: q.questionNo,
      stem: q.stem,
      options: q.options,
    })),
  }))

  const totalQuestionCount = passages.reduce(
    (sum, passage) => sum + passage.questions.length,
    0,
  )

  return {
    paperName: header.paperName,
    year: header.year,
    region: header.region,
    section: header.section,
    passages,
    totalQuestionCount,
  }
}

/* ─── Component ──────────────────────────────────────────────────── */

export type PaperPrintSurfacePrototypeProps = {
  /**
   * The same paperId the default PI surface receives. The spike only
   * supports the bundled sample (`paper-2024-xkb1-reading`); any other
   * id renders an explicit "spike does not have data" notice rather
   * than failing silently.
   */
  paperId: string | null
  /**
   * Caller is expected to provide a back-to-workbench handler so the
   * prototype is escapable without touching window.location itself —
   * mirrors the contract of the default PI surface.
   */
  onBackToWorkbench: () => void
}

const SPIKE_SUPPORTED_PAPER_ID = 'paper-2024-xkb1-reading'

export function PaperPrintSurfacePrototype({
  paperId,
  onBackToWorkbench,
}: PaperPrintSurfacePrototypeProps): ReactNode {
  const [report, setReport] = useState<PrintReport | null>(null)
  const [input, setInput] = useState<PrintInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)

  useEffect(() => {
    if (!paperId) {
      setError('未指定 paperId 参数。')
      setLoading(false)
      return
    }
    if (paperId !== SPIKE_SUPPORTED_PAPER_ID) {
      setError(
        `精排卷面 spike 只支持样卷 ${SPIKE_SUPPORTED_PAPER_ID}，当前 paperId=${paperId}。`,
      )
      setLoading(false)
      return
    }

    let cancelled = false
    const reportUrl = `/reports/paper-intelligence/${paperId}/report.json`
    const inputUrl = `/reports/paper-intelligence/${paperId}/input.json`

    async function load(): Promise<void> {
      try {
        const [reportRes, inputRes] = await Promise.all([
          fetch(reportUrl),
          fetch(inputUrl),
        ])
        if (!inputRes.ok) {
          throw new Error(`input.json HTTP ${inputRes.status}`)
        }
        const inputData = (await inputRes.json()) as PrintInput

        let reportData: PrintReport | null = null
        if (reportRes.ok) {
          reportData = (await reportRes.json()) as PrintReport
        }

        if (cancelled) return
        setReport(reportData)
        setInput(inputData)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setError(`加载样卷数据失败：${message}`)
        setLoading(false)
      }
    }

    void load()
    return (): void => {
      cancelled = true
    }
  }, [paperId])

  const view = useMemo<PrintSurfaceView | null>(() => {
    if (!input) return null
    return buildPrintSurfaceView({ report, input })
  }, [report, input])

  const activeQuestion = useMemo(() => {
    if (!view || !activeQuestionId) return null
    for (const passage of view.passages) {
      for (const q of passage.questions) {
        if (q.questionId === activeQuestionId) {
          return { passage, question: q }
        }
      }
    }
    return null
  }, [view, activeQuestionId])

  const handleSelectQuestion = (id: string): void => {
    setActiveQuestionId((prev) => (prev === id ? null : id))
  }

  if (loading) {
    return (
      <div className="pi-print-surface" data-pi-print-surface="loading">
        <PrintSurfaceTopBar onBackToWorkbench={onBackToWorkbench} />
        <div className="pi-print-error">加载中…</div>
      </div>
    )
  }

  if (error || !view) {
    return (
      <div className="pi-print-surface" data-pi-print-surface="error">
        <PrintSurfaceTopBar onBackToWorkbench={onBackToWorkbench} />
        <div className="pi-print-error">
          <h2>精排卷面 spike</h2>
          <p>{error || '未能解析样卷数据。'}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="pi-print-surface"
      data-pi-print-surface="ready"
      data-pi-print-surface-paper-id={paperId || ''}
    >
      <PrintSurfaceTopBar onBackToWorkbench={onBackToWorkbench} />
      <div className="pi-print-spike-notice" role="note">
        精排卷面 Spike / Prototype · 仅 {SPIKE_SUPPORTED_PAPER_ID} 样卷 · 不进入生产路径
      </div>
      <div className="pi-print-layout">
        <article
          className="pi-print-page"
          data-pi-print-page="true"
          aria-label="精排卷面"
        >
          <PrintSurfaceHeader view={view} />
          <PrintSectionInstruction />
          <ol className="pi-print-passages">
            {view.passages.map((passage) => (
              <PrintPassageBlock
                key={passage.paperSection}
                passage={passage}
                activeQuestionId={activeQuestionId}
                onSelectQuestion={handleSelectQuestion}
              />
            ))}
          </ol>
        </article>
        <aside
          className="pi-print-sidecar"
          aria-label="选中题信息（spike 验证用）"
          data-pi-print-sidecar="true"
        >
          <PrintActiveQuestionPanel active={activeQuestion} />
        </aside>
      </div>
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function PrintSurfaceTopBar({
  onBackToWorkbench,
}: {
  onBackToWorkbench: () => void
}): ReactNode {
  return (
    <div
      className="pi-print-topbar"
      role="navigation"
      aria-label="Paper Intelligence print surface top bar"
    >
      <button
        type="button"
        className="pi-print-topbar-back"
        onClick={onBackToWorkbench}
        aria-label="返回工作台"
        data-pi-back-to-workbench="true"
      >
        <span aria-hidden="true">←</span> 返回工作台
      </button>
      <span className="pi-print-topbar-title">精排卷面（Spike）</span>
    </div>
  )
}

function PrintSurfaceHeader({ view }: { view: PrintSurfaceView }): ReactNode {
  return (
    <header className="pi-print-header">
      <h1 className="pi-print-header-title">{view.paperName || '英语试卷样张'}</h1>
      <div className="pi-print-header-meta">
        <span>{view.year || ''}</span>
        <span>{view.region}</span>
        <span>{view.section}</span>
      </div>
    </header>
  )
}

function PrintSectionInstruction(): ReactNode {
  /*
   * High-school 阅读理解第一节 instruction is fixed by the exam standard.
   * We hard-code the canonical sentence here so the surface looks like a
   * real paper at a glance — a teacher who scans this should immediately
   * see "this is 第一节". The spike does not parse this from the report.
   */
  return (
    <section className="pi-print-instruction" data-pi-print-instruction="true">
      <h2 className="pi-print-instruction-heading">
        第二部分 阅读（共两节，满分 50 分）
      </h2>
      <h3 className="pi-print-instruction-subheading">
        第一节（共 15 小题；每小题 2.5 分，满分 37.5 分）
      </h3>
      <p className="pi-print-instruction-body">
        阅读下列短文，从每题所给的 A、B、C 和 D 四个选项中，选出最佳选项。
      </p>
    </section>
  )
}

function PrintPassageBlock(props: {
  passage: PrintPassageView
  activeQuestionId: string | null
  onSelectQuestion: (id: string) => void
}): ReactNode {
  const { passage, activeQuestionId, onSelectQuestion } = props
  return (
    <li
      className="pi-print-passage"
      data-pi-paper-section={passage.paperSection}
    >
      <h3 className="pi-print-passage-marker">
        <span className="pi-print-passage-letter">{passage.paperSection}</span>
        <span className="pi-print-passage-title">{passage.passageTitle}</span>
      </h3>
      <div className="pi-print-passage-body">{renderPassageBody(passage.passageBody)}</div>
      <ol className="pi-print-question-list">
        {passage.questions.map((q) => (
          <PrintQuestionBlock
            key={q.questionId}
            question={q}
            isActive={q.questionId === activeQuestionId}
            onSelect={onSelectQuestion}
          />
        ))}
      </ol>
    </li>
  )
}

/**
 * Render passage body as paragraphs. The fixture stores the body as one
 * long string with no paragraph breaks; we split on `\n\n` (defensive),
 * and otherwise render the whole thing as a single paragraph. The spike
 * does NOT try to recover paragraph structure from the original PDF —
 * that is a future production-surface concern.
 */
function renderPassageBody(body: string): ReactNode {
  const trimmed = (body || '').trim()
  if (!trimmed) return null
  const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) {
    return <p className="pi-print-passage-paragraph">{trimmed}</p>
  }
  return paragraphs.map((para, idx) => (
    <p key={idx} className="pi-print-passage-paragraph">
      {para}
    </p>
  ))
}

function PrintQuestionBlock(props: {
  question: PrintQuestionView
  isActive: boolean
  onSelect: (id: string) => void
}): ReactNode {
  const { question, isActive, onSelect } = props
  return (
    <li
      className={
        isActive ? 'pi-print-question pi-print-question--active' : 'pi-print-question'
      }
      data-pi-question-id={question.questionId}
      data-pi-question-no={question.questionNo}
    >
      <button
        type="button"
        className="pi-print-question-stem-button"
        onClick={() => onSelect(question.questionId)}
        aria-pressed={isActive}
        aria-label={`选中第 ${question.questionNo} 题`}
        data-pi-question-stem-trigger="true"
      >
        <span className="pi-print-question-no">{question.questionNo}.</span>
        <span className="pi-print-question-stem">{question.stem}</span>
      </button>
      <ol className="pi-print-option-list">
        {question.options.map((opt) => (
          <li
            key={`${question.questionId}-${opt.label}`}
            className="pi-print-option"
            data-pi-option-label={opt.label}
          >
            <span className="pi-print-option-label">{opt.label}.</span>
            <span className="pi-print-option-content">{opt.content}</span>
          </li>
        ))}
      </ol>
    </li>
  )
}

function PrintActiveQuestionPanel(props: {
  active: { passage: PrintPassageView; question: PrintQuestionView } | null
}): ReactNode {
  const { active } = props
  if (!active) {
    return (
      <div className="pi-print-sidecar-empty">
        <p>点击左侧任意题号或题干，可在此查看题目基础信息。</p>
        <p className="pi-print-sidecar-hint">
          spike 仅做最小交互验证，不复现完整 Question Analysis。
        </p>
      </div>
    )
  }
  const { passage, question } = active
  return (
    <div className="pi-print-sidecar-card" data-pi-print-active-question={question.questionId}>
      <div className="pi-print-sidecar-meta">
        <span className="pi-print-sidecar-section">阅读理解 {passage.paperSection}</span>
        <span className="pi-print-sidecar-no">第 {question.questionNo} 题</span>
      </div>
      <p className="pi-print-sidecar-stem">{question.stem}</p>
      <ol className="pi-print-sidecar-options">
        {question.options.map((opt) => (
          <li key={opt.label} className="pi-print-sidecar-option">
            <span className="pi-print-sidecar-option-label">{opt.label}.</span>
            <span>{opt.content}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
