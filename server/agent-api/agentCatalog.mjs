import path from 'node:path'
import { readFileSync } from 'node:fs'
import { listCanonicalPaperCatalog } from '../search/canonicalPaperCatalog.mjs'
import { resolvePaperAssetReadPaths } from '../paper-import/storage.mjs'

function paperEntry(paperId, asset, meta) {
  return {
    paperId, title: meta?.paperName || asset.paper.title, year: meta?.year ?? null,
    type: ({ '真题': 'real', '高考真题': 'real', '模拟题': 'mock', '模拟': 'mock', real: 'real', mock: 'mock' })[meta?.sourceType] ?? null,
    asset,
    groupIds: asset.content.blocks.filter(block => block.type === 'group').map(block => block.groupId),
  }
}

export function listAgentPapers(context) {
  const db = context.openDatabase({ readOnly: true })
  let published
  try { published = listCanonicalPaperCatalog({ db, rootDir: context.paperAssetsDir }) }
  finally { db.close() }
  const papers = published.map(({ paperId, asset }) => {
    const { baseDir } = resolvePaperAssetReadPaths(context.paperAssetsDir, paperId)
    let meta
    try { meta = JSON.parse(readFileSync(path.join(baseDir, 'import-meta.json'), 'utf8')).paper } catch { /* Unknown metadata stays null. */ }
    return paperEntry(paperId, asset, meta)
  })
  return papers.sort((a, b) => a.paperId.localeCompare(b.paperId))
}

export function paperSummary(paper) {
  const { asset, groupIds, ...summary } = paper
  return { ...summary, groupCount: groupIds.length }
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
  return (!params.has('type') || paper.type === params.get('type'))
    && (!params.has('year') || String(paper.year) === params.get('year'))
}

export function groupPreview(group) {
  const texts = []
  function visit(value) {
    if (typeof value === 'string') texts.push(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') {
      if (typeof value.text === 'string') texts.push(value.text)
      else Object.entries(value).filter(([key]) => !/Id$/.test(key)).forEach(([, child]) => visit(child))
    }
  }
  visit(group.passage ?? group.content ?? group.writingTask ?? group.material)
  return Array.from(texts.join(' ')).slice(0, 80).join('')
}
