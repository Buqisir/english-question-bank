#!/usr/bin/env node

import assert from 'node:assert/strict'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { validateReadingContract } from '../shared/paper-canonical/reading.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'
import {
  bindCanonicalFixtureRequest,
  makeFramedColumnsCanonicalFixture,
  makeFramedColumnsReadingBlocks,
} from '../test-fixtures/paper-canonical/framedColumnsFixture.mjs'
import { makeSz2026M1ReadingAFramedColumns } from '../shared/paper-canonical/paperMockSz2026M1ReadingAFramedColumns.mjs'

function compileSource(source, fixture = makeReadyCanonicalFixture()) {
  return compileCanonicalPaper(bindCanonicalFixtureRequest(fixture, source).request)
}

function readingGroupFromCompilation(compilation) {
  return compilation.artifacts.canonicalPaper.questionGroups.find(
    (group) => group.identity.groupId === 'group:reading.a',
  )
}

function projectCompilation(compilation) {
  return projectCanonicalPaper({
    plan: compilation.artifacts.canonicalPaper.paperPlan,
    groups: compilation.artifacts.canonicalPaper.questionGroups,
    sourceCapture: compilation.artifacts.sourceCapture,
  })
}

function readingConsumption(compilation, projected) {
  const readingOccurrences = projected.nodes.filter(
    (node) => node.kind === 'group' && node.familyContractId === 'reading',
  )
  return {
    disposition: 'ready',
    paperId: compilation.artifacts.canonicalPaper.paperPlan.paperId,
    mediaArtifacts: [],
    selections: [{
      familyContractId: 'reading',
      mode: 'canonical',
      groupIds: readingOccurrences.map((occurrence) => occurrence.groupId),
      projectedOccurrences: readingOccurrences,
    }],
  }
}

function assertBlocked(compilation, code) {
  assert.notEqual(compilation.disposition, 'ready', `expected ${code} to block compile`)
  assert.equal(
    compilation.artifacts.normalizationReport.diagnostics.some((item) => item.code === code),
    true,
    `expected diagnostic ${code}, got ${
      compilation.artifacts.normalizationReport.diagnostics.map((item) => item.code).join(', ')
    }`,
  )
}

function mutateFramedColumns(mutate) {
  const fixture = makeFramedColumnsCanonicalFixture()
  const group = fixture.source.groups.find((item) => item.slotId === 'reading.a')
  mutate(group.content.blocks.find((block) => block.kind === 'framed_columns'))
  return compileSource(fixture.source, fixture)
}

const unchanged = compileCanonicalPaper(makeReadyCanonicalFixture().request)
assert.equal(unchanged.disposition, 'ready')
assert.equal(
  unchanged.artifacts.canonicalPaper.questionGroups
    .find((group) => group.identity.groupId === 'group:reading.a')
    .content.blocks.every((block) => block.kind === 'paragraph'),
  true,
)

const fixture = makeFramedColumnsCanonicalFixture()
const compiled = compileCanonicalPaper(fixture.request)
assert.equal(
  compiled.disposition,
  'ready',
  compiled.artifacts.normalizationReport.diagnostics.map((item) => `${item.code}: ${item.message}`).join('\n'),
)
const compiledGroup = readingGroupFromCompilation(compiled)
assert.equal(compiledGroup.content.blocks[1].kind, 'framed_columns')
assert.equal(compiledGroup.content.blocks[1].columnCount, 2)
assert.equal(compiledGroup.content.blocks[1].columns[0].blocks.some((block) => block.kind === 'table'), true)
assert.equal(compiledGroup.content.blocks[1].columns[1].blocks.every((block) => block.kind === 'paragraph'), true)
assert.equal(compiledGroup.content.blocks[1].columns[0].columnHeading, 'paragraph:puzzle-heading')
assert.equal(compiledGroup.variant.passageBlockRoles.length, 0)

const projected = projectCompilation(compiled)
const readingA = projected.nodes.find((node) => node.kind === 'group' && node.groupId === 'group:reading.a')
assert.equal(readingA.blocks[1].kind, 'framed_columns')
assert.equal(readingA.anchors.contentNodeIds.includes('column:puzzle'), true)
assert.equal(readingA.anchors.contentNodeIds.includes('table:country-map'), true)
assert.equal(readingA.anchors.contentNodeIds.includes('paragraph:solution-heading'), true)

const consumption = readingConsumption(compiled, projected)
const consumer = projectCanonicalConsumerGroup({
  consumption,
  familyContractId: 'reading',
  groupId: 'group:reading.a',
})
assert.equal(consumer.blocks[1].kind, 'framed_columns')
assert.equal(consumer.blocks[1].columns[0].columnHeading, 'paragraph:puzzle-heading')
assert.equal(consumer.blocks[1].columns[0].blocks.some((block) => block.kind === 'table'), true)
assert.equal(consumer.blocks[1].columns[1].blocks.every((block) => block.kind === 'paragraph'), true)
assert.equal(
  consumer.blocks[1].columns[0].blocks.find((block) => block.nodeId === 'paragraph:puzzle-heading').role,
  'body',
)

const contractIssues = validateReadingContract({
  questionIds: compiledGroup.questionRefs.map(({ questionId }) => questionId),
  blankIds: [],
  content: compiledGroup.content,
  media: compiledGroup.media,
  variant: compiledGroup.variant,
  assertions: compiled.artifacts.sourceCapture.assertions,
})
assert.deepEqual(contractIssues, [])

assertBlocked(mutateFramedColumns((block) => {
  block.columnCount = 1
  block.columns = [block.columns[0]]
}), 'RICH_BLOCK_UNSUPPORTED')

assertBlocked(mutateFramedColumns((block) => {
  block.columns[0].blocks.push({
    kind: 'figure',
    nodeId: 'figure:in-column',
    mediaId: 'media:missing',
    caption: [{ kind: 'text', nodeId: 'text:figure-in-column', text: 'diagram' }],
  })
}), 'RICH_BLOCK_UNSUPPORTED')

assertBlocked(mutateFramedColumns((block) => {
  block.columns[0].blocks.push({
    kind: 'framed_columns',
    nodeId: 'framed-columns:nested',
    columnCount: 2,
    columns: [
      {
        columnId: 'column:nested-a',
        blocks: [{
          kind: 'paragraph',
          nodeId: 'paragraph:nested-a',
          inlines: [{ kind: 'text', nodeId: 'text:nested-a', text: 'Nested left.' }],
        }],
      },
      {
        columnId: 'column:nested-b',
        blocks: [{
          kind: 'paragraph',
          nodeId: 'paragraph:nested-b',
          inlines: [{ kind: 'text', nodeId: 'text:nested-b', text: 'Nested right.' }],
        }],
      },
    ],
  })
}), 'RICH_BLOCK_UNSUPPORTED')

assertBlocked(mutateFramedColumns((block) => {
  block.columns[0].blocks.push({
    kind: 'question',
    nodeId: 'question:in-column',
    questionId: compiledGroup.questionRefs[0].questionId,
  })
}), 'RICH_BLOCK_UNSUPPORTED')

assertBlocked(mutateFramedColumns((block) => {
  block.columns[0].columnHeading = 'table:country-map'
}), 'RICH_FRAMED_COLUMNS_HEADING_INVALID')

assertBlocked(mutateFramedColumns((block) => {
  block.columns[0].columnHeading = 'paragraph:solution-heading'
}), 'RICH_FRAMED_COLUMNS_HEADING_INVALID')

const clozeFixture = makeReadyCanonicalFixture()
const cloze = clozeFixture.source.groups.find((group) => group.slotId === 'language.cloze')
cloze.content.blocks.push(makeFramedColumnsReadingBlocks()[1])
assertBlocked(compileSource(clozeFixture.source, clozeFixture), 'RICH_BLOCK_UNSUPPORTED')

const badHeadingOccurrence = structuredClone(readingA)
badHeadingOccurrence.blocks[1].columns[0].columnHeading = 'table:country-map'
const badConsumption = readingConsumption(compiled, {
  nodes: projected.nodes.map((node) => (
    node.groupId === 'group:reading.a' ? badHeadingOccurrence : node
  )),
})
assert.throws(
  () => projectCanonicalConsumerGroup({
    consumption: badConsumption,
    familyContractId: 'reading',
    groupId: 'group:reading.a',
  }),
  (error) => error.code === 'CANONICAL_CONSUMPTION_REJECTED',
)

const figureInColumnOccurrence = structuredClone(readingA)
figureInColumnOccurrence.blocks[1].columns[0].blocks.push({
  kind: 'figure',
  nodeId: 'figure:projected-reject',
  mediaId: 'media:missing',
  caption: [{ kind: 'text', nodeId: 'text:projected-reject', text: 'diagram' }],
})
figureInColumnOccurrence.anchors.contentNodeIds = [
  ...figureInColumnOccurrence.anchors.contentNodeIds,
  'figure:projected-reject',
  'text:projected-reject',
]
const figureConsumption = readingConsumption(compiled, {
  nodes: projected.nodes.map((node) => (
    node.groupId === 'group:reading.a' ? figureInColumnOccurrence : node
  )),
})
assert.throws(
  () => projectCanonicalConsumerGroup({
    consumption: figureConsumption,
    familyContractId: 'reading',
    groupId: 'group:reading.a',
  }),
  (error) => error.code === 'CANONICAL_CONSUMPTION_REJECTED',
)

const szFixture = makeFramedColumnsCanonicalFixture()
const szGroup = szFixture.source.groups.find((item) => item.slotId === 'reading.a')
szGroup.content = {
  blocks: [
    szGroup.content.blocks[0],
    makeSz2026M1ReadingAFramedColumns(),
  ],
}
const szCompiled = compileCanonicalPaper(bindCanonicalFixtureRequest(szFixture, szFixture.source).request)
assert.equal(
  szCompiled.disposition,
  'ready',
  szCompiled.artifacts.normalizationReport.diagnostics.map((item) => `${item.code}: ${item.message}`).join('\n'),
)
const szCompiledGroup = readingGroupFromCompilation(szCompiled)
const szFramed = szCompiledGroup.content.blocks[1]
assert.equal(szFramed.kind, 'framed_columns')
assert.equal(szFramed.columns[0].blocks.some((block) => block.kind === 'table'), true)
assert.equal(szFramed.columns[1].blocks.length, 5)
assert.match(JSON.stringify(szFramed), /ბრაზილია/)
assert.match(JSON.stringify(szFramed), /Argentina/)
assert.equal(szCompiledGroup.variant.passageBlockRoles.length, 0)

console.log('verify-paper-canonical-framed-columns: PASS')
