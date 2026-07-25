#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildPrintHtml } from '../server/print-renderer.mjs'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import {
  buildPaperNormalizedGroupsSidecar,
} from '../server/paper-import/normalization.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const paperAssetsDir = path.join(rootDir, 'app/public/paper-assets')

function readPaperAsset(paperId) {
  return JSON.parse(
    readFileSync(
      path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json'),
      'utf8',
    ),
  )
}

function printItemFromAsset(asset, groupId) {
  const group = asset.content.groups[groupId]
  const answers = asset.answerKey?.answers || {}
  return {
    detail: {
      id: groupId,
      title: group.title,
      groupType:
        group.groupType === 'grammarFill'
          ? 'grammar_cloze'
          : group.groupType,
      passage: {
        title: group.title,
        materialText: group.passage.paragraphs
          .map((paragraph) => paragraph.text)
          .join('\n'),
      },
      questions: group.questionIds.map((questionId) => {
        const question = asset.content.questions[questionId]
        return {
          id: questionId,
          questionNo: String(question.questionNo),
          stem: question.stem ?? '',
          answer: answers[questionId]?.answer ?? '',
          explanation: '',
          note: '',
          options: (question.options || group.optionBank || []).map(
            (option) => ({
              label: option.label,
              content: option.text,
            }),
          ),
        }
      }),
    },
    score: 1.5,
    sectionTitle: '',
    note: '',
  }
}

function renderProofGroup({
  asset,
  groupId,
  versionType = 'student',
  questionNumberStart,
  assetsDir = paperAssetsDir,
}) {
  const normalizationDiagnostics = []
  const html = buildPrintHtml({
    title: asset.paper.title,
    versionType,
    printStyle: 'exam',
    items: [printItemFromAsset(asset, groupId)],
    blocks: [
      { type: 'question_group', questionGroupId: groupId, score: 1.5 },
    ],
    questionNumberStart,
    paperAssetsDir: assetsDir,
    normalizationDiagnostics,
  })
  return { html, normalizationDiagnostics }
}

function exportProofGroup({
  asset,
  groupId,
  questionNumberStart,
  assetsDir = paperAssetsDir,
  mutateDetail = null,
}) {
  const item = printItemFromAsset(asset, groupId)
  if (mutateDetail) mutateDetail(item.detail)
  const exportDir = mkdtempSync(
    path.join(tmpdir(), 'paper-normalization-print-export-'),
  )
  try {
    const implementation = createExportImplementation({
      rootDir,
      exportDir,
      getQuestionGroupDetail: (requestedGroupId) =>
        requestedGroupId === groupId ? item.detail : null,
      buildDocumentXml: () => '',
      writeDocxPackage: () => Buffer.alloc(0),
      buildPrintHtml,
      convertDocxToPdf: () => {},
      renderPrintPdf({ pdfPath }) {
        writeFileSync(pdfPath, Buffer.from('stable-print-pdf-bytes'))
      },
      timestampPrefix: () => 'fixed',
      paperAssetsDir: assetsDir,
    })
    const input = {
      title: asset.paper.title,
      versionType: 'student',
      printStyle: 'exam',
      items: [{ questionGroupId: groupId, score: 1.5 }],
      blocks: [
        { type: 'question_group', questionGroupId: groupId, score: 1.5 },
      ],
      questionNumberStart,
    }
    const htmlResult = implementation.exportPrintHtml(input)
    const pdfResult = implementation.exportPrintPdf(input)
    assert.deepEqual(
      pdfResult.normalizationDiagnostics,
      htmlResult.normalizationDiagnostics,
    )
    assert.equal(
      Buffer.from(pdfResult.body).toString('utf8'),
      'stable-print-pdf-bytes',
    )
    for (const diagnostic of htmlResult.normalizationDiagnostics) {
      if (diagnostic.reason) {
        assert.equal(htmlResult.body.includes(diagnostic.reason), false)
      }
    }
    return htmlResult.normalizationDiagnostics
  } finally {
    rmSync(exportDir, { recursive: true, force: true })
  }
}

const paper2026 = readPaperAsset('paper-2026-i')
const clozeGroupId = 'group-2026-i-cloze'
const cloze = renderProofGroup({
  asset: paper2026,
  groupId: clozeGroupId,
  questionNumberStart: 41,
})

assert.deepEqual(cloze.normalizationDiagnostics, [
  {
    status: 'ready',
    source: 'compatibility',
    paperId: 'paper-2026-i',
    groupId: clozeGroupId,
  },
])
assert.equal(/_{2,}\d+_{2,}/.test(cloze.html), false)
assert.equal(cloze.html.includes('<span class="print-blank-num">41</span>'), true)
assert.equal(cloze.html.includes('class="qnum">41.</span> 41'), false)
assert.equal(cloze.html.includes('A. fantasy'), true)

const grammar2026GroupId = 'group-2026-i-grammar-fill'
const grammar2026 = renderProofGroup({
  asset: paper2026,
  groupId: grammar2026GroupId,
  questionNumberStart: 56,
})
assert.deepEqual(grammar2026.normalizationDiagnostics, [
  {
    status: 'ready',
    source: 'compatibility',
    paperId: 'paper-2026-i',
    groupId: grammar2026GroupId,
  },
])
assert.equal(grammar2026.html.includes('__56__'), false)
assert.equal(grammar2026.html.includes('<span class="print-blank-num">56</span>'), true)
assert.equal(grammar2026.html.includes('<span class="print-blank-hint">(hold)</span>'), true)
assert.equal(grammar2026.html.includes('class="qnum">56.</span> 56'), false)

const paper960 = readPaperAsset('paper-960d0f8d')
const grammar960GroupId = 'group-960d0f8d-grammar-fill'
const grammar960 = renderProofGroup({
  asset: paper960,
  groupId: grammar960GroupId,
  questionNumberStart: 56,
})
assert.deepEqual(grammar960.normalizationDiagnostics, [
  {
    status: 'ready',
    source: 'compatibility',
    paperId: 'paper-960d0f8d',
    groupId: grammar960GroupId,
  },
])
assert.equal(/\d{1,3}\._{2,}/.test(grammar960.html), false)
assert.equal(grammar960.html.includes('<span class="print-blank-num">56</span>'), true)
assert.equal(grammar960.html.includes('<span class="print-blank-hint">(absorb)</span>'), true)
assert.equal(
  grammar960.html.includes(
    '<span class="print-blank-unit"><span class="print-blank print-blank--short"><span class="print-blank-num">57</span></span><span class="print-blank-hint">(absorb)</span></span>',
  ),
  true,
)
for (const protectedNumber of ['2026', '25-30g', '800g', '3-5g', '30g', '10g']) {
  assert.equal(
    grammar960.html.includes(protectedNumber),
    true,
    `protected prose number ${protectedNumber}`,
  )
}

const combinedItems = [
  printItemFromAsset(paper2026, clozeGroupId),
  printItemFromAsset(paper2026, grammar2026GroupId),
  printItemFromAsset(paper960, grammar960GroupId),
]
const combinedBlocks = [
  { type: 'section_header', title: '第三部分 完形填空' },
  { type: 'question_group', questionGroupId: clozeGroupId, score: 1.5 },
  { type: 'page_break' },
  { type: 'section_header', title: '第四部分 语法填空（2026-I）' },
  { type: 'question_group', questionGroupId: grammar2026GroupId, score: 1.5 },
  { type: 'page_break' },
  { type: 'section_header', title: '第四部分 语法填空（960d0f8d）' },
  { type: 'question_group', questionGroupId: grammar960GroupId, score: 1.5 },
]
const studentCombined = buildPrintHtml({
  title: 'Canonical Print',
  versionType: 'student',
  printStyle: 'exam',
  items: combinedItems,
  blocks: combinedBlocks,
  questionNumberStart: 41,
  paperAssetsDir,
})
const teacherCombined = buildPrintHtml({
  title: 'Canonical Print',
  versionType: 'teacher',
  printStyle: 'exam',
  items: combinedItems,
  blocks: combinedBlocks,
  questionNumberStart: 41,
  paperAssetsDir,
})
if (process.env.T07_VISUAL_OUTPUT_DIR) {
  mkdirSync(process.env.T07_VISUAL_OUTPUT_DIR, { recursive: true })
  writeFileSync(
    path.join(process.env.T07_VISUAL_OUTPUT_DIR, 'ticket-07-proof-student.html'),
    studentCombined,
  )
  writeFileSync(
    path.join(process.env.T07_VISUAL_OUTPUT_DIR, 'ticket-07-proof-teacher.html'),
    teacherCombined,
  )
}
assert.equal(studentCombined.includes('【答案】'), false)
assert.equal(teacherCombined.includes('【答案】'), true)
assert.equal(studentCombined.includes('<span class="print-blank-num">55</span>'), true)
assert.equal(studentCombined.includes('<span class="print-blank-num">56</span>'), true)
assert.equal(studentCombined.includes('<span class="print-blank-num">65</span>'), true)
assert.equal(studentCombined.includes('<span class="print-blank-num">66</span>'), true)
assert.equal(studentCombined.includes('<span class="print-blank-num">75</span>'), true)
assert.equal(studentCombined.includes('class="qnum">41.</span> 41'), false)
assert.equal(studentCombined.includes('class="qnum">56.</span> 56'), false)
const orderFacts = [
  studentCombined.indexOf('第三部分 完形填空'),
  studentCombined.indexOf('<span class="print-blank-num">41</span>'),
  studentCombined.indexOf('class="page-break"'),
  studentCombined.indexOf('第四部分 语法填空（2026-I）'),
  studentCombined.indexOf('<span class="print-blank-num">56</span>'),
  studentCombined.lastIndexOf('class="page-break"'),
  studentCombined.indexOf('第四部分 语法填空（960d0f8d）'),
  studentCombined.indexOf('<span class="print-blank-num">66</span>'),
]
assert.equal(
  orderFacts.every((position, index) =>
    position >= 0 && (index === 0 || position > orderFacts[index - 1])),
  true,
  `block order ${JSON.stringify(orderFacts)}`,
)
const blankRule = studentCombined.match(/\.print-blank \{[^}]*\}/)?.[0] || ''
assert.match(blankRule, /display:\s*inline-block/)
assert.match(blankRule, /white-space:\s*nowrap/)
assert.match(blankRule, /border-bottom:\s*0\.48pt solid #000/)
assert.match(blankRule, /text-align:\s*center/)
assert.match(studentCombined, /\.print-blank--short \{ width: 3\.3em; \}/)
assert.match(studentCombined, /\.print-blank--seven \{ width: 4\.6em; \}/)

const mismatchedItem = printItemFromAsset(paper2026, clozeGroupId)
mismatchedItem.detail.questions[0].id = 'stale-question-id'
const mismatchDiagnostics = []
const mismatchedHtml = buildPrintHtml({
  title: 'Mismatched print input',
  versionType: 'student',
  printStyle: 'exam',
  items: [mismatchedItem],
  blocks: [
    { type: 'question_group', questionGroupId: clozeGroupId, score: 1.5 },
  ],
  questionNumberStart: 41,
  paperAssetsDir,
  normalizationDiagnostics: mismatchDiagnostics,
})
assert.equal(
  mismatchDiagnostics[0]?.reason,
  'canonical_print_input_mismatch',
)
assert.equal(mismatchedHtml.includes('<span class="print-blank-num">41</span>'), true)

function writeAssetBundle(parentDir, asset, sidecar) {
  const latestDir = path.join(
    parentDir,
    asset.paper.paperId,
    'latest',
  )
  mkdirSync(latestDir, { recursive: true })
  writeFileSync(
    path.join(latestDir, 'paper-asset.json'),
    `${JSON.stringify(asset)}\n`,
  )
  if (sidecar !== undefined) {
    writeFileSync(
      path.join(latestDir, 'paper-normalized-groups-v1.json'),
      typeof sidecar === 'string'
        ? sidecar
        : `${JSON.stringify(sidecar)}\n`,
    )
  }
}

const scratchDir = mkdtempSync(
  path.join(tmpdir(), 'paper-normalization-print-html-'),
)
try {
  const sidecarResult = buildPaperNormalizedGroupsSidecar(paper2026)
  assert.equal(sidecarResult.status, 'ready')
  writeAssetBundle(scratchDir, paper2026, sidecarResult.sidecar)
  const sidecarCloze = renderProofGroup({
    asset: paper2026,
    groupId: clozeGroupId,
    questionNumberStart: 41,
    assetsDir: scratchDir,
  })
  assert.equal(sidecarCloze.normalizationDiagnostics[0]?.source, 'sidecar')
  assert.equal(sidecarCloze.html.includes('__41__'), false)

  const nonProofSidecarDir = path.join(scratchDir, 'non-proof-sidecar')
  const paper960SidecarResult = buildPaperNormalizedGroupsSidecar(paper960)
  assert.equal(paper960SidecarResult.status, 'ready')
  writeAssetBundle(
    nonProofSidecarDir,
    paper960,
    paper960SidecarResult.sidecar,
  )
  const nonProofSidecar = renderProofGroup({
    asset: paper960,
    groupId: 'group-960d0f8d-cloze',
    questionNumberStart: 41,
    assetsDir: nonProofSidecarDir,
  })
  assert.equal(nonProofSidecar.normalizationDiagnostics[0]?.status, 'legacy')
  assert.equal(
    nonProofSidecar.normalizationDiagnostics[0]?.reason,
    'canonical_not_enabled_for_group',
  )

  const staleDir = path.join(scratchDir, 'stale')
  const staleSidecar = structuredClone(sidecarResult.sidecar)
  staleSidecar.groups[clozeGroupId].sourceFingerprint = '0'.repeat(64)
  writeAssetBundle(staleDir, paper2026, staleSidecar)
  const staleCloze = renderProofGroup({
    asset: paper2026,
    groupId: clozeGroupId,
    questionNumberStart: 41,
    assetsDir: staleDir,
  })
  assert.equal(staleCloze.normalizationDiagnostics[0]?.source, 'compatibility')
  assert.equal(staleCloze.normalizationDiagnostics[0]?.artifact, 'rejected')
  assert.equal(staleCloze.html.includes('__41__'), false)

  const invalidDir = path.join(scratchDir, 'invalid')
  writeAssetBundle(invalidDir, paper2026, '{not-json')
  const invalidCloze = renderProofGroup({
    asset: paper2026,
    groupId: clozeGroupId,
    questionNumberStart: 41,
    assetsDir: invalidDir,
  })
  assert.equal(invalidCloze.normalizationDiagnostics[0]?.source, 'compatibility')
  assert.equal(invalidCloze.normalizationDiagnostics[0]?.artifact, 'rejected')

  const needsReviewDir = path.join(scratchDir, 'needs-review')
  const conflictingAsset = structuredClone(paper2026)
  conflictingAsset.content.blanks['blank-2026-i-056'].prompt = 'conflict'
  writeAssetBundle(needsReviewDir, conflictingAsset)
  const needsReview = renderProofGroup({
    asset: conflictingAsset,
    groupId: grammar2026GroupId,
    questionNumberStart: 56,
    assetsDir: needsReviewDir,
  })
  assert.equal(needsReview.normalizationDiagnostics[0]?.status, 'legacy')
  assert.equal(
    needsReview.normalizationDiagnostics[0]?.reason,
    'compatibility_needs_review',
  )
  assert.equal(needsReview.html.includes('__56__'), false)
  assert.equal(needsReview.html.includes('(hold)'), true)

  const missingDir = path.join(scratchDir, 'missing')
  writeAssetBundle(missingDir, paper960)
  const legacyClozeGroupId = 'group-960d0f8d-cloze'
  const missing = renderProofGroup({
    asset: paper960,
    groupId: legacyClozeGroupId,
    questionNumberStart: 41,
    assetsDir: missingDir,
  })
  assert.equal(missing.normalizationDiagnostics[0]?.status, 'legacy')
  assert.equal(
    missing.normalizationDiagnostics[0]?.reason,
    'canonical_not_enabled_for_group',
  )
  assert.equal(missing.html.includes('<span class="print-blank-num">41</span>'), true)

  const hostDiagnostics = [
    exportProofGroup({
      asset: paper2026,
      groupId: clozeGroupId,
      questionNumberStart: 41,
    }),
    exportProofGroup({
      asset: conflictingAsset,
      groupId: grammar2026GroupId,
      questionNumberStart: 56,
      assetsDir: needsReviewDir,
    }),
    exportProofGroup({
      asset: paper960,
      groupId: legacyClozeGroupId,
      questionNumberStart: 41,
      assetsDir: nonProofSidecarDir,
    }),
    exportProofGroup({
      asset: paper2026,
      groupId: clozeGroupId,
      questionNumberStart: 41,
      assetsDir: staleDir,
    }),
    exportProofGroup({
      asset: paper2026,
      groupId: clozeGroupId,
      questionNumberStart: 41,
      assetsDir: invalidDir,
    }),
    exportProofGroup({
      asset: paper2026,
      groupId: clozeGroupId,
      questionNumberStart: 41,
      mutateDetail(detail) {
        detail.questions[0].id = 'stale-question-id'
      },
    }),
  ]
  assert.deepEqual(
    hostDiagnostics.map((diagnostics) => ({
      status: diagnostics[0]?.status,
      source: diagnostics[0]?.source,
      artifact: diagnostics[0]?.artifact,
      reason: diagnostics[0]?.reason,
    })),
    [
      {
        status: 'ready',
        source: 'compatibility',
        artifact: undefined,
        reason: undefined,
      },
      {
        status: 'legacy',
        source: 'legacy',
        artifact: undefined,
        reason: 'compatibility_needs_review',
      },
      {
        status: 'legacy',
        source: 'legacy',
        artifact: undefined,
        reason: 'canonical_not_enabled_for_group',
      },
      {
        status: 'ready',
        source: 'compatibility',
        artifact: 'rejected',
        reason: undefined,
      },
      {
        status: 'ready',
        source: 'compatibility',
        artifact: 'rejected',
        reason: undefined,
      },
      {
        status: 'legacy',
        source: 'legacy',
        artifact: undefined,
        reason: 'canonical_print_input_mismatch',
      },
    ],
  )
} finally {
  rmSync(scratchDir, { recursive: true, force: true })
}

console.log('PASS paper normalization Print HTML: canonical proof groups')
