import path from 'node:path'
import { readFileSync } from 'node:fs'
import { listCanonicalPaperCatalog } from '../search/canonicalPaperCatalog.mjs'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'

const reviewPaperCaches = new WeakMap()

// Most imported configs carry no sourceType; the paperId convention in
// docs/product/nck1-paper-standard.md (paper-mock-… vs paper-YYYY-…/paper-gaokao-…) is the fallback.
function typeFromPaperId(paperId) {
  if (paperId.startsWith('paper-mock-')) return 'mock'
  if (/^paper-(gaokao-)?\d{4}-/.test(paperId)) return 'real'
  return null
}

function paperEntry(paperId, asset, meta) {
  return {
    paperId, title: meta?.paperName || asset.paper.title, year: meta?.year ?? null,
    type: ({ '真题': 'real', '高考真题': 'real', '模拟题': 'mock', '模拟': 'mock', real: 'real', mock: 'mock', real_exam: 'real', mock_exam: 'mock' })[meta?.sourceType] ?? typeFromPaperId(paperId),
    asset,
    groupIds: asset.content.blocks.filter(block => block.type === 'group').map(block => block.groupId),
  }
}

export function listAgentPapers(context, reviewStore) {
  const db = context.openDatabase({ readOnly: true })
  let published
  try {
    published = listCanonicalPaperCatalog({ db, rootDir: context.paperAssetsDir })
    if (db.prepare("SELECT name FROM sqlite_master WHERE name = 'sources'").get()) {
      const types = db.prepare('SELECT DISTINCT source_type FROM sources WHERE file_ref = ?')
      for (const paper of published) {
        const rows = types.all(`paper-assets/${paper.paperId}/latest/paper-asset.json`)
        if (rows.length === 1) paper.sourceType = rows[0].source_type
      }
    }
  }
  finally { db.close() }
  const papers = published.map(({ paperId, asset, sourceType }) => {
    const { baseDir } = resolvePaperAssetReadPaths(context.paperAssetsDir, paperId)
    let meta
    try { meta = JSON.parse(readFileSync(path.join(baseDir, 'import-meta.json'), 'utf8')).paper } catch { /* Unknown metadata stays null. */ }
    return { ...paperEntry(paperId, asset, { ...meta, sourceType: meta?.sourceType ?? sourceType }), status: 'published' }
  })
  const publishedIds = new Set(papers.map(paper => paper.paperId))
  if (reviewStore) {
    const cache = reviewPaperCaches.get(reviewStore) || new Map()
    reviewPaperCaches.set(reviewStore, cache)
    const activeKeys = new Set()
    for (const revision of reviewStore.listAwaitingCandidateRevisions()) {
      if (publishedIds.has(revision.paperId)) continue
      const key = `${revision.id}:${revision.bundleDigest}`
      activeKeys.add(key)
      const paper = cache.get(key) || { paperId: revision.paperId, title: revision.paperName,
        year: null, type: typeFromPaperId(revision.paperId),
        status: 'awaiting_review', revisionId: revision.id }
      paper.load = () => {
        if (!paper.asset) {
          try {
            const { paperAsset, meta } = reviewStore.agentPaperAssetForRevision(revision.id)
            Object.assign(paper, paperEntry(revision.paperId, paperAsset, meta))
            cache.set(key, paper)
          } catch { return null } // An unreadable Candidate must not break other papers.
        }
        return paper
      }
      papers.push(paper)
    }
    for (const key of cache.keys()) if (!activeKeys.has(key)) cache.delete(key)
  }
  return papers.sort((a, b) => a.paperId.localeCompare(b.paperId))
}

export function paperSummary(paper) {
  const { asset, groupIds, load, ...summary } = paper
  return { ...summary, groupCount: groupIds?.length ?? null }
}

export function agentGroup(paper, groupId) {
  const group = paper.asset.content.groups[groupId]
  const section = paper.asset.layoutTree?.parts?.flatMap(part => part.sections?.flatMap(section =>
    section.groups?.some(item => item.groupId === groupId) ? [section.title || part.title] : []) || [])
    .find(Boolean) || group.section || group.groupType
  const questions = (group.questionIds || []).map(questionId => {
    const question = paper.asset.content.questions[questionId]
    const answer = paper.asset.answerKey?.answers?.[questionId]
    return {
      questionId, number: question.questionNo, stem: question.stem ?? question.blankId ?? '',
      options: (question.options?.length ? question.options : group.optionBank || [])
        .map(option => ({ label: option.label, content: option.text ?? option.content ?? '' })),
      answer: answer?.answer ?? null,
    }
  })
  // Retain the original passage structure and family-specific fields (shared
  // options, listening material, writing task) rather than flattening the text.
  const { questionIds, ...content } = group
  const writingTask = paper.asset.content.writingTasks?.[group.writingTaskId]
  return { ...content, groupId, section, ...(writingTask ? { writingTask } : {}), questions }
}

export function matchesPaper(paper, params) {
  const needsLoad = params.has('year') || (params.has('type') && paper.type === null)
  if (needsLoad && paper.load && !paper.load()) return false
  return (!params.has('type') || paper.type === params.get('type'))
    && (!params.has('year') || String(paper.year) === params.get('year'))
}

export function matchesQuery(text, q = '') {
  const haystack = text.toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(word => haystack.includes(word))
}

export function groupText(group) {
  const texts = []
  function visit(value) {
    if (typeof value === 'string') texts.push(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') {
      if (typeof value.text === 'string') texts.push(value.text)
      else Object.entries(value).filter(([key]) => !/Id$/.test(key)).forEach(([, child]) => visit(child))
    }
  }
  visit(group)
  return texts.join(' ')
}

export function groupPreview(group) {
  return Array.from(groupText(group.passage ?? group.content ?? group.writingTask ?? group.material)).slice(0, 80).join('')
}
