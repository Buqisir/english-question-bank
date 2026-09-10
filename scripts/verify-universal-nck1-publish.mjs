#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
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
import { createSinglePaperPromotionService } from '../server/import-review/singlePaperPromotion.mjs'
import {
  buildNck1ReviewProjection,
  reviewBundleFilePaths,
  resolveReviewFile,
} from '../server/import-review/revisionProjection.mjs'
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'
import { materializeNck1CanonicalRequest } from '../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import {
  publishUniversalNck1Import,
  rollbackPaperImportPublication,
} from '../server/paper-import/publisher.mjs'
import { sendPaperAssetStatic } from '../server/paper-import/paperAssetStatic.mjs'
import { assertListeningAudioManifest, assertListeningAudioSource, LISTENING_AUDIO_PATHS } from '../server/paper-import/listeningAudioEvidence.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import { assertPaperFonts } from './lib/assert-paper-fonts.mjs'
import { assertSharedPaperLayout } from './lib/assert-shared-paper-layout.mjs'
import { readJsonRouteBody, runRoutes } from '../server/router/index.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { canonicalConsumptionPrintPayload } from './import-pipeline/canonical-consumption-print-payload.mjs'
import {
  finalizeListeningAudio,
  stageListeningAudio,
} from './import-pipeline/listening-audio.mjs'
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

function selectedLongSentence(group) {
  const sourceText = `${group.slotId} source text`
  return [{
    paragraphId: `block:${group.slotId.replaceAll('.', '-').replaceAll(' ', '-')}`,
    sourceText,
    displayText: sourceText,
    relatedQuestionIds: [group.questions[0].questionId],
    translationZh: '用于验证的长难句译文。',
    analysisZh: '先找句子主干，再把修饰成分接回主干。',
    underlineTexts: [`${group.slotId} source`],
  }]
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
      groups: {
        [group.groupId]: {
          summary: `Reading ${letter.toUpperCase()} analysis`,
          fullTranslationZh: `阅读 ${letter.toUpperCase()} 全文译文。`,
          selectedLongSentences: selectedLongSentence(group),
        },
      },
      questions: Object.fromEntries(group.questions.map((question) => [question.questionId, {
        skill: { primary: 'detail' },
        questionFocus: 'Locate the decisive detail.',
        stemTranslationZh: '题干翻译',
        optionAnalysis: question.options.map((option) => ({
          label: option.label,
          optionTranslationZh: `选项 ${option.label}`,
          status: option.label === 'A' ? 'correct' : 'wrong',
          evidence: [],
          ...(option.label === 'A'
            ? {}
            : { trap: { explanation: `选项 ${option.label} 与原文关键信息不符。` } }),
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
    groups: {
      [seven.groupId]: {
        overview: 'Seven choices analysis',
        fullTranslationZh: seven.questions
          .map((question) => `[${question.canonicalNumber}] 七选五译文。`)
          .join(''),
        selectedLongSentences: selectedLongSentence(seven),
      },
    },
    questions: Object.fromEntries(seven.questions.map((question) => [question.questionId, {
      blankId: question.blankId,
      positionFacet: 'seven-choices.position.paragraph-middle',
      roleFacet: 'seven-choices.role.cohesion',
      primaryMechanismFacet: 'seven-choices.cohesion.grammatical.referential-cohesion',
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
    groups: {
      [cloze.groupId]: {
        overview: 'Cloze analysis',
        fullTranslationZh: cloze.questions
          .map((question) => `[${question.canonicalNumber}] 完形译文。`)
          .join(''),
        selectedLongSentences: selectedLongSentence(cloze),
      },
    },
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
  let hasFiniteVerbFixture = false
  writeJson(path.join(reviewRoot, 'analysis-grammar.json'), {
    schemaVersion: 'grammar-fill-analysis-v2',
    paperId: materialization.paperId,
    sourceAssetVersion: 1,
    targetGroups: [grammar.groupId],
    groups: {
      [grammar.groupId]: {
        overview: 'Grammar fill analysis',
        fullTranslationZh: grammar.questions
          .map((question) => `[${question.canonicalNumber}] 语法填空译文。`)
          .join(''),
        selectedLongSentences: selectedLongSentence(grammar),
      },
    },
    blanks: Object.fromEntries(grammar.questions.map((question) => {
      const given = Boolean(question.prompt)
      const useFiniteVerb = given && !hasFiniteVerbFixture
      if (useFiniteVerb) hasFiniteVerbFixture = true
      return [question.questionId, {
        blankId: question.blankId,
        blankNo: question.canonicalNumber,
        blankType: given ? 'given' : 'no-hint',
        hint: given ? question.prompt : null,
        facetKey: given
          ? useFiniteVerb
            ? 'grammar-fill.given.verb.finite'
            : 'grammar-fill.given.conversion.verb-to-noun'
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
  { listening = false } = {},
) {
  const reviewRoot = path.join(parentDir, 'review')
  const questionBytes = Buffer.from(
    `%PDF-1.7 ${questionSourceLabel}`.padEnd(100, 'q'),
  )
  const answerBytes = Buffer.from(
    '%PDF-1.7 deterministic official answer source'.padEnd(100, 'a'),
  )
  const materialization = makeFixture({ listening })
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

  if (listening) {
    const audioPath = path.join(parentDir, 'listening.mp3')
    const asrFixturePath = path.join(parentDir, 'listening-asr.json')
    const referencePath = path.join(parentDir, 'listening-reference.json')
    const contentReviewPath = path.join(parentDir, 'listening-review.json')
    const transcript = materialization.listening.transcript.map((segment) => segment.text).join('\n')
    execFileSync('ffmpeg', [
      '-v', 'error',
      '-f', 'lavfi',
      '-i', 'sine=frequency=440:duration=12',
      '-codec:a', 'libmp3lame',
      '-b:a', '96k',
      audioPath,
    ])
    writeJson(asrFixturePath, {
      engine: {
        name: 'deterministic-fixture',
        model: 'fixture-en',
        version: '1',
        computeType: 'fixture',
      },
      language: 'en',
      languageProbability: 1,
      segments: [{
        startSeconds: 0.2,
        endSeconds: 11.5,
        text: transcript,
        avgLogProbability: -0.2,
        noSpeechProbability: 0.01,
      }],
    })
    const staged = stageListeningAudio({
      paperDir: reviewRoot,
      paperId: fixturePaperId,
      sourcePath: audioPath,
      asrFixturePath,
    })
    writeJson(referencePath, {
      schemaVersion: 'listening-audio-reference-v1',
      paperId: fixturePaperId,
      basis: 'authoritative_transcript',
      text: transcript,
    })
    writeJson(contentReviewPath, {
      schemaVersion: 'listening-audio-content-review-v1',
      paperId: fixturePaperId,
      reviewedBy: 'import_agent',
      reviewedAt: '2026-09-02T00:00:00.000Z',
      reviewedTranscriptSha256: staged.asrSha256,
      untrustedContentHandledAsData: true,
      verdict: 'pass',
      summary: 'Full fixture transcript reviewed as untrusted content.',
      flaggedRanges: [],
    })
    finalizeListeningAudio({
      paperDir: reviewRoot,
      paperId: fixturePaperId,
      reviewPath: contentReviewPath,
      referencePath,
    })
  }

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

function makeContext(label, options = {}) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), `eqb-universal-publish-${label}-`))
  const fixture = makeReviewRoot(tempRoot, paperId, undefined, options)
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

function reviewManifestFor(reviewRoot, projection) {
  const files = reviewBundleFilePaths(reviewRoot).map((file) => {
    const bytes = readFileSync(resolveReviewFile(reviewRoot, file.path))
    return {
      ...file,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
    }
  })
  const manifest = {
    schemaVersion: 'web-import-review-bundle-v1',
    paperId: projection.paperId,
    paperName: projection.paperName,
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    analysisDigest: projection.analysisDigest,
    producerBuildId: 'single-paper-promotion-verifier',
    files,
    resolvesIssueIds: [],
  }
  return { ...manifest, bundleDigest: reviewBundleDigest(manifest) }
}

function makeOnlinePromotionContext(label, fixturePaperId = paperId, paginationBreaks = null) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), `eqb-single-paper-promotion-${label}-`))
  const fixture = makeReviewRoot(tempRoot, fixturePaperId)
  if (paginationBreaks) {
    writeJson(path.join(fixture.reviewRoot, 'pagination-plan.json'), {
      schemaVersion: 'paper-pagination-plan-v1', paperId: fixturePaperId,
      sourceDigest: fixture.projection.sourceDigest, candidateDigest: fixture.projection.candidateDigest,
      editions: { friendly8: { targetPages: 8, includeListening: false, omitCover: false,
        coverGapsPt: [0, 18], breakSlotIds: paginationBreaks, allowSplitOptionBank: false } },
    })
    fixture.projection = buildNck1ReviewProjection(fixture.reviewRoot)
  }
  const reviewStore = createImportReviewStore({
    dbPath: path.join(tempRoot, 'import-review.sqlite'),
    filesRoot: path.join(tempRoot, 'review-files'),
    rendererBuildId: 'renderer-single-paper-promotion-verifier',
  })
  const manifest = reviewManifestFor(fixture.reviewRoot, fixture.projection)
  const created = reviewStore.createRevision(manifest)
  for (const file of manifest.files) {
    const upload = reviewStore.fileForUpload(created.revision.id, file.path)
    const bytes = readFileSync(resolveReviewFile(fixture.reviewRoot, file.path))
    mkdirSync(path.dirname(upload.destination), { recursive: true })
    writeFileSync(upload.destination, bytes)
    reviewStore.completeFileUpload(created.revision.id, file.path, {
      sha256: file.sha256,
      byteLength: file.byteLength,
    })
  }
  const revision = reviewStore.finalizeRevision(created.revision.id)
  const approval = reviewStore.approveRevision(
    fixturePaperId,
    revision.id,
    { bundleDigest: revision.bundleDigest },
    'synthetic-owner',
  )
  const dbPath = path.join(tempRoot, 'question-bank.sqlite')
  const setupDb = new DatabaseSync(dbPath)
  setupDb.exec(readFileSync(path.join(root, 'data/sql/schema.sql'), 'utf8'))
  setupDb.close()
  const openDatabase = ({ readOnly = false } = {}) => {
    const db = new DatabaseSync(dbPath, { readOnly })
    db.exec('PRAGMA foreign_keys = ON')
    return db
  }
  return {
    ...fixture,
    tempRoot,
    reviewStore,
    revision,
    approval,
    dbPath,
    openDatabase,
    paperAssetsDir: path.join(tempRoot, 'paper-assets'),
  }
}

function promotionRequest(approval, intent = 'ship') {
  return {
    intent,
    approvalId: approval.approvalId,
    revisionId: approval.revisionId,
    sourceDigest: approval.sourceDigest,
    candidateDigest: approval.candidateDigest,
    visibleStructureDigest: approval.visibleStructureDigest,
    analysisDigest: approval.analysisDigest,
    bundleDigest: approval.bundleDigest,
  }
}

async function startPromotionServer(context, promotionService) {
  const routes = createImportReviewRoutes({
    getStore: () => context.reviewStore,
    agentToken: 'synthetic-agent-token',
    shipToken: 'synthetic-ship-token',
    buildPrintHtml,
    promotionService,
  })
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    const staticFile = {
      '/ops/': ['index.html', 'text/html; charset=utf-8'],
      '/ops/index.html': ['index.html', 'text/html; charset=utf-8'],
      '/ops/app.js': ['app.js', 'text/javascript; charset=utf-8'],
      '/ops/clipboard.js': ['clipboard.js', 'text/javascript; charset=utf-8'],
      '/ops/styles.css': ['styles.css', 'text/css; charset=utf-8'],
      '/ops/source-intakes.css': ['source-intakes.css', 'text/css; charset=utf-8'],
    }[url.pathname]
    if (staticFile) {
      const bytes = readFileSync(path.join(root, 'import-ops/public', staticFile[0]))
      response.writeHead(200, {
        'content-length': bytes.byteLength,
        'content-type': staticFile[1],
      })
      response.end(bytes)
      return
    }
    if (url.pathname === '/api/auth/me') {
      const bytes = Buffer.from(JSON.stringify({
        authRequired: true,
        user: { role: 'owner', accountKind: 'human', username: 'synthetic-owner' },
      }))
      response.writeHead(200, {
        'content-length': bytes.byteLength,
        'content-type': 'application/json',
      })
      response.end(bytes)
      return
    }
    const handled = await runRoutes(routes, {
      request,
      response,
      url,
      context: {
        session: request.headers['x-synthetic-owner']
          ? { role: 'owner', accountKind: 'human', username: 'synthetic-owner' }
          : null,
        readJsonBody: readJsonRouteBody,
        sendJson(target, status, body) {
          const bytes = Buffer.from(JSON.stringify(body))
          target.writeHead(status, {
            'content-length': bytes.byteLength,
            'content-type': 'application/json',
          })
          target.end(bytes)
        },
      },
    })
    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'not found' }))
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address === 'object')
  return { server, origin: `http://127.0.0.1:${address.port}` }
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

async function assertRoleSurfaces({ projection, listeningProjection, listeningPublished, listeningAudioBytes, publishedScreen, publishedPrint }) {
  const titleId = 'block:seven-choices:title'
  const bodyId = 'block:seven-choices'
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const playwright = await import('../app/node_modules/playwright/index.js')
  const audioRoot = mkdtempSync(path.join(tmpdir(), 'listening-browser-'))
  const audioUrl = listeningPublished.screen.listeningAudio.url
  const audioPath = path.join(audioRoot, audioUrl.replace('/paper-assets/', ''))
  mkdirSync(path.dirname(audioPath), { recursive: true })
  writeFileSync(audioPath, listeningAudioBytes)
  const viteServer = await vite.createServer({
    root: path.join(root, 'app'),
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'listening-publication-audio-fixture',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === audioUrl) sendPaperAssetStatic(request, response, request.url, audioRoot)
          else next()
        })
      },
    }],
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
    let screenProjection = projection
    await screenPage.route('**/api/paper-canonical/consumption?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(screenProjection.consumption),
      }))
    await screenPage.route('**/paper-assets/**/paper-asset.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(screenProjection.paperAsset),
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
    assert.equal(await screenPage.locator('.paper-browse-listening').count(), 0)
    if (process.env.LISTENING_QA_ARTIFACT_DIR) {
      mkdirSync(process.env.LISTENING_QA_ARTIFACT_DIR, { recursive: true })
      await screenPage.screenshot({ path: path.join(process.env.LISTENING_QA_ARTIFACT_DIR, 'screen-not-supplied.png') })
    }
    screenProjection = listeningProjection
    screenUrl.searchParams.set('focusGroupId', `group:${projection.paperId}:listening.short-dialogue`)
    await screenPage.goto(screenUrl.href)
    await screenPage.locator('.paper-browse-listening .ps-question').first().waitFor()
    await assertPaperFonts(screenPage, '.paper-browse-listening')
    await assertSharedPaperLayout(screenPage, '.paper-browse-listening')
    assert.equal(await screenPage.locator('.paper-browse-listening').count(), 2)
    assert.equal(await screenPage.locator('.paper-browse-listening .ps-question').count(), 20)
    assert.deepEqual(
      await screenPage.locator('.paper-browse-listening .ps-question-no').allTextContents(),
      Array.from({ length: 20 }, (_, index) => `${index + 1}.`),
    )
    assert.equal(await screenPage.locator('.paper-browse-listening .ps-option').count(), 60)
    assert.equal(await screenPage.locator('audio').count(), 0, 'Review preview does not expose published playback')
    assert.doesNotMatch(await screenPage.locator('body').textContent(), /Long listening transcript|官方答案|内容安全检查通过/)
    await screenPage.locator('[data-paper-question-id="question:listening:6"]').click()
    screenProjection = { ...listeningProjection, consumption: listeningPublished.screen }
    await screenPage.goto(screenUrl.href)
    const audio = screenPage.locator('audio')
    await audio.waitFor()
    assert.equal(await audio.count(), 1)
    assert.equal(await screenPage.locator('.paper-browse-zoom audio').count(), 0, 'Player stays outside A4 paper')
    assert.equal(await audio.getAttribute('preload'), 'metadata')
    await screenPage.waitForFunction(() => document.querySelector('audio')?.readyState >= 1)
    assert.equal(await audio.evaluate((element) => Math.round(element.duration)), 12)
    await audio.evaluate((element) => element.play())
    await screenPage.waitForFunction(() => document.querySelector('audio').currentTime > 0)
    await audio.evaluate((element) => { element.pause(); element.currentTime = 8 })
    await screenPage.waitForFunction(() => !document.querySelector('audio').seeking)
    assert.equal(await audio.evaluate((element) => Math.round(element.currentTime)), 8)
    const columns = await screenPage.locator('.paper-browse-listening .ps-option-list').first()
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').map(parseFloat))
    assert.equal(columns.length, 3)
    assert.ok(Math.max(...columns) - Math.min(...columns) < 1)
    await audio.scrollIntoViewIfNeeded()
    if (process.env.LISTENING_QA_ARTIFACT_DIR) {
      await screenPage.screenshot({ path: path.join(process.env.LISTENING_QA_ARTIFACT_DIR, 'screen-captured.png') })
    }
    await screenPage.close()

    const detailPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await detailPage.route('**/api/paper-canonical/consumption?*', (route) => route.fulfill({
      contentType: 'application/json', body: JSON.stringify(listeningPublished.screen),
    }))
    const detailUrl = new URL('canonical-detail-consumption-qa.html', appUrl)
    detailUrl.searchParams.set('paperId', listeningProjection.paperId)
    detailUrl.searchParams.set('groupId', `group:${listeningProjection.paperId}:listening.short-dialogue`)
    detailUrl.searchParams.set('rawGroupType', 'listening')
    await detailPage.goto(detailUrl.href)
    await detailPage.locator('.canonical-listening-surface .ps-question').first().waitFor()
    assert.equal(await detailPage.locator('.canonical-listening-surface .ps-question').count(), 5)
    assert.equal(await detailPage.locator('audio').count(), 0, 'Only the whole-paper Screen owns playback')
    await assertPaperFonts(detailPage, '.canonical-listening-surface')
    const detailColumns = await detailPage.locator('.canonical-listening-surface .ps-option-list').first()
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').map(parseFloat))
    assert.equal(detailColumns.length, 3)
    assert.ok(Math.max(...detailColumns) - Math.min(...detailColumns) < 1)
    if (process.env.LISTENING_QA_ARTIFACT_DIR) await detailPage.screenshot({ path: path.join(process.env.LISTENING_QA_ARTIFACT_DIR, 'detail-listening.png') })
    await detailPage.close()

    const listeningAnswers = new Map(Object.entries(listeningProjection.paperAsset.answerKey.answers)
      .map(([questionId, answer]) => [questionId, answer.answer]))
    const listeningPayload = canonicalConsumptionPrintPayload(listeningPublished.print_pdf, listeningProjection.paperName, listeningAnswers)
    for (const versionType of ['student', 'teacher']) {
      const html = buildPrintHtml({
        ...listeningPayload,
        versionType,
        items: listeningPayload.items.map((item) => ({ detail: listeningPayload.details.get(item.questionGroupId), score: 0, note: '', sectionTitle: '' })),
        canonicalConsumption: listeningPublished.print_pdf,
      })
      assert.doesNotMatch(html, /<audio|Long listening transcript|asr-v1|check-v1/)
      const page = await browser.newPage({ viewport: { width: 794, height: 1123 } })
      await page.emulateMedia({ media: 'print' })
      await page.setContent(html)
      await assertPaperFonts(page, '.paper-print')
      await assertSharedPaperLayout(page, '.paper-print')
      const questions = page.locator('[data-canonical-question-id^="question:listening:"]')
      assert.equal(await questions.count(), 20)
      assert.equal(await page.locator('.question-group[data-canonical-group-type="listening"] .canonical-options > span').count(), 60)
      assert.equal(await questions.locator('.answer').count(), versionType === 'teacher' ? 20 : 0)
      assert.ok(await questions.evaluateAll((elements) => elements.every((element) => getComputedStyle(element).breakInside === 'avoid')))
      assert.equal(await page.locator('.question-group[data-canonical-group-type="listening"] .canonical-options--two_by_two').count(), 0)
      const listeningColumns = await page.locator('.question-group[data-canonical-group-type="listening"] .canonical-options').first()
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').map(parseFloat))
      assert.equal(listeningColumns.length, 3)
      assert.ok(Math.max(...listeningColumns) - Math.min(...listeningColumns) < 1)
      const artifactDir = process.env.LISTENING_QA_ARTIFACT_DIR
      if (artifactDir && versionType === 'student') {
        writeFileSync(path.join(artifactDir, 'full-listening-input.html'), html)
        const withoutListeningPayload = {
          ...listeningPayload,
          blocks: listeningPayload.blocks.slice(1 + listeningPayload.blocks.findLastIndex((block) =>
            block.type === 'question_group'
            && listeningPayload.details.get(block.questionGroupId)?.groupType === 'listening')),
          items: listeningPayload.items
            .filter((item) => listeningPayload.details.get(item.questionGroupId)?.groupType !== 'listening')
            .map((item) => ({ detail: listeningPayload.details.get(item.questionGroupId), score: 0, note: '', sectionTitle: '' })),
        }
        writeFileSync(path.join(artifactDir, 'full-without-listening-input.html'), buildPrintHtml({
          ...withoutListeningPayload, versionType, canonicalConsumption: listeningPublished.print_pdf,
        }))
      }
      const { pdfBytes: pdf } = await renderPaginatedPaper(html, { inspect: async paged => {
        await assertPaperFonts(paged, '.pagedjs_pages')
        await assertSharedPaperLayout(paged, '.pagedjs_pages')
        assert.equal(await paged.locator('.pagedjs_pages [data-canonical-question-id^="question:listening:"]').count(), 20)
      } })
      if (artifactDir) writeFileSync(path.join(artifactDir, `listening-${versionType}.pdf`), pdf)
      assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
      if (artifactDir) await page.screenshot({ path: path.join(artifactDir, `print-${versionType}.png`) })
      await page.close()
    }

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
    await closeChromiumPool()
    await viteServer.close()
    rmSync(audioRoot, { recursive: true, force: true })
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

const listeningPublication = makeContext('listening-publication', { listening: true })
try {
  const listeningProjection = listeningPublication.projection
  assert.deepEqual(
    listeningProjection.paperAsset.content.blocks.slice(0, 2),
    [
      {
        type: 'group',
        groupId: `group:${paperId}:listening.short-dialogue`,
      },
      {
        type: 'group',
        groupId: `group:${paperId}:listening.long-form`,
      },
    ],
    'Screen compatibility asset starts with the two Canonical Listening Groups',
  )
  assert.equal(listeningProjection.listeningReview.questions.length, 20)
  assert.deepEqual(
    listeningProjection.listeningReview.questions[5],
    {
      questionId: 'question:listening:6',
      questionNo: 6,
      officialAnswer: 'A',
      transcriptSegments: [{
        segmentId: 'text:6',
        text: 'Long listening transcript 6.',
        questionNumbers: [6, 7, 8],
      }],
    },
  )
  assert.equal(Math.round(listeningProjection.listeningReview.audio.durationSeconds), 12)
  assert.equal(listeningProjection.listeningReview.audio.comparison.verdict, 'pass')
  assert.equal(listeningProjection.listeningReview.audio.contentSafety.verdict, 'pass')
  assert.equal(
    Object.hasOwn(listeningProjection.paperAsset.content.questions['question:listening:6'], 'transcript'),
    false,
    'Student PaperAsset must not expose the Listening transcript',
  )
  for (const relativePath of Object.values(LISTENING_AUDIO_PATHS)) {
    const filePath = path.join(listeningPublication.reviewRoot, relativePath)
    const original = readFileSync(filePath)
    try {
      writeFileSync(filePath, 'tampered')
      assert.throws(() => publish(listeningPublication), /Listening/)
      rmSync(filePath)
      assert.throws(() => publish(listeningPublication), /Listening/)
      assert.equal(publishedVersionCount(listeningPublication), 0)
      assert.equal(existsSync(listeningPublication.paperAssetsDir), false)
    } finally {
      writeFileSync(filePath, original)
    }
  }
  const audioEvidence = assertListeningAudioManifest(listeningPublication.reviewRoot, listeningProjection.manifest)
  const changedListening = structuredClone(listeningProjection.materialization.listening)
  changedListening.transcript[0].text += ' Different source words.'
  assert.throws(() => assertListeningAudioSource(audioEvidence, changedListening), /Listening source changed/)
  assert.throws(() => assertListeningAudioSource(audioEvidence, { state: 'not_supplied' }), /without Listening/)
  const result = publish(listeningPublication)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.ok(existsSync(path.join(result.publish.versionDir, 'listening/playback.mp3')))
  assert.ok(result.publish.consumers.screen.listeningAudio.url.includes('/versions/v1/'))
  const previousAssetRoot = process.env.QUESTION_BANK_PAPER_ASSET_ROOT
  try {
    process.env.QUESTION_BANK_PAPER_ASSET_ROOT = listeningPublication.paperAssetsDir
    const { isGroupPrintReady, getPrintReadyByGroupId } = await import('../server/api.mjs?listening-publication-readiness')
    const groupIds = result.publish.consumers.screen.selections.find((selection) => selection.familyContractId === 'listening').groupIds
    for (const groupId of groupIds) assert.equal(isGroupPrintReady(listeningPublication.db, groupId).ok, true, 'Published Listening passes the actual draft-add readiness gate')
    const batch = getPrintReadyByGroupId(listeningPublication.db, groupIds)
    for (const groupId of groupIds) assert.equal(batch.get(groupId).ok, true, 'Search cards and draft-add agree')
  } finally {
    if (previousAssetRoot === undefined) delete process.env.QUESTION_BANK_PAPER_ASSET_ROOT
    else process.env.QUESTION_BANK_PAPER_ASSET_ROOT = previousAssetRoot
  }
  listeningPublication.published = result.publish.consumers
  listeningPublication.audioBytes = readFileSync(path.join(result.publish.versionDir, 'listening/playback.mp3'))
  for (const consumption of Object.values(result.publish.consumers)) {
    const listening = consumption.selections.find((selection) => selection.familyContractId === 'listening')
    assert.doesNotMatch(JSON.stringify(listening), /Long listening transcript|correctOptionId|asr-v1|check-v1/)
    assert.ok(listening.projectedOccurrences.every((occurrence) =>
      occurrence.transcriptSegments.every((segment) => !Object.hasOwn(segment, 'content'))))
  }
  for (const privatePath of ['source/listening-audio.mp3', 'materialization/listening-audio/asr-v1.json', 'materialization/listening-audio/check-v1.json']) {
    assert.equal(existsSync(path.join(result.publish.versionDir, privatePath)), false)
  }
} finally {
  close(listeningPublication)
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
  const projectedFiniteVerb = Object.values(
    happy.projection.analysisSidecars['grammar-fill-analysis-v1.json'].blanks,
  ).find((item) => item.facetKey === 'grammar-fill.given.verb.finite')
  assert.ok(projectedFiniteVerb, 'universal fixture must include one finite verb blank')
  assert.notEqual(projectedFiniteVerb.tense, undefined)
  assert.notEqual(projectedFiniteVerb.voice, undefined)
  assert.notEqual(projectedFiniteVerb.agreementSensitive, undefined)
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
    listeningProjection: listeningPublication.projection,
    listeningPublished: listeningPublication.published,
    listeningAudioBytes: listeningPublication.audioBytes,
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

const preCommit = makeContext('pre-commit', { listening: true })
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

const postCommit = makeContext('post-commit', { listening: true })
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

const online = makeOnlinePromotionContext('online')
let onlineServer = null
let onlineBrowser = null
try {
  const beforeDb = online.openDatabase({ readOnly: true })
  const beforeGroupIds = beforeDb.prepare('SELECT id FROM question_groups ORDER BY id')
    .all().map(({ id }) => id)
  beforeDb.close()
  assert(!existsSync(path.join(online.paperAssetsDir, paperId)))
  assert.equal(online.reviewStore.agentPaperStatus(paperId).promotion, null)

  const promotionService = createSinglePaperPromotionService({
    getStore: () => online.reviewStore,
    openDatabase: online.openDatabase,
    paperAssetsDir: online.paperAssetsDir,
  })
  const started = await startPromotionServer(online, promotionService)
  onlineServer = started.server
  const playwright = await import('../app/node_modules/playwright/index.js')
  onlineBrowser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
  const reviewPage = await onlineBrowser.newPage({
    extraHTTPHeaders: { 'x-synthetic-owner': '1' },
    viewport: { width: 1440, height: 1000 },
  })
  await reviewPage.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(value) {
          window.__copiedReviewText = value
        },
      },
    })
  })
  await reviewPage.goto(`${started.origin}/ops/?view=review`)
  const fixedPdfResponse = await fetch(`${started.origin}/api/import-review-preview/revisions/${online.approval.revisionId}/pdf?version=student&pageLayout=friendly8`, {
    headers: { 'x-synthetic-owner': '1' },
  })
  assert.equal(fixedPdfResponse.status, 200, 'Review fixed PDF must render through the real public route')
  assert.equal(fixedPdfResponse.headers.get('x-eqb-pagination-edition'), 'friendly8')
  assert.equal(fixedPdfResponse.headers.get('x-eqb-pagination-pages'), '8')
  const fixedPdfPath = path.join(online.tempRoot, 'review-fixed8.pdf')
  writeFileSync(fixedPdfPath, Buffer.from(await fixedPdfResponse.arrayBuffer()))
  assert.match(execFileSync('pdfinfo', [fixedPdfPath], { encoding: 'utf8' }), /Pages:\s+8\b/)
  const promotionRail = reviewPage.getByRole('heading', { name: '上线审计' }).locator('..')
  await promotionRail.getByText('已认可，未上线', { exact: true }).waitFor()
  await promotionRail.getByText(`上线 ${paperId}`, { exact: true }).waitFor()
  assert.equal(
    await promotionRail.getByRole('button', { name: /上线/u }).count(),
    0,
    'approved Review audit rail exposes no publish button',
  )
  const copyCommand = promotionRail.getByRole('button', { name: '复制口令' })
  assert.equal(await copyCommand.count(), 1)
  await copyCommand.click()
  assert.equal(await reviewPage.evaluate(() => window.__copiedReviewText), `上线 ${paperId}`)
  const copyPaperId = reviewPage.getByRole('button', { name: '复制Paper ID' })
  assert.equal(await copyPaperId.count(), 1)
  await copyPaperId.click()
  assert.equal(await reviewPage.evaluate(() => window.__copiedReviewText), paperId)
  const pathname = `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}/promotions`
  const body = JSON.stringify(promotionRequest(online.approval))
  for (const headers of [
    { authorization: 'Bearer synthetic-agent-token' },
    { 'x-synthetic-owner': '1' },
  ]) {
    const denied = await fetch(`${started.origin}${pathname}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body,
    })
    assert.equal(denied.status, 401, 'Agent and Owner web identities cannot promote')
    assert.equal((await denied.json()).error, 'shipping_auth_required')
  }
  const stale = await fetch(`${started.origin}${pathname}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer synthetic-ship-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...promotionRequest(online.approval),
      bundleDigest: `sha256:${'0'.repeat(64)}`,
    }),
  })
  assert.equal(stale.status, 409)
  assert.equal((await stale.json()).code, 'IMPORT_REVIEW_PROMOTION_STALE')
  assert.equal(online.reviewStore.latestPromotion(paperId), null)

  const promoted = await fetch(`${started.origin}${pathname}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer synthetic-ship-token',
      'content-type': 'application/json',
    },
    body,
  })
  assert.equal(promoted.status, 201)
  const promotedBody = await promoted.json()
  assert.equal(promotedBody.status, 'published')
  assert.equal(promotedBody.promotion.state, 'published')
  assert.equal(promotedBody.promotion.versionName, 'v1')
  assert.equal(promotedBody.promotion.revisionId, online.approval.revisionId)
  assert.equal(
    promotedBody.promotion.analysisPublicationDigest,
    analysisDigestAt(path.join(online.paperAssetsDir, paperId, 'versions/v1')),
  )
  await reviewPage.reload()
  const publishedRail = reviewPage.getByRole('heading', { name: '上线审计' }).locator('..')
  await publishedRail.getByText('已上线', { exact: true }).waitFor()
  assert.match(await publishedRail.textContent(), /R1 · v1 · 尝试 1/u)
  assert.equal(
    await publishedRail.getByRole('button', { name: /上线/u }).count(),
    0,
    'published Review audit rail remains read-only',
  )

  const afterDb = online.openDatabase({ readOnly: true })
  const afterGroupIds = afterDb.prepare('SELECT id FROM question_groups ORDER BY id')
    .all().map(({ id }) => id)
  const addedGroupIds = afterGroupIds.filter((id) => !beforeGroupIds.includes(id))
  assert.deepEqual(
    addedGroupIds.sort(),
    Object.keys(online.projection.paperAsset.content.groups).sort(),
    'single-paper promotion changes only the approved paper formal groups',
  )
  assert.equal(
    afterDb.prepare('SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?')
      .get(paperId).count,
    1,
  )
  afterDb.close()
  for (const base of [
    path.join(online.paperAssetsDir, paperId, 'versions/v1'),
    path.join(online.paperAssetsDir, paperId, 'latest'),
  ]) {
    assert(existsSync(path.join(base, 'paper-asset.json')))
    assert.equal(analysisDigestAt(base), promotedBody.promotion.analysisPublicationDigest)
  }
  const agentStatusResponse = await fetch(
    `${started.origin}/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
    { headers: { authorization: 'Bearer synthetic-agent-token' } },
  )
  assert.equal(agentStatusResponse.status, 200)
  assert.equal((await agentStatusResponse.json()).promotion.state, 'published')

  const duplicate = await fetch(`${started.origin}${pathname}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer synthetic-ship-token',
      'content-type': 'application/json',
    },
    body,
  })
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json()).status, 'idempotent')
  const duplicateDb = online.openDatabase({ readOnly: true })
  assert.equal(
    duplicateDb.prepare('SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?')
      .get(paperId).count,
    1,
  )
  duplicateDb.close()
  const inspected = promotionService.promote(
    paperId,
    promotionRequest(online.approval),
    'ship-authorizer-token',
  )
  assert.equal(inspected.status, 'idempotent')
  assert.equal(inspected.consumers.screen.disposition, 'ready')
  assert.equal(inspected.consumers.print_pdf.disposition, 'ready')
  assert.equal(
    inspected.consumers.screen.visibleStructureDigest,
    inspected.consumers.print_pdf.visibleStructureDigest,
  )
  const latestMetaPath = path.join(
    online.paperAssetsDir,
    paperId,
    'latest',
    'import-meta.json',
  )
  const latestMetaBytes = readFileSync(latestMetaPath)
  const unboundLatestMeta = JSON.parse(latestMetaBytes)
  delete unboundLatestMeta.paginationPlanBinding
  writeFileSync(latestMetaPath, `${JSON.stringify(unboundLatestMeta, null, 2)}\n`)
  assert.throws(
    () => promotionService.promote(
      paperId,
      promotionRequest(online.approval),
      'ship-authorizer-token',
    ),
    /pagination binding differs from Review projection/,
    'an idempotent promotion rejects latest after its explicit null pagination commitment is dropped',
  )
  const rollbackDb = online.openDatabase({ readOnly: false })
  try {
    assert.throws(
      () => rollbackPaperImportPublication({
        db: rollbackDb,
        paperAssetsDir: online.paperAssetsDir,
        paperId,
        versionName: 'v1',
      }),
      { code: 'PUBLICATION_REF_DISAGREEMENT' },
      'idempotent rollback rejects latest after its explicit null pagination commitment is dropped',
    )
  } finally {
    rollbackDb.close()
  }
  writeFileSync(latestMetaPath, latestMetaBytes)
  const promotedByCli = await runReviewCommand(
    ['promote', paperId, '--owner-said-ship'],
    {
      QUESTION_BANK_IMPORT_OPS_ORIGIN: started.origin,
      QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: 'synthetic-agent-token',
      QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN: 'synthetic-ship-token',
    },
  )
  assert.match(promotedByCli.stdout, /"status": "idempotent"/)
  assert.match(promotedByCli.stdout, /R2 backup remains asynchronous/)

  const nextFixture = makeReviewRoot(
    path.join(online.tempRoot, 'next-approved-revision'),
    paperId,
    'newer approved synthetic source that has not been promoted',
  )
  const nextManifest = reviewManifestFor(nextFixture.reviewRoot, nextFixture.projection)
  const nextCreated = online.reviewStore.createRevision(nextManifest)
  for (const file of nextManifest.files) {
    const upload = online.reviewStore.fileForUpload(nextCreated.revision.id, file.path)
    const bytes = readFileSync(resolveReviewFile(nextFixture.reviewRoot, file.path))
    mkdirSync(path.dirname(upload.destination), { recursive: true })
    writeFileSync(upload.destination, bytes)
    online.reviewStore.completeFileUpload(nextCreated.revision.id, file.path, {
      sha256: file.sha256,
      byteLength: file.byteLength,
    })
  }
  const nextRevision = online.reviewStore.finalizeRevision(nextCreated.revision.id)
  online.reviewStore.approveRevision(
    paperId,
    nextRevision.id,
    { bundleDigest: nextRevision.bundleDigest },
    'synthetic-owner',
  )
  await reviewPage.reload()
  const nextApprovalRail = reviewPage.getByRole('heading', { name: '上线审计' }).locator('..')
  await nextApprovalRail.getByText('已认可，未上线', { exact: true }).waitFor()
  await nextApprovalRail.getByText(`上线 ${paperId}`, { exact: true }).waitFor()
  assert.match(await nextApprovalRail.textContent(), /上一份上线回执：已上线 · v1/u)
  const paperListButton = reviewPage.locator(
    `.paper-list button[data-paper-id="${paperId}"]`,
  )
  assert.equal(
    await paperListButton.locator('.status--published').count(),
    0,
    'paper list does not label a newer unshipped approval as published',
  )
  assert.equal(
    await nextApprovalRail.getByRole('button', { name: /上线/u }).count(),
    0,
    'a newer approved revision stays visibly unshipped and exposes no publish button',
  )
  const opsSource = readFileSync(path.join(root, 'import-ops/public/app.js'), 'utf8')
  assert.match(opsSource, /上线审计/)
  assert(!opsSource.includes('/promotions'), 'Review UI has no promotion mutation call')
} finally {
  if (onlineBrowser) await onlineBrowser.close()
  if (onlineServer) await new Promise((resolve) => onlineServer.close(resolve))
  rmSync(online.tempRoot, { recursive: true, force: true })
}

const plannedPromotion = makeOnlinePromotionContext('planned', paperId, ['reading.b'])
try {
  const service = createSinglePaperPromotionService({ getStore: () => plannedPromotion.reviewStore,
    openDatabase: plannedPromotion.openDatabase, paperAssetsDir: plannedPromotion.paperAssetsDir })
  const first = service.promote(paperId, promotionRequest(plannedPromotion.approval), 'synthetic-ship')
  assert.equal(first.status, 'published')
  const paperDir = path.join(plannedPromotion.paperAssetsDir, paperId)
  const versionPlan = path.join(paperDir, 'versions/v1/pagination-plan.json')
  const originalPlan = readFileSync(versionPlan)
  assert.deepEqual(JSON.parse(originalPlan), plannedPromotion.projection.paginationPlan)
  assert.deepEqual(readFileSync(path.join(paperDir, 'latest/pagination-plan.json')), originalPlan)
  rmSync(versionPlan)
  assert.throws(() => service.promote(paperId, promotionRequest(plannedPromotion.approval), 'synthetic-ship'), /missing/)
  writeFileSync(versionPlan, originalPlan)

  const changedPlan = JSON.parse(originalPlan)
  changedPlan.editions.friendly8.breakSlotIds = ['reading.d']
  writeJson(path.join(plannedPromotion.reviewRoot, 'pagination-plan.json'), changedPlan)
  const nextProjection = buildNck1ReviewProjection(plannedPromotion.reviewRoot)
  assert.equal(nextProjection.candidateDigest, plannedPromotion.projection.candidateDigest)
  const manifest = reviewManifestFor(plannedPromotion.reviewRoot, nextProjection)
  assert.notEqual(manifest.bundleDigest, plannedPromotion.approval.bundleDigest)
  const created = plannedPromotion.reviewStore.createRevision(manifest)
  for (const file of manifest.files) {
    const upload = plannedPromotion.reviewStore.fileForUpload(created.revision.id, file.path)
    mkdirSync(path.dirname(upload.destination), { recursive: true })
    writeFileSync(upload.destination, readFileSync(resolveReviewFile(plannedPromotion.reviewRoot, file.path)))
    plannedPromotion.reviewStore.completeFileUpload(created.revision.id, file.path, { sha256: file.sha256, byteLength: file.byteLength })
  }
  const revision = plannedPromotion.reviewStore.finalizeRevision(created.revision.id)
  const approval = plannedPromotion.reviewStore.approveRevision(paperId, revision.id, { bundleDigest: revision.bundleDigest }, 'synthetic-owner')
  const second = service.promote(paperId, promotionRequest(approval), 'synthetic-ship')
  assert.equal(second.promotion.assetVersion, 2, 'same Candidate with a newly approved plan must not reuse v1')
  assert.deepEqual(JSON.parse(readFileSync(path.join(paperDir, 'latest/pagination-plan.json'))), changedPlan)
  const db = plannedPromotion.openDatabase({ readOnly: false })
  try {
    rollbackPaperImportPublication({ db, paperAssetsDir: plannedPromotion.paperAssetsDir, paperId, versionName: 'v1' })
    assert.deepEqual(readFileSync(path.join(paperDir, 'latest/pagination-plan.json')), originalPlan)
    writeJson(path.join(paperDir, 'latest/pagination-plan.json'), changedPlan)
    assert.throws(() => rollbackPaperImportPublication({ db, paperAssetsDir: plannedPromotion.paperAssetsDir,
      paperId, versionName: 'v1' }), /commitment/)
  } finally { db.close() }
} finally { rmSync(plannedPromotion.tempRoot, { recursive: true, force: true }) }

const preCommitPromotion = makeOnlinePromotionContext('precommit')
try {
  const service = createSinglePaperPromotionService({
    getStore: () => preCommitPromotion.reviewStore,
    openDatabase: preCommitPromotion.openDatabase,
    paperAssetsDir: preCommitPromotion.paperAssetsDir,
    publish(input) {
      return publishUniversalNck1Import({ ...input, failurePoint: 'db-write' })
    },
  })
  assert.throws(
    () => service.promote(
      paperId,
      promotionRequest(preCommitPromotion.approval),
      'ship-authorizer-token',
    ),
    /Forced db-write failure/,
  )
  const publishing = preCommitPromotion.reviewStore.latestPromotion(paperId)
  assert.equal(publishing.state, 'publishing')
  assert.equal(publishing.versionName, 'v1')
  assert.throws(
    () => preCommitPromotion.reviewStore.createRevision(
      reviewManifestFor(preCommitPromotion.reviewRoot, preCommitPromotion.projection),
    ),
    (error) => error.code === 'IMPORT_REVIEW_SHIPPING_IN_PROGRESS',
    'Review mutation remains frozen after an unknown publication failure',
  )
  const rolledBackDb = preCommitPromotion.openDatabase({ readOnly: true })
  assert.equal(
    rolledBackDb.prepare('SELECT COUNT(*) AS count FROM question_groups WHERE id LIKE ?')
      .get('group-%').count,
    0,
  )
  assert.equal(
    rolledBackDb.prepare('SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?')
      .get(paperId).count,
    0,
  )
  rolledBackDb.close()
  assert(!existsSync(path.join(preCommitPromotion.paperAssetsDir, paperId, 'latest')))
  const aborted = preCommitPromotion.reviewStore.releaseShippingGuard(
    paperId,
    publishing.guardId,
    'ship-authorizer-token',
  )
  assert.equal(aborted.released, true)
  assert.equal(aborted.promotion.state, 'failed')
  assert.equal(aborted.promotion.failureCode, 'IMPORT_REVIEW_PROMOTION_ABORTED')
  const recovered = createSinglePaperPromotionService({
    getStore: () => preCommitPromotion.reviewStore,
    openDatabase: preCommitPromotion.openDatabase,
    paperAssetsDir: preCommitPromotion.paperAssetsDir,
  }).promote(
    paperId,
    promotionRequest(preCommitPromotion.approval, 'retry_ship'),
    'ship-authorizer-token',
  )
  assert.equal(recovered.status, 'published')
  assert.equal(recovered.promotion.versionName, 'v1')
} finally {
  rmSync(preCommitPromotion.tempRoot, { recursive: true, force: true })
}

const committedWithoutReceipt = makeOnlinePromotionContext('committed-without-receipt')
try {
  const interrupted = createSinglePaperPromotionService({
    getStore: () => committedWithoutReceipt.reviewStore,
    openDatabase: committedWithoutReceipt.openDatabase,
    paperAssetsDir: committedWithoutReceipt.paperAssetsDir,
    afterPublish() {
      throw new Error('forced receipt crash')
    },
  })
  assert.throws(
    () => interrupted.promote(
      paperId,
      promotionRequest(committedWithoutReceipt.approval),
      'ship-authorizer-token',
    ),
    /forced receipt crash/,
  )
  assert.equal(committedWithoutReceipt.reviewStore.latestPromotion(paperId).state, 'publishing')
  assert.throws(
    () => committedWithoutReceipt.reviewStore.createIssue(paperId, {
      revisionId: committedWithoutReceipt.revision.id,
      surface: 'screen',
      groupId: 'group:reading-a',
      message: 'must remain frozen',
    }, 'synthetic-owner'),
    (error) => error.code === 'IMPORT_REVIEW_SHIPPING_IN_PROGRESS',
  )
  const resumed = createSinglePaperPromotionService({
    getStore: () => committedWithoutReceipt.reviewStore,
    openDatabase: committedWithoutReceipt.openDatabase,
    paperAssetsDir: committedWithoutReceipt.paperAssetsDir,
    publish() {
      throw new Error('publisher must not run for committed promotion recovery')
    },
  }).promote(
    paperId,
    promotionRequest(committedWithoutReceipt.approval, 'retry_ship'),
    'ship-authorizer-token',
  )
  assert.equal(resumed.status, 'idempotent')
  assert.equal(resumed.promotion.state, 'published')
  assert.equal(resumed.promotion.versionName, 'v1')
  const recoveredDb = committedWithoutReceipt.openDatabase({ readOnly: true })
  assert.equal(
    recoveredDb.prepare('SELECT COUNT(*) AS count FROM paper_asset_versions WHERE paper_id = ?')
      .get(paperId).count,
    1,
  )
  recoveredDb.close()
} finally {
  rmSync(committedWithoutReceipt.tempRoot, { recursive: true, force: true })
}

const committedJournal = makeOnlinePromotionContext('committed-journal')
try {
  const interrupted = createSinglePaperPromotionService({
    getStore: () => committedJournal.reviewStore,
    openDatabase: committedJournal.openDatabase,
    paperAssetsDir: committedJournal.paperAssetsDir,
    publish(input) {
      return publishUniversalNck1Import({ ...input, failurePoint: 'committed-reload' })
    },
  })
  assert.throws(
    () => interrupted.promote(
      paperId,
      promotionRequest(committedJournal.approval),
      'ship-authorizer-token',
    ),
    /Forced committed canonical reload failure/,
  )
  const journalPath = path.join(
    committedJournal.paperAssetsDir,
    paperId,
    '.latest-swap.json',
  )
  assert(existsSync(journalPath), 'committed publisher crash leaves its recovery journal')
  assert.equal(committedJournal.reviewStore.latestPromotion(paperId).state, 'publishing')
  const resumed = createSinglePaperPromotionService({
    getStore: () => committedJournal.reviewStore,
    openDatabase: committedJournal.openDatabase,
    paperAssetsDir: committedJournal.paperAssetsDir,
    publish() {
      throw new Error('publisher must not start after committed journal recovery')
    },
  }).promote(
    paperId,
    promotionRequest(committedJournal.approval, 'retry_ship'),
    'ship-authorizer-token',
  )
  assert.equal(resumed.status, 'idempotent')
  assert.equal(resumed.promotion.state, 'published')
  assert.equal(resumed.promotion.versionName, 'v1')
  assert(!existsSync(journalPath), 'exact retry finalizes the committed publisher journal')
  assert.equal(
    readdirSync(path.join(committedJournal.paperAssetsDir, paperId))
      .filter((name) => name.startsWith('.latest-')).length,
    0,
    'committed promotion recovery leaves no latest-swap residue',
  )
} finally {
  rmSync(committedJournal.tempRoot, { recursive: true, force: true })
}

const knownFailure = makeOnlinePromotionContext('known-failure')
try {
  const failed = createSinglePaperPromotionService({
    getStore: () => knownFailure.reviewStore,
    openDatabase: knownFailure.openDatabase,
    paperAssetsDir: knownFailure.paperAssetsDir,
    publish() {
      return {
        ok: false,
        status: 'validation_failed',
        validation: {
          blockingIssues: [{ code: 'SYNTHETIC_ADMISSION_FAILURE', message: 'synthetic known failure' }],
        },
      }
    },
  }).promote(
    paperId,
    promotionRequest(knownFailure.approval),
    'ship-authorizer-token',
  )
  assert.equal(failed.status, 'failed')
  assert.equal(failed.promotion.state, 'failed')
  assert.throws(
    () => knownFailure.reviewStore.beginPromotion(
      paperId,
      promotionRequest(knownFailure.approval),
      'ship-authorizer-token',
    ),
    (error) => error.code === 'IMPORT_REVIEW_PROMOTION_RETRY_REQUIRED',
  )
  const retried = createSinglePaperPromotionService({
    getStore: () => knownFailure.reviewStore,
    openDatabase: knownFailure.openDatabase,
    paperAssetsDir: knownFailure.paperAssetsDir,
  }).promote(
    paperId,
    promotionRequest(knownFailure.approval, 'retry_ship'),
    'ship-authorizer-token',
  )
  assert.equal(retried.status, 'published')
  assert.equal(retried.promotion.attemptCount, 2)
} finally {
  rmSync(knownFailure.tempRoot, { recursive: true, force: true })
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
  const sourceReviewRoot = fixture.reviewRoot
  const projection = buildNck1ReviewProjection(sourceReviewRoot)
  const producerBuildId = 'universal-publish-verifier'
  const files = reviewBundleFilePaths(sourceReviewRoot).map((file) => {
    const bytes = readFileSync(resolveReviewFile(sourceReviewRoot, file.path))
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
    const bytes = readFileSync(resolveReviewFile(sourceReviewRoot, file.path))
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
      paperId: cliPaperId,
      reviewKind: 'candidate',
      state: 'approved',
      finalizedAt: '2026-08-28T00:00:00.000Z',
      bundleDigest,
      manifest: { ...manifestBase, bundleDigest },
    },
    files,
    approval,
  }
  let hydrateFailure = null
  reviewServer = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    if (request.headers.authorization !== 'Bearer verifier-token') {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'not found' }))
      return
    }
    if (
      request.method === 'GET'
      && url.pathname === `/api/import-agent-reviews/papers/${encodeURIComponent(cliPaperId)}`
    ) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(status))
      return
    }
    if (
      request.method === 'GET'
      && url.pathname
        === `/api/import-review-preview/revisions/${encodeURIComponent(approval.revisionId)}/files`
    ) {
      const relativePath = url.searchParams.get('path') || ''
      const file = files.find((candidate) => candidate.path === relativePath)
      if (!file || hydrateFailure === 'missing') {
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'not found' }))
        return
      }
      const bytes = readFileSync(resolveReviewFile(sourceReviewRoot, file.path))
      const body = hydrateFailure === 'changed'
        ? Buffer.concat([bytes, Buffer.from('changed')])
        : bytes
      response.writeHead(200, {
        'content-length': body.byteLength,
        'content-type': file.mediaType,
      })
      response.end(body)
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
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
  const hydrateTemps = () => readdirSync(path.dirname(cliPaperDir))
    .filter((name) => name.startsWith('.hydrate-'))
    .sort()
  const hydrateTempsBefore = hydrateTemps()
  hydrateFailure = 'missing'
  await assert.rejects(
    runReviewCommand(['hydrate', cliPaperId], commandEnv),
    /404.*not found/,
  )
  assert(!existsSync(cliPaperDir), 'missing Review bytes do not create a local workspace')
  assert.deepEqual(hydrateTemps(), hydrateTempsBefore, 'failed hydration cleans its temp workspace')
  hydrateFailure = 'changed'
  await assert.rejects(
    runReviewCommand(['hydrate', cliPaperId], commandEnv),
    /Hydrated Review file changed in transit/,
  )
  assert(!existsSync(cliPaperDir), 'changed Review bytes do not create a local workspace')
  assert.deepEqual(hydrateTemps(), hydrateTempsBefore, 'drifted hydration cleans its temp workspace')
  hydrateFailure = null
  const hydrated = await runReviewCommand(['hydrate', cliPaperId], commandEnv)
  assert.equal(JSON.parse(hydrated.stdout).state, 'hydrated')
  assert.equal(buildNck1ReviewProjection(cliPaperDir).candidateDigest, projection.candidateDigest)
  const paginationOutput = path.join(cliTempRoot, 'pagination-qa')
  const paginationArgs = ['pagination-qa', cliPaperId, '--edition', 'friendly8', '--output', paginationOutput]
  const automatic = JSON.parse((await runReviewCommand([...paginationArgs, '--auto', '--save-plan'], commandEnv)).stdout)
  assert.equal(automatic.pageCount, 8)
  assert.equal(automatic.screenshots.length, 8)
  for (const file of automatic.screenshots) assert(existsSync(path.join(paginationOutput, file)), 'every reported raster path exists')
  const planPath = path.join(cliPaperDir, 'pagination-plan.json')
  const savedPlan = readFileSync(planPath)
  const replayed = JSON.parse((await runReviewCommand(paginationArgs, commandEnv)).stdout)
  assert.equal(replayed.mode, 'explicit')
  assert.equal(replayed.searchedCandidates, 1)
  assert.deepEqual(replayed.groups, automatic.groups, 'saved plan must reproduce the same group pagination')
  assert.deepEqual(replayed.selectedPlan, automatic.selectedPlan)
  await assert.rejects(() => runReviewCommand([...paginationArgs, '--break-slots', '', '--save-plan'], commandEnv), /Diagnostic report:/)
  const failureReport = JSON.parse(readFileSync(path.join(paginationOutput, 'failure-report.json'), 'utf8'))
  assert.equal(failureReport.status, 'failure')
  assert.equal(failureReport.planSaved, false)
  assert.equal(failureReport.targetPages, 8)
  assert.notEqual(failureReport.actualPages, 8)
  assert(failureReport.groups.every((group) => group.slotId))
  assert(existsSync(path.join(paginationOutput, failureReport.artifacts.pdf)))
  for (const file of failureReport.artifacts.screenshots) assert(existsSync(path.join(paginationOutput, file)))
  assert.deepEqual(readFileSync(planPath), savedPlan, 'a failed edit must not replace a working plan')
  rmSync(planPath)
  assert.equal(buildNck1ReviewProjection(cliPaperDir).candidateDigest, projection.candidateDigest, 'pagination QA leaves source and Candidate unchanged')
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
