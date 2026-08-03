#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import {
  registeredConfirmedCanonicalAdmissionSchemaVersion,
  resolveRegisteredConfirmedCanonicalAdmission,
} from '../server/paper-canonical/registeredConfirmedCanonicalAdmission.mjs'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const storeRoot = path.join(
  repositoryRoot,
  'test-fixtures/paper-canonical/publications/ticket-32-remaining-v1/store',
)
const paperId = 'paper-2025-i'

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function groupTypeForPrint(groupType) {
  if (groupType === 'grammarFill') return 'grammar_cloze'
  if (groupType === 'sevenChoices') return 'seven_choices'
  if (groupType === 'continuation') return 'writing'
  return groupType
}

function canonicalPrintPayload(consumption) {
  const groups = []
  for (const selection of consumption.selections) {
    for (const groupId of selection.groupIds) {
      const group = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      groups.push({
        detail: {
          id: groupId,
          paperId: consumption.paperId,
          title: groupId,
          source: consumption.paperId,
          groupType: groupTypeForPrint(group.groupType),
          passage: { title: groupId, materialText: '' },
          questions: group.questions.map((question) => ({
            id: question.questionId,
            questionNo: String(question.questionNo),
            stem: question.stem ?? '',
            answer: question.correctOptionId
              ? question.options.find((option) =>
                option.optionId === question.correctOptionId,
              )?.label || ''
              : '',
            explanation: '',
            note: '',
            options: question.options.map((option) => ({
              label: option.label,
              content: option.text,
            })),
          })),
        },
        score: 0,
        sectionTitle: '',
        note: '',
      })
    }
  }
  const details = new Map(groups.map((group) => [group.detail.id, group.detail]))
  const blocks = consumption.visibleStructure.flatMap((node) => {
    if (node.kind === 'group') return [{ type: 'question_group', questionGroupId: node.groupId }]
    if (node.kind !== 'instruction' || node.renderPolicy !== 'render') return []
    if (node.placement === 'part_heading' || node.placement === 'section_heading') {
      return [{ type: 'section_header', title: node.text, instructionId: node.instructionId }]
    }
    return node.placement === 'group_instruction'
      ? [{ type: 'instruction', text: node.text, instructionId: node.instructionId }]
      : []
  })
  return {
    title: consumption.paperId,
    printStyle: 'exam',
    questionNumberStart: 1,
    items: groups.map((group) => ({ questionGroupId: group.detail.id })),
    blocks,
    details,
  }
}

function withRuntime(rootDir, run) {
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'), { readOnly: true })
  try {
    return run(createCanonicalConsumerRuntime({ rootDir, db }))
  } finally {
    db.close()
  }
}

function publicPrintHtml({ rootDir, runtime, consumption, versionType }) {
  const payload = canonicalPrintPayload(consumption)
  const implementation = createExportImplementation({
    rootDir,
    exportDir: path.join(tmpdir(), 'eqb-ticket-33-docx-no-export'),
    getQuestionGroupDetail: (groupId) => payload.details.get(groupId) || null,
    buildPrintHtml,
    paperAssetsDir: rootDir,
    resolveCanonicalConsumption: () => consumption,
  })
  return implementation.exportPrintHtml({ ...payload, versionType }).body
}

function assertExpectedPublicHtml({ html, consumption, versionType }) {
  const groups = consumption.visibleStructure.filter((node) => node.kind === 'group')
  const expectedGroupIds = groups.map((node) => node.groupId)
  const actualGroupIds = [...html.matchAll(/data-canonical-group-id="([^"]+)"/g)]
    .map((match) => match[1])
  assert.deepEqual(actualGroupIds, expectedGroupIds, `${versionType} Print HTML retains canonical identity and order`)
  const grammarFill = consumption.selections.find(
    (selection) => selection.familyContractId === 'grammar-fill' && selection.mode === 'canonical',
  )
  assert.equal(grammarFill?.groupIds.length, 1, 'the trusted DOCX publication contains one canonical Grammar Fill group')
  assert.equal(html.includes(`data-canonical-group-id="${grammarFill.groupIds[0]}"`), true, 'Grammar Fill is present in the public Print HTML')
  assert.equal(groups.some((node) => node.slotId?.startsWith('listening.')), false, 'inactive Listening slots are absent from Print HTML')
  const questionCount = groups.reduce((count, node) => {
    const selection = consumption.selections.find((candidate) => candidate.groupIds.includes(node.groupId))
    const group = projectCanonicalConsumerGroup({
      consumption,
      familyContractId: selection.familyContractId,
      groupId: node.groupId,
    })
    return count + group.questions.length
  }, 0)
  assert.equal((html.match(/【答案】/g) || []).length, versionType === 'teacher' ? questionCount : 0, `${versionType} answer visibility is canonical`)
  assert.equal(html.includes('data-canonical-correct-option-id='), versionType === 'teacher', `${versionType} correct-option visibility is canonical`)
  assert.equal(html.trim().length > 200, true, `${versionType} Print HTML is not blank`)
  return { groupCount: groups.length, questionCount, grammarFillGroupId: grammarFill.groupIds[0] }
}

async function assertChromiumA4Pdfs(entries) {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'eqb-ticket-33-docx-pdf-'))
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true })
  const observations = []
  try {
    for (const entry of entries) {
      const page = await browser.newPage({ viewport: { width: 794, height: 1123 } })
      await page.setContent(entry.html, { waitUntil: 'load' })
      await page.emulateMedia({ media: 'print' })
      await page.evaluate(() => document.fonts.ready)
      const dom = await page.evaluate(() => ({
        blankUnits: document.querySelectorAll('.print-blank-unit[data-canonical-grammar-fill-unit]').length,
        nonPositiveBoxes: [...document.querySelectorAll('section.question-group[data-canonical-group-id], .question[data-canonical-question-id]')]
          .filter((node) => {
            const rect = node.getBoundingClientRect()
            return rect.width <= 0 || rect.height <= 0
          }).length,
        textLength: document.body.innerText.trim().length,
      }))
      assert.equal(dom.blankUnits > 0, true, `${entry.versionType} PDF input retains Grammar Fill blanks`)
      assert.equal(dom.nonPositiveBoxes, 0, `${entry.versionType} PDF input has no clipped canonical group or question`)
      assert.equal(dom.textLength > 200, true, `${entry.versionType} PDF input is not blank`)
      const pdfPath = path.join(outputDir, `${entry.versionType}.pdf`)
      const pdfBytes = await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      })
      assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF', `${entry.versionType} has a real PDF`)
      const pdfInfo = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
      assert.match(pdfInfo, /Page size:\s+594\.96 x 841\.92 pts \(A4\)/, `${entry.versionType} PDF is A4`)
      const pageCount = Number(pdfInfo.match(/^Pages:\s+(\d+)$/m)?.[1])
      assert.equal(Number.isInteger(pageCount) && pageCount > 0, true, `${entry.versionType} PDF has pages`)
      for (let number = 1; number <= pageCount; number += 1) {
        const text = execFileSync('pdftotext', ['-f', String(number), '-l', String(number), pdfPath, '-'], { encoding: 'utf8' }).trim()
        assert.equal(text.length > 0, true, `${entry.versionType} PDF page ${number} is not blank`)
      }
      const text = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
      const answerMarkers = (text.match(/【答案】/g) || []).length
      assert.equal(answerMarkers, entry.versionType === 'teacher' ? entry.observation.questionCount : 0, `${entry.versionType} PDF preserves answer visibility`)
      observations.push({
        versionType: entry.versionType,
        sha256: sha256(pdfBytes),
        pageCount,
        answerMarkers,
        grammarFillBlankUnits: dom.blankUnits,
        nonPositiveBoxes: dom.nonPositiveBoxes,
      })
      await page.close()
    }
  } finally {
    await browser.close()
    rmSync(outputDir, { recursive: true, force: true })
  }
  return observations
}

function treeSnapshot(rootDir) {
  const files = []
  const visit = (directory) => {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, name.name)
      if (name.isDirectory()) visit(target)
      else if (name.isFile()) {
        const bytes = readFileSync(target)
        files.push([path.relative(rootDir, target), bytes.byteLength, sha256(bytes)])
      }
    }
  }
  visit(rootDir)
  return files.sort((left, right) => left[0].localeCompare(right[0]))
}

function copiedTargetStore() {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-ticket-33-docx-source-'))
  cpSync(path.join(storeRoot, 'publication.sqlite'), path.join(rootDir, 'publication.sqlite'))
  cpSync(path.join(storeRoot, paperId), path.join(rootDir, paperId), { recursive: true })
  return rootDir
}

function fakeStructuredSourceAsset() {
  return Buffer.from(JSON.stringify({
    content: {
      blocks: [
        { type: 'partHeading', text: '第一部分' },
        { type: 'group', groupId: 'group-2025-i-language-cloze' },
        { type: 'sectionHeading', text: '第二部分' },
        { type: 'instruction', text: '用括号内单词的正确形式填空。' },
        { type: 'group', groupId: 'group-2025-i-grammar-fill' },
        { type: 'partHeading', text: '第三部分' },
      ],
    },
  }))
}

function expectPublicRejection({ rootDir, mutate, mutateConsumption = null, label }) {
  try {
    withRuntime(rootDir, (runtime) => {
      const consumption = runtime.load({ paperId, consumerId: 'print_pdf' })
      mutate(rootDir)
      const before = treeSnapshot(rootDir)
      const supplied = mutateConsumption ? mutateConsumption(consumption) : consumption
      assert.throws(
        () => publicPrintHtml({
          rootDir,
          runtime,
          consumption: supplied,
          versionType: 'student',
        }),
        (error) => error?.code === 'CANONICAL_CONSUMPTION_REJECTED',
        label,
      )
      assert.deepEqual(treeSnapshot(rootDir), before, `${label} has zero publication/output mutation on rejection`)
    })
  } finally {
    rmSync(rootDir, { recursive: true, force: true })
  }
}

function expectCanonicalConsumptionRejection({ rootDir, mutate, label }) {
  try {
    mutate(rootDir)
    const before = treeSnapshot(rootDir)
    withRuntime(rootDir, (runtime) => {
      assert.throws(
        () => runtime.load({ paperId, consumerId: 'print_pdf' }),
        (error) => error?.code === 'CANONICAL_CONSUMPTION_REJECTED',
        label,
      )
    })
    assert.deepEqual(treeSnapshot(rootDir), before, `${label} has zero publication/output mutation on rejection`)
  } finally {
    rmSync(rootDir, { recursive: true, force: true })
  }
}

function assertTrustedDocxPublicAdversaries() {
  const asset = (rootDir) => path.join(rootDir, paperId, 'versions', 'v1', 'paper-asset.json')
  const publication = (rootDir) => path.join(
    rootDir,
    paperId,
    'versions',
    'v1',
    'canonical',
    'canonical-paper-publication-v37.json',
  )
  const originalAsset = readFileSync(asset(storeRoot))
  const fakeStructuredAsset = fakeStructuredSourceAsset()
  expectPublicRejection({
    rootDir: copiedTargetStore(),
    label: 'tampered trusted DOCX bytes reject through public Print',
    mutate: (rootDir) => {
      const bytes = Buffer.from(readFileSync(asset(rootDir)))
      bytes[bytes.length - 1] ^= 0x01
      writeFileSync(asset(rootDir), bytes)
    },
  })
  expectPublicRejection({
    rootDir: copiedTargetStore(),
    label: 'truncated trusted DOCX bytes reject through public Print',
    mutate: (rootDir) => writeFileSync(asset(rootDir), originalAsset.subarray(0, -1)),
  })
  expectPublicRejection({
    rootDir: copiedTargetStore(),
    label: 'swapped-paper DOCX bytes reject through public Print',
    mutate: (rootDir) => writeFileSync(
      asset(rootDir),
      readFileSync(path.join(repositoryRoot, 'test-fixtures/paper-canonical/evidence/original-paper-zj-2020-jan.docx')),
    ),
  })
  expectPublicRejection({
    rootDir: copiedTargetStore(),
    label: 'unparseable DOCX replacement rejects against immutable Publication bytes',
    mutate: (rootDir) => writeFileSync(asset(rootDir), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])),
  })
  expectCanonicalConsumptionRejection({
    rootDir: copiedTargetStore(),
    label: 'wrong immutable Publication binding rejects at canonical consumption',
    mutate: (rootDir) => {
      const value = JSON.parse(readFileSync(publication(rootDir)))
      value.sourceAssetDigest = 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
      writeFileSync(publication(rootDir), `${JSON.stringify(value)}\n`)
    },
  })
  expectPublicRejection({
    rootDir: copiedTargetStore(),
    label: 'same-object source digest mutation cannot bypass immutable Publication authority',
    mutate: (rootDir) => writeFileSync(asset(rootDir), fakeStructuredAsset),
    mutateConsumption: (consumption) => {
      assert.throws(
        () => {
          consumption.sourceAssetDigest = sha256(fakeStructuredAsset)
        },
        TypeError,
        'same-object canonical consumption mutation is rejected',
      )
      return consumption
    },
  })
  expectPublicRejection({
    rootDir: copiedTargetStore(),
    label: 'caller-supplied structured blocks cannot replace canonical Publication authority',
    mutate: (rootDir) => writeFileSync(asset(rootDir), fakeStructuredAsset),
    mutateConsumption: (consumption) => ({
      ...structuredClone(consumption),
      sourceAssetDigest: sha256(fakeStructuredAsset),
      sourceAsset: { content: JSON.parse(fakeStructuredAsset).content },
    }),
  })
}

function assertRegisteredAdmissionBindings() {
  const manifest = JSON.parse(readFileSync(path.join(
    repositoryRoot,
    'docs/cuts/paper-canonical-unification/migration/manifest-v2.json',
  )))
  const record = manifest.papers.find((candidate) => candidate.paperId === paperId)
  const bytesFor = (descriptor) => new Uint8Array(readFileSync(
    path.join(repositoryRoot, descriptor.path),
  ))
  const validEnvelope = {
    schemaVersion: registeredConfirmedCanonicalAdmissionSchemaVersion,
    paperId,
    sourceBytes: new Uint8Array(readFileSync(path.join(
      storeRoot,
      paperId,
      'versions',
      'v1',
      'paper-asset.json',
    ))),
    candidateBytes: bytesFor(record.candidate),
    confirmationBytes: bytesFor(record.confirmation),
    canonicalPaperBytes: bytesFor(record.canonicalPaper),
  }
  assert.doesNotThrow(
    () => resolveRegisteredConfirmedCanonicalAdmission(validEnvelope),
    'registered DOCX Admission accepts the exact bound chain',
  )
  for (const [label, field] of [
    ['candidate', 'candidateBytes'],
    ['confirmation', 'confirmationBytes'],
    ['canonical', 'canonicalPaperBytes'],
  ]) {
    const forged = { ...validEnvelope, [field]: new Uint8Array(validEnvelope[field]) }
    forged[field][forged[field].length - 1] ^= 0x01
    assert.throws(
      () => resolveRegisteredConfirmedCanonicalAdmission(forged),
      (error) => error?.code?.startsWith('CANONICAL_PUBLICATION_REGISTERED_'),
      `wrong registered ${label} binding fails closed at Admission`,
    )
  }
}

const entries = withRuntime(storeRoot, (runtime) => {
  const consumption = runtime.load({ paperId, consumerId: 'print_pdf' })
  return ['student', 'teacher'].map((versionType) => {
    const html = publicPrintHtml({ rootDir: storeRoot, runtime, consumption, versionType })
    return { versionType, html, observation: assertExpectedPublicHtml({ html, consumption, versionType }) }
  })
})

assertTrustedDocxPublicAdversaries()
assertRegisteredAdmissionBindings()
const pdf = await assertChromiumA4Pdfs(entries)

console.log(JSON.stringify({
  status: 'PASS',
  paperId,
  publicPrintHtml: entries.map(({ versionType, observation }) => ({ versionType, ...observation })),
  directChromiumA4Pdf: pdf,
  adversarialFailClosed: [
    'tampered',
    'truncated',
    'swapped-paper',
    'unparseable',
    'wrong immutable Publication binding at canonical consumption',
    'wrong candidate/confirmation/canonical binding at Admission',
    'caller structured blocks and same-object mutation',
    'zero output/publication mutation on rejection',
  ],
}))
