import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, FileText, Loader2, Save, Sparkles, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  analyzePaperImportAiClozeGroup,
  analyzePaperImportAiGrammarFillGroup,
  analyzePaperImportAiReadingGroup,
  analyzePaperImportAiSevenChoicesGroup,
  parsePaperImportAiDocx,
  publishPaperImportAiAnalysis,
  type PaperImportAiAnalysisResult,
  type PaperImportAiClozeGroup,
  type PaperImportAiGrammarFillGroup,
  type PaperImportAiParseResult,
  type PaperImportAiProviderId,
  type PaperImportAiPublishResult,
  type PaperImportAiQuestion,
  type PaperImportAiReadingGroup,
  type PaperImportAiSevenChoicesGroup,
} from '../../services/paperImportAi'
import './paperImportAiWorkbench.css'

type PaperImportAiWorkbenchProps = {
  onBackToWorkbench: () => void
}

type AnalysisState = {
  status: 'idle' | 'analyzing' | 'error' | 'done'
  message: string
  result: PaperImportAiAnalysisResult | null
}

type AnalysisRecord = Record<string, unknown>

type PublishState = {
  status: 'idle' | 'publishing' | 'error' | 'done'
  message: string
  result: PaperImportAiPublishResult | null
}

const providerOptions: Array<{ value: PaperImportAiProviderId; label: string }> = [
  { value: 'deepseek-v4-pro', label: 'DeepSeek v4 Pro' },
  { value: 'gpt-5.5', label: 'GPT 5.5 中转' },
]

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function firstPassageLine(group: PaperImportAiReadingGroup) {
  return group.paragraphs.find((paragraph) => paragraph.text.trim())?.text || '未识别到段落文本'
}

function reasonLabel(reason: string) {
  if (reason.endsWith('_out_of_scope_for_i1')) return 'I1 范围外'
  if (reason.includes('missing_questions_or_options')) return '题干或选项不完整'
  if (reason.includes('missing_passage')) return '缺少语篇正文'
  return reason
}

function asRecord(value: unknown): AnalysisRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnalysisRecord) : {}
}

function asArray(value: unknown): AnalysisRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : []
}

function textOf(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function statusLabel(status: unknown) {
  if (status === 'correct') return '正确'
  if (status === 'wrong') return '干扰项'
  return textOf(status, '待核对')
}

function trapTypeLabel(type: unknown) {
  if (type === 'sourceLexicalTrap') return '原文词钩干扰'
  if (type === 'polarityReversal') return '黑白颠倒'
  if (type === 'scopeShift') return '范围偷换'
  if (type === 'entityMismatch') return '对象错配'
  if (type === 'unsupportedClaim') return '无中生有'
  return textOf(type, '干扰诊断')
}

function relationTypeLabel(type: unknown) {
  if (type === 'locationCue') return '定位线索'
  if (type === 'paraphrase') return '同义替换'
  if (type === 'wordFamily') return '词族关联'
  if (type === 'calculation') return '计算/推算'
  return textOf(type, '定位关系')
}

function skillText(skill: unknown) {
  const record = asRecord(skill)
  const primary = textOf(record.primary)
  const secondary = textOf(record.secondary)
  return [primary, secondary].filter(Boolean).join(' / ') || '未标注'
}

function optionNote(option: AnalysisRecord) {
  const evidence = asArray(option.evidence)
  if (evidence.length > 0) {
    return textOf(evidence[0].anchor) || textOf(evidence[0].quote)
  }
  const trap = asRecord(option.trap)
  return (
    textOf(trap.relationNote) ||
    textOf(trap.explanation) ||
    textOf(trap.claim) ||
    textOf(trap.sourceQuote) ||
    textOf(trap.sourceText)
  )
}

function correctLabelFromAnalysis(questionAnalysis: AnalysisRecord) {
  const correct = asArray(questionAnalysis.optionAnalysis).find((option) => option.status === 'correct')
  return textOf(correct?.label)
}

function groupLetter(group: PaperImportAiReadingGroup) {
  const match = group.groupId.match(/reading-([abcd])$/i)
  return match ? match[1].toUpperCase() : ''
}

function answerState(question: PaperImportAiQuestion, questionAnalysis: AnalysisRecord) {
  const official = question.answerKey
  const ai = correctLabelFromAnalysis(questionAnalysis)
  if (!official && ai) return { label: `AI 判断 ${ai}`, tone: 'pending' }
  if (official && !ai) return { label: `答案 ${official} · AI 未标出`, tone: 'warning' }
  if (official && ai && official !== ai) return { label: `冲突：答案版 ${official} / AI ${ai}`, tone: 'danger' }
  if (official && ai) return { label: `一致：${official}`, tone: 'ok' }
  return { label: '待核对', tone: 'pending' }
}

function AnalysisReadablePreview({
  group,
  result,
}: {
  group: PaperImportAiReadingGroup
  result: PaperImportAiAnalysisResult
}) {
  const analysis = asRecord(result.analysis)
  const groups = asRecord(analysis.groups)
  const groupAnalysis = asRecord(groups[group.groupId])
  const questions = asRecord(analysis.questions)
  const overview = textOf(groupAnalysis.overview, 'AI 未返回篇章概览。')
  const structure = asRecord(groupAnalysis.discourseStructure)
  const structureSummary = textOf(structure.summary)

  return (
    <section className="pi-ai-readable-preview" aria-label={`${group.title} 解析预览`}>
      <div className="pi-ai-readable-head">
        <div>
          <h3>解析预览</h3>
          <p>{overview}</p>
        </div>
        <span>{result.provider} · {result.model} · {result.latencyMs}ms</span>
      </div>
      {structureSummary ? <p className="pi-ai-structure-summary">{structureSummary}</p> : null}

      <div className="pi-ai-question-preview-list">
        {group.questions.map((question, index) => {
          const questionAnalysis = asRecord(questions[question.id])
          const state = answerState(question, questionAnalysis)
          const options = asArray(questionAnalysis.optionAnalysis)
          const locations = asArray(questionAnalysis.locationParaphrases)
          return (
            <article key={question.id} className="pi-ai-question-preview">
              <header>
                <div>
                  <strong>第 {index + 1} 题</strong>
                  <span>{skillText(questionAnalysis.skill)}</span>
                </div>
                <em className={`pi-ai-answer-state pi-ai-answer-state--${state.tone}`}>{state.label}</em>
              </header>
              <p className="pi-ai-question-focus">{textOf(questionAnalysis.questionFocus, question.stem)}</p>
              {textOf(questionAnalysis.stemTranslationZh) ? (
                <p className="pi-ai-stem-translation">{textOf(questionAnalysis.stemTranslationZh)}</p>
              ) : null}

              {options.length > 0 ? (
                <ul className="pi-ai-option-list">
                  {options.map((option) => (
                    <li key={textOf(option.label)} className={option.status === 'correct' ? 'is-correct' : ''}>
                      <div>
                        <strong>{textOf(option.label)}</strong>
                        <span>{statusLabel(option.status)}</span>
                        {option.status !== 'correct' ? <em>{trapTypeLabel(asRecord(option.trap).primaryType)}</em> : null}
                      </div>
                      <p>{textOf(option.optionTranslationZh, question.options[textOf(option.label) as 'A' | 'B' | 'C' | 'D'] || '未返回选项翻译')}</p>
                      {optionNote(option) ? <small>{optionNote(option)}</small> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pi-ai-muted">AI 未返回选项解析。</p>
              )}

              {locations.length > 0 ? (
                <div className="pi-ai-location-list">
                  <h4>定位关系 / 同义替换</h4>
                  {locations.map((location, locationIndex) => (
                    <p key={`${question.id}-location-${locationIndex}`}>
                      <strong>{relationTypeLabel(location.relationType)}</strong>
                      <span>{textOf(location.sourceText)} → {textOf(location.targetText)}</span>
                      {textOf(location.note) ? <em>{textOf(location.note)}</em> : null}
                    </p>
                  ))}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      <details className="pi-ai-raw-json">
        <summary>查看原始 JSON</summary>
        <pre className="pi-ai-json-preview">{JSON.stringify(result.analysis, null, 2)}</pre>
      </details>
    </section>
  )
}

export function PaperImportAiWorkbench({ onBackToWorkbench }: PaperImportAiWorkbenchProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const answerInputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [answerFile, setAnswerFile] = useState<File | null>(null)
  const [result, setResult] = useState<PaperImportAiParseResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [providerId, setProviderId] = useState<PaperImportAiProviderId>('deepseek-v4-pro')
  const [analysisByGroupId, setAnalysisByGroupId] = useState<Record<string, AnalysisState>>({})
  const [scAnalysisState, setScAnalysisState] = useState<AnalysisState>({ status: 'idle', message: '', result: null })
  const [clAnalysisState, setClAnalysisState] = useState<AnalysisState>({ status: 'idle', message: '', result: null })
  const [gfAnalysisState, setGfAnalysisState] = useState<AnalysisState>({ status: 'idle', message: '', result: null })
  const [publishState, setPublishState] = useState<PublishState>({ status: 'idle', message: '', result: null })

  function resetParsedResult() {
    setMessage('')
    setResult(null)
    setAnalysisByGroupId({})
    setScAnalysisState({ status: 'idle', message: '', result: null })
    setClAnalysisState({ status: 'idle', message: '', result: null })
    setGfAnalysisState({ status: 'idle', message: '', result: null })
    setPublishState({ status: 'idle', message: '', result: null })
  }

  function acceptFile(nextFile: File | null) {
    resetParsedResult()
    if (!nextFile) {
      setFile(null)
      return
    }
    if (!/\.docx$/i.test(nextFile.name)) {
      setFile(null)
      setStatus('error')
      setMessage('这里只接收一个 .docx 试卷文件。')
      return
    }
    setStatus('idle')
    setFile(nextFile)
  }

  function acceptAnswerFile(nextFile: File | null) {
    resetParsedResult()
    if (!nextFile) {
      setAnswerFile(null)
      return
    }
    if (!/\.docx$/i.test(nextFile.name)) {
      setAnswerFile(null)
      setStatus('error')
      setMessage('答案解析版也需要是 .docx 文件。')
      return
    }
    setStatus('idle')
    setAnswerFile(nextFile)
  }

  async function handleParse() {
    if (!file) return
    setStatus('parsing')
    setMessage('')
    try {
      const parsed = await parsePaperImportAiDocx(file, answerFile)
      setResult(parsed)
      setAnalysisByGroupId({})
      setStatus('idle')
      const keyedCount = parsed.readingGroups.reduce(
        (sum, group) => sum + group.questions.filter((question) => question.answerKey).length,
        0,
      )
      const sevenChoicesMessage = parsed.sevenChoicesGroup
        ? `，七选五 ${parsed.sevenChoicesGroup.questions.length} 题 / ${parsed.sevenChoicesGroup.optionBank.length} 选项`
        : parsed.sevenChoicesError ? '，检测到七选五但未能完整解析' : ''
      setMessage(`已识别 ${parsed.readingGroups.length} 个 Reading 题组${answerFile ? `，匹配 ${keyedCount} 个答案` : ''}${sevenChoicesMessage}。`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleAnalyzeAll() {
    if (!result) return
    const tasks = result.readingGroups.map((group) => {
      if (analysisByGroupId[group.groupId]?.status === 'done') return Promise.resolve()
      return handleAnalyze(group)
    })
    if (result.sevenChoicesGroup && scAnalysisState.status !== 'done') {
      tasks.push(handleAnalyzeSevenChoices(result.sevenChoicesGroup))
    }
    if (result.clozeGroup && clAnalysisState.status !== 'done') {
      tasks.push(handleAnalyzeCloze(result.clozeGroup))
    }
    if (result.grammarFillGroup && gfAnalysisState.status !== 'done') {
      tasks.push(handleAnalyzeGrammarFill(result.grammarFillGroup))
    }
    await Promise.all(tasks)
  }

  async function handleAnalyzeGrammarFill(group: PaperImportAiGrammarFillGroup) {
    if (!result) return
    setGfAnalysisState({ status: 'analyzing', message: '', result: null })
    try {
      const analysis = await analyzePaperImportAiGrammarFillGroup({
        paper: result.paper,
        group,
        providerId,
      })
      setGfAnalysisState({ status: 'done', message: '语法填空解析已生成。', result: analysis })
      setPublishState({ status: 'idle', message: '', result: null })
    } catch (error) {
      setGfAnalysisState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        result: null,
      })
    }
  }

  async function handleAnalyzeCloze(group: PaperImportAiClozeGroup) {
    if (!result) return
    setClAnalysisState({ status: 'analyzing', message: '', result: null })
    try {
      const analysis = await analyzePaperImportAiClozeGroup({
        paper: result.paper,
        group,
        providerId,
      })
      setClAnalysisState({ status: 'done', message: '完形解析已生成。', result: analysis })
      setPublishState({ status: 'idle', message: '', result: null })
    } catch (error) {
      setClAnalysisState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        result: null,
      })
    }
  }

  async function handleAnalyzeSevenChoices(group: PaperImportAiSevenChoicesGroup) {
    if (!result) return
    setScAnalysisState({ status: 'analyzing', message: '', result: null })
    try {
      const analysis = await analyzePaperImportAiSevenChoicesGroup({
        paper: result.paper,
        group,
        providerId,
      })
      setScAnalysisState({ status: 'done', message: '七选五解析已生成。', result: analysis })
      setPublishState({ status: 'idle', message: '', result: null })
    } catch (error) {
      setScAnalysisState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        result: null,
      })
    }
  }

  async function handleAnalyze(group: PaperImportAiReadingGroup) {
    if (!result) return
    setAnalysisByGroupId((current) => ({
      ...current,
      [group.groupId]: { status: 'analyzing', message: '', result: current[group.groupId]?.result || null },
    }))
    try {
      const analysis = await analyzePaperImportAiReadingGroup({
        paper: result.paper,
        group,
        providerId,
      })
      setAnalysisByGroupId((current) => ({
        ...current,
        [group.groupId]: { status: 'done', message: 'JSON preview ready.', result: analysis },
      }))
      setPublishState({ status: 'idle', message: '', result: null })
    } catch (error) {
      setAnalysisByGroupId((current) => ({
        ...current,
        [group.groupId]: {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
          result: current[group.groupId]?.result || null,
        },
      }))
    }
  }

  const questionCount = result?.readingGroups.reduce((sum, group) => sum + group.questions.length, 0) || 0
  const analyzedCount = result?.readingGroups.filter((group) => analysisByGroupId[group.groupId]?.status === 'done').length || 0
  const missingReadingLabels = ['A', 'B', 'C', 'D'].filter((label) => !result?.readingGroups.some((group) => groupLetter(group) === label))
  const missingAnswerCount = result?.readingGroups.reduce(
    (sum, group) => sum + group.questions.filter((question) => !question.answerKey).length,
    0,
  ) || 0
  const answerConflicts = result?.readingGroups.flatMap((group) => {
    const analysis = asRecord(analysisByGroupId[group.groupId]?.result?.analysis)
    const questions = asRecord(analysis.questions)
    return group.questions.flatMap((question) => {
      const official = question.answerKey
      const ai = correctLabelFromAnalysis(asRecord(questions[question.id]))
      return official && ai && official !== ai
        ? [{ groupTitle: group.title, questionId: question.id, official, ai }]
        : []
    })
  }) || []
  const scGroup = result?.sevenChoicesGroup || null
  const scError = result?.sevenChoicesError || null
  const scHasAnswers = scGroup ? scGroup.questions.every((q) => q.answerKey) : true
  const scMissingAnswers = scGroup ? scGroup.questions.filter((q) => !q.answerKey).length : 0
  const clGroup = result?.clozeGroup || null
  const clError = result?.clozeError || null
  const clHasAnswers = clGroup ? clGroup.questions.every((q) => q.answerKey) : true
  const clMissingAnswers = clGroup ? clGroup.questions.filter((q) => !q.answerKey).length : 0
  const gfGroup = result?.grammarFillGroup || null
  const gfError = result?.grammarFillError || null
  const gfHasAnswers = gfGroup ? gfGroup.questions.every((q) => q.answerKey) : true
  const gfMissingAnswers = gfGroup ? gfGroup.questions.filter((q) => !q.answerKey).length : 0
  const gfPromptCount = gfGroup ? gfGroup.questions.filter((q) => q.prompt).length : 0
  const gfNoPromptCount = gfGroup ? gfGroup.questions.filter((q) => !q.prompt).length : 0
  const appGroup = result?.applicationGroup || null
  const appError = result?.applicationError || null
  const contGroup = result?.continuationGroup || null
  const contError = result?.continuationError || null
  const contStartersOk = contGroup ? (contGroup.continuationStarters || []).length >= 2 : true
  const isAnyAnalyzing = result?.readingGroups.some((group) => analysisByGroupId[group.groupId]?.status === 'analyzing') || scAnalysisState.status === 'analyzing' || clAnalysisState.status === 'analyzing' || gfAnalysisState.status === 'analyzing' || false
  const allGroupsAnalyzed = Boolean(result?.readingGroups.length) && analyzedCount === result?.readingGroups.length
  const scAnalyzed = !scGroup || scAnalysisState.status === 'done'
  const clAnalyzed = !clGroup || clAnalysisState.status === 'done'
  const gfAnalyzed = !gfGroup || gfAnalysisState.status === 'done'
  const allImportAnalyzed = allGroupsAnalyzed && scAnalyzed && clAnalyzed && gfAnalyzed
  const scReady = Boolean(scGroup) && scAnalyzed && scHasAnswers
  const clReady = Boolean(clGroup) && clAnalyzed && clHasAnswers
  const gfReady = Boolean(gfGroup) && gfAnalyzed && gfHasAnswers
  const appReady = Boolean(appGroup)
  const contReady = Boolean(contGroup) && contStartersOk
  const canPublish = Boolean(
    file &&
    result &&
    result.paper.answerSourceFilename &&
    result.readingGroups.length === 4 &&
    allImportAnalyzed &&
    missingAnswerCount === 0 &&
    scReady &&
    clReady &&
    gfReady &&
    appReady &&
    contReady &&
    answerConflicts.length === 0 &&
    publishState.status !== 'publishing',
  )

  async function handlePublish() {
    if (!file || !result || !canPublish) return
    setPublishState({ status: 'publishing', message: '', result: null })
    try {
      const analysesByGroupId = Object.fromEntries(
        result.readingGroups.map((group) => [group.groupId, analysisByGroupId[group.groupId]?.result?.analysis || {}]),
      )
      const published = await publishPaperImportAiAnalysis({
        file,
        parseResult: result,
        analysesByGroupId,
        sevenChoicesGroup: result.sevenChoicesGroup || null,
        sevenChoicesAnalysis: scAnalysisState.result?.analysis || null,
        clozeGroup: result.clozeGroup || null,
        clozeAnalysis: clAnalysisState.result?.analysis || null,
        grammarFillGroup: result.grammarFillGroup || null,
        grammarFillAnalysis: gfAnalysisState.result?.analysis || null,
        applicationGroup: result.applicationGroup || null,
        continuationGroup: result.continuationGroup || null,
      })
      setPublishState({ status: 'done', message: '已保存为正式试卷资产。', result: published })
    } catch (error) {
      setPublishState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        result: null,
      })
    }
  }

  return (
    <main className="pi-ai-shell">
      <header className="pi-ai-topbar">
        <button className="ghost-button" type="button" onClick={onBackToWorkbench}>
          <ArrowLeft size={16} aria-hidden="true" />
          返回题库
        </button>
        <div>
          <p className="eyebrow">Local-first Paper Import</p>
          <h1>AI 导题工作台</h1>
        </div>
        <div className="pi-ai-status">
          {publishState.status === 'done' ? '已保存' : status === 'parsing' ? '拆题中' : '预览未保存'}
        </div>
      </header>

      <div className="pi-ai-layout">
        <section
          className="pi-ai-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const dropped = Array.from(event.dataTransfer.files).filter((item) => /\.docx$/i.test(item.name))
            const answer = dropped.find((item) => /答案|解析|参考答案/i.test(item.name)) || null
            const paper = dropped.find((item) => item !== answer) || dropped[0] || null
            acceptFile(paper)
            acceptAnswerFile(answer)
          }}
        >
          <UploadCloud size={38} aria-hidden="true" />
          <h2>导入完整试卷</h2>
          <p>识别阅读理解 A-D + 七选五 + 完形填空；可同时上传答案解析版，用官方答案和 AI 判断做对照。</p>
          <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>
            选择 DOCX
          </button>
          <input
            ref={inputRef}
            className="pi-ai-file-input"
            type="file"
            accept=".docx"
            onChange={(event) => {
              acceptFile(event.target.files?.item(0) || null)
              event.currentTarget.value = ''
            }}
          />
        </section>

        <section className="pi-ai-panel">
          <div className="pi-ai-panel-heading">
            <h2>文件</h2>
            <span>{file ? formatSize(file.size) : '等待上传'}</span>
          </div>
          {file ? (
            <div className="pi-ai-file-card">
              <FileText size={17} aria-hidden="true" />
              <span>{file.name}</span>
            </div>
          ) : (
            <p className="pi-ai-muted">拖入或选择一个 `.docx`，系统会先拆出阅读理解 A-D 和七选五。</p>
          )}
          <div className="pi-ai-answer-file-row">
            <button className="ghost-button" type="button" onClick={() => answerInputRef.current?.click()}>
              <FileText size={16} aria-hidden="true" />
              选择答案解析版
            </button>
            <span>{answerFile ? answerFile.name : '可选，用于答案对照'}</span>
          </div>
          <input
            ref={answerInputRef}
            className="pi-ai-file-input"
            type="file"
            accept=".docx"
            onChange={(event) => {
              acceptAnswerFile(event.target.files?.item(0) || null)
              event.currentTarget.value = ''
            }}
          />
          <button className="primary-button pi-ai-parse-button" type="button" disabled={!file || status === 'parsing'} onClick={handleParse}>
            {status === 'parsing' ? <Loader2 size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
            拆题预检
          </button>
          {message ? (
            <p className={status === 'error' ? 'pi-ai-error' : 'pi-ai-muted'}>{message}</p>
          ) : null}
        </section>

        <section className="pi-ai-panel">
          <div className="pi-ai-panel-heading">
            <h2>模型通道</h2>
            <span>解析预览</span>
          </div>
          <label className="pi-ai-provider-field">
            <span>模型通道</span>
            <select
              value={providerId}
              onChange={(event) => setProviderId(event.target.value as PaperImportAiProviderId)}
            >
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="pi-ai-muted">生成解析后可保存为正式试卷资产；答案冲突会先拦住。</p>
        </section>

        <section className="pi-ai-panel pi-ai-summary">
          <div className="pi-ai-panel-heading">
            <h2>识别概览</h2>
            <span>{result ? result.paper.paperId : '未生成'}</span>
          </div>
          {result?.paper.answerSourceFilename ? (
            <p className="pi-ai-answer-source">答案来源：{result.paper.answerSourceFilename}</p>
          ) : null}
          <div className="pi-ai-summary-grid">
            <strong>{result?.readingGroups.length || 0}</strong>
            <span>Reading 题组</span>
            <strong>{questionCount}</strong>
            <span>题目</span>
            <strong>{result?.skipped.length || 0}</strong>
            <span>跳过项</span>
          </div>
        </section>

        <section className="pi-ai-panel pi-ai-publish">
          <div className="pi-ai-panel-heading">
            <h2>保存</h2>
            {publishState.result?.publish ? <span>v{publishState.result.publish.assetVersion}</span> : <span>{analyzedCount}/{result?.readingGroups.length || 0}</span>}
          </div>
          <div className="pi-ai-publish-checks">
            <p className={result?.paper.answerSourceFilename ? 'is-ok' : ''}>
              <CheckCircle2 size={15} aria-hidden="true" />
              答案解析版
            </p>
            <p className={missingReadingLabels.length === 0 && result?.readingGroups.length === 4 ? 'is-ok' : ''}>
              <CheckCircle2 size={15} aria-hidden="true" />
              Reading A-D
            </p>
            <p className={allImportAnalyzed ? 'is-ok' : ''}>
              <CheckCircle2 size={15} aria-hidden="true" />
              解析已生成
            </p>
            <p className={missingAnswerCount === 0 && answerConflicts.length === 0 && Boolean(result) ? 'is-ok' : ''}>
              <CheckCircle2 size={15} aria-hidden="true" />
              答案无冲突
            </p>
            <p className={scReady ? 'is-ok' : ''}>
              <CheckCircle2 size={15} aria-hidden="true" />
              {scGroup ? '七选五就绪' : '缺七选五'}
            </p>
            <p className={clReady ? 'is-ok' : ''}>
              <CheckCircle2 size={15} aria-hidden="true" />
              {clGroup ? (clAnalyzed ? '完形就绪' : '完形待解析') : '缺完形'}
            </p>
            <p className={gfReady ? 'is-ok' : ''}>
              <CheckCircle2 size={15} aria-hidden="true" />
              {gfGroup ? '语法填空就绪' : '缺语法填空'}
            </p>
            <p className={appReady ? 'is-ok' : ''}>
              <CheckCircle2 size={15} aria-hidden="true" />
              {appGroup ? '应用文就绪' : '缺应用文写作'}
            </p>
            <p className={contReady ? 'is-ok' : ''}>
              <CheckCircle2 size={15} aria-hidden="true" />
              {contGroup ? '读后续写就绪' : '缺读后续写'}
            </p>
          </div>
          {missingReadingLabels.length > 0 && result ? (
            <p className="pi-ai-warning">缺少 Reading {missingReadingLabels.join(' / ')}，暂不保存。</p>
          ) : null}
          {missingAnswerCount > 0 ? (
            <p className="pi-ai-warning">还有 {missingAnswerCount} 道题没有答案解析版答案。</p>
          ) : null}
          {answerConflicts.length > 0 ? (
            <div className="pi-ai-conflict-list">
              {answerConflicts.map((item) => (
                <p key={item.questionId}>
                  {item.groupTitle} · {item.questionId}: 答案版 {item.official} / AI {item.ai}
                </p>
              ))}
            </div>
          ) : null}
          {scGroup && scMissingAnswers > 0 ? (
            <p className="pi-ai-warning">七选五还有 {scMissingAnswers} 道题没有答案解析版答案。</p>
          ) : null}
          {scGroup && scAnalysisState.status === 'error' ? (
            <p className="pi-ai-error">七选五解析失败：{scAnalysisState.message}</p>
          ) : null}
          {scGroup && scAnalysisState.status === 'idle' ? (
            <p className="pi-ai-warning">检测到七选五，请先完成解析。</p>
          ) : null}
          {!scGroup && result ? (
            <p className="pi-ai-warning">缺少七选五，暂不保存。</p>
          ) : null}
          {!clGroup && result ? (
            <p className="pi-ai-warning">缺少完形填空，暂不保存。</p>
          ) : null}
          {clGroup && clMissingAnswers > 0 ? (
            <p className="pi-ai-warning">完形还有 {clMissingAnswers} 道题没有答案解析版答案。</p>
          ) : null}
          {clGroup && clAnalysisState.status === 'error' ? (
            <p className="pi-ai-error">完形解析失败：{clAnalysisState.message}</p>
          ) : null}
          {clGroup && clAnalysisState.status === 'idle' ? (
            <p className="pi-ai-warning">检测到完形，请先完成解析。</p>
          ) : null}
          {clError ? (
            <p className="pi-ai-error">完形解析失败：{clError.reason}</p>
          ) : null}
          {!gfGroup && result ? (
            <p className="pi-ai-warning">缺少语法填空，暂不保存。</p>
          ) : null}
          {gfGroup && gfMissingAnswers > 0 ? (
            <p className="pi-ai-warning">语法填空还有 {gfMissingAnswers} 道题没有答案解析版答案。</p>
          ) : null}
          {gfError ? (
            <p className="pi-ai-error">语法填空解析失败：{gfError.reason}</p>
          ) : null}
          {!appGroup && result ? (
            <p className="pi-ai-warning">缺少应用文写作，暂不保存。</p>
          ) : null}
          {appError ? (
            <p className="pi-ai-error">应用文解析失败：{appError.reason}</p>
          ) : null}
          {!contGroup && result ? (
            <p className="pi-ai-warning">缺少读后续写，暂不保存。</p>
          ) : null}
          {contGroup && !contStartersOk ? (
            <p className="pi-ai-warning">读后续写缺少段落开头语，暂不保存。</p>
          ) : null}
          {contError ? (
            <p className="pi-ai-error">读后续写解析失败：{contError.reason}</p>
          ) : null}
          <button className="primary-button pi-ai-publish-button" type="button" disabled={!canPublish} onClick={() => void handlePublish()}>
            {publishState.status === 'publishing' ? <Loader2 size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            保存为正式试卷
          </button>
          {publishState.message ? (
            <p className={publishState.status === 'error' ? 'pi-ai-error' : 'pi-ai-muted'}>{publishState.message}</p>
          ) : null}
          {publishState.result?.publish ? (
            <div className="pi-ai-publish-links">
              {publishState.result.publish.qaLinks.map((link) => (
                <a key={link.groupId} href={link.latestHref}>
                  <ExternalLink size={14} aria-hidden="true" />
                  {link.title} 讲评页
                </a>
              ))}
            </div>
          ) : null}
        </section>

        <section className="pi-ai-panel pi-ai-groups">
          <div className="pi-ai-panel-heading">
            <h2>Reading A-D 预览</h2>
            <span>{result?.readingGroups.length || 0}/4</span>
          </div>
          {result?.readingGroups.length ? (
            <>
              <button
                className="primary-button pi-ai-analyze-all-button"
                type="button"
                disabled={isAnyAnalyzing || allImportAnalyzed}
                onClick={() => void handleAnalyzeAll()}
              >
                {isAnyAnalyzing ? <Loader2 size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
                一键解析 ({analyzedCount}/{result.readingGroups.length})
              </button>
              <div className="pi-ai-group-list">
              {result.readingGroups.map((group) => (
                <article key={group.groupId} className="pi-ai-group-card">
                  <header>
                    <div>
                      <strong>{group.title}</strong>
                      <span>{group.groupId}</span>
                    </div>
                    <em>{group.questions.length} 题 · {group.paragraphs.length} 段</em>
                  </header>
                  <p>{firstPassageLine(group)}</p>
                  <ol>
                    {group.questions.slice(0, 5).map((question) => (
                      <li key={question.id}>
                        <span>{question.stem}</span>
                        <em>答案 {question.answerKey || '待核对'}</em>
                      </li>
                    ))}
                  </ol>
                  <div className="pi-ai-analysis-actions">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={analysisByGroupId[group.groupId]?.status === 'analyzing'}
                      onClick={() => void handleAnalyze(group)}
                    >
                      {analysisByGroupId[group.groupId]?.status === 'analyzing' ? (
                        <Loader2 size={16} aria-hidden="true" />
                      ) : (
                        <Sparkles size={16} aria-hidden="true" />
                      )}
                      生成解析
                    </button>
                    {analysisByGroupId[group.groupId]?.status === 'error' ? (
                      <span className="pi-ai-error">{analysisByGroupId[group.groupId]?.message}</span>
                    ) : null}
                    {analysisByGroupId[group.groupId]?.result ? (
                      <span className="pi-ai-muted">
                        {analysisByGroupId[group.groupId]?.result?.provider} · {analysisByGroupId[group.groupId]?.result?.model} ·{' '}
                        {analysisByGroupId[group.groupId]?.result?.latencyMs}ms
                      </span>
                    ) : null}
                  </div>
                  {analysisByGroupId[group.groupId]?.result ? (
                    <AnalysisReadablePreview group={group} result={analysisByGroupId[group.groupId].result!} />
                  ) : null}
                </article>
              ))}
            </div>
            </>
          ) : (
            <p className="pi-ai-muted">拆题后会按题组显示段落、题干、选项和答案键预览。</p>
          )}
        </section>

        {scGroup ? (
          <section className="pi-ai-panel pi-ai-groups">
            <div className="pi-ai-panel-heading">
              <h2>七选五 预览</h2>
              <span>{scAnalysisState.status === 'done' ? '已解析' : scAnalysisState.status === 'analyzing' ? '解析中' : scAnalysisState.status === 'error' ? '失败' : '待解析'}</span>
            </div>
            <article className="pi-ai-group-card">
              <header>
                <div>
                  <strong>{scGroup.title}</strong>
                  <span>{scGroup.groupId}</span>
                </div>
                <em>{scGroup.questions.length} 题 · {scGroup.optionBank.length} 选项 · {scGroup.paragraphs.length} 段</em>
              </header>
              <p>{scGroup.paragraphs[0]?.text || '未识别到段落文本'}</p>
              <ol>
                {scGroup.questions.map((q) => (
                  <li key={q.id}>
                    <span>{q.stem}</span>
                    <em>答案 {q.answerKey || '待核对'}</em>
                  </li>
                ))}
              </ol>
              <div className="pi-ai-analysis-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={scAnalysisState.status === 'analyzing'}
                  onClick={() => void handleAnalyzeSevenChoices(scGroup)}
                >
                  {scAnalysisState.status === 'analyzing' ? (
                    <Loader2 size={16} aria-hidden="true" />
                  ) : (
                    <Sparkles size={16} aria-hidden="true" />
                  )}
                  生成七选五解析
                </button>
                {scAnalysisState.status === 'error' ? (
                  <span className="pi-ai-error">{scAnalysisState.message}</span>
                ) : null}
                {scAnalysisState.result ? (
                  <span className="pi-ai-muted">
                    {scAnalysisState.result.provider} · {scAnalysisState.result.model} · {scAnalysisState.result.latencyMs}ms
                  </span>
                ) : null}
              </div>
            </article>
          </section>
        ) : scError ? (
          <section className="pi-ai-panel">
            <div className="pi-ai-panel-heading">
              <h2>七选五 检测</h2>
              <span><AlertTriangle size={15} aria-hidden="true" /></span>
            </div>
            <p className="pi-ai-warning">
              检测到七选五但无法解析：{scError.reason === 'seven_choices_missing_option_bank' ? '缺少 A-G 选项池' : scError.reason === 'seven_choices_missing_passage' ? '缺少篇章正文' : scError.reason}
            </p>
          </section>
        ) : null}

        {clGroup ? (
          <section className="pi-ai-panel pi-ai-groups">
            <div className="pi-ai-panel-heading">
              <h2>完形填空 预览</h2>
              <span>{clAnalysisState.status === 'done' ? '已解析' : clAnalysisState.status === 'analyzing' ? '解析中' : clAnalysisState.status === 'error' ? '失败' : '待解析'}</span>
            </div>
            <article className="pi-ai-group-card">
              <header>
                <div>
                  <strong>{clGroup.title}</strong>
                  <span>{clGroup.groupId}</span>
                </div>
                <em>{clGroup.questions.length} 题 · {clGroup.paragraphs.length} 段</em>
              </header>
              <p>{clGroup.paragraphs[0]?.text || '未识别到段落文本'}</p>
              <ol>
                {clGroup.questions.slice(0, 5).map((q) => (
                  <li key={q.id}>
                    <span>{q.stem}</span>
                    <em>答案 {q.answerKey || '待核对'}</em>
                  </li>
                ))}
              </ol>
              <div className="pi-ai-analysis-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={clAnalysisState.status === 'analyzing'}
                  onClick={() => void handleAnalyzeCloze(clGroup)}
                >
                  {clAnalysisState.status === 'analyzing' ? (
                    <Loader2 size={16} aria-hidden="true" />
                  ) : (
                    <Sparkles size={16} aria-hidden="true" />
                  )}
                  生成完形解析
                </button>
                {clAnalysisState.status === 'error' ? (
                  <span className="pi-ai-error">{clAnalysisState.message}</span>
                ) : null}
                {clAnalysisState.result ? (
                  <span className="pi-ai-muted">
                    {clAnalysisState.result.provider} · {clAnalysisState.result.model} · {clAnalysisState.result.latencyMs}ms
                  </span>
                ) : null}
              </div>
            </article>
          </section>
        ) : clError ? (
          <section className="pi-ai-panel">
            <div className="pi-ai-panel-heading">
              <h2>完形填空 检测</h2>
              <span><AlertTriangle size={15} aria-hidden="true" /></span>
            </div>
            <p className="pi-ai-warning">
              检测到完形但无法解析：{clError.reason}
            </p>
          </section>
        ) : null}

        {gfGroup ? (
          <section className="pi-ai-panel pi-ai-groups">
            <div className="pi-ai-panel-heading">
              <h2>语法填空 预览</h2>
              <span>{gfGroup.questions.length} 题 · {gfGroup.paragraphs.length} 段</span>
            </div>
            <article className="pi-ai-group-card">
              <header>
                <div>
                  <strong>{gfGroup.title}</strong>
                  <span>{gfGroup.groupId}</span>
                </div>
                <em>
                  {gfGroup.questions.length}/10 题 · {gfHasAnswers ? `10/10` : `${10 - gfMissingAnswers}/10`} 答案
                  {gfPromptCount > 0 ? ` · ${gfPromptCount} 提示词` : ''}
                  {gfNoPromptCount > 0 ? ` · ${gfNoPromptCount} 无提示词` : ''}
                </em>
              </header>
              <p>{gfGroup.paragraphs[0]?.text || '未识别到段落文本'}</p>
              <ol>
                {gfGroup.questions.slice(0, 5).map((q) => (
                  <li key={q.id}>
                    <span>{q.stem}{q.prompt ? ` (${q.prompt})` : ''}</span>
                    <em>答案 {q.answerKey || '待核对'}</em>
                  </li>
                ))}
              </ol>
            </article>
          </section>
        ) : gfError ? (
          <section className="pi-ai-panel">
            <div className="pi-ai-panel-heading">
              <h2>语法填空 检测</h2>
              <span><AlertTriangle size={15} aria-hidden="true" /></span>
            </div>
            <p className="pi-ai-warning">
              检测到语法填空但无法解析：{gfError.reason}
            </p>
          </section>
        ) : null}

        <section className="pi-ai-panel pi-ai-skipped">
          <div className="pi-ai-panel-heading">
            <h2>跳过项</h2>
            <span>{result?.skipped.length || 0}</span>
          </div>
          {result?.skipped.length ? (
            <div className="pi-ai-skipped-list">
              {result.skipped.map((item, index) => (
                <article key={`${item.reason}-${index}`}>
                  <strong>
                    <AlertTriangle size={15} aria-hidden="true" />
                    {reasonLabel(item.reason)}
                  </strong>
                  <pre>{item.rawText}</pre>
                </article>
              ))}
            </div>
          ) : (
            <p className="pi-ai-muted">完形、语法填空等非当前范围内容会单独列在这里。</p>
          )}
        </section>
      </div>
    </main>
  )
}
