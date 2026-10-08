export type NotebookPaper = {
  paperId: string
  paperTitle: string
  entryCount: number
  lastAddedAt: string
}

export type NotebookRange = { start: number; end: number; quote: string }

export type NotebookContext = {
  id: string
  entryId: string
  source: {
    selectedText: string
    sentenceText: string
    selectionInSentence: { start: number; end: number }
    sourceKind: 'sentence' | 'fragment'
    role: string
  }
  glossZh: string | null
  translationZh: string | null
  targetRanges: NotebookRange[]
  enrichment: {
    glossStatus: string
    translationStatus: string
    alignmentStatus: string
    retryable: boolean
  }
}

export type NotebookEntry = {
  id: string
  groupId: string
  groupLabel: string
  groupOrder: number
  headword: string
  pronunciations: Array<{ pos: string; items: Array<{ dialect: string; ipa: string }> }>
  meanings: string[]
  contexts: NotebookContext[]
}

export type NotebookPaperDetail = {
  paperId: string
  paperTitle: string
  entryCount: number
  revisions: Array<{
    sourceRevision: string
    groups: Array<{ groupId: string; groupLabel: string; entries: NotebookEntry[] }>
  }>
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || '生词本暂时没有打开')
    throw error
  }
  return body as T
}

export function fetchNotebookPapers() {
  return fetch('/api/vocabulary-notebook/papers').then((response) => readJson<{ papers: NotebookPaper[] }>(response))
}

export function fetchNotebookPaper(paperId: string) {
  return fetch(`/api/vocabulary-notebook/papers/${encodeURIComponent(paperId)}`).then((response) => readJson<NotebookPaperDetail>(response))
}

export function fetchNotebookSelectionState(body: {
  paperId: string
  sourceRevision: string
  segments: Array<{ streamId: string; start: number; end: number; selectedText: string }>
}) {
  return fetch('/api/vocabulary-notebook/selection-state', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // The read-only check never replays, but the shared request shape caps the id at 80 characters.
    body: JSON.stringify({ schemaVersion: 'vocabulary-notebook-add-v1', clientMutationId: `state-${crypto.randomUUID()}`, ...body }),
  }).then((response) => readJson<{ state: 'not-added' | 'entry-exists' | 'occurrence-exists'; contextId: string | null; entryId: string | null }>(response))
}

export function addNotebookContext(body: {
  clientMutationId: string
  paperId: string
  sourceRevision: string
  segments: Array<{ streamId: string; start: number; end: number; selectedText: string }>
}) {
  return fetch('/api/vocabulary-notebook/contexts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 'vocabulary-notebook-add-v1', ...body }),
  }).then((response) => readJson<{ created: boolean; contextId: string; entryId: string; state: string }>(response))
}

export function enrichNotebookContext(contextId: string) {
  return fetch(`/api/vocabulary-notebook/contexts/${encodeURIComponent(contextId)}/enrich`, { method: 'POST' })
    .then((response) => readJson<{ saved?: boolean; discarded?: boolean }>(response))
}

export function deleteNotebookContext(contextId: string) {
  return fetch(`/api/vocabulary-notebook/contexts/${encodeURIComponent(contextId)}`, { method: 'DELETE' })
    .then((response) => readJson<{ deleted: boolean }>(response))
}

export function deleteNotebookEntry(entryId: string) {
  return fetch(`/api/vocabulary-notebook/entries/${encodeURIComponent(entryId)}`, { method: 'DELETE' })
    .then((response) => readJson<{ deleted: boolean; contexts: number }>(response))
}
