#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
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
import { digestJson, withoutKey } from '../shared/paper-canonical/stable.mjs'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const evidencePath = 'docs/cuts/paper-canonical-unification/qa/ticket-33-shared-surface-proof-v1.json'
const manifestPath = 'docs/cuts/paper-canonical-unification/migration/manifest-v2.json'
const durabilityPath = 'docs/cuts/paper-canonical-unification/migration/ticket-32-publication-index-durability-v1.json'
const ticket31Path = 'docs/cuts/paper-canonical-unification/migration/ticket-31-canary-publication-accounting-v2.json'
const ticket32Path = 'docs/cuts/paper-canonical-unification/migration/ticket-32-final-migration-accounting-v1.json'

const stores = Object.freeze({
  ticket31: 'test-fixtures/paper-canonical/publications/ticket-31-canary-v1/store',
  ticket32: 'test-fixtures/paper-canonical/publications/ticket-32-remaining-v1/store',
})

// The ticket starts with these three. The frozen census has a third, national
// legacy Profile that none of them cover, so the approved canary below is the
// one additional representative.
const representatives = Object.freeze([
  'paper-2025-i',
  'paper-2022-ii',
  'paper-zj-2021-jun',
  'paper-2023-yi',
])

function absolute(relativePath) {
  return path.join(repositoryRoot, relativePath)
}

function bytes(relativePath) {
  return readFileSync(absolute(relativePath))
}

function json(relativePath) {
  return JSON.parse(bytes(relativePath))
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function sortUnique(values, label) {
  const sorted = [...values].sort()
  assert.equal(new Set(sorted).size, sorted.length, `${label} must be unique`)
  return sorted
}

function sortedDistinct(values) {
  return [...new Set(values)].sort()
}

function requireArray(value, label) {
  assert.equal(Array.isArray(value), true, `${label} must be an array`)
  return value
}

function publicationFile(root, paperId, versionName) {
  const canonicalDir = absolute(path.join(root, paperId, 'versions', versionName, 'canonical'))
  const names = readdirSync(canonicalDir).filter((name) => /^canonical-paper-publication-v\d+\.json$/.test(name))
  assert.equal(names.length, 1, `${paperId} must contain one immutable canonical publication manifest`)
  return path.join(root, paperId, 'versions', versionName, 'canonical', names[0])
}

function sourceCaptureShape(sourceCapture) {
  return sourceCapture.sourceType || 'legacy-json'
}

function groupQuestionOwnedOptionIds(group) {
  const choice = group.variant?.choiceOwnership
  if (choice?.ownership !== 'per_question') return []
  const sets = requireArray(choice.sets, `${group.identity.groupId} per-question option sets`)
  return sets.flatMap((set) => requireArray(set.options, `${group.identity.groupId} option set`).map((option) => option.optionId))
}

function immutableSourceChain(manifestEntry) {
  const readArtifact = (label, descriptor) => {
    const value = bytes(descriptor.path)
    assert.equal(sha256(value), descriptor.fileSha256, `${manifestEntry.paperId} ${label} bytes must match the frozen manifest`)
    if (Number.isInteger(descriptor.byteLength)) {
      assert.equal(value.byteLength, descriptor.byteLength, `${manifestEntry.paperId} ${label} byte length must match the frozen manifest`)
    }
    return JSON.parse(value)
  }

  const sourceCapture = readArtifact('source capture', manifestEntry.sourceCapture)
  const candidate = readArtifact('candidate', manifestEntry.candidate)
  const confirmation = readArtifact('teacher confirmation', manifestEntry.confirmation)
  const canonicalPaper = readArtifact('canonical paper', manifestEntry.canonicalPaper)

  const sourceCaptureDigest = manifestEntry.sourceCapture.sourceCaptureDigest
    || manifestEntry.sourceCapture.semanticDigest
  const candidateDigest = manifestEntry.candidate.candidateDigest
    || manifestEntry.candidate.semanticDigest
  const confirmationDigest = manifestEntry.confirmation.confirmationDigest
    || manifestEntry.confirmation.semanticDigest
  const canonicalDigest = manifestEntry.canonicalPaper.canonicalPaperDigest
    || manifestEntry.canonicalPaper.semanticDigest

  const candidateRecord = candidate.candidate || candidate
  const confirmationRecord = confirmation.teacherConfirmation || confirmation
  const sourceRecord = sourceCapture.source || candidateRecord.source
  const canonicalRecord = canonicalPaper.canonicalPaper || canonicalPaper

  assert.equal(sourceCapture.paperId || sourceRecord?.paperId, manifestEntry.paperId, `${manifestEntry.paperId} source capture identity must close`)
  assert.equal(sourceCapture.captureId, manifestEntry.sourceCapture.sourceCaptureId, `${manifestEntry.paperId} source capture id must close`)
  assert.equal(sourceCapture.digest, sourceCaptureDigest, `${manifestEntry.paperId} source capture digest must close`)
  assert.equal(candidateRecord.candidateDigest, candidateDigest, `${manifestEntry.paperId} candidate digest must close`)
  assert.equal(confirmationRecord.confirmed, true, `${manifestEntry.paperId} requires teacher confirmation`)
  assert.equal(confirmationRecord.candidateDigest, candidateDigest, `${manifestEntry.paperId} confirmation must bind the exact candidate`)
  assert.equal(confirmationRecord.sourceDigest, sourceRecord.sha256, `${manifestEntry.paperId} confirmation must bind the exact source`)
  assert.equal(
    canonicalPaper.paperId || canonicalRecord.paperId || canonicalRecord.paperPlan?.paperId,
    manifestEntry.paperId,
    `${manifestEntry.paperId} canonical paper identity must close`,
  )
  assert.equal(digestJson(canonicalRecord), canonicalDigest, `${manifestEntry.paperId} canonical semantic digest must close`)
  if (canonicalPaper.candidateDigest !== undefined) {
    assert.equal(canonicalPaper.candidateDigest, candidateDigest, `${manifestEntry.paperId} canonical paper must bind the exact candidate`)
  }
  if (canonicalPaper.sourceDigest !== undefined) {
    assert.equal(canonicalPaper.sourceDigest, sourceRecord.sha256, `${manifestEntry.paperId} canonical paper must bind the exact source`)
  }
  if (canonicalPaper.confirmation !== undefined) {
    assert.equal(canonicalPaper.confirmation.candidateDigest, candidateDigest, `${manifestEntry.paperId} canonical paper must retain confirmation candidate binding`)
    assert.equal(canonicalPaper.confirmation.sourceDigest, sourceRecord.sha256, `${manifestEntry.paperId} canonical paper must retain confirmation source binding`)
  }
  if (canonicalPaper.sourceDigest !== undefined) {
    assert.equal(canonicalPaper.sourceDigest, sourceRecord.sha256, `${manifestEntry.paperId} canonical paper must bind the exact source`)
    if (canonicalPaper.sourceCapture !== undefined) {
      assert.equal(canonicalPaper.sourceCapture.captureId, sourceCapture.captureId, `${manifestEntry.paperId} canonical paper must retain source capture identity`)
      assert.equal(canonicalPaper.sourceCapture.captureDigest, sourceCaptureDigest, `${manifestEntry.paperId} canonical paper must retain source capture digest`)
    } else {
      assert.ok(canonicalRecord.sourceCapture?.captureId, `${manifestEntry.paperId} canonical paper must retain derived source capture identity`)
      assert.ok(canonicalRecord.sourceCapture?.digest, `${manifestEntry.paperId} canonical paper must retain derived source capture digest`)
    }
  } else if (canonicalPaper.sourceCapturePath !== undefined) {
    // Legacy canonicalization derives its own semantic source capture. Its
    // authority bridge is the outer candidate/Teacher Confirmation chain.
    assert.equal(canonicalPaper.teacherConfirmationDigest, confirmationDigest, `${manifestEntry.paperId} legacy canonical paper must bind Teacher Confirmation`)
    assert.equal(canonicalPaper.sourceCapturePath, manifestEntry.sourceCapture.path, `${manifestEntry.paperId} legacy canonical paper must retain frozen source path`)
    assert.ok(canonicalRecord.sourceCapture?.captureId, `${manifestEntry.paperId} legacy canonical paper must retain derived source capture identity`)
    assert.ok(canonicalRecord.sourceCapture?.digest, `${manifestEntry.paperId} legacy canonical paper must retain derived source capture digest`)
  } else {
    // Ticket 27's frozen raw canonical representation has no wrapper fields;
    // the immutable manifest is its candidate/confirmation-to-canonical edge.
    assert.ok(canonicalRecord.sourceCapture?.captureId, `${manifestEntry.paperId} canonical paper must retain derived source capture identity`)
    assert.ok(canonicalRecord.sourceCapture?.digest, `${manifestEntry.paperId} canonical paper must retain derived source capture digest`)
  }

  return {
    sourceType: manifestEntry.sourceType,
    sourceDigest: sourceRecord.sha256,
    sourceCaptureDigest,
    candidateDigest,
    confirmationDigest,
    canonicalDigest,
  }
}

function immutablePublicationOracle({ root, paperId, versionName, manifestEntry }) {
  const latestPath = path.join(root, paperId, 'latest', 'canonical-paper-publication-ref-v1.json')
  const latest = json(latestPath)
  const publicationPath = publicationFile(root, paperId, versionName)
  const publication = json(publicationPath)
  assert.equal(latest.paperId, paperId, `${paperId} current ref identity must close`)
  assert.equal(latest.versionName, versionName, `${paperId} current ref version must close`)
  assert.equal(publication.paperId, paperId, `${paperId} publication identity must close`)
  assert.equal(publication.publicationDigest, latest.publicationDigest, `${paperId} publication digest must match current ref`)
  assert.equal(publication.sourceAssetVersion, latest.sourceAssetVersion, `${paperId} source asset version must match current ref`)

  const artifacts = new Map(requireArray(publication.artifacts, `${paperId} publication artifacts`).map((artifact) => [artifact.role, artifact]))
  for (const role of ['source_capture', 'paper_plan', 'question_groups']) {
    const descriptor = artifacts.get(role)
    assert.ok(descriptor, `${paperId} must publish ${role}`)
    const value = bytes(path.join(root, paperId, 'versions', versionName, descriptor.relativePath))
    assert.equal(value.byteLength, descriptor.byteLength, `${paperId} ${role} byte length must match publication manifest`)
    assert.equal(sha256(value), descriptor.sha256, `${paperId} ${role} hash must match publication manifest`)
  }

  const sourceCapture = JSON.parse(bytes(path.join(root, paperId, 'versions', versionName, artifacts.get('source_capture').relativePath)))
  const plan = JSON.parse(bytes(path.join(root, paperId, 'versions', versionName, artifacts.get('paper_plan').relativePath)))
  const groupsDocument = JSON.parse(bytes(path.join(root, paperId, 'versions', versionName, artifacts.get('question_groups').relativePath)))
  const groups = requireArray(groupsDocument.groups, `${paperId} canonical groups`)
  const groupIds = sortUnique(groups.map((group) => group.identity?.groupId), `${paperId} canonical group ids`)
  const groupById = new Map(groups.map((group) => [group.identity.groupId, group]))
  const boundGroupIds = sortUnique(
    requireArray(plan.slotBindings, `${paperId} slot bindings`)
      .filter((binding) => binding.state === 'bound')
      .map((binding) => binding.groupRef?.groupId),
    `${paperId} bound slot group ids`,
  )
  assert.deepEqual(boundGroupIds, groupIds, `${paperId} active slots must bind every and only canonical group`)
  const inactiveSlots = plan.slotBindings
    .filter((binding) => binding.state === 'inactive')
    .map((binding) => binding.slotId)
    .sort()
  assert.equal(inactiveSlots.length > 0, true, `${paperId} must retain explicit inactive slots`)

  const sourceChain = immutableSourceChain(manifestEntry)
  assert.equal(publication.sourceAssetDigest, sourceChain.sourceDigest, `${paperId} published source asset must retain immutable source material`)
  assert.equal(plan.paperId, paperId, `${paperId} canonical plan identity must close`)
  assert.deepEqual(plan.profileRef, {
    profileId: manifestEntry.profileId,
    profileVersion: plan.profileRef.profileVersion,
    profileDigest: plan.profileRef.profileDigest,
  }, `${paperId} immutable plan profile must match frozen membership`)

  return {
    paperId,
    root,
    latest,
    publication,
    plan,
    groupIds,
    groupById,
    inactiveSlots,
    sourceChain,
    counts: {
      groups: groups.length,
      questions: groups.reduce((sum, group) => sum + group.questionRefs.length, 0),
      questionOwnedOptions: groups.reduce((sum, group) => sum + groupQuestionOwnedOptionIds(group).length, 0),
    },
  }
}

function projectedSummary(consumption, selection, rawGroup) {
  const projection = projectCanonicalConsumerGroup({
    consumption,
    familyContractId: selection.familyContractId,
    groupId: rawGroup.identity.groupId,
  })
  const expectedQuestionIds = rawGroup.questionRefs.map((question) => question.questionId)
  const receivedQuestionIds = projection.questions.map((question) => question.questionId)
  assert.deepEqual(receivedQuestionIds, expectedQuestionIds, `${consumption.paperId} ${rawGroup.identity.groupId} projection must retain immutable question identity`)
  const expectedOptionIds = groupQuestionOwnedOptionIds(rawGroup).sort()
  const receivedOptionIds = projection.questions.flatMap((question) => question.options.map((option) => option.optionId)).sort()
  assert.deepEqual(receivedOptionIds, expectedOptionIds, `${consumption.paperId} ${rawGroup.identity.groupId} projection must retain immutable question-owned options`)
  const rawQuestionsById = new Map((rawGroup.variant?.questions || []).map((question) => [question.questionId, question]))
  for (const question of projection.questions) {
    const rawQuestion = rawQuestionsById.get(question.questionId)
    if (rawQuestion?.correctOptionId !== undefined) {
      assert.equal(question.correctOptionId, rawQuestion.correctOptionId, `${consumption.paperId} ${question.questionId} correct-option identity must remain canonical`)
    }
  }
  return {
    groupId: projection.groupId,
    familyContractId: selection.familyContractId,
    semanticSignature: projection.semanticSignature,
    occurrenceSignature: projection.occurrenceSignature || null,
    questionIds: receivedQuestionIds,
    questionOwnedOptionIds: receivedOptionIds,
  }
}

function assertConsumerAgainstOracle({ consumerId, consumption, oracle }) {
  assert.equal(consumption.disposition, 'ready', `${oracle.paperId} ${consumerId} must resolve ready`)
  assert.equal(consumption.paperId, oracle.paperId, `${oracle.paperId} ${consumerId} must retain paper identity`)
  assert.equal(consumption.publicationDigest, oracle.publication.publicationDigest, `${oracle.paperId} ${consumerId} must select the current publication`)
  assert.equal(consumption.sourceAssetVersion, oracle.publication.sourceAssetVersion, `${oracle.paperId} ${consumerId} must retain source asset version`)
  assert.deepEqual(consumption.profileRef, oracle.plan.profileRef, `${oracle.paperId} ${consumerId} must retain canonical profile`)
  assert.equal(consumption.diagnostics.length, 0, `${oracle.paperId} ${consumerId} must not fall back with diagnostics`)
  assert.equal(consumption.selections.every((selection) => selection.mode === 'canonical'), true, `${oracle.paperId} ${consumerId} must never reconstruct a legacy/raw family`)

  const selectedGroupIds = sortUnique(consumption.selections.flatMap((selection) => selection.groupIds), `${oracle.paperId} ${consumerId} selected groups`)
  assert.deepEqual(selectedGroupIds, oracle.groupIds, `${oracle.paperId} ${consumerId} must select every and only current canonical group`)
  const visibleGroups = requireArray(consumption.visibleStructure, `${oracle.paperId} ${consumerId} visible structure`)
    .filter((node) => node.kind === 'group')
  assert.deepEqual(sortUnique(visibleGroups.map((node) => node.groupId), `${oracle.paperId} ${consumerId} visible groups`), oracle.groupIds, `${oracle.paperId} ${consumerId} visible structure must contain every and only canonical group`)
  assert.equal(visibleGroups.some((node) => oracle.inactiveSlots.includes(node.slotId)), false, `${oracle.paperId} ${consumerId} must render no inactive slot`)

  const summaries = []
  for (const selection of consumption.selections) {
    for (const groupId of selection.groupIds) {
      const rawGroup = oracle.groupById.get(groupId)
      assert.ok(rawGroup, `${oracle.paperId} ${consumerId} may only select a published immutable group`)
      assert.equal(rawGroup.contractRef.familyContractId, selection.familyContractId, `${oracle.paperId} ${groupId} family must agree with immutable canonical bytes`)
      summaries.push(projectedSummary(consumption, selection, rawGroup))
    }
  }
  return summaries.sort((left, right) => left.groupId.localeCompare(right.groupId))
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
              ? question.options.find((option) => option.optionId === question.correctOptionId)?.label || ''
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

function printGroupIds(html) {
  return [...html.matchAll(/<section class="question-group" data-canonical-group-id="([^"]+)"/g)].map((match) => match[1])
}

function assertPrintHtml({ html, versionType, oracle, consumption }) {
  const expectedGroupIds = consumption.visibleStructure
    .filter((node) => node.kind === 'group')
    .map((node) => node.groupId)
  assert.deepEqual(printGroupIds(html), expectedGroupIds, `${oracle.paperId} ${versionType} Print HTML must retain canonical visible group order`)
  for (const group of oracle.groupById.values()) {
    for (const question of group.questionRefs) {
      assert.equal(html.includes(`data-canonical-question-id="${question.questionId}"`), true, `${oracle.paperId} ${versionType} Print HTML must retain ${question.questionId}`)
    }
  }
  const answerMarkers = (html.match(/【答案】/g) || []).length
  assert.equal(answerMarkers, versionType === 'teacher' ? oracle.counts.questions : 0, `${oracle.paperId} ${versionType} Print HTML must preserve answer visibility`)
  assert.equal(html.includes('data-canonical-correct-option-id='), versionType === 'teacher', `${oracle.paperId} ${versionType} must expose correct-option data only for Teacher`)
  return { answerMarkers, groupCount: expectedGroupIds.length }
}

function exportPrintHtml({ root, runtime, consumption, oracle, versionType }) {
  const payload = canonicalPrintPayload(consumption)
  const implementation = createExportImplementation({
    rootDir: absolute(root),
    exportDir: path.join(tmpdir(), 'eqb-ticket-33-no-export'),
    getQuestionGroupDetail: (groupId) => payload.details.get(groupId) || null,
    buildPrintHtml,
    paperAssetsDir: absolute(root),
    resolveCanonicalConsumption: runtime.resolveForItems,
  })
  try {
    const result = implementation.exportPrintHtml({ ...payload, versionType })
    return { html: result.body, observation: assertPrintHtml({ html: result.body, versionType, oracle, consumption }) }
  } catch (error) {
    error.message = `${consumption.paperId} ${versionType} Print HTML: ${error.message}`
    throw error
  }
}

function assetProjectionBytes(root, paperId, versionName, oracle) {
  const sourceAssetBytes = bytes(path.join(root, paperId, 'versions', versionName, 'paper-asset.json'))
  let capture
  try {
    capture = JSON.parse(sourceAssetBytes)
  } catch {
    assert.equal(sourceAssetBytes.subarray(0, 4).toString('hex'), '504b0304', `${paperId} non-JSON Screen source must be an immutable DOCX/ZIP asset`)
    const publicAssetPath = path.join('app/public/paper-assets', paperId, 'latest', 'paper-asset.json')
    const publicAssetBytes = bytes(publicAssetPath)
    const publicAsset = JSON.parse(publicAssetBytes)
    assert.equal(publicAsset.paper?.paperId, paperId, `${paperId} existing Screen asset identity must close`)
    assert.deepEqual(
      sortUnique(Object.keys(publicAsset.content?.groups || {}), `${paperId} existing Screen asset groups`),
      oracle.groupIds,
      `${paperId} existing Screen asset groups must match the immutable Publication oracle`,
    )
    assert.deepEqual(
      sortUnique(Object.keys(publicAsset.content?.questions || {}), `${paperId} existing Screen asset questions`),
      sortUnique([...oracle.groupById.values()].flatMap((group) => group.questionRefs.map((question) => question.questionId)), `${paperId} immutable oracle questions`),
      `${paperId} existing Screen asset questions must match the immutable Publication oracle`,
    )
    return publicAssetBytes
  }
  const document = capture.documents?.find((candidate) => candidate.roles?.includes('asset-projection'))
  assert.ok(document?.encodedBytes && document?.sha256, `${paperId} Screen asset projection must be immutable and self-hashed`)
  const value = Buffer.from(document.encodedBytes, 'base64')
  assert.equal(sha256(value), document.sha256, `${paperId} Screen asset projection hash must close`)
  return value
}

async function inspectRepresentativeScreen(records) {
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: new URL('../app', import.meta.url).pathname,
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert.ok(appUrl, 'Ticket 33 requires a real Vite Screen surface URL')
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true })
  const observations = []
  try {
    for (const record of records) {
      for (const mode of ['plain', 'lecture']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
        const pageErrors = []
        page.on('pageerror', (error) => pageErrors.push(error.message))
        await page.route('**/api/paper-canonical/consumption?*', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(record.screen),
        }))
        await page.route('**/paper-assets/**/paper-asset.json', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: assetProjectionBytes(record.oracle.root, record.oracle.paperId, record.oracle.latest.versionName, record.oracle),
        }))
        await page.route('**/paper-assets/**/analyses/**', (route) => route.fulfill({ status: 404, body: '' }))
        await page.route('**/paper-assets/**/figures/**', (route) => route.fulfill({ status: 404, body: '' }))
        const url = new URL('canonical-consumption-qa.html', appUrl)
        url.searchParams.set('paperId', record.oracle.paperId)
        if (mode === 'lecture') url.searchParams.set('lecture', '1')
        await page.goto(url.href)
        const cards = page.locator('section.paper-browse-group-card[data-paper-browse-anchor]')
        await cards.first().waitFor()
        assert.equal(await cards.count(), record.oracle.counts.groups, `${record.oracle.paperId} ${mode} Screen must mount every canonical group`)
        for (const summary of record.screenSummary) {
          const card = page.locator(`section.paper-browse-group-card[data-paper-browse-anchor="${summary.groupId}"]`)
          assert.equal(await card.count(), 1, `${record.oracle.paperId} ${mode} Screen must mount ${summary.groupId} once`)
          assert.equal(await card.getAttribute('data-canonical-semantic-signature'), summary.semanticSignature, `${record.oracle.paperId} ${mode} Screen must retain canonical semantic signature`)
        }
        assert.equal(await page.locator('.paper-browse-group-card--error').count(), 0, `${record.oracle.paperId} ${mode} Screen must not fall back per group`)
        assert.equal(await page.locator('.paper-browse-lecture-panel').count(), mode === 'lecture' ? 1 : 0, `${record.oracle.paperId} ${mode} Screen state must be real`)
        assert.deepEqual(pageErrors, [], `${record.oracle.paperId} ${mode} Screen must have no uncaught browser error`)
        const textLength = (await page.locator('body').innerText()).trim().length
        assert.equal(textLength > 200, true, `${record.oracle.paperId} ${mode} Screen must not be blank`)
        await page.screenshot({ fullPage: true })
        observations.push({ paperId: record.oracle.paperId, mode, groupCards: record.oracle.counts.groups, lecturePanel: mode === 'lecture', bodyTextLength: textLength })
        await page.close()
      }
    }
  } finally {
    await browser.close()
    await viteServer.close()
  }
  return observations
}

async function inspectRepresentativePdfs(records) {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'eqb-ticket-33-pdf-'))
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true })
  const observations = []
  try {
    for (const record of records) {
      const db = new DatabaseSync(absolute(path.join(record.oracle.root, 'publication.sqlite')), { readOnly: true })
      try {
        const runtime = createCanonicalConsumerRuntime({ rootDir: absolute(record.oracle.root), db })
        const consumption = runtime.load({ paperId: record.oracle.paperId, consumerId: 'print_pdf' })
        for (const versionType of ['student', 'teacher']) {
          const { html, observation } = exportPrintHtml({ root: record.oracle.root, runtime, consumption, oracle: record.oracle, versionType })
          const page = await browser.newPage({ viewport: { width: 794, height: 1123 } })
          await page.setContent(html, { waitUntil: 'load' })
          await page.emulateMedia({ media: 'print' })
          await page.evaluate(() => document.fonts.ready)
          const dom = await page.evaluate(() => ({
            groupIds: [...document.querySelectorAll('section.question-group[data-canonical-group-id]')].map((node) => node.getAttribute('data-canonical-group-id')),
            questionCount: new Set([...document.querySelectorAll('[data-canonical-question-id]')].map((node) => node.getAttribute('data-canonical-question-id'))).size,
            nonPositiveBoxes: [...document.querySelectorAll('section.question-group[data-canonical-group-id], [data-canonical-question-id]')]
              .filter((node) => {
                const rect = node.getBoundingClientRect()
                return rect.width <= 0 || rect.height <= 0
              }).length,
            bodyTextLength: document.body.innerText.trim().length,
          }))
          assert.deepEqual(dom.groupIds, consumption.visibleStructure.filter((node) => node.kind === 'group').map((node) => node.groupId), `${record.oracle.paperId} ${versionType} Print DOM must retain canonical group order`)
          assert.equal(dom.questionCount, record.oracle.counts.questions, `${record.oracle.paperId} ${versionType} Print DOM must retain every question`)
          assert.equal(dom.nonPositiveBoxes, 0, `${record.oracle.paperId} ${versionType} Print DOM must not clip a canonical group or question to zero size`)
          assert.equal(dom.bodyTextLength > 200, true, `${record.oracle.paperId} ${versionType} Print DOM must not be blank`)
          const pdfPath = path.join(outputDir, `${record.oracle.paperId}-${versionType}.pdf`)
          const pdfBytes = await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true })
          assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF', `${record.oracle.paperId} ${versionType} must be a real PDF`)
          const pdfInfo = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
          assert.match(pdfInfo, /Page size:\s+594\.96 x 841\.92 pts \(A4\)/, `${record.oracle.paperId} ${versionType} PDF must be A4`)
          const pageCount = Number(pdfInfo.match(/^Pages:\s+(\d+)$/m)?.[1])
          assert.equal(Number.isInteger(pageCount) && pageCount > 0, true, `${record.oracle.paperId} ${versionType} PDF must have pages`)
          for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            const pageText = execFileSync('pdftotext', ['-f', String(pageNumber), '-l', String(pageNumber), pdfPath, '-'], { encoding: 'utf8' }).trim()
            assert.equal(pageText.length > 0, true, `${record.oracle.paperId} ${versionType} PDF page ${pageNumber} must not be blank`)
          }
          const pdfText = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
          const answerMarkers = (pdfText.match(/【答案】/g) || []).length
          assert.equal(answerMarkers, versionType === 'teacher' ? record.oracle.counts.questions : 0, `${record.oracle.paperId} ${versionType} PDF must preserve answer visibility`)
          observations.push({
            paperId: record.oracle.paperId,
            versionType,
            htmlGroups: observation.groupCount,
            htmlAnswerMarkers: observation.answerMarkers,
            pdfPages: pageCount,
            pdfAnswerMarkers: answerMarkers,
            a4: true,
            nonPositiveBoxes: dom.nonPositiveBoxes,
          })
          await page.close()
        }
      } finally {
        db.close()
      }
    }
  } finally {
    await browser.close()
    rmSync(outputDir, { recursive: true, force: true })
  }
  return observations
}

function storeInput() {
  const manifest = json(manifestPath)
  const durability = json(durabilityPath)
  const ticket31 = json(ticket31Path)
  const ticket32 = json(ticket32Path)
  assert.equal(manifest.manifestDigest, digestJson(withoutKey(manifest, 'manifestDigest')), 'frozen 33-paper source manifest digest must close')
  assert.equal(durability.status, 'PASS', 'Ticket 32 durability accounting must pass before Ticket 33')
  const ticket31Ids = sortUnique(ticket31.approvedCanaryPublications.map((entry) => entry.paperId), 'Ticket 31 canary identities')
  const ticket32Ids = sortUnique(durability.stores.find((store) => store.ticket === 32)?.paperIds || [], 'Ticket 32 current identities')
  assert.equal(ticket31Ids.length, 4, 'Ticket 31 must contribute exactly four current identities')
  assert.equal(ticket32Ids.length, 29, 'Ticket 32 must contribute exactly twenty-nine current identities')
  const allIds = sortUnique([...ticket31Ids, ...ticket32Ids], 'Ticket 33 current identities')
  assert.deepEqual(allIds, sortUnique(manifest.membership.paperIds, 'frozen source paper identities'), 'current 4+29 identities must equal the frozen 33-paper denominator')
  return { manifest, ticket31Ids, ticket32Ids, allIds, ticket32 }
}

function runCorpusTrace(input) {
  const manifestById = new Map(input.manifest.papers.map((entry) => [entry.paperId, entry]))
  const rootForPaper = new Map([
    ...input.ticket31Ids.map((paperId) => [paperId, stores.ticket31]),
    ...input.ticket32Ids.map((paperId) => [paperId, stores.ticket32]),
  ])
  const runtimes = new Map()
  try {
    for (const root of new Set(rootForPaper.values())) {
      const db = new DatabaseSync(absolute(path.join(root, 'publication.sqlite')), { readOnly: true })
      const runtime = createCanonicalConsumerRuntime({ rootDir: absolute(root), db })
      const databaseIds = sortUnique(db.prepare('SELECT paper_id FROM canonical_paper_publications WHERE is_current = 1').all().map((row) => row.paper_id), `${root} SQLite current identities`)
      const expectedIds = root === stores.ticket31 ? input.ticket31Ids : input.ticket32Ids
      assert.deepEqual(databaseIds, expectedIds, `${root} SQLite must contain exact current identities`)
      runtimes.set(root, { db, runtime })
    }

    const records = []
    for (const paperId of input.manifest.membership.paperIds) {
      const root = rootForPaper.get(paperId)
      const manifestEntry = manifestById.get(paperId)
      assert.ok(root && manifestEntry, `${paperId} must have one publication store and one immutable source entry`)
      const runtime = runtimes.get(root).runtime
      const row = runtimes.get(root).db.prepare('SELECT version_name FROM canonical_paper_publications WHERE paper_id = ? AND is_current = 1').get(paperId)
      assert.ok(row?.version_name, `${paperId} must have one current SQLite row`)
      const oracle = immutablePublicationOracle({ root, paperId, versionName: row.version_name, manifestEntry })
      const screen = runtime.load({ paperId, consumerId: 'screen' })
      const print = runtime.load({ paperId, consumerId: 'print_pdf' })
      const screenSummary = assertConsumerAgainstOracle({ consumerId: 'screen', consumption: screen, oracle })
      const printSummary = assertConsumerAgainstOracle({ consumerId: 'print_pdf', consumption: print, oracle })
      assert.deepEqual(printSummary, screenSummary, `${paperId} Screen and Print/PDF must project the same canonical semantics`)
      records.push({ oracle, screen, print, screenSummary })
    }
    const counts = records.reduce((total, record) => ({
      papers: total.papers + 1,
      groups: total.groups + record.oracle.counts.groups,
      questions: total.questions + record.oracle.counts.questions,
      questionOwnedOptions: total.questionOwnedOptions + record.oracle.counts.questionOwnedOptions,
    }), { papers: 0, groups: 0, questions: 0, questionOwnedOptions: 0 })
    assert.deepEqual(counts, { papers: 33, groups: 273, questions: 1530, questionOwnedOptions: 4140 }, 'immutable current corpus totals must close')
    return { records, counts }
  } finally {
    for (const { db } of runtimes.values()) db.close()
  }
}

function representativeCoverage(records) {
  const allProfiles = sortedDistinct(records.map((record) => record.oracle.plan.profileRef.profileId))
  const allSourceTypes = sortedDistinct(records.map((record) => record.oracle.sourceChain.sourceType))
  const allFamilies = sortedDistinct(records.flatMap((record) => [...record.oracle.groupById.values()].map((group) => group.contractRef.familyContractId)))
  const representativeRecords = representatives.map((paperId) => records.find((record) => record.oracle.paperId === paperId))
  assert.equal(representativeRecords.every(Boolean), true, 'every Ticket 33 representative must be current')
  const representativeProfiles = sortedDistinct(representativeRecords.map((record) => record.oracle.plan.profileRef.profileId))
  const representativeSourceTypes = sortedDistinct(representativeRecords.map((record) => record.oracle.sourceChain.sourceType))
  const representativeFamilies = sortedDistinct(representativeRecords.flatMap((record) => [...record.oracle.groupById.values()].map((group) => group.contractRef.familyContractId)))
  assert.deepEqual(representativeProfiles, allProfiles, 'representatives must cover every Profile')
  assert.deepEqual(representativeSourceTypes, allSourceTypes, 'representatives must cover both source authority shapes')
  assert.deepEqual(representativeFamilies, allFamilies, 'representatives must cover every active family')
  return { records: representativeRecords, allProfiles, allSourceTypes, allFamilies }
}

async function produceEvidence() {
  const input = storeInput()
  const trace = runCorpusTrace(input)
  const coverage = representativeCoverage(trace.records)
  const screen = await inspectRepresentativeScreen(coverage.records)
  const pdf = await inspectRepresentativePdfs(coverage.records)
  assert.equal(pdf.length, representatives.length * 2, 'representative Student/Teacher Print HTML and PDF checks must cover exactly four papers')
  const inactiveSlotInventory = trace.records.reduce((inventory, record) => {
    for (const slotId of record.oracle.inactiveSlots) inventory[slotId] = (inventory[slotId] || 0) + 1
    return inventory
  }, {})
  const rollbackTargets = input.ticket32.publication.papers.map((paper) => paper.rollback?.disposition)
  assert.equal(rollbackTargets.length, 29, 'Ticket 32 rollback inventory must retain all 29 papers')
  assert.equal(rollbackTargets.every((value) => value === 'no_prior_rollback_target'), true, 'Ticket 32 rollback inventory must not fabricate a prior target')
  return {
    schemaVersion: 'ticket-33-shared-surface-proof-v1',
    status: 'PASS',
    ticket: {
      number: 33,
      supersedesFailClosedPreflight: 'docs/cuts/paper-canonical-unification/qa/ticket-33-input-preflight-v1.json',
      durabilityRepair: '396940ad3611ad2bedc7faae228671bc76ab4bf3',
      nextTicketStarted: false,
    },
    corpus: {
      currentIdentity: {
        ticket31: input.ticket31Ids,
        ticket32: input.ticket32Ids,
        noMissingDuplicateOrExtra: true,
      },
      counts: trace.counts,
      sourceCandidateConfirmationCanonicalPublicationBindings: 33,
      exactScreenSelections: 33,
      exactPrintPdfSelections: 33,
      studentTeacherPrintHtmlChecks: pdf.length,
      noLegacyOrRawReconstruction: true,
      inactiveSlotInventory: Object.fromEntries(Object.entries(inactiveSlotInventory).sort()),
      inactiveSlotOccurrences: 0,
      rollback: { noPriorRollbackTarget: 29 },
      sourceAuthorityShapes: coverage.allSourceTypes,
      profiles: coverage.allProfiles,
      activeFamilies: coverage.allFamilies,
    },
    representativeCoverage: {
      papers: representatives,
      addedForNationalLegacyProfileGap: 'paper-2023-yi',
      sourceAuthorityShapes: coverage.allSourceTypes,
      profiles: coverage.allProfiles,
      activeFamilies: coverage.allFamilies,
    },
    realScreen: screen,
    directChromiumA4Pdf: pdf,
    invariants: {
      immutableCanonicalPublicationOracle: true,
      noCallerMaintainedMirrorAsOracle: true,
      noRendererSelfReportAsOnlyOracle: true,
      sharedBehaviorChanged: false,
      productionOrR2Touched: false,
      ticket34Started: false,
    },
  }
}

function withEvidenceDigest(evidence) {
  return { ...evidence, evidenceDigest: digestJson(evidence) }
}

function failClosedEvidence() {
  const input = storeInput()
  const paperId = 'paper-2025-i'
  const root = stores.ticket32
  const manifestEntry = input.manifest.papers.find((entry) => entry.paperId === paperId)
  assert.ok(manifestEntry, 'Ticket 33 trusted DOCX representative must remain in the frozen 33-paper manifest')
  const db = new DatabaseSync(absolute(path.join(root, 'publication.sqlite')), { readOnly: true })
  try {
    const runtime = createCanonicalConsumerRuntime({ rootDir: absolute(root), db })
    const row = db.prepare('SELECT version_name FROM canonical_paper_publications WHERE paper_id = ? AND is_current = 1').get(paperId)
    assert.equal(row?.version_name, 'v1', 'Ticket 33 must exercise the current trusted DOCX publication')
    const oracle = immutablePublicationOracle({ root, paperId, versionName: row.version_name, manifestEntry })
    const consumption = runtime.load({ paperId, consumerId: 'print_pdf' })
    assertConsumerAgainstOracle({ consumerId: 'print_pdf', consumption, oracle })
    const sourceAssetPath = path.join(root, paperId, 'versions', row.version_name, 'paper-asset.json')
    const sourceAssetBytes = bytes(sourceAssetPath)
    assert.equal(sha256(sourceAssetBytes), consumption.sourceAssetDigest, 'Ticket 33 must prove the failing asset is the selected immutable source asset')
    const failures = []
    for (const versionType of ['student', 'teacher']) {
      try {
        exportPrintHtml({ root, runtime, consumption, oracle, versionType })
        assert.fail(`${paperId} ${versionType} Print HTML unexpectedly rendered`)
      } catch (error) {
        assert.equal(error?.code, 'CANONICAL_CONSUMPTION_REJECTED', `${paperId} ${versionType} must fail through the real public Print seam`)
        assert.equal(error.message, `${paperId} ${versionType} Print HTML: Canonical Grammar Fill chrome immutable source asset is invalid`, `${paperId} ${versionType} failure must be exact and deterministic`)
        failures.push({ versionType, code: error.code, message: error.message })
      }
    }
    return {
      schemaVersion: 'ticket-33-shared-surface-proof-v1',
      status: 'FAIL_CLOSED',
      ticket: {
        number: 33,
        supersedesFailClosedPreflight: 'docs/cuts/paper-canonical-unification/qa/ticket-33-input-preflight-v1.json',
        durabilityRepair: '396940ad3611ad2bedc7faae228671bc76ab4bf3',
        nextTicketStarted: false,
      },
      replay: {
        paperId,
        consumerId: 'print_pdf',
        currentVersion: row.version_name,
        sourceAuthorityShape: manifestEntry.sourceType,
        canonicalPublication: oracle.publication.publicationDigest,
        sourceAsset: {
          path: sourceAssetPath,
          byteLength: sourceAssetBytes.byteLength,
          sha256: sha256(sourceAssetBytes),
          leadingBytesHex: sourceAssetBytes.subarray(0, 4).toString('hex'),
          jsonParseable: false,
        },
        failures,
      },
      withheld: {
        wholeCorpusTrace: 'not claimed after the representative public Print seam rejected',
        screenAndPdfRepresentativeRender: 'not run because Student and Teacher Print HTML are prerequisites',
      },
      requiredFixLineage: {
        kind: 'shared Print/PDF trusted-DOCX immutable-source handling',
        mustPreserve: ['immutable source binding', 'fail-closed integrity checks', 'canonical publication bytes'],
        ticket34Started: false,
      },
      invariants: {
        sharedBehaviorChanged: false,
        productionOrR2Touched: false,
        ticket34Started: false,
      },
    }
  } finally {
    db.close()
  }
}

const mode = process.argv.slice(2)
assert.equal(mode.length, 1, 'use exactly one of --produce, --fail-closed, or --check')
assert.equal(['--produce', '--fail-closed', '--check'].includes(mode[0]), true, 'use exactly one of --produce, --fail-closed, or --check')

if (mode[0] === '--produce' || mode[0] === '--fail-closed') {
  const evidence = withEvidenceDigest(mode[0] === '--produce' ? await produceEvidence() : failClosedEvidence())
  writeFileSync(absolute(evidencePath), `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify({ status: evidence.status, mode: mode[0].slice(2), evidencePath, replay: evidence.replay || { corpus: evidence.corpus.counts } }))
} else {
  const recorded = json(evidencePath)
  assert.equal(recorded.evidenceDigest, digestJson(withoutKey(recorded, 'evidenceDigest')), 'Ticket 33 evidence digest must close')
  const evidence = withEvidenceDigest(recorded.status === 'FAIL_CLOSED' ? failClosedEvidence() : await produceEvidence())
  assert.deepEqual(recorded, evidence, 'Ticket 33 rendered and immutable evidence must replay exactly')
  console.log(JSON.stringify({ status: evidence.status, mode: 'check', evidencePath, replay: evidence.replay || { corpus: evidence.corpus.counts } }))
}
