#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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

import { createDocxRenderer } from '../server/exports/docxRenderer.mjs'
import {
  buildPaperNormalizedGroupsSidecar,
} from '../server/paper-import/normalization.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const paperAssetsDir = path.join(rootDir, 'app/public/paper-assets')
const groupTypeLabels = {
  cloze: '完形填空',
  grammar_cloze: '语法填空',
}
const optionalString = (value) =>
  typeof value === 'string' ? value.trim() : ''

function readPaperAsset(paperId) {
  return JSON.parse(
    readFileSync(
      path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json'),
      'utf8',
    ),
  )
}

function docxItemFromAsset(asset, groupId) {
  const group = asset.content.groups[groupId]
  const answers = asset.answerKey?.answers || {}
  return {
    detail: {
      id: groupId,
      title: group.title,
      source: asset.paper.title,
      groupType:
        group.groupType === 'grammarFill'
          ? 'grammar_cloze'
          : group.groupType === 'sevenChoices'
            ? 'seven_choices'
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

function renderProofGroups({
  items,
  blocks,
  versionType = 'student',
  printStyle = 'exam',
  questionNumberStart,
  assetsDir = paperAssetsDir,
}) {
  const normalizationDiagnostics = []
  const renderer = createDocxRenderer({
    groupTypeLabels,
    optionalString,
    paperAssetsDir: assetsDir,
  })
  const xml = renderer.buildDocumentXml({
    title: 'Canonical DOCX',
    versionType,
    printStyle,
    items,
    blocks,
    questionNumberStart,
    normalizationDiagnostics,
  })
  return { xml, normalizationDiagnostics }
}

function renderProofGroup({
  asset,
  groupId,
  versionType = 'student',
  questionNumberStart,
  assetsDir = paperAssetsDir,
}) {
  return renderProofGroups({
    items: [docxItemFromAsset(asset, groupId)],
    blocks: [
      {
        type: 'question_group',
        questionGroupId: groupId,
        score: 1.5,
      },
    ],
    versionType,
    questionNumberStart,
    assetsDir,
  })
}

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

const paper2026 = readPaperAsset('paper-2026-i')
const paper960 = readPaperAsset('paper-960d0f8d')
const clozeGroupId = 'group-2026-i-cloze'
const grammar2026GroupId = 'group-2026-i-grammar-fill'
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
assert.equal(/\d{1,3}\._{2,}/.test(grammar960.xml), false)
assert.equal(grammar960.xml.includes('<w:u w:val="single"/>'), true)
assert.equal(grammar960.xml.includes('  56  '), true)
assert.equal(grammar960.xml.includes('(absorb)'), true)
for (const protectedNumber of ['2026', '25-30g', '800g', '3-5g', '30g', '10g']) {
  assert.equal(
    grammar960.xml.includes(protectedNumber),
    true,
    `protected prose number ${protectedNumber}`,
  )
}

const combinedItems = [
  docxItemFromAsset(paper2026, clozeGroupId),
  docxItemFromAsset(paper2026, grammar2026GroupId),
  docxItemFromAsset(paper960, grammar960GroupId),
]
const combinedBlocks = [
  { type: 'section_header', title: '第三部分 完形填空' },
  { type: 'question_group', questionGroupId: clozeGroupId, score: 1.5 },
  { type: 'page_break' },
  { type: 'section_header', title: '第四部分 语法填空（2026-I）' },
  {
    type: 'question_group',
    questionGroupId: grammar2026GroupId,
    score: 1.5,
  },
  { type: 'page_break' },
  { type: 'section_header', title: '第四部分 语法填空（960d0f8d）' },
  {
    type: 'question_group',
    questionGroupId: grammar960GroupId,
    score: 1.5,
  },
]
const studentCombined = renderProofGroups({
  items: combinedItems,
  blocks: combinedBlocks,
  versionType: 'student',
  questionNumberStart: 41,
})
const teacherCombined = renderProofGroups({
  items: combinedItems,
  blocks: combinedBlocks,
  versionType: 'teacher',
  questionNumberStart: 41,
})
const handoutCombined = renderProofGroups({
  items: combinedItems,
  blocks: combinedBlocks,
  versionType: 'student',
  printStyle: 'handout',
  questionNumberStart: 41,
})
const teacherHandoutCombined = renderProofGroups({
  items: combinedItems,
  blocks: combinedBlocks,
  versionType: 'teacher',
  printStyle: 'handout',
  questionNumberStart: 41,
})
const itemsOnlyHandoutCombined = renderProofGroups({
  items: combinedItems,
  blocks: null,
  versionType: 'student',
  printStyle: 'handout',
  questionNumberStart: 41,
})

assert.deepEqual(
  studentCombined.normalizationDiagnostics.map(
    ({ source, groupId }) => ({ source, groupId }),
  ),
  [
    { source: 'compatibility', groupId: clozeGroupId },
    { source: 'compatibility', groupId: grammar2026GroupId },
    { source: 'compatibility', groupId: grammar960GroupId },
  ],
)
assert.equal(studentCombined.xml.includes('__41__'), false)
assert.equal(studentCombined.xml.includes('__56__'), false)
assert.equal(/\d{1,3}\._{2,}/.test(studentCombined.xml), false)
assert.equal(studentCombined.xml.includes('41.  41'), false)
assert.equal(studentCombined.xml.includes('56.  56'), false)
assert.equal(studentCombined.xml.includes('A. fantasy'), true)
assert.equal(studentCombined.xml.includes('  41  '), true)
assert.equal(studentCombined.xml.includes('  55  '), true)
assert.equal(studentCombined.xml.includes('  56  '), true)
assert.equal(studentCombined.xml.includes('  65  '), true)
assert.equal(studentCombined.xml.includes('  66  '), false)
assert.equal(studentCombined.xml.includes('  75  '), false)
assert.equal(studentCombined.xml.includes('【答案】'), false)
assert.equal(teacherCombined.xml.includes('【答案】'), true)
assert.equal(teacherCombined.xml.includes('41.  41'), false)
assert.equal(teacherCombined.xml.includes('56.  56'), false)
const blockOrder = [
  studentCombined.xml.indexOf('第三部分 完形填空'),
  studentCombined.xml.indexOf('  41  '),
  studentCombined.xml.indexOf('<w:br w:type="page"/>'),
  studentCombined.xml.indexOf('第四部分 语法填空（2026-I）'),
  studentCombined.xml.indexOf('  56  '),
  studentCombined.xml.lastIndexOf('<w:br w:type="page"/>'),
  studentCombined.xml.indexOf('第四部分 语法填空（960d0f8d）'),
  studentCombined.xml.lastIndexOf('  56  '),
]
assert.equal(
  blockOrder.every(
    (position, index) =>
      position >= 0 && (index === 0 || position > blockOrder[index - 1]),
  ),
  true,
  `block order ${JSON.stringify(blockOrder)}`,
)
assert.match(
  studentCombined.xml,
  /<w:u w:val="single"\/>[^]*?<w:t xml:space="preserve">  57  <\/w:t><\/w:r><w:r>[^]*?<w:t xml:space="preserve">\(absorb\)<\/w:t>/,
)
assert.equal(
  (studentCombined.xml.match(/<w:u w:val="single"\/>/g) || []).length,
  35,
)
assert.deepEqual(
  handoutCombined.normalizationDiagnostics.map(
    ({ source, groupId }) => ({ source, groupId }),
  ),
  [
    { source: 'compatibility', groupId: clozeGroupId },
    { source: 'compatibility', groupId: grammar2026GroupId },
    { source: 'compatibility', groupId: grammar960GroupId },
  ],
)
assert.equal(handoutCombined.xml.includes('__41__'), false)
assert.equal(handoutCombined.xml.includes('__56__'), false)
assert.equal(/\d{1,3}\._{2,}/.test(handoutCombined.xml), false)
assert.equal(handoutCombined.xml.includes('41.  41'), false)
assert.equal(handoutCombined.xml.includes('56.  56'), false)
assert.equal(handoutCombined.xml.includes('A. fantasy'), true)
assert.equal(handoutCombined.xml.includes('  41  '), true)
assert.equal(handoutCombined.xml.includes('  65  '), true)
assert.match(
  handoutCombined.xml,
  /<w:u w:val="single"\/>[^]*?<w:t xml:space="preserve">  57  <\/w:t><\/w:r><w:r>[^]*?<w:t xml:space="preserve">\(absorb\)<\/w:t>/,
)
assert.equal(
  (handoutCombined.xml.match(/<w:u w:val="single"\/>/g) || []).length,
  35,
)
assert.equal(teacherHandoutCombined.xml.includes('__41__'), false)
assert.equal(teacherHandoutCombined.xml.includes('答案：'), true)
assert.equal(teacherHandoutCombined.xml.includes('41.  41'), false)
assert.deepEqual(
  itemsOnlyHandoutCombined.normalizationDiagnostics.map(
    ({ source, groupId }) => ({ source, groupId }),
  ),
  [
    { source: 'compatibility', groupId: clozeGroupId },
    { source: 'compatibility', groupId: grammar2026GroupId },
    { source: 'compatibility', groupId: grammar960GroupId },
  ],
)
assert.equal(itemsOnlyHandoutCombined.xml.includes('__41__'), false)
assert.equal(itemsOnlyHandoutCombined.xml.includes('__56__'), false)
assert.equal(itemsOnlyHandoutCombined.xml.includes('41.  41'), false)
assert.equal(itemsOnlyHandoutCombined.xml.includes('  41  '), true)
assert.equal(itemsOnlyHandoutCombined.xml.includes('  65  '), true)
assert.equal(
  (itemsOnlyHandoutCombined.xml.match(/<w:u w:val="single"\/>/g) || [])
    .length,
  35,
)

const sevenChoices = renderProofGroup({
  asset: paper2026,
  groupId: 'group-2026-i-seven-choices',
  questionNumberStart: 36,
})
assert.deepEqual(sevenChoices.normalizationDiagnostics, [])
assert.match(
  sevenChoices.xml,
  /<w:u w:val="single"\/>[^]*?<w:t xml:space="preserve"> {3}36 {3}<\/w:t>/,
)

const scratchDir = mkdtempSync(
  path.join(tmpdir(), 'paper-normalization-docx-'),
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
  const handoutSidecarCloze = renderProofGroups({
    items: [docxItemFromAsset(paper2026, clozeGroupId)],
    blocks: [
      {
        type: 'question_group',
        questionGroupId: clozeGroupId,
        score: 1.5,
      },
    ],
    printStyle: 'handout',
    questionNumberStart: 41,
    assetsDir: scratchDir,
  })
  assert.equal(sidecarCloze.normalizationDiagnostics[0]?.source, 'sidecar')
  assert.equal(sidecarCloze.xml.includes('__41__'), false)
  assert.equal(
    handoutSidecarCloze.normalizationDiagnostics[0]?.source,
    'sidecar',
  )
  assert.equal(handoutSidecarCloze.xml.includes('__41__'), false)

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
  const handoutNonProofSidecar = renderProofGroups({
    items: [docxItemFromAsset(paper960, 'group-960d0f8d-cloze')],
    blocks: [
      {
        type: 'question_group',
        questionGroupId: 'group-960d0f8d-cloze',
        score: 1.5,
      },
    ],
    printStyle: 'handout',
    questionNumberStart: 41,
    assetsDir: nonProofSidecarDir,
  })
  const itemsOnlyHandoutNonProofSidecar = renderProofGroups({
    items: [docxItemFromAsset(paper960, 'group-960d0f8d-cloze')],
    blocks: null,
    printStyle: 'handout',
    questionNumberStart: 41,
    assetsDir: nonProofSidecarDir,
  })
  assert.equal(nonProofSidecar.normalizationDiagnostics[0]?.status, 'legacy')
  assert.equal(
    nonProofSidecar.normalizationDiagnostics[0]?.reason,
    'canonical_not_enabled_for_group',
  )
  assert.equal(
    handoutNonProofSidecar.normalizationDiagnostics[0]?.reason,
    'canonical_not_enabled_for_group',
  )
  assert.equal(
    itemsOnlyHandoutNonProofSidecar.normalizationDiagnostics[0]?.reason,
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
  assert.equal(staleCloze.xml.includes('__41__'), false)

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
  assert.equal(needsReview.xml.includes('__56__'), false)
  assert.equal(needsReview.xml.includes('(hold)'), true)

  const mismatchItem = docxItemFromAsset(paper2026, clozeGroupId)
  mismatchItem.detail.questions[0].id = 'stale-question-id'
  const mismatch = renderProofGroups({
    items: [mismatchItem],
    blocks: [
      {
        type: 'question_group',
        questionGroupId: clozeGroupId,
        score: 1.5,
      },
    ],
    questionNumberStart: 41,
    assetsDir: scratchDir,
  })
  assert.equal(
    mismatch.normalizationDiagnostics[0]?.reason,
    'canonical_docx_input_mismatch',
  )
  assert.equal(mismatch.xml.includes('  41  '), true)

  const missingDir = path.join(scratchDir, 'missing')
  writeAssetBundle(missingDir, paper960)
  const missing = renderProofGroup({
    asset: paper960,
    groupId: 'group-960d0f8d-cloze',
    questionNumberStart: 41,
    assetsDir: missingDir,
  })
  assert.equal(missing.normalizationDiagnostics[0]?.status, 'legacy')
  assert.equal(
    missing.normalizationDiagnostics[0]?.reason,
    'canonical_not_enabled_for_group',
  )
} finally {
  rmSync(scratchDir, { recursive: true, force: true })
}

const packageCheckDir = mkdtempSync(
  path.join(tmpdir(), 'paper-normalization-docx-package-'),
)
try {
  const packageRenderer = createDocxRenderer({
    groupTypeLabels,
    optionalString,
    paperAssetsDir,
  })
  const outputPath = path.join(packageCheckDir, 'student.docx')
  packageRenderer.writeDocxPackage({
    documentXml: studentCombined.xml,
    outputPath,
    title: 'Ticket 08 packaged OOXML check',
  })
  const packagedXml = execFileSync(
    'unzip',
    ['-p', outputPath, 'word/document.xml'],
    { encoding: 'utf8' },
  )
  assert.equal(packagedXml, studentCombined.xml)
  assert.equal(/_{2,}\d+_{2,}/.test(packagedXml), false)
  assert.equal(/\d{1,3}\._{2,}/.test(packagedXml), false)
  assert.equal(
    (packagedXml.match(/<w:u w:val="single"\/>/g) || []).length,
    35,
  )
  assert.equal(packagedXml.includes('  41  '), true)
  assert.equal(packagedXml.includes('  65  '), true)
  assert.equal(packagedXml.includes('(absorb)'), true)
} finally {
  rmSync(packageCheckDir, { recursive: true, force: true })
}

if (process.env.T08_VISUAL_OUTPUT_DIR) {
  const outputDir = path.resolve(process.env.T08_VISUAL_OUTPUT_DIR)
  mkdirSync(outputDir, { recursive: true })
  const visualRenderer = createDocxRenderer({
    groupTypeLabels,
    optionalString,
    paperAssetsDir,
  })
  for (const [versionType, documentXml] of [
    ['student', studentCombined.xml],
    ['teacher', teacherCombined.xml],
    ['seven-legacy', sevenChoices.xml],
  ]) {
    const docxPath = path.join(
      outputDir,
      `ticket-08-proof-${versionType}.docx`,
    )
    const pdfPath = path.join(
      outputDir,
      `ticket-08-proof-${versionType}.pdf`,
    )
    visualRenderer.writeDocxPackage({
      documentXml,
      outputPath: docxPath,
      title: `Ticket 08 proof ${versionType}`,
    })
    visualRenderer.convertDocxToPdf(docxPath, pdfPath)
  }
}

console.log('PASS paper normalization DOCX: canonical proof groups')
