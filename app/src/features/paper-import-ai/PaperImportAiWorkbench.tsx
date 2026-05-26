import { AlertTriangle, ArrowLeft, FileText, Loader2, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  parsePaperImportAiDocx,
  type PaperImportAiParseResult,
  type PaperImportAiReadingGroup,
} from '../../services/paperImportAi'
import './paperImportAiWorkbench.css'

type PaperImportAiWorkbenchProps = {
  onBackToWorkbench: () => void
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function firstPassageLine(group: PaperImportAiReadingGroup) {
  return group.paragraphs.find((paragraph) => paragraph.text.trim())?.text || '未识别到段落文本'
}

function reasonLabel(reason: string) {
  if (reason === 'seven_choices_deferred_to_i2') return '七选五留到 I2'
  if (reason.endsWith('_out_of_scope_for_i1')) return 'I1 范围外'
  if (reason.includes('missing_questions_or_options')) return '题干或选项不完整'
  if (reason.includes('missing_passage')) return '缺少语篇正文'
  return reason
}

export function PaperImportAiWorkbench({ onBackToWorkbench }: PaperImportAiWorkbenchProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<PaperImportAiParseResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'error'>('idle')
  const [message, setMessage] = useState('')

  function acceptFile(nextFile: File | null) {
    setMessage('')
    setResult(null)
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

  async function handleParse() {
    if (!file) return
    setStatus('parsing')
    setMessage('')
    try {
      const parsed = await parsePaperImportAiDocx(file)
      setResult(parsed)
      setStatus('idle')
      setMessage(`已识别 ${parsed.readingGroups.length} 个 Reading 题组。`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const questionCount = result?.readingGroups.reduce((sum, group) => sum + group.questions.length, 0) || 0

  return (
    <main className="pi-ai-shell">
      <header className="pi-ai-topbar">
        <button className="ghost-button" type="button" onClick={onBackToWorkbench}>
          <ArrowLeft size={16} aria-hidden="true" />
          返回题库
        </button>
        <div>
          <p className="eyebrow">I1 Owner-only Paper Import AI</p>
          <h1>AI 导题预检台</h1>
        </div>
        <div className="pi-ai-status">{status === 'parsing' ? 'Parsing' : 'Preview only'}</div>
      </header>

      <div className="pi-ai-layout">
        <section
          className="pi-ai-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            acceptFile(event.dataTransfer.files.item(0))
          }}
        >
          <UploadCloud size={38} aria-hidden="true" />
          <h2>上传完整试卷 DOCX</h2>
          <p>当前只做本地拆题预检：识别 Reading A-D、展示跳过项，不调用 LLM，不保存文件。</p>
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
            <p className="pi-ai-muted">拖入或选择一个 `.docx`，预检台会调用 `/api/paper-import-ai/parse`。</p>
          )}
          <button className="primary-button pi-ai-parse-button" type="button" disabled={!file || status === 'parsing'} onClick={handleParse}>
            {status === 'parsing' ? <Loader2 size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
            拆题预检
          </button>
          {message ? (
            <p className={status === 'error' ? 'pi-ai-error' : 'pi-ai-muted'}>{message}</p>
          ) : null}
        </section>

        <section className="pi-ai-panel pi-ai-summary">
          <div className="pi-ai-panel-heading">
            <h2>识别概览</h2>
            <span>{result ? result.paper.paperId : '未生成'}</span>
          </div>
          <div className="pi-ai-summary-grid">
            <strong>{result?.readingGroups.length || 0}</strong>
            <span>Reading 题组</span>
            <strong>{questionCount}</strong>
            <span>题目</span>
            <strong>{result?.skipped.length || 0}</strong>
            <span>跳过项</span>
          </div>
        </section>

        <section className="pi-ai-panel pi-ai-groups">
          <div className="pi-ai-panel-heading">
            <h2>Reading A-D 预览</h2>
            <span>{result?.readingGroups.length || 0}/4</span>
          </div>
          {result?.readingGroups.length ? (
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
                </article>
              ))}
            </div>
          ) : (
            <p className="pi-ai-muted">拆题后会按题组显示段落、题干、选项和答案键预览。</p>
          )}
        </section>

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
            <p className="pi-ai-muted">七选五、完形、语法填空等非 I1 范围内容会单独列在这里。</p>
          )}
        </section>
      </div>
    </main>
  )
}
