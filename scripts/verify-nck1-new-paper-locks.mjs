#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertApplicationChromeFromGroups,
  assertNck1ApplicationChrome,
  assertPublishedWritingAnalysisEnvelope,
  isFormat3Config,
  projectStagedWritingAnalysis,
} from './import-pipeline/lib-nck1-new-paper-locks.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0

function check(label, fn) {
  fn()
  passed += 1
  console.log(`PASS ${label}`)
}

check('format ③ is the new-paper writing/chrome lock', () => {
  assert.equal(isFormat3Config({ format: '3' }), true)
  assert.equal(isFormat3Config({ format: 3 }), true)
  assert.equal(isFormat3Config({ format: '1' }), false)
})

check('groups.json rejects glued word-count without inventing a required title', () => {
  assertApplicationChromeFromGroups({
    paragraphs: [{ text: '请写一篇演讲稿，内容包括：(1)陈述看法，(2)提出建议。' }],
    applicationGiven: 'Should the Club Open to Beginners?',
  })
  assert.throws(
    () => assertApplicationChromeFromGroups({
      paragraphs: [{ text: '请写一篇演讲稿（词数80左右。）' }],
      applicationGiven: 'Title',
    }),
    /glue/,
  )
  assertApplicationChromeFromGroups({ paragraphs: [{ text: '请写一封信。' }] })
})

check('application chrome follows semantic refs for letters, titles and evidenced empty boxes', () => {
  const texts = ['请给朋友写一封信。', '注意：写作词数应为80个左右。', 'Dear Alex,', 'I am writing to share some news.', 'Yours,', 'Lin']
  const roles = ['salutation', 'opening', 'closing', 'signature']
  const letter = {
    content: { blocks: texts.map((text, index) => ({ nodeId: `b${index}`, inlines: [{ kind: 'text', text }] })) },
    variant: {
      family: 'application-writing', promptBlockRefs: ['b0', 'b1'],
      givenSkeleton: { presence: 'provided', parts: roles.map((role, index) => ({
        role, blockRef: `b${index + 2}`, placement: index < 2 ? 'answer_region_top' : 'answer_region_bottom',
      })) },
    },
  }
  assertNck1ApplicationChrome(letter)
  const title = structuredClone(letter)
  title.content.blocks = title.content.blocks.slice(0, 3)
  title.content.blocks[2].inlines[0].text = 'Our School Library'
  title.variant.givenSkeleton.parts = [{ role: 'title', blockRef: 'b2', placement: 'answer_region_top' }]
  assertNck1ApplicationChrome(title)
  const absent = structuredClone(letter)
  absent.content.blocks = absent.content.blocks.slice(0, 2)
  absent.variant.givenSkeleton = { presence: 'none', answerRegionAbsenceAssertionRef: 'reviewed-empty-region' }
  assertNck1ApplicationChrome(absent)
  delete absent.variant.givenSkeleton.answerRegionAbsenceAssertionRef
  assert.throws(() => assertNck1ApplicationChrome(absent), /evidenced absence/)
  const misplaced = structuredClone(letter)
  misplaced.variant.givenSkeleton.parts[2].placement = 'answer_region_top'
  assert.throws(() => assertNck1ApplicationChrome(misplaced), /wrong response-box placement/)
  const duplicate = structuredClone(letter)
  duplicate.content.blocks.push({ nodeId: 'duplicate', inlines: [{ text: texts[2] }] })
  duplicate.variant.promptBlockRefs.push('duplicate')
  assertNck1ApplicationChrome(duplicate) // Equal text at different source refs is not duplicate ownership.
  duplicate.variant.promptBlockRefs.push('b2')
  assert.throws(() => assertNck1ApplicationChrome(duplicate), /not again in the prompt/)
  const opaque = structuredClone(letter)
  opaque.variant.mode = 'legacy_opaque'
  assert.throws(() => assertNck1ApplicationChrome(opaque), /needs source review/)
})

check('projectStagedWritingAnalysis requires a complete application ReviewCard', () => {
  assert.throws(
    () => projectStagedWritingAnalysis({
      taskType: 'application',
      modelAnswer: 'Hello',
      reviewCard: { form: '倡议书' },
    }),
    /application-review-card-v2/,
  )
})

const liveGroupsPath = path.join(
  rootDir,
  'app/public/paper-assets/paper-mock-gd-2026-m1/latest/canonical/canonical-question-groups-v1.json',
)
const liveWritingPath = path.join(
  rootDir,
  'app/public/paper-assets/paper-mock-gd-2026-m1/latest/analyses/writing-analysis-v1.json',
)
if (existsSync(liveGroupsPath)) {
  check('published format ③ mock keeps NCK1 application chrome', () => {
    const liveGroups = JSON.parse(readFileSync(liveGroupsPath, 'utf8'))
    const application = (liveGroups.groups || []).find(
      (group) => group.variant?.family === 'application-writing',
    )
    assertNck1ApplicationChrome(application)
  })
}
if (existsSync(liveWritingPath)) {
  check('published format ③ historical V1 continuation remains readable', () => {
    assertPublishedWritingAnalysisEnvelope(JSON.parse(readFileSync(liveWritingPath, 'utf8')), {
      paperId: 'paper-mock-gd-2026-m1',
      applicationGroupId: 'group-mock-gd-2026-m1-writing-application',
      continuationGroupId: 'group-mock-gd-2026-m1-writing-continuation',
    })
  })
}

const szGroupsPath = path.join(
  rootDir,
  'app/public/paper-assets/paper-mock-sz-2026-m1/latest/canonical/canonical-question-groups-v1.json',
)
const szStagedGroupsPath = path.join(
  rootDir,
  'scripts/import-pipeline/papers/paper-mock-sz-2026-m1/groups.json',
)
if (existsSync(szGroupsPath)) {
  check('published format ② PDF pair keeps Reading A puzzle as framed_columns', () => {
    const liveGroups = JSON.parse(readFileSync(szGroupsPath, 'utf8'))
    const readingA = (liveGroups.groups || []).find(
      (group) => (group.identity?.groupId || group.groupId) === 'group-mock-sz-2026-m1-reading-a',
    )
    const blocks = readingA?.content?.blocks || []
    const intro = blocks[0]
    const framed = blocks[1]
    const contest = blocks[2]
    const introText = (intro?.inlines || []).map((inline) => inline.text).join('')
    const contestText = (contest?.inlines || []).map((inline) => inline.text).join('')
    assert.match(introText, /International Linguistics Olympiad/)
    assert.equal(framed?.kind, 'framed_columns')
    assert.equal(framed.columnCount, 2)
    assert.equal(framed.columns?.[0]?.columnHeading, 'paragraph:sz-2026-m1-reading-a-puzzle-heading')
    assert.equal(framed.columns?.[1]?.columnHeading, 'paragraph:sz-2026-m1-reading-a-solution-heading')
    const leftText = JSON.stringify(framed.columns[0])
    const rightText = JSON.stringify(framed.columns[1])
    assert.match(leftText, /A Puzzle/)
    assert.match(leftText, /ბრაზილია/)
    assert.match(leftText, /პერუ/)
    assert.match(leftText, /ურუგვაი/)
    assert.match(leftText, /არგენტინა/)
    assert.equal(
      framed.columns[0].blocks.some((block) => block.kind === 'table' && block.columnCount === 2 && block.rows?.length === 3),
      true,
    )
    assert.match(rightText, /The Solution/)
    assert.match(rightText, /Argentina/)
    assert.match(rightText, /left-to-right/)
    assert.equal(framed.columns[1].blocks.every((block) => block.kind === 'paragraph'), true)
    assert.equal(contest?.kind, 'paragraph')
    assert.equal(contestText, 'Contest Rules')
    assert.equal(
      blocks.some((block) => block.kind === 'figure' && /reading-a-puzzle/.test(String(block.mediaId || ''))),
      false,
    )
    const hasFigureMarker = (block) => {
      if (block?.kind === 'paragraph') {
        return /\[图:/.test((block.inlines || []).map((inline) => inline.text).join(''))
      }
      if (block?.kind === 'table') {
        return (block.rows || []).some((row) =>
          (row.cells || []).some((cell) => /\[图:/.test((cell.inlines || []).map((inline) => inline.text).join(''))))
      }
      if (block?.kind === 'framed_columns') {
        return (block.columns || []).some((column) => (column.blocks || []).some(hasFigureMarker))
      }
      return false
    }
    assert.equal(blocks.some(hasFigureMarker), false)
    const liveFigureManifestPath = path.join(
      rootDir,
      'app/public/paper-assets/paper-mock-sz-2026-m1/latest/figures/manifest.json',
    )
    const livePuzzlePngPath = path.join(
      rootDir,
      'app/public/paper-assets/paper-mock-sz-2026-m1/latest/figures/reading-a-puzzle-1.png',
    )
    if (existsSync(liveFigureManifestPath)) {
      const manifest = JSON.parse(readFileSync(liveFigureManifestPath, 'utf8'))
      const figureIds = (manifest.figures || []).map((figure) => figure.figureId)
      assert.equal(figureIds.includes('fig-paper-mock-sz-2026-m1-reading-a-puzzle-1'), true)
      assert.equal(figureIds.includes('fig-paper-mock-sz-2026-m1-reading-d-q33'), true)
      assert.equal(figureIds.includes('fig-paper-mock-sz-2026-m1-writing-application-lamp'), true)
      assert.equal(existsSync(livePuzzlePngPath), true)
    }
    const readingD = (liveGroups.groups || []).find(
      (group) => (group.identity?.groupId || group.groupId) === 'group-mock-sz-2026-m1-reading-d',
    )
    const application = (liveGroups.groups || []).find(
      (group) => group.variant?.family === 'application-writing',
    )
    assert.equal(
      (readingD?.content?.blocks || []).some((block) => block.kind === 'framed_columns'),
      false,
    )
    assert.equal(
      (application?.content?.blocks || []).some((block) => block.kind === 'framed_columns'),
      false,
    )
    if (existsSync(szStagedGroupsPath)) {
      const staged = JSON.parse(readFileSync(szStagedGroupsPath, 'utf8'))
      const stagedReadingA = (staged.readingGroups || []).find(
        (group) => group.groupId === 'group-mock-sz-2026-m1-reading-a',
      )
      assert.equal(
        (stagedReadingA?.paragraphs || []).some((paragraph) =>
          paragraph.text.includes('[图: fig-paper-mock-sz-2026-m1-reading-a-puzzle-1]')),
        true,
      )
    }
  })
}

console.log(`\nverify-nck1-new-paper-locks: ${passed} passed, 0 failed`)
