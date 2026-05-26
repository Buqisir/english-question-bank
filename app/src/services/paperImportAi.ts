export type PaperImportAiQuestion = {
  id: string
  stem: string
  options: Record<'A' | 'B' | 'C' | 'D', string>
  answerKey: string
}

export type PaperImportAiReadingGroup = {
  groupId: string
  title: string
  order: number
  paragraphs: Array<{ id: string; text: string }>
  questions: PaperImportAiQuestion[]
}

export type PaperImportAiSkippedItem = {
  rawText: string
  reason: string
}

export type PaperImportAiParseResult = {
  paper: {
    paperId: string
    sourceFilename: string
    sourceHash: string
  }
  readingGroups: PaperImportAiReadingGroup[]
  skipped: PaperImportAiSkippedItem[]
}

const API_ORIGIN = 'http://127.0.0.1:8787'

function apiPath(path: string) {
  if (typeof window === 'undefined') return path
  if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
    return path
  }
  return `${API_ORIGIN}${path}`
}

async function parseError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  return new Error(data?.error || fallback)
}

export async function parsePaperImportAiDocx(file: File) {
  const formData = new FormData()
  formData.append('files', file, file.name)
  const response = await fetch(apiPath('/api/paper-import-ai/parse'), {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    throw await parseError(response, `Failed to parse paper import AI DOCX: ${response.status}`)
  }
  return (await response.json()) as PaperImportAiParseResult
}
