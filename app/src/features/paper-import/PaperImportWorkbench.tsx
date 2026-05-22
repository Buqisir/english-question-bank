import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  FileJson,
  FileText,
  FolderOpen,
  Send,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  publishPaperImport,
  type PaperImportIssue,
  type PaperImportPublishResult,
  type PaperImportValidation,
  validatePaperImport,
} from '../../services/paperImport'
import './paperImportWorkbench.css'

type PaperImportWorkbenchProps = {
  onBackToWorkbench: () => void
}

type ImportMetaDraft = {
  paperId: string
  sourceFileName: string
  sourceFileSha256: string
  importedBy?: string
  importedAt?: string
  paper: {
    year: number | string
    region: string
    paperName: string
    examCode: string
    subject: string
    sourceType: string
    defaultTags: string
  }
  groups: Record<string, unknown>
}

const allowedExtensions = new Set(['.docx', '.json'])

function extensionOf(fileName: string) {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index).toLowerCase() : ''
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function readImportMetaDraft(value: unknown): ImportMetaDraft | null {
  const json = value as {
    sourceFileName?: string
    sourceFileSha256?: string
    paper?: {
      year?: number | string
      region?: string
      paperName?: string
      examCode?: string
      subject?: string
      sourceType?: string
      defaultTags?: string[]
    }
  }
  if (!json?.paper) return null
  return {
    paperId: (value as { paperId?: string }).paperId || '',
    sourceFileName: json.sourceFileName || '',
    sourceFileSha256: json.sourceFileSha256 || '',
    importedBy: (value as { importedBy?: string }).importedBy,
    importedAt: (value as { importedAt?: string }).importedAt,
    paper: {
      year: json.paper.year || '',
      region: json.paper.region || '',
      paperName: json.paper.paperName || '',
      examCode: json.paper.examCode || '',
      subject: json.paper.subject || 'English',
      sourceType: json.paper.sourceType || '真题',
      defaultTags: (json.paper.defaultTags || []).join(', '),
    },
    groups: (value as { groups?: Record<string, unknown> }).groups || {},
  }
}

async function readImportMetaFile(files: File[]) {
  const metaFile = files.find((file) => file.name === 'import-meta.json')
  if (!metaFile) return null
  try {
    return readImportMetaDraft(JSON.parse(await metaFile.text()))
  } catch {
    return null
  }
}

function buildRepairPrompt(validation: PaperImportValidation | null) {
  const issues = [...(validation?.blockingIssues || []), ...(validation?.warnings || [])]
  if (issues.length === 0) {
    return '当前没有需要修复的问题。'
  }
  return [
    '请修复这份 C7 整卷导入包的 JSON。只输出需要替换的 .json 文件，不要解释。',
    '',
    '问题清单：',
    ...issues.map((issue, index) => {
      const fix = issue.suggestedFix ? ` 修复建议：${issue.suggestedFix}` : ''
      return `${index + 1}. [${issue.severity}] ${issue.code}: ${issue.message}${fix}`
    }),
  ].join('\n')
}

function patchImportMetaFile(files: File[], draft: ImportMetaDraft | null) {
  if (!draft) return files
  return files.map((file) => {
    if (file.name !== 'import-meta.json') return file
    const tags = draft.paper.defaultTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
    const patched = {
      schemaVersion: 'import-meta-v1',
      paperId: draft.paperId,
      sourceFileName: draft.sourceFileName,
      sourceFileSha256: draft.sourceFileSha256,
      importedBy: draft.importedBy,
      importedAt: draft.importedAt,
      paper: {
        year: Number(draft.paper.year),
        region: draft.paper.region,
        paperName: draft.paper.paperName,
        examCode: draft.paper.examCode,
        subject: draft.paper.subject,
        sourceType: draft.paper.sourceType,
        defaultTags: tags,
      },
      groups: draft.groups,
    }
    return new File([`${JSON.stringify(patched, null, 2)}\n`], 'import-meta.json', {
      type: 'application/json',
    })
  })
}

function IssueList({ issues, title }: { issues: PaperImportIssue[]; title: string }) {
  if (issues.length === 0) return null
  return (
    <section className="pi-import-issues">
      <h3>{title}</h3>
      <ul>
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${index}`} className={`pi-import-issue pi-import-issue--${issue.severity}`}>
            <strong>{issue.code}</strong>
            <span>{issue.message}</span>
            {issue.suggestedFix ? <em>{issue.suggestedFix}</em> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PaperImportWorkbench({ onBackToWorkbench }: PaperImportWorkbenchProps) {
  const [files, setFiles] = useState<File[]>([])
  const [rejectedFiles, setRejectedFiles] = useState<Array<{ fileName: string; reason: string }>>([])
  const [validation, setValidation] = useState<PaperImportValidation | null>(null)
  const [publishResult, setPublishResult] = useState<PaperImportPublishResult | null>(null)
  const [status, setStatus] = useState<'idle' | 'validating' | 'publishing' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [metaDraft, setMetaDraft] = useState<ImportMetaDraft | null>(null)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    readImportMetaFile(files).then(setMetaDraft)
  }, [files])

  useEffect(() => {
    const shouldWarn = files.length > 0 && !publishResult?.ok
    const handler = (event: BeforeUnloadEvent) => {
      if (!shouldWarn) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [files.length, publishResult?.ok])

  const submitFiles = useMemo(() => patchImportMetaFile(files, metaDraft), [files, metaDraft])

  function addFiles(nextFiles: FileList | File[]) {
    const nextRejected: Array<{ fileName: string; reason: string }> = []
    const accepted: File[] = []
    for (const file of Array.from(nextFiles)) {
      const extension = extensionOf(file.name)
      if (!allowedExtensions.has(extension)) {
        nextRejected.push({ fileName: file.name, reason: '只允许 .docx / .json' })
        continue
      }
      if (file.size > 5_000_000) {
        nextRejected.push({ fileName: file.name, reason: '单文件超过 5MB' })
        continue
      }
      accepted.push(file)
    }
    setRejectedFiles((current) => [...nextRejected, ...current].slice(0, 12))
    setFiles((current) => {
      const byName = new Map(current.map((file) => [file.name, file]))
      for (const file of accepted) byName.set(file.name, file)
      return Array.from(byName.values()).slice(0, 20)
    })
    setValidation(null)
    setPublishResult(null)
  }

  function removeFile(fileName: string) {
    setFiles((current) => current.filter((file) => file.name !== fileName))
    setValidation(null)
    setPublishResult(null)
  }

  async function handleValidate() {
    setStatus('validating')
    setMessage('')
    try {
      const result = await validatePaperImport(submitFiles)
      setValidation(result)
      setStatus('idle')
      setMessage(result.ok ? '校验通过，可以发布。' : '校验未通过，请先修复阻断项。')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function handlePublish() {
    setStatus('publishing')
    setMessage('')
    try {
      const result = await publishPaperImport(submitFiles)
      setPublishResult(result)
      setValidation(result.validation)
      setStatus('idle')
      setMessage(result.ok ? '发布完成。' : '发布被校验阻断。')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function copyRepairPrompt() {
    await navigator.clipboard.writeText(buildRepairPrompt(validation))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const readingPreview = validation?.structurePreview.filter(
    (item) => item.groupType === 'reading' && /reading-[abcd]$/i.test(item.groupId),
  )

  return (
    <main className="pi-import-shell">
      <header className="pi-import-topbar">
        <button className="ghost-button" type="button" onClick={onBackToWorkbench}>
          返回题库
        </button>
        <div>
          <p className="eyebrow">C7 Whole Paper Import</p>
          <h1>整卷导入工作台</h1>
        </div>
        <div className="pi-import-topbar-status">{status === 'idle' ? 'Ready' : status}</div>
      </header>

      <div className="pi-import-layout">
        <section
          className="pi-import-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            addFiles(event.dataTransfer.files)
          }}
        >
          <UploadCloud size={36} aria-hidden="true" />
          <h2>上传试卷包</h2>
          <p>.docx + paper-asset.json + answer-key.json + import-meta.json + reading-choice-analysis-v1.json</p>
          <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>
            <FolderOpen size={16} aria-hidden="true" />
            选择文件
          </button>
          <input
            ref={inputRef}
            className="pi-import-file-input"
            type="file"
            multiple
            accept=".docx,.json"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files)
              event.currentTarget.value = ''
            }}
          />
        </section>

        <section className="pi-import-panel">
          <div className="pi-import-panel-heading">
            <h2>文件清单</h2>
            <span>{files.length}/20</span>
          </div>
          <ul className="pi-import-file-list">
            {files.map((file) => (
              <li key={file.name}>
                {file.name.endsWith('.json') ? <FileJson size={16} /> : <FileText size={16} />}
                <span>{file.name}</span>
                <em>{formatSize(file.size)}</em>
                <button type="button" aria-label={`移除 ${file.name}`} onClick={() => removeFile(file.name)}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          {rejectedFiles.length > 0 ? (
            <div className="pi-import-rejected">
              {rejectedFiles.map((file, index) => (
                <p key={`${file.fileName}-${index}`}>
                  {file.fileName}: {file.reason}
                </p>
              ))}
            </div>
          ) : null}
        </section>

        <section className="pi-import-panel pi-import-meta">
          <div className="pi-import-panel-heading">
            <h2>元数据</h2>
            <span>{metaDraft ? 'import-meta.json' : '等待文件'}</span>
          </div>
          {metaDraft ? (
            <div className="pi-import-meta-grid">
              {[
                ['year', '年份'],
                ['region', '地区'],
                ['paperName', '试卷名'],
                ['examCode', '考试代码'],
                ['subject', '科目'],
                ['sourceType', '来源类型'],
                ['defaultTags', '默认标签'],
              ].map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    value={String(metaDraft.paper[key as keyof ImportMetaDraft['paper']] ?? '')}
                    onChange={(event) =>
                      setMetaDraft((current) =>
                        current
                          ? { ...current, paper: { ...current.paper, [key]: event.target.value } }
                          : current,
                      )
                    }
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="pi-import-muted">上传 import-meta.json 后可编辑发布元数据。</p>
          )}
        </section>

        <section className="pi-import-panel">
          <div className="pi-import-panel-heading">
            <h2>修复提示词</h2>
            <button className="ghost-button" type="button" onClick={copyRepairPrompt} disabled={!validation}>
              <Clipboard size={15} />
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          <p className="pi-import-muted">校验失败后复制给外部 AI，只要求它输出替换用 JSON 文件。</p>
        </section>

        <section className="pi-import-panel pi-import-actions">
          <button className="primary-button" type="button" onClick={handleValidate} disabled={files.length === 0 || status !== 'idle'}>
            <CheckCircle2 size={16} />
            校验
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={handlePublish}
            disabled={!validation?.ok || status !== 'idle'}
          >
            <Send size={16} />
            发布
          </button>
          {message ? <p className={status === 'error' ? 'pi-import-error' : 'pi-import-muted'}>{message}</p> : null}
        </section>

        <section className="pi-import-panel pi-import-report">
          <div className="pi-import-panel-heading">
            <h2>校验报告</h2>
            {validation?.ok ? <span className="pi-import-pass">通过</span> : validation ? <span>未通过</span> : null}
          </div>
          {validation ? (
            <>
              <IssueList issues={validation.blockingIssues} title="阻断项" />
              <IssueList issues={validation.warnings} title="警告" />
              {validation.blockingIssues.length === 0 && validation.warnings.length === 0 ? (
                <p className="pi-import-muted">没有发现问题。</p>
              ) : null}
            </>
          ) : (
            <p className="pi-import-muted">点击校验后显示 schema、business validation 和 quote 定位结果。</p>
          )}
        </section>

        <section className="pi-import-panel pi-import-preview">
          <div className="pi-import-panel-heading">
            <h2>Reading A-D 预览</h2>
            <span>{readingPreview?.length || 0}/4</span>
          </div>
          <div className="pi-import-reading-grid">
            {(readingPreview || []).map((item) => (
              <article key={item.groupId}>
                <strong>{item.title}</strong>
                <span>{item.questionIds.length} 题</span>
                <span>{item.paragraphCount} 段</span>
              </article>
            ))}
          </div>
        </section>

        <section className="pi-import-panel pi-import-publish">
          <div className="pi-import-panel-heading">
            <h2>发布结果</h2>
            {publishResult?.ok ? <span className="pi-import-pass">v{publishResult.publish?.assetVersion}</span> : null}
          </div>
          {publishResult?.ok && publishResult.publish ? (
            <div className="pi-import-links">
              {publishResult.publish.qaLinks.map((link) => (
                <span key={link.groupId} className="pi-import-link-pair">
                  <a href={link.latestHref}>{link.title} 最新解析</a>
                  <a href={link.versionHref}>{link.title} v{publishResult.publish?.assetVersion} 解析</a>
                </span>
              ))}
            </div>
          ) : (
            <p className="pi-import-muted">
              发布成功后会生成 Reading A-D QA 链接，七选五、完形和语法填空不会显示假解析入口。
            </p>
          )}
          {validation && !validation.ok ? (
            <p className="pi-import-warning">
              <AlertTriangle size={15} /> 阻断项修复前不能发布。
            </p>
          ) : null}
        </section>
      </div>
    </main>
  )
}
