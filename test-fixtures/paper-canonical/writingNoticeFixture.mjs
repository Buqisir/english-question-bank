import assert from 'node:assert/strict'
import { makeDrawingAreaSourceInput, drawingAreaConsumption } from './applicationDrawingAreaFixture.mjs'
import { importCanonicalCandidate, rederiveConfirmedCanonicalCandidate } from '../../shared/paper-canonical/compiler.mjs'
import { consumerContractRefs } from '../../shared/paper-canonical/consumers.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { buildCanonicalApplicationWritingConsumptionSurfaceData,
  buildCanonicalContinuationWritingConsumptionSurfaceData } from '../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'

// Compile the actual source-block layout before exercising either consumer.
export function writingNoticeFixture({ family = 'application', texts, marked = false, multiple = false }) {
  const sourceInput = makeDrawingAreaSourceInput({ drawing: false, listening: false })
  const materialization = JSON.parse(Buffer.from(sourceInput.materializationBytes))
  const sourceGroup = materialization.groups.find(group => group.family === `${family}-writing`)
  const start = sourceGroup.blocks.findIndex(block => block.blockId === `block:${family}-notice`)
  const original = sourceGroup.blocks[start]
  sourceGroup.blocks.splice(start, 3, ...texts.map((text, index) => ({
    ...structuredClone(original), blockId: `block:${family}-notice-${index}`,
    content: (marked ? text.split(/(80|150|增加细节)/u).filter(Boolean) : [text])
      .map(text => ({ kind: 'text', text })),
  })))
  if (multiple) {
    materialization.schemaVersion = 'nck1-source-materialization-v7'
    sourceGroup.writingTask.givenBlockRefs = sourceGroup.blocks.slice(-2).map(block => block.blockId)
  }
  sourceInput.materializationBytes = Buffer.from(JSON.stringify(materialization))
  const imported = importCanonicalCandidate(sourceInput)
  assert.deepEqual(imported.issues, [])
  const confirmed = rederiveConfirmedCanonicalCandidate(imported.candidate, {
    schemaVersion: 'teacher-confirmation-v1', candidateDigest: imported.candidate.candidateDigest,
    sourceDigest: imported.candidate.source.sha256, confirmed: true,
  })
  assert(confirmed.compilation?.artifacts.canonicalPaper, JSON.stringify(confirmed.unresolvedIssues))
  const compilation = confirmed.compilation
  const group = compilation.artifacts.canonicalPaper.questionGroups.find(group =>
    group.contractRef.familyContractId === `${family}-writing`)
  if (marked) {
    // Like the drawing-area fixture, exercise existing Canonical marks directly,
    // without adding a marks input capability to source materialization.
    for (const block of group.content.blocks.filter(block => block.nodeId.includes(`notice-`))) {
      for (const node of block.inlines) {
        if (/^(?:80|150|增加细节)$/u.test(node.text)) node.marks = ['underline']
      }
    }
    const { sourceMap, sourceFingerprint, semanticDigest, ...semantic } = group
    group.semanticDigest = digestJson(semantic)
  }
  const printConsumption = drawingAreaConsumption(compilation)
  const screenConsumption = drawingAreaConsumption(compilation, consumerContractRefs.screen)
  const build = family === 'application' ? buildCanonicalApplicationWritingConsumptionSurfaceData
    : buildCanonicalContinuationWritingConsumptionSurfaceData
  const screen = build({ consumption: screenConsumption, groupId: group.identity.groupId })
  const key = family === 'application' ? 'promptBlocks' : 'materialBlocks'
  const prop = family === 'application' ? 'canonicalApplicationPromptBlocks' : 'canonicalContinuationMaterialBlocks'
  const item = { detail: { id: group.identity.groupId, paperId: printConsumption.paperId,
    groupType: 'writing', passage: '', questions: [] }, score: family === 'application' ? 15 : 25 }
  return {
    printInput: { title: 'Writing notice source lines', versionType: 'student', printStyle: 'exam',
      items: [item], blocks: [{ type: 'question_group', questionGroupId: item.detail.id, score: item.score }],
      questionNumberStart: 1, canonicalConsumption: printConsumption },
    screenProps: { ...screen.surfaceData, multipleApplicationNotices: screen.multipleApplicationNotices, [prop]: screen[key], annotations: [], mode: 'lecture',
      lectureFocus: null, readingFocusBySection: {}, onFocusIntent() {} },
    sourceBlocks: screen[key], sourceInput, imported, compilation,
  }
}
