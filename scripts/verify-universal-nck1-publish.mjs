#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  createImportReviewStore,
  reviewBundleDigest,
} from '../server/import-review/importReviewStore.mjs'
import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import {
  buildNck1ReviewProjection,
  reviewBundleFilePaths,
  resolveReviewFile,
} from '../server/import-review/revisionProjection.mjs'
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'
import { materializeNck1CanonicalRequest } from '../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { publishUniversalNck1Import } from '../server/paper-import/publisher.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { runRoutes } from '../server/router/index.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { canonicalConsumptionPrintPayload } from './import-pipeline/canonical-consumption-print-payload.mjs'
import { makeFixture } from './verify-nck1-source-materialization.mjs'

const root = path.resolve(import.meta.dirname, '..')
const paperId = 'paper-mock-contract-2026-m1'
const officialApplicationSample = 'Official application sample from the supplied answer source.'
const officialContinuationSample = 'Official continuation sample from the supplied answer source.'

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function continuationAnalysis() {
  const evidence = (source, excerpt) => ({ source, excerpt })
  const grounded = (statement, source = 'material', excerpt = 'Story material') => ({
    statement,
    evidence: [evidence(source, excerpt)],
  })
  const constraint = (id, statement, source = 'material', excerpt = 'Story material') => ({
    id,
    ...grounded(statement, source, excerpt),
  })
  const firstStarter = grounded('Paragraph one must start from its supplied sentence.', 'paragraph1Starter', 'Paragraph one starter.')
  const secondStarter = grounded('Paragraph two must start from its supplied sentence.', 'paragraph2Starter', 'Paragraph two starter.')
  return {
    schemaVersion: 'continuation-analysis-v1',
    storyUnderstanding: {
      centralSituation: grounded('The source establishes the story situation.'),
      sourceEndState: grounded('The source ends with an unresolved situation.'),
      narrativePerspective: grounded('The continuation preserves the source perspective.'),
      timeAndPlaceFrame: grounded('The continuation stays in the source setting.'),
      characters: [{
        name: 'the protagonist',
        role: 'protagonist',
        establishedTraits: [grounded('The protagonist acts consistently.')],
        motivations: [grounded('The protagonist wants to resolve the situation.')],
        currentState: grounded('The protagonist faces the unresolved situation.'),
      }],
      relationships: [],
      causalChain: [{
        cause: grounded('The source situation creates a problem.'),
        effect: grounded('The protagonist must respond.'),
      }],
      unresolvedProblem: grounded('The story problem still requires resolution.'),
      usableClues: [grounded('The source situation supplies the usable clue.')],
      meaningDirection: {
        statement: 'The ending should grow from the source situation.',
        confidence: 'stronglyInferred',
        evidence: [evidence('material', 'Story material')],
      },
      sourceStyle: grounded('The source uses concise narrative prose.'),
    },
    continuationContract: {
      hardConstraints: [constraint('hard-source', 'Continue from the source situation.')],
      softAffordances: [grounded('A plausible resolution may be developed.')],
      openChoices: ['Choose concrete actions that preserve source continuity.'],
      forbiddenContradictions: [constraint('forbid-reset', 'Do not erase the source situation.')],
      paragraphs: [
        {
          paragraphIndex: 1,
          entryState: firstStarter,
          starterFunction: firstStarter,
          requiredMoves: [constraint('p1-move', 'Develop a plausible first move.', 'paragraph1Starter', 'Paragraph one starter.')],
          requiredExitState: [constraint('p1-exit', 'Reach the state required by paragraph two.', 'paragraph2Starter', 'Paragraph two starter.')],
          supportedOptions: [firstStarter],
        },
        {
          paragraphIndex: 2,
          entryState: secondStarter,
          starterFunction: secondStarter,
          requiredMoves: [constraint('p2-move', 'Resolve the source problem.', 'paragraph2Starter', 'Paragraph two starter.')],
          requiredExitState: [constraint('p2-exit', 'Close the story consistently.')],
          supportedOptions: [secondStarter],
        },
      ],
      closureRequirements: [constraint('close-source', 'The ending must resolve the source problem.')],
    },
    narrativeDevelopment: {
      coreTension: grounded('The source problem drives the continuation.'),
      drivingMotivations: [grounded('The protagonist wants a resolution.')],
      requiredTurningPoints: [firstStarter, secondStarter],
      eventChain: [{
        cause: 'The source problem remains unresolved.',
        event: 'The protagonist takes a plausible action.',
        immediateEffect: 'The story moves toward resolution.',
        evidence: [evidence('material', 'Story material')],
      }],
      emotionLogic: [{
        trigger: 'The unresolved situation demands action.',
        internalResponse: 'The protagonist decides to respond.',
        visibleAction: 'The protagonist takes the next step.',
      }],
      relationshipMovement: [],
      interactionMoves: [],
      cluePayoffs: [{
        clue: evidence('material', 'Story material'),
        payoff: 'The source situation receives a coherent resolution.',
      }],
      endingState: 'The source problem is resolved without contradiction.',
    },
    languageAlignment: {
      personAndPerspective: 'Preserve the source narrative perspective.',
      baseTense: 'Use the simple past for main events.',
      licensedTenseShifts: [],
      narrativeDistanceAndRegister: 'Keep a clear narrative register.',
      sourceStyleContinuity: 'Continue the concise source style.',
      cohesionPlan: [{ relation: 'sequence', use: 'Connect the two supplied paragraph starters.' }],
      dialoguePolicy: 'Use dialogue only when it advances the action.',
      descriptionPriorities: ['Concrete actions'],
      functionLedLanguage: ['Action verbs'],
      languageRisks: ['Contradicting the supplied starters'],
    },
    paragraphBlueprint: {
      selectedRoute: 'Develop the source problem into a coherent resolution.',
      routeRationale: [firstStarter, secondStarter],
      paragraphs: [
        {
          paragraphIndex: 1,
          narrativeFunction: 'Develop the first required move.',
          eventMoves: ['Continue from the first starter.'],
          characterActionsAndReactions: ['The protagonist responds plausibly.'],
          evidenceToReuse: [evidence('paragraph1Starter', 'Paragraph one starter.')],
          stateChange: 'unresolved situation to progress',
          bridgeToNext: 'Reach the second supplied starter.',
        },
        {
          paragraphIndex: 2,
          narrativeFunction: 'Resolve the source problem.',
          eventMoves: ['Continue from the second starter.'],
          characterActionsAndReactions: ['The protagonist completes the response.'],
          evidenceToReuse: [evidence('paragraph2Starter', 'Paragraph two starter.')],
          stateChange: 'progress to resolution',
          bridgeToNext: 'Close without a new unresolved event.',
        },
      ],
      finalEffect: 'The ending follows from and resolves the source situation.',
      validAlternativeRoutes: [],
      qualityRisks: ['Skipping a supplied starter'],
    },
  }
}

function writeStagedAnalyses(reviewRoot, materialization) {
  const bySlot = new Map(materialization.groups.map((group) => [group.slotId, group]))
  for (const letter of ['a', 'b', 'c', 'd']) {
    const group = bySlot.get(`reading.${letter}`)
    writeJson(path.join(reviewRoot, `analysis-reading-${letter}.json`), {
      schemaVersion: 'reading-choice-analysis-v1',
      paperId: materialization.paperId,
      sourceAssetVersion: 1,
      targetGroups: [group.groupId],
      groups: { [group.groupId]: { summary: `Reading ${letter.toUpperCase()} analysis` } },
      questions: Object.fromEntries(group.questions.map((question) => [question.questionId, {
        skill: { primary: 'detail' },
        questionFocus: 'Locate the decisive detail.',
        stemTranslationZh: '题干翻译',
        optionAnalysis: question.options.map((option) => ({
          label: option.label,
          optionTranslationZh: `选项 ${option.label}`,
          status: option.label === 'A' ? 'correct' : 'wrong',
          evidence: [],
        })),
        locationParaphrases: [],
      }])),
    })
  }

  const seven = bySlot.get('seven-choices')
  writeJson(path.join(reviewRoot, 'analysis-seven.json'), {
    schemaVersion: 'seven-choices-analysis-v1',
    paperId: materialization.paperId,
    sourceAssetVersion: 1,
    targetGroups: [seven.groupId],
    groups: { [seven.groupId]: { overview: 'Seven choices analysis' } },
    questions: Object.fromEntries(seven.questions.map((question) => [question.questionId, {
      blankId: question.blankId,
      blankNo: question.canonicalNumber,
      positionFacet: 'middle',
      roleFacet: 'support',
      primaryMechanismFacet: 'cohesion',
      topicClues: ['topic'],
      contextEvidence: { beforeQuote: 'seven-choices source text' },
      mechanismSignals: [
        { signalText: 'seven-choices source text', signalSide: 'context-before' },
        { signalText: 'A option', signalSide: 'option' },
      ],
      optionFit: { correctOptionLabel: 'A', reason: 'Fits the official answer.' },
      teachingNote: 'Use context and cohesion together.',
    }])),
  })

  const cloze = bySlot.get('cloze')
  writeJson(path.join(reviewRoot, 'analysis-cloze.json'), {
    schemaVersion: 'cloze-analysis-v1',
    paperId: materialization.paperId,
    sourceAssetVersion: 1,
    targetGroups: [cloze.groupId],
    groups: { [cloze.groupId]: { overview: 'Cloze analysis' } },
    blanks: Object.fromEntries(cloze.questions.map((question) => [question.questionId, {
      blankId: question.blankId,
      blankNo: question.canonicalNumber,
      pos: 'other',
      correctFit: { optionLabel: 'A', reason: 'Fits the official answer.' },
      distractorGlosses: ['B', 'C', 'D'].map((optionLabel) => ({
        optionLabel,
        gloss: `Why ${optionLabel} does not fit.`,
      })),
      evidence: [{
        type: 'collocation-partner',
        signalText: 'cloze source text',
        signalSide: 'context-before',
      }],
      teachingNote: 'Check collocation and context.',
    }])),
  })

  const grammar = bySlot.get('grammar-fill')
  writeJson(path.join(reviewRoot, 'analysis-grammar.json'), {
    schemaVersion: 'grammar-fill-analysis-v2',
    paperId: materialization.paperId,
    sourceAssetVersion: 1,
    targetGroups: [grammar.groupId],
    groups: { [grammar.groupId]: { overview: 'Grammar fill analysis' } },
    blanks: Object.fromEntries(grammar.questions.map((question) => {
      const given = Boolean(question.prompt)
      return [question.questionId, {
        blankId: question.blankId,
        blankNo: question.canonicalNumber,
        blankType: given ? 'given' : 'no-hint',
        hint: given ? question.prompt : null,
        facetKey: given
          ? 'grammar-fill.given.conversion.verb-to-noun'
          : 'grammar-fill.no-hint.article',
        role: null,
        path: null,
        answer: 'ANSWER',
        reason: 'The sentence structure determines the form.',
        evidence: [{ type: 'clause-frame', signalText: 'grammar-fill source text' }],
        teachingNote: 'Identify the blank type before choosing the form.',
      }]
    })),
  })

  writeJson(path.join(reviewRoot, 'analysis-application.json'), {
    taskType: 'application',
    modelAnswer: Array.from({ length: 70 }, (_, index) => `word${index + 1}`).join(' '),
    reviewCard: {
      form: 'Email',
      topic: 'Topic',
      reader: 'Chris',
      person: 'First person',
      tense: 'Simple present',
      type: 'Informative',
      points: ['Explain the topic', 'Offer details'],
      readerWho: 'A friend',
      readerCares: 'Clear information',
      readerWants: 'Useful details',
      value: 'Practical guidance',
    },
  })
  writeJson(path.join(reviewRoot, 'analysis-continuation.json'), {
    taskType: 'continuation',
    modelAnswer: Array.from({ length: 130 }, (_, index) => `story${index + 1}`).join(' '),
    continuationAnalysis: continuationAnalysis(),
  })
}

function makeReviewRoot(
  parentDir,
  fixturePaperId = paperId,
  questionSourceLabel = 'deterministic NCK1 question source',
) {
  const reviewRoot = path.join(parentDir, 'review')
  const questionBytes = Buffer.from(
    `%PDF-1.7 ${questionSourceLabel}`.padEnd(100, 'q'),
  )
  const answerBytes = Buffer.from(
    '%PDF-1.7 deterministic official answer source'.padEnd(100, 'a'),
  )
  const materialization = makeFixture()
  materialization.paperId = fixturePaperId
  materialization.groups.find((group) =>
    group.slotId === 'writing.application').writingTask.officialModelAnswer =
      officialApplicationSample
  materialization.groups.find((group) =>
    group.slotId === 'writing.continuation').writingTask.officialModelAnswer =
      officialContinuationSample
  for (const [documentId, bytes] of [
    ['paper', questionBytes],
    ['answers', answerBytes],
  ]) {
    const document = materialization.documents.find((item) =>
      item.documentId === documentId)
    document.sha256 = sha256(bytes)
    document.byteLength = bytes.byteLength
  }
  const manifest = {
    schemaVersion: 'universal-nck1-source-manifest-v1',
    paperId: fixturePaperId,
    profileId: 'nck1',
    provenance: {
      paperName: '2026 Contract Mock',
      source: 'Deterministic verifier source',
    },
    documents: [
      {
        ...materialization.documents[0],
        path: 'source/questions.pdf',
      },
      {
        ...materialization.documents[1],
        path: 'source/answers.pdf',
      },
    ],
    materializationPath: 'materialization/nck1-source-materialization-v1.json',
    mediaDirectory: 'materialization/media',
    canonicalRequestPath: 'canonical-evidence/canonical-import-request.json',
  }
  writeJson(path.join(reviewRoot, 'config.json'), {
    paperId: fixturePaperId,
    format: 'universal-nck1',
    provenance: manifest.provenance,
    universalSourceManifestPath: 'universal-source-manifest.json',
    canonicalRequestPath: manifest.canonicalRequestPath,
  })
  writeJson(path.join(reviewRoot, 'universal-source-manifest.json'), manifest)
  writeJson(
    path.join(reviewRoot, manifest.materializationPath),
    materialization,
  )
  mkdirSync(path.join(reviewRoot, 'source'), { recursive: true })
  writeFileSync(path.join(reviewRoot, 'source/questions.pdf'), questionBytes)
  writeFileSync(path.join(reviewRoot, 'source/answers.pdf'), answerBytes)

  writeStagedAnalyses(reviewRoot, materialization)

  const projection = buildNck1ReviewProjection(reviewRoot, { requireAnalyses: true })
  const writingTasks = Object.values(projection.paperAsset.content.writingTasks)
  assert.deepEqual(
    writingTasks.map(({ officialModelAnswer }) => officialModelAnswer),
    [officialApplicationSample, officialContinuationSample],
    'source official samples reach the Review PaperAsset',
  )
  assert.deepEqual(
    Object.values(projection.analysisSidecars['writing-analysis-v1.json'].groups)
      .map(({ writing }) => writing.officialModelAnswer),
    [officialApplicationSample, officialContinuationSample],
    'source official samples reach the Review analysis sidecar',
  )
  const firstQuestion = materialization.groups[0].questions[0]
  const firstQuestionSource = projection.sourceVisuals.find((visual) =>
    visual.targetId === firstQuestion.questionId)
  assert.deepEqual(
    {
      documentId: firstQuestionSource?.documentId,
      page: firstQuestionSource?.page,
      region: firstQuestionSource?.region,
      path: firstQuestionSource?.path,
      state: firstQuestionSource?.state,
    },
    {
      documentId: firstQuestion.source.documentId,
      page: firstQuestion.source.page,
      region: firstQuestion.source.region,
      path: 'source/questions.pdf',
      state: 'paired',
    },
    'page-region question locators must reach the Owner source-proof surface',
  )
  const firstBlock = materialization.groups[0].blocks[0]
  assert.equal(
    projection.sourceVisuals.find((visual) => visual.targetId === firstBlock.blockId)?.state,
    'paired',
    'page-region paragraph locators must reach the Owner source-proof surface',
  )
  const confirmation = {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: projection.candidateDigest,
    sourceDigest: projection.sourceDigest,
    confirmed: true,
  }
  const materialized = materializeNck1CanonicalRequest(
    projection.sourceInput,
    confirmation,
  )
  const evidenceDir = path.join(reviewRoot, 'canonical-evidence')
  mkdirSync(evidenceDir, { recursive: true })
  for (const [fileName, bytes] of materialized.outputs) {
    writeFileSync(path.join(evidenceDir, fileName), bytes)
  }
  return {
    reviewRoot,
    projection,
    requestPath: path.join(evidenceDir, 'canonical-import-request.json'),
  }
}

function makeContext(label) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), `eqb-universal-publish-${label}-`))
  const fixture = makeReviewRoot(tempRoot)
  const db = new DatabaseSync(path.join(tempRoot, 'question-bank.sqlite'))
  db.exec(readFileSync(path.join(root, 'data/sql/schema.sql'), 'utf8'))
  return {
    ...fixture,
    tempRoot,
    db,
    paperAssetsDir: path.join(tempRoot, 'paper-assets'),
  }
}

function approvedIdentity(projection) {
  return {
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    analysisDigest: projection.analysisDigest,
  }
}

function publish(context, options = {}) {
  return publishUniversalNck1Import({
    reviewRootDir: context.reviewRoot,
    approvedIdentity: approvedIdentity(context.projection),
    canonicalRequest: loadCanonicalImportRequest(context.requestPath),
    db: context.db,
    paperAssetsDir: context.paperAssetsDir,
    ...options,
  })
}

function publishedVersionCount(context) {
  return context.db.prepare(
    'SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?',
  ).get(paperId).count
}

function close(context) {
  context.db.close()
  rmSync(context.tempRoot, { recursive: true, force: true })
}

function analysisDigestAt(baseDir) {
  return digestJson(Object.fromEntries([
    'reading-choice-analysis-v1.json',
    'seven-choices-analysis-v1.json',
    'cloze-analysis-v1.json',
    'grammar-fill-analysis-v1.json',
    'writing-analysis-v1.json',
  ].map((fileName) => [
    fileName,
    JSON.parse(readFileSync(path.join(baseDir, 'analyses', fileName), 'utf8')),
  ])))
}

async function requestReviewAsset(projection, relativePath, session) {
  const pathname = `/api/import-review-preview/revisions/rev-fixture/asset/${relativePath}`
  const routes = createImportReviewRoutes({
    getStore: () => ({ projectionForRevision: () => ({ projection }) }),
    agentToken: '',
    shipToken: '',
    buildPrintHtml: () => '',
  })
  let status = null
  let body = null
  const response = {
    writeHead(code) { status = code },
    end(value) { body = value ? JSON.parse(String(value)) : null },
  }
  const context = {
    session,
    sendJson(_response, code, value) {
      status = code
      body = value
    },
  }
  const handled = await runRoutes(routes, {
    request: { method: 'GET', headers: {} },
    response,
    url: new URL(`http://localhost${pathname}`),
    context,
  })
  assert.equal(handled, true)
  return { status, body }
}

async function requestReviewPrint(projection, versionType) {
  const pathname = `/api/import-review-preview/revisions/rev-fixture/print?version=${versionType}`
  const routes = createImportReviewRoutes({
    getStore: () => ({ projectionForRevision: () => ({ projection }) }),
    agentToken: '',
    shipToken: '',
    buildPrintHtml,
  })
  let status = null
  let body = ''
  const response = {
    writeHead(code) { status = code },
    end(value) { body = String(value || '') },
  }
  const context = {
    session: { role: 'owner', accountKind: 'human' },
    sendJson(_response, code, value) {
      status = code
      body = JSON.stringify(value)
    },
  }
  const handled = await runRoutes(routes, {
    request: { method: 'GET', headers: {} },
    response,
    url: new URL(`http://localhost${pathname}`),
    context,
  })
  assert.equal(handled, true)
  return { status, body }
}

function sevenChoicesSelection(consumption) {
  const selection = consumption.selections.find(
    ({ familyContractId }) => familyContractId === 'seven-choices',
  )
  assert(selection, 'Consumption Plan includes Seven Choices')
  assert.equal(selection.groupIds.length, 1)
  assert.equal(selection.projectedOccurrences.length, 1)
  return selection
}

async function assertRoleSurfaces({ projection, publishedScreen, publishedPrint }) {
  const titleId = 'block:seven-choices:title'
  const bodyId = 'block:seven-choices'
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const playwright = await import('../app/node_modules/playwright/index.js')
  const viteServer = await vite.createServer({
    root: path.join(root, 'app'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert(appUrl, 'Vite exposes one local Screen QA URL')
  const browser = await playwright.default.chromium.launch({
    headless: true,
    channel: 'chromium',
  })
  try {
    const studentReviewPrint = await requestReviewPrint(projection, 'student')
    assert.equal(studentReviewPrint.status, 200)
    assert.doesNotMatch(studentReviewPrint.body, /class="teacher-official-model-answer"|Official (?:application|continuation) sample/)
    const teacherReviewPrint = await requestReviewPrint(projection, 'teacher')
    assert.equal(teacherReviewPrint.status, 200)
    assert.equal(
      (teacherReviewPrint.body.match(/class="teacher-official-model-answer"/g) || []).length,
      2,
      'Owner Review Teacher Print renders both source official samples',
    )
    assert.match(teacherReviewPrint.body, new RegExp(officialApplicationSample))
    assert.match(teacherReviewPrint.body, new RegExp(officialContinuationSample))

    const screenPage = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    })
    await screenPage.route('**/api/paper-canonical/consumption?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(projection.consumption),
      }))
    await screenPage.route('**/paper-assets/**/paper-asset.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(projection.paperAsset),
      }))
    await screenPage.route('**/paper-assets/**/analyses/**', (route) =>
      route.fulfill({ status: 404, body: '' }))
    await screenPage.route('**/paper-assets/**/figures/**', (route) =>
      route.fulfill({ status: 404, body: '' }))
    const screenUrl = new URL('canonical-consumption-qa.html', appUrl)
    screenUrl.searchParams.set('paperId', projection.paperId)
    screenUrl.searchParams.set('focusGroupId', 'group:seven-choices')
    await screenPage.goto(screenUrl.href)
    const screenTitle = screenPage.locator(
      `[data-paper-paragraph-id="${titleId}"]`,
    )
    const screenBody = screenPage.locator(
      `[data-paper-paragraph-id="${bodyId}"]`,
    )
    await screenTitle.waitFor()
    assert.equal(
      await screenTitle.getAttribute('data-canonical-seven-choices-rhythm-role'),
      'passage_title',
    )
    assert.equal(
      await screenBody.getAttribute('data-canonical-seven-choices-rhythm-role'),
      'passage_body_line',
    )
    assert.equal(
      await screenTitle.evaluate((element) => getComputedStyle(element).textAlign),
      'center',
    )
    assert.notEqual(
      await screenBody.evaluate((element) => getComputedStyle(element).textAlign),
      'center',
    )
    await screenPage.close()

    const answers = new Map(Object.entries(projection.paperAsset.answerKey.answers)
      .map(([questionId, answer]) => [questionId, answer.answer]))
    const payload = canonicalConsumptionPrintPayload(
      publishedPrint,
      projection.paperName,
      answers,
    )
    const items = payload.items.map((item) => ({
      detail: payload.details.get(item.questionGroupId),
      note: '',
      score: 0,
      sectionTitle: '',
    }))
    for (const versionType of ['student', 'teacher']) {
      const html = buildPrintHtml({
        ...payload,
        versionType,
        items,
        canonicalConsumption: publishedPrint,
      })
      const printPage = await browser.newPage()
      await printPage.emulateMedia({ media: 'print' })
      await printPage.setContent(html, { waitUntil: 'load' })
      const printTitle = printPage.locator(
        `[data-canonical-paragraph-id="${titleId}"]`,
      )
      const printBody = printPage.locator(
        `[data-canonical-paragraph-id="${bodyId}"]`,
      )
      assert.equal(await printTitle.count(), 1)
      assert.equal(await printBody.count(), 1)
      assert.equal(
        await printTitle.getAttribute('data-canonical-seven-choices-rhythm-role'),
        'passage_title',
      )
      assert.equal(
        await printBody.getAttribute('data-canonical-seven-choices-rhythm-role'),
        'passage_body_line',
      )
      assert.equal(
        await printTitle.evaluate((element) => getComputedStyle(element).textAlign),
        'center',
      )
      assert.notEqual(
        await printBody.evaluate((element) => getComputedStyle(element).textAlign),
        'center',
      )
      const pdfBytes = await printPage.pdf({
        format: 'A4',
        printBackground: true,
      })
      assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
      await printPage.close()
    }

    const screenGroup = projectCanonicalConsumerGroup({
      consumption: publishedScreen,
      familyContractId: 'seven-choices',
      groupId: 'group:seven-choices',
    })
    const printGroup = projectCanonicalConsumerGroup({
      consumption: publishedPrint,
      familyContractId: 'seven-choices',
      groupId: 'group:seven-choices',
    })
    assert.equal(screenGroup.semanticSignature, printGroup.semanticSignature)
    assert.equal(screenGroup.occurrenceSignature, printGroup.occurrenceSignature)
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

function runReviewCommand(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['scripts/import-pipeline/review.mjs', ...args],
      {
        cwd: root,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(
        `review.mjs ${args.join(' ')} exited ${code}: ${stderr || stdout}`,
      ))
    })
  })
}

const incomplete = makeContext('incomplete')
try {
  for (const fileName of [
    'analysis-reading-a.json',
    'analysis-reading-b.json',
    'analysis-reading-c.json',
    'analysis-reading-d.json',
    'analysis-seven.json',
    'analysis-cloze.json',
    'analysis-grammar.json',
  ]) rmSync(path.join(incomplete.reviewRoot, fileName))
  assert.throws(
    () => publish(incomplete),
    /Incomplete staged analyses/,
  )
  assert(!existsSync(incomplete.paperAssetsDir))
  assert.equal(publishedVersionCount(incomplete), 0)
} finally {
  close(incomplete)
}

const legacy = makeContext('legacy-revision')
try {
  for (const fileName of [
    'analysis-reading-a.json',
    'analysis-reading-b.json',
    'analysis-reading-c.json',
    'analysis-reading-d.json',
    'analysis-seven.json',
    'analysis-cloze.json',
    'analysis-grammar.json',
    'analysis-application.json',
    'analysis-continuation.json',
  ]) rmSync(path.join(legacy.reviewRoot, fileName))
  const legacyProjection = buildNck1ReviewProjection(legacy.reviewRoot)
  assert.deepEqual(legacyProjection.analysisSidecars, {})
  assert.equal(legacyProjection.analysisDigest, null)
  assert.equal((await requestReviewAsset(
    legacyProjection,
    'analyses/reading-choice-analysis-v1.json',
    { role: 'owner', accountKind: 'human' },
  )).status, 404)
} finally {
  close(legacy)
}

for (const [label, relativePath, mutate, expected] of [
  [
    'group-closure',
    'analysis-reading-a.json',
    (analysis) => { analysis.groups['group:other'] = { summary: 'Unbound group' } },
    /analysis groups closure mismatch/,
  ],
  [
    'question-closure',
    'analysis-reading-a.json',
    (analysis) => { delete analysis.questions['question:21'] },
    /questionIds.*不匹配|closure mismatch/,
  ],
  [
    'blank-closure',
    'analysis-seven.json',
    (analysis) => { analysis.questions['question:36'].blankId = 'blank:999' },
    /blankId does not match/,
  ],
  [
    'answer-closure',
    'analysis-seven.json',
    (analysis) => { analysis.questions['question:36'].optionFit.correctOptionLabel = '' },
    /analysis answer does not close/,
  ],
  [
    'answer-conflict',
    'analysis-cloze.json',
    (analysis) => { analysis.blanks['question:41'].correctFit.optionLabel = 'B' },
    /答案解析版不一致/,
  ],
]) {
  const context = makeContext(label)
  try {
    const filePath = path.join(context.reviewRoot, relativePath)
    const analysis = JSON.parse(readFileSync(filePath, 'utf8'))
    mutate(analysis)
    writeJson(filePath, analysis)
    assert.throws(() => publish(context), expected)
    assert(!existsSync(context.paperAssetsDir))
    assert.equal(publishedVersionCount(context), 0)
  } finally {
    close(context)
  }
}

const happy = makeContext('happy')
try {
  const result = publish(happy)
  assert.equal(result.status, 'published', JSON.stringify(result, null, 2))
  assert.equal(result.publish.assetVersion, 1)
  assert.equal(result.publish.consumers.screen.disposition, 'ready')
  assert.equal(result.publish.consumers.print_pdf.disposition, 'ready')
  assert.equal(
    result.publish.consumers.screen.visibleStructureDigest,
    happy.projection.visibleStructureDigest,
  )
  const reviewSeven = sevenChoicesSelection(happy.projection.consumption)
  assert.deepEqual(
    reviewSeven.projectedOccurrences[0].passageBlockRoles,
    [{ nodeId: 'block:seven-choices:title', role: 'title' }],
    'Review consumption retains the source-bound Seven Choices title',
  )
  assert.deepEqual(
    happy.projection.paperAsset.content.groups['group:seven-choices']
      .passage.paragraphs.map(({ paragraphId, role }) => ({ paragraphId, role })),
    [
      { paragraphId: 'block:seven-choices:title', role: 'title' },
      { paragraphId: 'block:seven-choices', role: 'body' },
    ],
    'Review compatibility PaperAsset retains title/body semantics',
  )
  for (const consumer of [
    result.publish.consumers.screen,
    result.publish.consumers.print_pdf,
  ]) {
    const publishedSeven = sevenChoicesSelection(consumer)
    assert.deepEqual(
      publishedSeven.projectedOccurrences[0],
      reviewSeven.projectedOccurrences[0],
      'Review and published consumers share one deterministic occurrence',
    )
    assert.deepEqual(
      publishedSeven.projectedOccurrenceDigests,
      reviewSeven.projectedOccurrenceDigests,
      'Review and published consumers share one occurrence digest',
    )
  }
  const invalidConsumption = structuredClone(happy.projection.consumption)
  const invalidSeven = sevenChoicesSelection(invalidConsumption)
  invalidSeven.projectedOccurrences[0].passageBlockRoles[0].nodeId =
    'block:unbound-title'
  invalidSeven.projectedOccurrenceDigests[0].digest = digestJson(
    invalidSeven.projectedOccurrences[0],
  )
  assert.throws(
    () => projectCanonicalConsumerGroup({
      consumption: invalidConsumption,
      familyContractId: 'seven-choices',
      groupId: 'group:seven-choices',
    }),
    /invalid passage roles/,
    'unbound Seven Choices role references fail closed at the consumer seam',
  )
  assert.equal(Object.keys(happy.projection.paperAsset.content.groups).length, 9)
  assert.equal(Object.keys(happy.projection.paperAsset.answerKey.answers).length, 45)
  assert.equal(publishedVersionCount(happy), 1)
  const publishedGroupIds = Object.keys(
    happy.projection.paperAsset.content.groups,
  )
  const groupPlaceholders = publishedGroupIds.map(() => '?').join(', ')
  assert.equal(
    happy.db.prepare(
      `SELECT COUNT(*) AS count FROM question_groups WHERE id IN (${groupPlaceholders})`,
    ).get(...publishedGroupIds).count,
    9,
  )
  const publishedQuestions = happy.db.prepare(
    `
    SELECT answer
    FROM questions
    WHERE group_id IN (${groupPlaceholders})
    `,
  ).all(...publishedGroupIds)
  assert.equal(publishedQuestions.length, 45)
  assert(publishedQuestions.every(({ answer }) => String(answer).length > 0))
  const current = happy.db.prepare(
    `
    SELECT source_asset_version, publication_digest
    FROM canonical_paper_publications
    WHERE paper_id = ? AND is_current = 1
    `,
  ).get(paperId)
  assert.equal(current.source_asset_version, 1)
  assert.equal(current.publication_digest, result.publish.canonicalPublicationDigest)
  for (const base of [
    path.join(happy.paperAssetsDir, paperId, 'versions/v1'),
    path.join(happy.paperAssetsDir, paperId, 'latest'),
  ]) {
    assert(existsSync(path.join(base, 'paper-asset.json')))
    assert(existsSync(path.join(base, 'answer-key.json')))
    const publishedPaperAsset = JSON.parse(
      readFileSync(path.join(base, 'paper-asset.json'), 'utf8'),
    )
    assert.deepEqual(
      publishedPaperAsset.content.groups['group:seven-choices'].passage.paragraphs,
      happy.projection.paperAsset.content.groups['group:seven-choices']
        .passage.paragraphs,
      'version/latest PaperAsset bytes retain Review title/body semantics',
    )
    const publishedSidecars = Object.fromEntries(Object.keys(happy.projection.analysisSidecars)
      .map((fileName) => {
        const filePath = path.join(base, 'analyses', fileName)
        assert(existsSync(filePath), `${fileName} must publish atomically`)
        return [fileName, JSON.parse(readFileSync(filePath, 'utf8'))]
      }))
    assert.equal(digestJson(publishedSidecars), happy.projection.analysisDigest)
  }

  assert.equal(
    Object.keys(happy.projection.analysisSidecars['reading-choice-analysis-v1.json'].questions).length,
    15,
  )
  assert.equal(
    happy.projection.analysisSidecars['reading-choice-analysis-v1.json'].targetGroups.length,
    4,
  )
  assert.equal(
    Object.keys(happy.projection.analysisSidecars['writing-analysis-v1.json'].groups).length,
    2,
  )
  assert.equal(
    Object.keys(happy.projection.analysisSidecars['reading-choice-analysis-v1.json'].questions).length
      + Object.keys(happy.projection.analysisSidecars['seven-choices-analysis-v1.json'].questions).length
      + Object.keys(happy.projection.analysisSidecars['cloze-analysis-v1.json'].blanks).length
      + Object.keys(happy.projection.analysisSidecars['grammar-fill-analysis-v1.json'].blanks).length,
    45,
  )
  const authoritativeAnswers = happy.projection.paperAsset.answerKey.answers
  for (const [questionId, item] of Object.entries(
    happy.projection.analysisSidecars['reading-choice-analysis-v1.json'].questions,
  )) {
    assert.equal(
      item.optionAnalysis.find(({ status }) => status === 'correct')?.label,
      authoritativeAnswers[questionId].answer,
    )
  }
  for (const [questionId, item] of Object.entries(
    happy.projection.analysisSidecars['seven-choices-analysis-v1.json'].questions,
  )) assert.equal(item.optionFit.correctOptionLabel, authoritativeAnswers[questionId].answer)
  for (const [questionId, item] of Object.entries(
    happy.projection.analysisSidecars['cloze-analysis-v1.json'].blanks,
  )) assert.equal(item.correctFit.optionLabel, authoritativeAnswers[questionId].answer)
  for (const [questionId, item] of Object.entries(
    happy.projection.analysisSidecars['grammar-fill-analysis-v1.json'].blanks,
  )) assert.equal(item.answer, authoritativeAnswers[questionId].answer)
  for (const fileName of Object.keys(happy.projection.analysisSidecars)) {
    const response = await requestReviewAsset(
      happy.projection,
      `analyses/${fileName}`,
      { role: 'owner', accountKind: 'human' },
    )
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, happy.projection.analysisSidecars[fileName])
  }
  assert.equal((await requestReviewAsset(
    happy.projection,
    'analyses/unknown.json',
    { role: 'owner', accountKind: 'human' },
  )).status, 404)
  assert.equal((await requestReviewAsset(
    happy.projection,
    'analyses/reading-choice-analysis-v1.json',
    { role: 'member', accountKind: 'human' },
  )).status, 403)
  await assertRoleSurfaces({
    projection: happy.projection,
    publishedScreen: result.publish.consumers.screen,
    publishedPrint: result.publish.consumers.print_pdf,
  })
} finally {
  close(happy)
}

for (const [label, mutate] of [
  ['stale-approval', ({ identity }) => {
    identity.candidateDigest = `sha256:${'0'.repeat(64)}`
  }],
  ['stale-confirmation', ({ request }) => {
    request.nck1MaterializationConfirmation.candidateDigest = `sha256:${'0'.repeat(64)}`
  }],
]) {
  const context = makeContext(label)
  try {
    const identity = approvedIdentity(context.projection)
    const request = loadCanonicalImportRequest(context.requestPath)
    mutate({ identity, request })
    const result = publishUniversalNck1Import({
      reviewRootDir: context.reviewRoot,
      approvedIdentity: identity,
      canonicalRequest: request,
      db: context.db,
      paperAssetsDir: context.paperAssetsDir,
    })
    assert.equal(result.ok, false)
    assert(!existsSync(context.paperAssetsDir))
    assert.equal(publishedVersionCount(context), 0)
  } finally {
    close(context)
  }
}

const tamperedSource = makeContext('tampered-source')
try {
  writeFileSync(
    path.join(tamperedSource.reviewRoot, 'source/questions.pdf'),
    Buffer.from('tampered source'),
  )
  assert.throws(() => publish(tamperedSource))
  assert(!existsSync(tamperedSource.paperAssetsDir))
} finally {
  close(tamperedSource)
}

const staleRequest = makeContext('stale-request')
try {
  const staleFixture = makeReviewRoot(
    path.join(staleRequest.tempRoot, 'stale'),
    paperId,
    'older but internally valid NCK1 question source',
  )
  const result = publishUniversalNck1Import({
    reviewRootDir: staleRequest.reviewRoot,
    approvedIdentity: approvedIdentity(staleRequest.projection),
    canonicalRequest: loadCanonicalImportRequest(staleFixture.requestPath),
    db: staleRequest.db,
    paperAssetsDir: staleRequest.paperAssetsDir,
  })
  assert.equal(result.ok, false)
  assert.equal(
    result.canonicalAdmission.diagnostics[0].code,
    'NCK1_MATERIALIZATION_REQUEST_IDENTITY_MISMATCH',
  )
  assert(!existsSync(staleRequest.paperAssetsDir))
  assert.equal(publishedVersionCount(staleRequest), 0)
} finally {
  close(staleRequest)
}

const preCommit = makeContext('pre-commit')
try {
  assert.throws(() => publish(preCommit, { failurePoint: 'db-write' }))
  assert.equal(publishedVersionCount(preCommit), 0)
  assert.equal(
    preCommit.db.prepare(
      'SELECT COUNT(*) AS count FROM question_groups WHERE id LIKE ?',
    ).get('group-%').count,
    0,
  )
  assert(!existsSync(path.join(preCommit.paperAssetsDir, paperId, 'latest')))
  const versionsDir = path.join(preCommit.paperAssetsDir, paperId, 'versions')
  assert(
    !existsSync(versionsDir)
      || readdirSync(versionsDir).filter((name) => /^v\d+$/.test(name)).length === 0,
  )
} finally {
  close(preCommit)
}

const postCommit = makeContext('post-commit')
try {
  assert.throws(() => publish(postCommit, { failurePoint: 'committed-reload' }))
  const journalPath = path.join(
    postCommit.paperAssetsDir,
    paperId,
    '.latest-swap.json',
  )
  assert(existsSync(journalPath))
  assert.equal(
    analysisDigestAt(path.join(postCommit.paperAssetsDir, paperId, 'versions/v1')),
    postCommit.projection.analysisDigest,
  )
  assert.equal(
    analysisDigestAt(path.join(postCommit.paperAssetsDir, paperId, 'latest')),
    postCommit.projection.analysisDigest,
  )
  const invalidRequest = loadCanonicalImportRequest(postCommit.requestPath)
  invalidRequest.nck1MaterializationConfirmation.candidateDigest =
    `sha256:${'0'.repeat(64)}`
  const rejected = publishUniversalNck1Import({
    reviewRootDir: postCommit.reviewRoot,
    approvedIdentity: approvedIdentity(postCommit.projection),
    canonicalRequest: invalidRequest,
    db: postCommit.db,
    paperAssetsDir: postCommit.paperAssetsDir,
  })
  assert.equal(rejected.ok, false)
  assert(
    existsSync(journalPath),
    'invalid retry must not recover or clean committed-reload state before admission',
  )
  assert.equal(publishedVersionCount(postCommit), 1)
  const retry = publish(postCommit)
  assert.equal(retry.status, 'idempotent')
  assert.equal(retry.publish.assetVersion, 1)
  assert.equal(publishedVersionCount(postCommit), 1)
  assert.deepEqual(
    readdirSync(path.join(postCommit.paperAssetsDir, paperId, 'versions'))
      .filter((name) => /^v\d+$/.test(name)),
    ['v1'],
  )
} finally {
  close(postCommit)
}

const cliTempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-universal-publish-cli-'))
const cliPaperId = `paper-mock-contract-2026-cli-${process.pid}`
const cliPaperDir = path.join(
  root,
  'scripts/import-pipeline/papers',
  cliPaperId,
)
let reviewServer = null
try {
  const fixture = makeReviewRoot(cliTempRoot, cliPaperId)
  mkdirSync(path.dirname(cliPaperDir), { recursive: true })
  assert(!existsSync(cliPaperDir), 'CLI fixture paper directory must be unique')
  renameSync(fixture.reviewRoot, cliPaperDir)
  const projection = buildNck1ReviewProjection(cliPaperDir)
  const producerBuildId = 'universal-publish-verifier'
  const files = reviewBundleFilePaths(cliPaperDir).map((file) => {
    const bytes = readFileSync(resolveReviewFile(cliPaperDir, file.path))
    return {
      ...file,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
    }
  })
  const analysisFiles = files.filter(({ role }) => role.startsWith('analysis_'))
  assert.equal(analysisFiles.length, 9)
  assert.deepEqual(
    analysisFiles.map(({ path: relativePath }) => relativePath).sort(),
    [
      'analysis-application.json',
      'analysis-cloze.json',
      'analysis-continuation.json',
      'analysis-grammar.json',
      'analysis-reading-a.json',
      'analysis-reading-b.json',
      'analysis-reading-c.json',
      'analysis-reading-d.json',
      'analysis-seven.json',
    ],
  )
  const manifestBase = {
    schemaVersion: 'web-import-review-bundle-v1',
    paperId: cliPaperId,
    paperName: projection.paperName,
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    analysisDigest: projection.analysisDigest,
    producerBuildId,
    files,
    resolvesIssueIds: [],
  }
  const bundleDigest = reviewBundleDigest(manifestBase)
  const changedManifest = structuredClone(manifestBase)
  changedManifest.files.find(({ path: relativePath }) =>
    relativePath === 'analysis-application.json').sha256 = `sha256:${'f'.repeat(64)}`
  assert.notEqual(reviewBundleDigest(changedManifest), bundleDigest)
  const incompleteStoreRoot = path.join(cliTempRoot, 'incomplete-review-store')
  const incompleteManifest = {
    ...manifestBase,
    files: manifestBase.files.filter(({ role }) => !role.startsWith('analysis_')),
  }
  incompleteManifest.bundleDigest = reviewBundleDigest(incompleteManifest)
  const incompleteStore = createImportReviewStore({
    dbPath: path.join(incompleteStoreRoot, 'review.sqlite'),
    filesRoot: path.join(incompleteStoreRoot, 'files'),
    rendererBuildId: 'renderer-universal-publish-verifier',
    projectRevision: buildNck1ReviewProjection,
  })
  const incompleteRevision = incompleteStore.createRevision(incompleteManifest)
  for (const file of incompleteManifest.files) {
    const upload = incompleteStore.fileForUpload(incompleteRevision.revision.id, file.path)
    const bytes = readFileSync(resolveReviewFile(cliPaperDir, file.path))
    mkdirSync(path.dirname(upload.destination), { recursive: true })
    writeFileSync(upload.destination, bytes)
    incompleteStore.completeFileUpload(incompleteRevision.revision.id, file.path, {
      sha256: file.sha256,
      byteLength: file.byteLength,
    })
  }
  assert.throws(
    () => incompleteStore.finalizeRevision(incompleteRevision.revision.id),
    /Missing required staged analysis|Incomplete staged analyses/,
  )
  const approval = {
    schemaVersion: 'web-import-review-approval-v1',
    approvalId: 'approval-universal-publish-verifier',
    paperId: cliPaperId,
    revisionId: 'rev-universal-publish-verifier',
    revisionNumber: 1,
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    analysisDigest: projection.analysisDigest,
    bundleDigest,
    producerBuildId,
    rendererBuildId: 'renderer-universal-publish-verifier',
    approvedAt: '2026-08-28T00:00:00.000Z',
    approvedBy: 'owner',
  }
  const status = {
    paperId: cliPaperId,
    latestRevisionId: approval.revisionId,
    latest: {
      id: approval.revisionId,
      state: 'approved',
      manifest: { ...manifestBase, bundleDigest },
    },
    approval,
  }
  reviewServer = createServer((request, response) => {
    if (
      request.method !== 'GET'
      || request.url
        !== `/api/import-agent-reviews/papers/${encodeURIComponent(cliPaperId)}`
      || request.headers.authorization !== 'Bearer verifier-token'
    ) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'not found' }))
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(status))
  })
  await new Promise((resolve, reject) => {
    reviewServer.once('error', reject)
    reviewServer.listen(0, '127.0.0.1', resolve)
  })
  const address = reviewServer.address()
  assert(address && typeof address === 'object')
  const dbPath = path.join(cliTempRoot, 'question-bank.sqlite')
  const assetsDir = path.join(cliTempRoot, 'paper-assets')
  const db = new DatabaseSync(dbPath)
  db.exec(readFileSync(path.join(root, 'data/sql/schema.sql'), 'utf8'))
  db.close()
  const commandEnv = {
    QUESTION_BANK_IMPORT_OPS_ORIGIN: `http://127.0.0.1:${address.port}`,
    QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: 'verifier-token',
    QUESTION_BANK_BUILD_ID: producerBuildId,
    QUESTION_BANK_DB: dbPath,
    QUESTION_BANK_PAPER_ASSET_ROOT: assetsDir,
  }
  const accepted = await runReviewCommand(['accept', cliPaperId], commandEnv)
  assert.match(accepted.stdout, /^ACCEPTED /)
  writeJson(path.join(cliPaperDir, 'signals/ai-answer-check.json'), {
    ok: true,
    checkedAt: '2026-08-28T00:00:00.000Z',
    method: 'source-markings-vs-answerKey',
  })
  const published = await runReviewCommand(['publish', cliPaperId], commandEnv)
  assert.match(published.stdout, /^PUBLISHED .* v1: ready_to_ship;/)
  const receipt = JSON.parse(readFileSync(
    path.join(cliPaperDir, 'signals/locally-published.json'),
    'utf8',
  ))
  assert.equal(receipt.approvalId, approval.approvalId)
  assert.equal(receipt.assetVersion, 1)
  const repeated = await runReviewCommand(['publish', cliPaperId], commandEnv)
  assert.match(repeated.stdout, /^ALREADY PUBLISHED .* v1: ready_to_ship;/)
  const publishedDb = new DatabaseSync(dbPath, { readOnly: true })
  assert.equal(
    publishedDb.prepare(
      'SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?',
    ).get(cliPaperId).count,
    1,
  )
  publishedDb.close()
} finally {
  if (reviewServer) {
    await new Promise((resolve) => reviewServer.close(resolve))
  }
  rmSync(cliPaperDir, { recursive: true, force: true })
  rmSync(cliTempRoot, { recursive: true, force: true })
}

console.log('verify-universal-nck1-publish: PASS')
