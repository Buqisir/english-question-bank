import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { resolvePaperAssetReadPaths } from '../../paper-import/storage.mjs'
import { safeFileTitle } from './paper.mjs'
import { array, nonEmptyString } from './text.mjs'

export const ANALYSIS_FILES = Object.freeze({
  reading: 'reading-choice-analysis-v1.json',
  sevenChoices: 'seven-choices-analysis-v1.json',
  cloze: 'cloze-analysis-v1.json',
  grammarFill: 'grammar-fill-analysis-v1.json',
  writing: 'writing-analysis-v1.json',
  listening: 'listening-analysis-v1.json',
})

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

export function assertSafePaperId(paperId) {
  const normalized = nonEmptyString(paperId)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(normalized) || normalized.includes('..')) {
    throw new Error('paperId is invalid')
  }
  return normalized
}

export function loadCompanionAnalysisSource({ paperAssetsDir, paperId }) {
  if (!paperAssetsDir) throw new Error('paperAssetsDir is required')
  const normalizedPaperId = assertSafePaperId(paperId)
  const { baseDir, assetPath } = resolvePaperAssetReadPaths(paperAssetsDir, normalizedPaperId)
  if (!existsSync(assetPath)) {
    const error = new Error(`Paper asset not found: ${normalizedPaperId}`)
    error.code = 'COMPANION_ANALYSIS_NOT_FOUND'
    throw error
  }
  const analyses = Object.fromEntries(Object.entries(ANALYSIS_FILES).map(([key, fileName]) => {
    const filePath = path.join(baseDir, 'analyses', fileName)
    return [key, existsSync(filePath) ? readJson(filePath) : null]
  }))
  if (!Object.values(analyses).some(Boolean)) {
    const error = new Error('这份试卷的配套解析尚未发布')
    error.code = 'COMPANION_ANALYSIS_NOT_FOUND'
    throw error
  }
  return {
    paperAsset: readJson(assetPath),
    analyses,
  }
}

export function companionAnalysisFileName(paperAsset, extension = 'pdf') {
  return `${safeFileTitle(paperAsset?.paper?.title)}-配套解析.${extension}`
}

export const revisionGroupTitles = {
  'listening.short-dialogue': '听力短对话',
  'listening.long-form': '听力长对话与独白',
  sevenChoices: '七选五',
  cloze: '完形填空',
  grammarFill: '语法填空',
  'writing.application': '应用文写作',
  'writing.continuation': '读后续写',
}

export function revisionAnalysisSource(projection) {
  const { paperAsset, analysisSidecars, consumption, materialization, sourceReferences } = projection
  const nodes = array(consumption?.visibleStructure)
  const titles = new Map(nodes.filter(node => node.kind === 'instruction')
    .map(node => [node.instructionId, node.text]))
  const groupsBySlot = new Map(Object.values(paperAsset.content.groups).map(group => [group.title, group]))
  const parts = []
  for (const node of nodes) {
    if (node.kind === 'part') parts.push({ title: titles.get(node.instructionId), sections: [] })
    if (node.kind === 'section') parts.at(-1).sections.push({ title: titles.get(node.instructionId), groups: [] })
    if (node.kind === 'group') {
      const group = paperAsset.content.groups[node.groupId] ?? groupsBySlot.get(node.slotId)
      if (!group) continue
      const section = parts.at(-1).sections.at(-1)
      const isReading = /^reading\.[a-d]$/u.test(node.slotId)
      const sectionTitle = isReading ? '阅读理解'
        : revisionGroupTitles[node.slotId] ?? revisionGroupTitles[group.groupType]
      if (sectionTitle && !section.groups.length) section.title = sectionTitle
      section.groups.push({ groupId: group.groupId,
        title: isReading ? node.slotId.at(-1).toUpperCase() : sectionTitle ?? section.title })
    }
  }
  const media = new Map(array(materialization?.media).map(item => [item.mediaId, item]))
  const answers = { ...paperAsset.answerKey?.answers }
  for (const answer of array(materialization?.listening?.answers)) {
    const questionId = `question:listening:${answer.canonicalNumber}`
    if (answer.provenance === 'unofficial' && answers[questionId]) {
      answers[questionId] = { ...answers[questionId], provenance: answer.provenance }
    }
  }
  return {
    paperAsset: { ...paperAsset, answerKey: { ...paperAsset.answerKey, answers }, layoutTree: { parts } },
    analyses: Object.fromEntries(Object.entries(ANALYSIS_FILES)
      .map(([key, fileName]) => [key, analysisSidecars[fileName]])),
    sourceReferencesByGroup: new Map(array(sourceReferences?.groups)
      .map(group => [group.groupId, group])),
    listeningSegmentOrder: new Map(array(materialization?.listening?.transcript)
      .map(({ segmentId }, index) => [segmentId, index + 1])),
    figuresByGroup: new Map(array(materialization?.groups).map(group => [group.groupId,
      group.blocks.filter(block => block.kind === 'figure').map(block => ({
        ...block, textRegions: media.get(block.mediaId)?.textRegions,
      }))])),
  }
}
