#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
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
import { digestJson, stableStringify, withoutKey } from '../shared/paper-canonical/stable.mjs'
import {
  registeredConfirmedCanonicalAdmissionSchemaVersion,
  resolveRegisteredConfirmedCanonicalAdmission,
} from '../server/paper-canonical/registeredConfirmedCanonicalAdmission.mjs'
import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const paperId = 'paper-2026-i'
const storeRoot = path.join(
  repositoryRoot,
  'test-fixtures/paper-canonical/publications/ticket-32-remaining-v1/store',
)
const correctionPath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/migration/paper-2026-i-successor-correction-v1.json',
)
const accountingPath = path.join(
  repositoryRoot,
  'docs/cuts/paper-canonical-unification/migration/paper-2026-i-successor-publication-accounting-v1.json',
)
const expectedOccurrenceDigest =
  'sha256:f864c176a692e39611bd08f3574f2e626934554b7056057e54f78ac145b40cd4'

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function json(filePath) {
  return JSON.parse(readFileSync(filePath))
}

function canonicalBytes(value) {
  return Buffer.from(`${stableStringify(value)}\n`)
}

function assertArtifact(descriptor, label) {
  const value = readFileSync(path.join(repositoryRoot, descriptor.path))
  assert.equal(value.byteLength, descriptor.byteLength, `${label} byte length must close`)
  assert.equal(sha256(value), descriptor.fileSha256, `${label} file digest must close`)
  return value
}

function treeSnapshot(rootDir) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(target)
      else {
        assert.equal(entry.isFile(), true, `${target} must be a regular file`)
        const value = readFileSync(target)
        files.push({
          path: path.relative(repositoryRoot, target),
          byteLength: value.byteLength,
          sha256: sha256(value),
        })
      }
    }
  }
  visit(rootDir)
  return {
    root: path.relative(repositoryRoot, rootDir),
    fileCount: files.length,
    treeDigest: digestJson(files),
    files,
  }
}

function groupTypeForPrint(groupType) {
  if (groupType === 'grammarFill') return 'grammar_cloze'
  if (groupType === 'sevenChoices') return 'seven_choices'
  if (groupType === 'continuation') return 'writing'
  return groupType
}

function sourceAnswerByQuestionId(rootDir) {
  const sourceCapture = json(path.join(
    rootDir,
    paperId,
    'versions/v2/canonical/source-capture-v1.json',
  ))
  const documents = sourceCapture.documents.filter((document) =>
    document.inputKey === 'latest_official_answer_lead'
    && Array.isArray(document.roles)
    && document.roles.length === 1
    && document.roles[0] === 'official_answer_source')
  assert.equal(documents.length, 1, 'p-2026-i v2 has exactly one recognized official-answer source')
  const source = json(path.join(
    rootDir,
    paperId,
    'versions/v2',
    documents[0].immutableArtifactRef.relativePath,
  ))
  assert.equal(typeof source.answers, 'object', 'official answer source must contain answers')
  return source.answers
}

function canonicalPrintPayload(consumption, sourceAnswers) {
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
              ? question.options.find((option) => option.optionId === question.correctOptionId)?.label || ''
              : sourceAnswers[question.questionId]?.answer || '',
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

function publicPrintHtml({ rootDir, consumption, versionType, payload = null }) {
  const resolvedPayload = payload || canonicalPrintPayload(consumption, sourceAnswerByQuestionId(rootDir))
  const implementation = createExportImplementation({
    rootDir,
    exportDir: path.join(tmpdir(), 'eqb-paper-2026-i-successor-no-export'),
    getQuestionGroupDetail: (groupId) => resolvedPayload.details.get(groupId) || null,
    buildPrintHtml,
    paperAssetsDir: rootDir,
    resolveCanonicalConsumption: () => consumption,
  })
  return implementation.exportPrintHtml({ ...resolvedPayload, versionType }).body
}

function assertPublicHtml({ html, consumption, versionType }) {
  const groups = consumption.visibleStructure.filter((node) => node.kind === 'group')
  const expectedGroupIds = groups.map((node) => node.groupId)
  const actualGroupIds = [...html.matchAll(/data-canonical-group-id="([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual(actualGroupIds, expectedGroupIds, `${versionType} Print HTML preserves canonical group order`)
  const grammarFill = consumption.selections.find((selection) => selection.familyContractId === 'grammar-fill')
  assert.equal(grammarFill?.groupIds.length, 1, 'p-2026-i has one canonical Grammar Fill group')
  const questionCount = groups.reduce((count, node) => {
    const selection = consumption.selections.find((candidate) => candidate.groupIds.includes(node.groupId))
    const group = projectCanonicalConsumerGroup({
      consumption,
      familyContractId: selection.familyContractId,
      groupId: node.groupId,
    })
    return count + group.questions.length
  }, 0)
  assert.equal(questionCount, 45, 'p-2026-i successor logical question count is unchanged')
  assert.equal((html.match(/【答案】/g) || []).length, versionType === 'teacher' ? questionCount : 0, `${versionType} answer visibility is correct`)
  assert.equal(html.includes('data-canonical-correct-option-id='), versionType === 'teacher', `${versionType} correct-option visibility is correct`)
  assert.equal(html.includes(`data-canonical-group-id="${grammarFill.groupIds[0]}"`), true, `${versionType} contains the source-bound Grammar Fill group`)
  assert.equal(html.trim().length > 200, true, `${versionType} Print HTML is not blank`)
  return { groupCount: groups.length, questionCount, grammarFillGroupId: grammarFill.groupIds[0] }
}

async function assertChromiumA4Pdfs(entries) {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'eqb-paper-2026-i-successor-pdf-'))
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
      assert.equal(dom.nonPositiveBoxes, 0, `${entry.versionType} PDF input has no empty canonical group or question box`)
      assert.equal(dom.textLength > 200, true, `${entry.versionType} PDF input is not blank`)
      const pdfPath = path.join(outputDir, `${entry.versionType}.pdf`)
      const pdfBytes = await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      })
      assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF', `${entry.versionType} direct PDF is real`)
      const pdfInfo = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
      assert.match(pdfInfo, /Page size:\s+594\.96 x 841\.92 pts \(A4\)/, `${entry.versionType} direct PDF is A4`)
      const pageCount = Number(pdfInfo.match(/^Pages:\s+(\d+)$/m)?.[1])
      assert.equal(Number.isInteger(pageCount) && pageCount > 0, true, `${entry.versionType} direct PDF has pages`)
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const text = execFileSync('pdftotext', ['-f', String(pageNumber), '-l', String(pageNumber), pdfPath, '-'], { encoding: 'utf8' }).trim()
        assert.equal(text.length > 0, true, `${entry.versionType} direct PDF page ${pageNumber} is not blank`)
      }
      const text = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
      const answerMarkers = (text.match(/【答案】/g) || []).length
      assert.equal(answerMarkers, entry.versionType === 'teacher' ? entry.observation.questionCount : 0, `${entry.versionType} direct PDF answer visibility is correct`)
      observations.push({
        versionType: entry.versionType,
        sha256: sha256(pdfBytes),
        pageCount,
        answerMarkers,
        grammarFillBlankUnits: dom.blankUnits,
      })
      await page.close()
    }
  } finally {
    await browser.close()
    rmSync(outputDir, { recursive: true, force: true })
  }
  return observations
}

function copiedTargetStore() {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-paper-2026-i-successor-source-'))
  cpSync(path.join(storeRoot, 'publication.sqlite'), path.join(rootDir, 'publication.sqlite'))
  cpSync(path.join(storeRoot, paperId), path.join(rootDir, paperId), { recursive: true })
  return rootDir
}

function rewriteSourceCapture(rootDir, mutate) {
  const versionDir = path.join(rootDir, paperId, 'versions/v2')
  const capturePath = path.join(versionDir, 'canonical/source-capture-v1.json')
  const publicationPath = path.join(versionDir, 'canonical/canonical-paper-publication-v43.json')
  const capture = json(capturePath)
  mutate(capture)
  const captureBytes = canonicalBytes(capture)
  writeFileSync(capturePath, captureBytes)
  const publication = json(publicationPath)
  const descriptor = publication.artifacts.find((artifact) => artifact.role === 'source_capture')
  assert.ok(descriptor, 'successor Publication describes the Source Capture')
  descriptor.byteLength = captureBytes.byteLength
  descriptor.sha256 = sha256(captureBytes)
  writeFileSync(publicationPath, canonicalBytes(publication))
}

function expectPublicRejection({ label, mutate }) {
  const rootDir = copiedTargetStore()
  try {
    withRuntime(rootDir, (runtime) => {
      const consumption = runtime.load({ paperId, consumerId: 'print_pdf' })
      const payload = canonicalPrintPayload(consumption, sourceAnswerByQuestionId(rootDir))
      mutate(rootDir)
      const before = treeSnapshot(rootDir).files
      assert.throws(
        () => publicPrintHtml({ rootDir, consumption, versionType: 'student', payload }),
        (error) => error?.code === 'CANONICAL_CONSUMPTION_REJECTED',
        label,
      )
      assert.deepEqual(treeSnapshot(rootDir).files, before, `${label} performs no publication/output mutation`)
    })
  } finally {
    rmSync(rootDir, { recursive: true, force: true })
  }
}

function assertPrintBindingAdversaries() {
  expectPublicRejection({
    label: 'zero recognized official-answer identities fail closed',
    mutate: (rootDir) => rewriteSourceCapture(rootDir, (capture) => {
      const document = capture.documents.find((entry) => entry.inputKey === 'latest_official_answer_lead')
      document.roles = ['source_provenance']
    }),
  })
  expectPublicRejection({
    label: 'multiple recognized official-answer identities fail closed',
    mutate: (rootDir) => rewriteSourceCapture(rootDir, (capture) => {
      const document = capture.documents.find((entry) => entry.inputKey === 'latest_official_answer_lead')
      capture.documents.push({ ...structuredClone(document), documentId: `${document.documentId}-duplicate` })
    }),
  })
  expectPublicRejection({
    label: 'multi-role recognized official-answer competitor fails closed',
    mutate: (rootDir) => rewriteSourceCapture(rootDir, (capture) => {
      const document = capture.documents.find((entry) => entry.inputKey === 'latest_official_answer_lead')
      capture.documents.push({
        ...structuredClone(document),
        documentId: `${document.documentId}-multi-role-competitor`,
        roles: ['official_answer_source', 'source_provenance'],
      })
    }),
  })
  expectPublicRejection({
    label: 'competing official-answer input key fails closed',
    mutate: (rootDir) => rewriteSourceCapture(rootDir, (capture) => {
      const document = capture.documents.find((entry) => entry.inputKey === 'latest_official_answer_lead')
      document.inputKey = 'competing_official_answer_key'
    }),
  })
  expectPublicRejection({
    label: 'forged accepted official-answer key fails closed by digest',
    mutate: (rootDir) => rewriteSourceCapture(rootDir, (capture) => {
      const official = capture.documents.find((entry) => entry.inputKey === 'latest_official_answer_lead')
      const forged = capture.documents.find((entry) => entry.inputKey === 'latest_source_provenance')
      official.inputKey = 'official_answers'
      official.sha256 = forged.sha256
      official.byteLength = forged.byteLength
      official.immutableArtifactRef = structuredClone(forged.immutableArtifactRef)
    }),
  })
  expectPublicRejection({
    label: 'swapped immutable source asset fails closed',
    mutate: (rootDir) => writeFileSync(
      path.join(rootDir, paperId, 'versions/v2/paper-asset.json'),
      readFileSync(path.join(rootDir, paperId, 'versions/v2/source-evidence/606e0c96b9b853826d8a8.bin')),
    ),
  })
  expectPublicRejection({
    label: 'tampered immutable source asset fails closed',
    mutate: (rootDir) => {
      const assetPath = path.join(rootDir, paperId, 'versions/v2/paper-asset.json')
      const value = Buffer.from(readFileSync(assetPath))
      value[value.length - 1] ^= 0x01
      writeFileSync(assetPath, value)
    },
  })
}

function assertRegisteredAdmission(correction) {
  const sourceBytes = assertArtifact(correction.sourceCapture, 'successor Source Capture')
  const valid = {
    schemaVersion: registeredConfirmedCanonicalAdmissionSchemaVersion,
    paperId,
    sourceBytes: new Uint8Array(sourceBytes),
    candidateBytes: new Uint8Array(assertArtifact(correction.candidate, 'successor Candidate')),
    confirmationBytes: new Uint8Array(assertArtifact(correction.confirmation, 'successor Confirmation')),
    canonicalPaperBytes: new Uint8Array(assertArtifact(correction.canonicalPaper, 'successor Canonical Paper')),
  }
  assert.doesNotThrow(() => resolveRegisteredConfirmedCanonicalAdmission(valid), 'exact p-2026-i successor admission accepts')
  for (const [label, field] of [
    ['source', 'sourceBytes'],
    ['candidate', 'candidateBytes'],
    ['confirmation', 'confirmationBytes'],
    ['canonical', 'canonicalPaperBytes'],
  ]) {
    const forged = { ...valid, [field]: new Uint8Array(valid[field]) }
    forged[field][forged[field].length - 1] ^= 0x01
    assert.throws(
      () => resolveRegisteredConfirmedCanonicalAdmission(forged),
      (error) => error?.code?.startsWith('CANONICAL_PUBLICATION_REGISTERED_'),
      `forged successor ${label} admission fails closed`,
    )
  }
}

function assertSuccessorEvidence() {
  const correction = json(correctionPath)
  const accounting = json(accountingPath)
  assert.equal(correction.schemaVersion, 'paper-2026-i-successor-correction-v1')
  assert.equal(accounting.schemaVersion, 'paper-2026-i-successor-publication-accounting-v1')
  assert.equal(correction.evidenceDigest, digestJson(withoutKey(correction, 'evidenceDigest')), 'correction evidence digest must close')
  assert.equal(accounting.evidenceDigest, digestJson(withoutKey(accounting, 'evidenceDigest')), 'successor accounting digest must close')
  assert.equal(correction.paperId, paperId)
  assert.equal(correction.sourceBinding.expectedProjectedOccurrenceDigest, expectedOccurrenceDigest)
  assert.equal(correction.authority.manifestVersion, '43')
  assert.equal(accounting.predecessor.publication.versionName, 'v1')
  assert.equal(accounting.successor.publication.versionName, 'v2')
  assert.equal(accounting.successor.publication.sourceAssetVersion, 2)
  assert.equal(accounting.successor.latest.identity.publicationDigest, accounting.successor.publication.publicationDigest)
  const predecessorManifest = json(path.join(repositoryRoot, 'standards/paper-canonical/manifest-v42.json'))
  const predecessorRhythm = json(path.join(repositoryRoot, 'standards/paper-canonical/rendering/grammar-fill-rhythm-v5.json'))
  assert.equal(digestJson(predecessorManifest), accounting.predecessor.authority.manifestDigest, 'v42 authority manifest must remain immutable')
  const predecessorRhythmDescriptor = predecessorManifest.artifacts.find((artifact) => artifact.id === 'renderer-grammar-fill-rhythm')
  assert.equal(digestJson(predecessorRhythm), predecessorRhythmDescriptor.sha256, 'v5 public oracle artifact must remain immutable')
  assert.equal(predecessorRhythm.publicArtifactOracle.sourceAssetVersion, 1, 'v5 oracle must retain source asset v1')
  assert.equal(predecessorRhythm.publicArtifactOracle.expectedProjectedOccurrenceDigest, 'sha256:530edf0a143cfe60fd774c3368c51f9948927c1b1d52af9c0a3407ba3a20147a', 'v5 oracle must retain its historical occurrence literal')
  assertArtifact(correction.sourceCapture, 'correction Source Capture')
  for (const [label, descriptor, semanticKey, semanticForm] of [
    ['successor Candidate', correction.candidate, 'candidateDigest', 'candidate'],
    ['successor Confirmation', correction.confirmation, 'confirmationDigest', 'whole'],
    ['successor Canonical Paper', correction.canonicalPaper, 'canonicalPaperDigest', 'whole'],
    ['predecessor Candidate', accounting.predecessor.candidate, 'candidateDigest', 'candidate'],
    ['predecessor Confirmation', accounting.predecessor.confirmation, 'confirmationDigest', 'whole'],
    ['predecessor Canonical Paper', accounting.predecessor.canonicalPaper, 'canonicalPaperDigest', 'canonical-wrapper'],
  ]) {
    const value = JSON.parse(assertArtifact(descriptor, label))
    const semanticValue = semanticForm === 'candidate'
      ? withoutKey(value, 'candidateDigest')
      : semanticForm === 'canonical-wrapper'
        ? value.canonicalPaper
        : value
    assert.equal(digestJson(semanticValue), descriptor[semanticKey], `${label} semantic digest must close`)
  }
  const predecessorRoot = path.join(storeRoot, paperId, 'versions/v1')
  const oldTree = treeSnapshot(predecessorRoot)
  const predecessorFiles = oldTree.files.map((entry) => ({
    ...entry,
    path: path.relative(predecessorRoot, path.join(repositoryRoot, entry.path)),
  }))
  assert.deepEqual(
    {
      root: oldTree.root,
      fileCount: oldTree.fileCount,
      treeDigest: digestJson(predecessorFiles),
    },
    accounting.predecessor.immutableVersionTree,
    'predecessor v1 immutable bytes must remain unchanged',
  )
  const latest = assertArtifact(accounting.successor.latest, 'successor latest ref')
  assert.deepEqual(JSON.parse(latest), accounting.successor.latest.identity, 'latest ref must name the successor exactly')
  const publication = JSON.parse(assertArtifact(accounting.successor.publication, 'successor Publication'))
  assert.equal(publication.publicationDigest, accounting.successor.publication.publicationDigest, 'successor Publication digest must close')
  assert.equal(publication.authority.manifestVersion, '43', 'successor Publication authority must be v43')
  const dbPath = path.join(storeRoot, 'publication.sqlite')
  for (const suffix of ['-wal', '-shm', '-journal']) assert.equal(existsSync(`${dbPath}${suffix}`), false, `SQLite ${suffix} sidecar must be absent`)
  assert.equal(existsSync(path.join(storeRoot, paperId, '.canonical-latest-swap-v1.json')), false, 'latest swap journal must be absent')
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok', 'SQLite integrity must close')
    const rows = db.prepare('SELECT version_name, source_asset_version, publication_digest, is_current FROM canonical_paper_publications WHERE paper_id = ? ORDER BY version_name').all(paperId).map((row) => ({ ...row }))
    assert.deepEqual(rows, accounting.durableIndex.paper2026IRows, 'SQLite retains the exact predecessor and sole successor current identity')
    assert.equal(db.prepare('SELECT paper_id FROM canonical_paper_publications WHERE is_current = 1').all().length, 29, 'SQLite retains exactly 29 logical current identities')
  } finally {
    db.close()
  }
  const predecessorCanonical = JSON.parse(assertArtifact(accounting.predecessor.canonicalPaper, 'predecessor Canonical Paper')).canonicalPaper
  const successorCanonical = JSON.parse(assertArtifact(correction.canonicalPaper, 'successor Canonical Paper'))
  const questionCount = (canonical) => canonical.questionGroups.reduce((total, group) => total + group.questionRefs.length, 0)
  assert.equal(successorCanonical.questionGroups.length, 9, 'successor group count must remain 9')
  assert.equal(questionCount(successorCanonical), 45, 'successor question count must remain 45')
  assert.equal(successorCanonical.questionGroups.length, predecessorCanonical.questionGroups.length, 'successor must preserve predecessor group count')
  assert.equal(questionCount(successorCanonical), questionCount(predecessorCanonical), 'successor must preserve predecessor question count')
  assert.deepEqual(accounting.logicalCounts.frozenCorpus, { papers: 33, groups: 273, questions: 1530, questionOwnedOptions: 4140 }, '33-paper aggregate logical counts must remain unchanged')
  assertRegisteredAdmission(correction)
  return { correction, accounting }
}

function assertIdempotentRetry() {
  const output = execFileSync(process.execPath, ['scripts/materialize-paper-2026-i-successor-correction.mjs', '--check'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
  const result = JSON.parse(output)
  assert.equal(result.status, 'PASS')
  assert.equal(result.publication.status, 'idempotent')
  return result
}

const evidence = assertSuccessorEvidence()
const retry = assertIdempotentRetry()
const entries = withRuntime(storeRoot, (runtime) => {
  const consumption = runtime.load({ paperId, consumerId: 'print_pdf' })
  assert.equal(consumption.authorityRef.manifestVersion, '43', 'public Print consumes the v43 successor')
  assert.equal(consumption.sourceAssetVersion, 2, 'public Print consumes source asset v2')
  const payload = canonicalPrintPayload(consumption, sourceAnswerByQuestionId(storeRoot))
  return ['student', 'teacher'].map((versionType) => {
    const html = publicPrintHtml({ rootDir: storeRoot, consumption, versionType, payload: canonicalPrintPayload(consumption, sourceAnswerByQuestionId(storeRoot)) })
    return { versionType, html, observation: assertPublicHtml({ html, consumption, versionType }) }
  })
})
assertPrintBindingAdversaries()
const pdf = await assertChromiumA4Pdfs(entries)

console.log(JSON.stringify({
  status: 'PASS',
  paperId,
  correction: {
    authority: evidence.correction.authority,
    expectedOccurrenceDigest,
    predecessor: evidence.accounting.predecessor.publication,
    successor: evidence.accounting.successor.latest.identity,
  },
  idempotentRetry: retry.publication,
  publicPrintHtml: entries.map(({ versionType, observation }) => ({ versionType, ...observation })),
  directChromiumA4Pdf: pdf,
  adversarialFailClosed: [
    'zero recognized official-answer identity',
    'multiple recognized official-answer identities',
    'multi-role recognized official-answer competitor',
    'competing official-answer key',
    'forged accepted official-answer key',
    'swapped immutable source asset',
    'tampered immutable source asset',
    'forged source/candidate/confirmation/canonical admission bytes',
  ],
}))
