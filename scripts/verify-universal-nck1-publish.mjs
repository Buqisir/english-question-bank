#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  createImportReviewStore,
  externalListeningReviewProofIdentity,
  reviewBundleDigest,
} from '../server/import-review/importReviewStore.mjs'
import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import { reviewPrintHtml } from '../server/import-review/reviewPagination.mjs'
import { createSinglePaperPromotionService } from '../server/import-review/singlePaperPromotion.mjs'
import { NCK1_STAGED_ANALYSIS_FILES } from '../server/import-review/nck1AnalysisProjection.mjs'
import {
  buildNck1AnalyzedPackageReviewSourceManifest,
  buildNck1ReviewProjection,
  buildNck1ReviewConsumption,
  loadNck1ReviewSource,
  reviewBundleFilePaths,
  resolveReviewFile,
} from '../server/import-review/revisionProjection.mjs'
import { loadCanonicalImportRequest } from '../server/paper-canonical/importRequest.mjs'
import { materializeNck1CanonicalRequest } from '../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import {
  publishUniversalNck1Import,
  recoverInterruptedPaperImportPublish,
  rollbackPaperImportPublication,
} from '../server/paper-import/publisher.mjs'
import { prepareSourceReferences, SOURCE_REFERENCES_FILE } from '../server/paper-import/sourceReferences.mjs'
import { readSourceReferencePublication } from '../server/paper-import/sourceReferencePublication.mjs'
import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import { sendPaperAssetStatic } from '../server/paper-import/paperAssetStatic.mjs'
import { assertListeningAudioManifest, assertListeningAudioSource, LISTENING_AUDIO_PATHS } from '../server/paper-import/listeningAudioEvidence.mjs'
import { prepareNck1AnalyzedPackageReview } from '../server/paper-import/analyzedPackage.mjs'
import { loadAnalyzedPackageFiles } from '../server/paper-import/analyzedPackage.mjs'
import {
  compareAnalyzedPackageSemantics,
  convertRepresentableNck1ReviewSourceToAnalyzedPackageFiles,
  exportAnalyzedPackageRevision,
} from '../server/paper-import/analyzedPackageExport.mjs'
import { readAnalyzedPackageArchive } from '../server/source-intake/analyzedPackageArchive.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { buildCompanionAnalysisHtml } from '../server/exports/companionAnalysisRenderer.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import { assertPaperFonts } from './lib/assert-paper-fonts.mjs'
import { assertSharedPaperLayout } from './lib/assert-shared-paper-layout.mjs'
import { readJsonRouteBody, runRoutes } from '../server/router/index.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { consumerContractRefs, resolveConsumerPresentation } from '../shared/paper-canonical/consumers.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../shared/paper-canonical/compiler.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import { nck1OcrSourceSetDigest } from '../server/paper-import/nck1OcrSourceEvidence.mjs'
import {
  nck1MaterializationCandidateAuthorityRef,
  nck1MaterializationHistoricalAuthorityRef58,
  nck1MaterializationHistoricalAuthorityRef66,
  resolveCanonicalAuthority,
} from '../shared/paper-canonical/authority.mjs'
import { canonicalConsumptionPrintPayload } from './import-pipeline/canonical-consumption-print-payload.mjs'
import {
  finalizeListeningAudio,
  stageListeningAudio,
} from './import-pipeline/listening-audio.mjs'
import { LISTENING_WAVEFORM_FILE, PUBLISHED_LISTENING_WAVEFORM_FILE } from '../shared/paper-canonical/listeningWaveform.mjs'
import { makeFixture } from './verify-nck1-source-materialization.mjs'
import { buildObjectiveTeachingFixture } from './lib/objective-teaching-fixture.mjs'
import { enumerateParagraphSummaryTargets } from '../server/paper-import-ai/paragraphSummaries.mjs'
import {
  finalizePublicSearchMetadata,
  preparePublicSearchMetadataRequest,
} from '../server/paper-import-ai/publicSearchMetadata.mjs'

const root = path.resolve(import.meta.dirname, '..')
const paperId = 'paper-mock-contract-2026-m1'
const officialApplicationSample = 'Official application sample from the supplied answer source.'
const officialContinuationSample = 'Official continuation sample from the supplied answer source.'

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function publicMetadataFixture(materialization, sourceDigest, candidateDigest) {
  const binding = { materialization, sourceDigest, candidateDigest }
  const prepared = preparePublicSearchMetadataRequest(binding)
  const groups = prepared.sourceGroups.map((group) => {
    let metadata
    if (group.family === 'reading') metadata = { slot: group.slotId.split('.')[1].toUpperCase(), questions: group.questions.map(({ questionId }) => ({ questionId, similarityProfile: { family: 'detail', subtype: 'general-detail', detailScope: 'single', technique: null } })) }
    if (group.family === 'seven-choices') metadata = { questions: group.questions.map(({ questionId }) => ({ questionId, positionFacet: 'seven-choices.position.paragraph-middle', roleFacet: 'seven-choices.role.cohesion', primaryMechanismFacet: 'seven-choices.cohesion.grammatical.logical-connector' })) }
    if (group.family === 'cloze') metadata = { questions: group.questions.map(({ questionId }) => ({ questionId, pos: 'verb', signatureFacet: 'cloze.signature.verb.action-sequence' })) }
    if (group.family === 'grammar-fill') metadata = { questions: group.questions.map(({ questionId, prompt }) => ({ questionId, facetKey: prompt ? 'grammar-fill.given.verb.finite' : 'grammar-fill.no-hint.article', role: null, similarityProfile: { route: prompt ? 'present-stable-description' : 'the-anaphoric', features: [] }, contextParagraphIds: prepared.deterministic.find((item) => item.groupId === group.groupId).paragraphIds })) }
    if (group.family === 'application-writing') metadata = { writingTaskId: `writing-task:${group.groupId}`, form: 'email', function: 'communicate' }
    if (group.family === 'continuation-writing') metadata = { writingTaskId: `writing-task:${group.groupId}`, situation: 'A situation develops.', conflict: 'A problem is resolved.', relationships: [] }
    return { groupId: group.groupId, family: group.family, topicLabels: ['人与社会-社会服务与人际沟通-合作'], genre: '记叙', metadata }
  })
  return finalizePublicSearchMetadata({ authored: { groups }, ...binding })
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
    schemaVersion: 'continuation-analysis-v2',
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
    developmentPlan: {
      selectedRoute: 'Develop the source problem into a coherent resolution.',
      routeRationale: [firstStarter, secondStarter],
      paragraphs: [
        {
          paragraphIndex: 1,
          cause: 'The source problem remains unresolved.',
          action: 'The protagonist continues from the first starter.',
          result: 'The unresolved situation moves toward progress.',
          sourceEvidence: [evidence('paragraph1Starter', 'Paragraph one starter.')],
          cluePayoffs: [],
          bridge: 'Reach the second supplied starter.',
          emotionChanges: [],
          relationshipChanges: [],
          languageReminder: 'Preserve the concise source perspective and simple past.',
        },
        {
          paragraphIndex: 2,
          cause: 'The first paragraph reaches the second starter.',
          action: 'The protagonist completes the response.',
          result: 'The source problem is resolved without contradiction.',
          sourceEvidence: [evidence('paragraph2Starter', 'Paragraph two starter.')],
          cluePayoffs: [{
            clue: evidence('material', 'Story material'),
            payoff: 'The source situation receives a coherent resolution.',
          }],
          ending: 'Close without a new unresolved event.',
          emotionChanges: [],
          relationshipChanges: [],
        },
      ],
      qualityRisks: ['Skipping a supplied starter'],
    },
  }
}

export function objectiveFixtureGroup(group, answerByQuestionId) {
  const questionNoByBlankId = new Map(group.questions
    .filter(({ blankId }) => blankId)
    .map(({ blankId, canonicalNumber }) => [blankId, canonicalNumber]))
  const paragraphs = group.blocks
    .filter(({ kind }) => kind === 'paragraph')
    .map((block) => {
      let text = ''
      for (const [index, item] of block.content.entries()) {
        if (item.kind === 'text') {
          text += item.text
          continue
        }
        const marker = `__${questionNoByBlankId.get(item.blankId)}__`
        if (group.family !== 'grammar-fill') {
          text += marker
          continue
        }
        const next = block.content[index + 1]
        const prefix = /[\p{L}\p{N}]$/u.test(text) ? ' ' : ''
        const suffix = next?.kind === 'text' && /^[\p{L}\p{N}(]/u.test(next.text) ? ' ' : ''
        text += `${prefix}${marker}${suffix}`
      }
      return { id: block.blockId, text }
    })
  return {
    groupId: group.groupId,
    paragraphs,
    questions: group.questions.map((question) => ({
      id: question.questionId,
      stem: String(question.canonicalNumber),
      answerKey: answerByQuestionId.get(question.questionId),
      blankId: question.blankId,
      prompt: question.prompt,
      options: Object.fromEntries(question.options.map(({ label, text }) => [label, text])),
    })),
    optionBank: group.optionBank,
  }
}

export function writeStagedAnalyses(reviewRoot, materialization) {
  const bySlot = new Map(materialization.groups.map((group) => [group.slotId, group]))
  const answerByQuestionId = new Map(materialization.answers.map(({ questionId, value }) => [questionId, value]))
  for (const letter of ['a', 'b', 'c', 'd']) {
    const group = bySlot.get(`reading.${letter}`)
    const teaching = buildObjectiveTeachingFixture(objectiveFixtureGroup(group, answerByQuestionId))
    writeJson(path.join(reviewRoot, `analysis-reading-${letter}.json`), {
      schemaVersion: 'reading-choice-analysis-v1',
      paperId: materialization.paperId,
      sourceAssetVersion: 1,
      targetGroups: [group.groupId],
      groups: {
        [group.groupId]: {
          overview: `Reading ${letter.toUpperCase()} analysis`,
          ...teaching,
        },
      },
      questions: Object.fromEntries(group.questions.map((question) => [question.questionId, {
        skill: { primary: 'detail' },
        questionFocus: 'Locate the decisive detail.',
        stemTranslationZh: '题干翻译',
        optionAnalysis: question.options.map((option) => ({
          label: option.label,
          optionTranslationZh: `选项 ${option.label}`,
          status: option.label === answerByQuestionId.get(question.questionId) ? 'correct' : 'wrong',
          evidence: [],
          ...(option.label === answerByQuestionId.get(question.questionId)
            ? {}
            : { trap: { explanation: `选项 ${option.label} 与原文关键信息不符。` } }),
        })),
        locationParaphrases: [],
      }])),
    })
  }

  const seven = bySlot.get('seven-choices')
  const sevenTeaching = buildObjectiveTeachingFixture(objectiveFixtureGroup(seven, answerByQuestionId))
  writeJson(path.join(reviewRoot, 'analysis-seven.json'), {
    schemaVersion: 'seven-choices-analysis-v1',
    paperId: materialization.paperId,
    sourceAssetVersion: 1,
    targetGroups: [seven.groupId],
    groups: {
      [seven.groupId]: {
        overview: 'Seven choices analysis',
        ...sevenTeaching,
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
      optionFit: { correctOptionLabel: answerByQuestionId.get(question.questionId), fitSummary: 'The option resumes the preceding reference and introduces the following example.' },
    }])),
  })

  const cloze = bySlot.get('cloze')
  const clozeTeaching = buildObjectiveTeachingFixture(objectiveFixtureGroup(cloze, answerByQuestionId))
  writeJson(path.join(reviewRoot, 'analysis-cloze.json'), {
    schemaVersion: 'cloze-analysis-v1',
    paperId: materialization.paperId,
    sourceAssetVersion: 1,
    targetGroups: [cloze.groupId],
    groups: {
      [cloze.groupId]: {
        overview: 'Cloze analysis',
        ...clozeTeaching,
      },
    },
    blanks: Object.fromEntries(cloze.questions.map((question) => [question.questionId, {
      blankId: question.blankId,
      blankNo: question.canonicalNumber,
      pos: 'other',
      correctFit: { optionLabel: answerByQuestionId.get(question.questionId), reason: 'Fits the official answer.' },
      distractorGlosses: ['A', 'B', 'C', 'D'].filter((optionLabel) =>
        optionLabel !== answerByQuestionId.get(question.questionId)).map((optionLabel) => ({
        optionLabel,
        gloss: `Why ${optionLabel} does not fit.`,
      })),
      evidence: [{
        type: 'collocation-partner',
        signalText: 'cloze source text',
        signalSide: 'context-before',
      }],
    }])),
  })

  const grammar = bySlot.get('grammar-fill')
  const grammarTeaching = buildObjectiveTeachingFixture(objectiveFixtureGroup(grammar, answerByQuestionId))
  let hasFiniteVerbFixture = false
  writeJson(path.join(reviewRoot, 'analysis-grammar.json'), {
    schemaVersion: 'grammar-fill-analysis-v2',
    paperId: materialization.paperId,
    sourceAssetVersion: 1,
    targetGroups: [grammar.groupId],
    groups: {
      [grammar.groupId]: {
        overview: 'Grammar fill analysis',
        ...grammarTeaching,
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
        answer: answerByQuestionId.get(question.questionId),
        reason: 'The sentence structure determines the form.',
        evidence: [{ type: 'clause-frame', signalText: 'grammar-fill source text' }],
      }]
    })),
  })

  writeJson(path.join(reviewRoot, 'analysis-application.json'), {
    taskType: 'application',
    modelAnswer: Array.from({ length: 70 }, (_, index) => `word${index + 1}`).join(' '),
    reviewCard: {
      schemaVersion: 'application-review-card-v2',
      form: 'Email',
      topic: 'Topic',
      purpose: 'Share practical information',
      person: 'First person',
      tense: 'Simple present',
      points: ['Explain the topic', 'Offer details'],
      reader: 'Chris',
      relationship: 'A friend',
      readerNeeds: 'Clear and useful details',
      value: 'Practical guidance',
    },
  })
  writeJson(path.join(reviewRoot, 'analysis-continuation.json'), {
    taskType: 'continuation',
    modelAnswer: Array.from({ length: 130 }, (_, index) => `story${index + 1}`).join(' '),
    continuationAnalysis: continuationAnalysis(),
  })
  if (materialization.listening.state === 'captured') {
    const answerByNumber = new Map(materialization.listening.answers.map(({ canonicalNumber, value }) => [canonicalNumber, value]))
    const materials = Object.fromEntries(materialization.listening.transcript.map((segment) => [segment.segmentId, {
      segmentId: segment.segmentId,
      questionIds: segment.questionNumbers.map((number) => `question:listening:${number}`),
      transcript: segment.text,
      translationZh: '这是与听力原文逐段对应的完整中文翻译。',
      topic: { theme: '人与社会', themeGroup: '社会服务与人际沟通', subtopic: '社会交往' },
      summaryZh: '说话者围绕日常事项交换信息并明确后续安排和行动计划',
    }]))
    writeJson(path.join(reviewRoot, 'analysis-listening.json'), {
      schemaVersion: 'listening-analysis-v1',
      paperId: materialization.paperId,
      sourceAssetVersion: 1,
      materials,
      questions: Object.fromEntries(materialization.listening.transcript.flatMap((segment) =>
        segment.questionNumbers.map((number) => [`question:listening:${number}`, {
          questionId: `question:listening:${number}`,
          segmentId: segment.segmentId,
          stemTranslationZh: `第 ${number} 题题干翻译`,
          optionTranslationsZh: { A: '选项甲', B: '选项乙', C: '选项丙' },
          officialAnswer: answerByNumber.get(number),
          evidence: { quote: segment.text },
          reasonZh: '原话直接给出关键信息，题干只是换了一种表达，因此选择官方答案。',
        }]))),
    })
  }
}

export function makeReviewRoot(
  parentDir,
  fixturePaperId = paperId,
  questionSourceLabel = 'deterministic NCK1 question source',
  { listening = false, sourceType = '自编题' } = {},
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
  if (listening) {
    materialization.listening.transcript[0].text =
      'Where will you meet your sister tomorrow morning? I will meet her beside the central library before lunch.'
    materialization.listening.questions[5].options[2].text =
      'Ask the librarian for information about the new community reading programme.'
  }
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
      sourceType,
      region: 'Fixture',
      year: 2026,
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
    const contentReviewPath = path.join(parentDir, 'listening-review.json')
    const transcript = `Text one. ${materialization.listening.transcript[0].text} Text two. Unchecked later content.`
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
    writeJson(contentReviewPath, {
      schemaVersion: 'listening-audio-content-review-v1',
      paperId: fixturePaperId,
      reviewedBy: 'import_agent',
      reviewedAt: '2026-09-02T00:00:00.000Z',
      reviewedTranscriptSha256: staged.asrSha256,
      untrustedContentHandledAsData: true,
      verdict: 'pass',
      scope: staged.scope,
      summary: 'Opening fixture sample reviewed as untrusted content; later audio unchecked.',
      flaggedRanges: [],
    })
    finalizeListeningAudio({
      paperDir: reviewRoot,
      paperId: fixturePaperId,
      reviewPath: contentReviewPath,
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

function convertToAnalyzedPackageReviewSource(reviewRoot) {
  const rawManifest = JSON.parse(readFileSync(
    path.join(reviewRoot, 'universal-source-manifest.json'),
    'utf8',
  ))
  const content = JSON.parse(readFileSync(
    path.join(reviewRoot, rawManifest.materializationPath),
    'utf8',
  ))
  delete content.documents
  delete content.sourceCoverage
  content.schemaVersion = 'nck1-analyzed-package-content-v1'
  if (content.listening.state === 'not_supplied') {
    content.listening.evidence = {
      kind: 'package_declares_no_listening_content',
      documentId: 'content',
    }
  }
  const continuation = content.groups.find((group) => group.slotId === 'writing.continuation')
  const oldPrompt = continuation.writingTask.prompt
  const registeredPrompt = resolveCanonicalAuthority(
    nck1MaterializationCandidateAuthorityRef,
  ).closure.profiles.get('nck1').instructions['writing.continuation.prompt'].text
  continuation.writingTask.prompt = registeredPrompt
  continuation.blocks.find((block) =>
    block.content?.some((item) => item.text === oldPrompt)).content[0].text = registeredPrompt
  const pointerEscape = (value) => value.replaceAll('~', '~0').replaceAll('/', '~1')
  function replaceLocators(value, pointer = '') {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach((item, index) => replaceLocators(item, `${pointer}/${index}`))
      return
    }
    for (const [key, child] of Object.entries(value)) {
      if (['page_region', 'docx_part'].includes(child?.kind)) {
        value[key] = { kind: 'package_json_pointer', documentId: 'content', pointer }
      } else replaceLocators(child, `${pointer}/${pointerEscape(key)}`)
    }
  }
  replaceLocators(content)
  const contentBytes = new TextEncoder().encode(JSON.stringify(content))
  const members = [{
    memberId: 'content', role: 'content', mediaType: 'application/json',
    path: 'analyzed-package/content.json', bytes: contentBytes,
  }, ...NCK1_STAGED_ANALYSIS_FILES.map((descriptor) => ({
    memberId: descriptor.key,
    role: 'analysis',
    mediaType: 'application/json',
    path: descriptor.path,
    bytes: new Uint8Array(readFileSync(path.join(reviewRoot, descriptor.path))),
  }))]
  if (content.listening.state === 'captured') {
    const audio = rawManifest.attachments.find(({ role }) => role === 'listening_audio_original')
    members.push({
      memberId: 'listening-audio',
      role: 'audio',
      mediaType: 'audio/mpeg',
      path: 'analyzed-package/listening-audio.mp3',
      bytes: new Uint8Array(readFileSync(path.join(reviewRoot, audio.path))),
    })
  }
  const packageManifestBytes = new TextEncoder().encode(JSON.stringify({
    schemaVersion: 'nck1-analyzed-package-v1',
    paperId: content.paperId,
    profileId: 'nck1',
    contentMemberId: 'content',
    members: members.map((member) => ({
      memberId: member.memberId,
      role: member.role,
      mediaType: member.mediaType,
      sha256: sha256(member.bytes),
      byteLength: member.bytes.byteLength,
    })),
  }))
  const packageManifestPath = 'analyzed-package/manifest.json'
  mkdirSync(path.join(reviewRoot, 'analyzed-package'), { recursive: true })
  writeFileSync(path.join(reviewRoot, packageManifestPath), packageManifestBytes)
  writeFileSync(path.join(reviewRoot, members[0].path), contentBytes)
  const audioMember = members.find(({ role }) => role === 'audio')
  if (audioMember) writeFileSync(path.join(reviewRoot, audioMember.path), audioMember.bytes)
  writeJson(
    path.join(reviewRoot, 'universal-source-manifest.json'),
    buildNck1AnalyzedPackageReviewSourceManifest({
      paperId: content.paperId,
      manifestPath: packageManifestPath,
      manifestBytes: packageManifestBytes,
      members,
    }),
  )
  rmSync(path.join(reviewRoot, 'source'), { recursive: true, force: true })
  rmSync(path.join(reviewRoot, 'materialization'), { recursive: true, force: true })
}

export function makeExternalAnalyzedPackage(reviewRoot, packageRoot) {
  const rawManifest = JSON.parse(readFileSync(
    path.join(reviewRoot, 'universal-source-manifest.json'),
    'utf8',
  ))
  const content = JSON.parse(readFileSync(
    path.join(reviewRoot, rawManifest.materializationPath),
    'utf8',
  ))
  delete content.documents
  delete content.sourceCoverage
  content.schemaVersion = 'nck1-analyzed-package-content-v1'
  if (content.listening.state === 'not_supplied') {
    content.listening.evidence = {
      kind: 'package_declares_no_listening_content',
      documentId: 'content',
    }
  }
  const continuation = content.groups.find((group) => group.slotId === 'writing.continuation')
  const oldPrompt = continuation.writingTask.prompt
  const registeredPrompt = resolveCanonicalAuthority(
    nck1MaterializationCandidateAuthorityRef,
  ).closure.profiles.get('nck1').instructions['writing.continuation.prompt'].text
  continuation.writingTask.prompt = registeredPrompt
  continuation.blocks.find((block) =>
    block.content?.some((item) => item.text === oldPrompt)).content[0].text = registeredPrompt
  const pointerEscape = (value) => value.replaceAll('~', '~0').replaceAll('/', '~1')
  function replaceLocators(value, pointer = '') {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach((item, index) => replaceLocators(item, `${pointer}/${index}`))
      return
    }
    for (const [key, child] of Object.entries(value)) {
      if (['page_region', 'docx_part'].includes(child?.kind)) {
        value[key] = { kind: 'package_json_pointer', documentId: 'content', pointer }
      } else replaceLocators(child, `${pointer}/${pointerEscape(key)}`)
    }
  }
  replaceLocators(content)
  const officialAnswers = {
    answers: content.answers.map(({ questionId, canonicalNumber, value }) => ({
      questionId, canonicalNumber, value,
    })),
    ...(content.listening.state === 'captured' ? {
      listeningAnswers: content.listening.answers.map(({ canonicalNumber, value }) => ({
        canonicalNumber, value,
      })),
    } : {}),
  }
  content.answers.forEach((answer, index) => {
    answer.authority = {
      kind: 'package_json_pointer',
      documentId: 'official-answers',
      pointer: `/answers/${index}`,
    }
  })
  if (content.listening.state === 'captured') {
    content.listening.answers.forEach((answer, index) => {
      answer.authority = {
        kind: 'package_json_pointer',
        documentId: 'official-answers',
        pointer: `/listeningAnswers/${index}`,
      }
    })
  }
  const files = [{
    memberId: 'content', path: 'content.json', role: 'content', mediaType: 'application/json',
  }, {
    memberId: 'official-answers', path: 'official-answers.json', role: 'official_answers', mediaType: 'application/json',
  }, ...NCK1_STAGED_ANALYSIS_FILES.map((descriptor) => ({
    memberId: `analysis-${descriptor.key}`,
    path: descriptor.path,
    role: 'analysis',
    mediaType: 'application/json',
    analysisKey: descriptor.key,
  })), ...(content.listening.state === 'captured' ? [{
    memberId: 'analysis-listening', path: 'analysis-listening.json', role: 'analysis',
    mediaType: 'application/json', analysisKey: 'listening-unit',
  }, {
    memberId: 'listening-audio', path: 'listening.mp3', role: 'audio', mediaType: 'audio/mpeg',
  }] : [])]
  mkdirSync(packageRoot, { recursive: true })
  writeJson(path.join(packageRoot, 'content.json'), content)
  writeJson(path.join(packageRoot, 'official-answers.json'), officialAnswers)
  for (const descriptor of NCK1_STAGED_ANALYSIS_FILES) {
    writeFileSync(
      path.join(packageRoot, descriptor.path),
      readFileSync(path.join(reviewRoot, descriptor.path)),
    )
  }
  if (content.listening.state === 'captured') {
    writeFileSync(
      path.join(packageRoot, 'analysis-listening.json'),
      readFileSync(path.join(reviewRoot, 'analysis-listening.json')),
    )
    const audio = rawManifest.attachments.find(({ role }) => role === 'listening_audio_original')
    writeFileSync(path.join(packageRoot, 'listening.mp3'), readFileSync(path.join(reviewRoot, audio.path)))
  }
  writeJson(path.join(packageRoot, 'package.json'), {
    schemaVersion: 'eqb-analyzed-package-v1',
    paperId: content.paperId,
    profileId: 'nck1',
    paperName: 'Original-free complete analyzed package fixture',
    metadata: { year: 2026, region: 'Fixture', sourceType: '模拟题' },
    sources: [{
      sourceId: 'question-transcription', role: 'question_source', memberId: 'content',
      description: 'Externally supplied complete question transcription', suppliedBy: 'fixture producer',
    }, {
      sourceId: 'official-answer-transcription', role: 'official_answers', memberId: 'official-answers',
      description: 'Externally supplied official answer transcription', suppliedBy: 'fixture producer',
    }],
    files,
  })
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

// A stored v58 Review must be rederived under its original Candidate authority,
// while the existing consumer presentation stays unchanged for both versions.
{
  const root = mkdtempSync(path.join(tmpdir(), 'eqb-review-v58-replay-'))
  try {
    const { reviewRoot } = makeReviewRoot(root)
    const loaded = loadNck1ReviewSource(reviewRoot)
    const previous = importCanonicalCandidate(loaded.sourceInput, undefined, {
      materializationAuthorityRef: nck1MaterializationHistoricalAuthorityRef58,
    })
    assert.deepEqual(previous.issues, [])
    const replayed = buildNck1ReviewProjection(reviewRoot, {
      expectedCandidateDigest: previous.candidate.candidateDigest,
    })
    const current = buildNck1ReviewProjection(reviewRoot)
    assert.equal(replayed.candidateDigest, previous.candidate.candidateDigest)
    assert.equal(replayed.consumption.authorityRef.manifestVersion, '58')
    assert.equal(replayed.consumption.consumerContractRef.version, '47')
    assert.equal(current.consumption.authorityRef.manifestVersion, '67')
    assert.equal(current.consumption.consumerContractRef.version, '47')
    const readingId = replayed.consumption.selections
      .find((selection) => selection.familyContractId === 'reading').groupIds[0]
    for (const [projection, expectedRuleset] of [
      [replayed, 'abcd-option-layout-v1'],
      [current, 'abcd-option-layout-v2'],
    ]) {
      assert.equal(resolveConsumerPresentation(projection.consumption.consumerContractRef).policy.version, '3')
      const rendered = projectCanonicalConsumerGroup({
        consumption: projection.consumption,
        familyContractId: 'reading',
        groupId: readingId,
      })
      assert.equal(rendered.questions[0].layoutPlan.rulesetRef.id, expectedRuleset)
    }
    const materialization = JSON.parse(new TextDecoder().decode(loaded.sourceInput.materializationBytes))
    const reading = materialization.groups.find((group) => group.slotId === 'reading.a')
    const texts = [
      ['W'.repeat(19), 'W'.repeat(19), 'W'.repeat(19), 'W'.repeat(20)],
      ['short', 'W'.repeat(19), 'short', 'W'.repeat(20)],
      ['short', 'W'.repeat(21), 'short', 'W'.repeat(21)],
    ]
    reading.questions.forEach((question, index) => question.options.forEach((option, optionIndex) => {
      option.text = texts[index][optionIndex]
    }))
    const alignedCandidate = importCanonicalCandidate({
      ...loaded.sourceInput,
      materializationBytes: new TextEncoder().encode(JSON.stringify(materialization)),
    })
    assert.deepEqual(alignedCandidate.issues, [])
    const alignedPreview = compileNck1MaterializationCandidatePreview(alignedCandidate.candidate)
    assert(alignedPreview.compilation)
    const alignedConsumption = buildNck1ReviewConsumption(alignedPreview.candidate, alignedPreview.compilation)
    const alignedScreen = projectCanonicalConsumerGroup({
      consumption: alignedConsumption, familyContractId: 'reading', groupId: readingId,
    })
    const alignedPrint = projectCanonicalConsumerGroup({
      consumption: { ...alignedConsumption, consumerContractRef: consumerContractRefs.print_pdf },
      familyContractId: 'reading', groupId: readingId,
    })
    assert.deepEqual(alignedScreen.questions.map((question) => question.layoutPlan.mode),
      ['two_by_two', 'two_by_two', 'one_column'])
    assert.deepEqual(alignedScreen.questions.slice(0, 2).map((question) =>
      question.layoutPlan.placements[1].startTwip), [4464, 4464])
    assert.deepEqual(alignedScreen.questions.map((question) => question.placementSignature),
      alignedPrint.questions.map((question) => question.placementSignature))
    assert.throws(() => buildNck1ReviewProjection(reviewRoot, {
      expectedCandidateDigest: `sha256:${'0'.repeat(64)}`,
    }), /Stored Candidate does not match a retained authority/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function approvedIdentity(projection) {
  return {
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    ...(projection.importProfile
      ? {
          importProfile: projection.importProfile,
          paragraphSummariesDigest: projection.paragraphSummariesDigest,
          publicSearchMetadataDigest: projection.publicSearchMetadataDigest,
          ...(projection.analysisDigest ? { analysisDigest: projection.analysisDigest } : {}),
        }
      : { analysisDigest: projection.analysisDigest }),
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
    schemaVersion: projection.importProfile
      ? 'web-import-review-bundle-v2'
      : 'web-import-review-bundle-v1',
    paperId: projection.paperId,
    paperName: projection.paperName,
    sourceDigest: projection.sourceDigest,
    candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest,
    ...(projection.importProfile
      ? {
          importProfile: projection.importProfile,
          paragraphSummariesDigest: projection.paragraphSummariesDigest,
          publicSearchMetadataDigest: projection.publicSearchMetadataDigest,
          ...(projection.analysisDigest ? { analysisDigest: projection.analysisDigest } : {}),
        }
      : { analysisDigest: projection.analysisDigest }),
    producerBuildId: 'single-paper-promotion-verifier',
    files,
    resolvesIssueIds: [],
  }
  return { ...manifest, bundleDigest: reviewBundleDigest(manifest) }
}

function makeOnlinePromotionContext(
  label,
  fixturePaperId = paperId,
  paginationBreaks = null,
  {
    listening = false,
    analyzedPackage = false,
    publicPaper = false,
    preservePublicAnalyses = false,
    retainedAuthorityRef = null,
  } = {},
) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), `eqb-single-paper-promotion-${label}-`))
  const fixture = makeReviewRoot(tempRoot, fixturePaperId, undefined, { listening })
  if (retainedAuthorityRef) {
    const retained = importCanonicalCandidate(loadNck1ReviewSource(fixture.reviewRoot).sourceInput, undefined,
      { materializationAuthorityRef: retainedAuthorityRef })
    assert.deepEqual(retained.issues, [])
    fixture.projection = buildNck1ReviewProjection(fixture.reviewRoot, {
      requireAnalyses: true, expectedCandidateDigest: retained.candidate.candidateDigest,
    })
  }
  if (analyzedPackage) {
    convertToAnalyzedPackageReviewSource(fixture.reviewRoot)
    fixture.projection = buildNck1ReviewProjection(fixture.reviewRoot, { requireAnalyses: true })
  }
  if (publicPaper) {
    const configPath = path.join(fixture.reviewRoot, 'config.json')
    writeJson(configPath, {
      ...JSON.parse(readFileSync(configPath, 'utf8')),
      importProfile: 'public-paper-v1',
    })
    if (!preservePublicAnalyses) {
      for (const name of readdirSync(fixture.reviewRoot)) {
        if (name.startsWith('analysis-') && name.endsWith('.json')) {
          rmSync(path.join(fixture.reviewRoot, name))
        }
      }
    }
    const targets = enumerateParagraphSummaryTargets(fixture.projection.materialization)
    writeJson(path.join(fixture.reviewRoot, 'paragraph-summaries-v1.json'), {
      schemaVersion: 'paragraph-summaries-v1',
      paperId: fixturePaperId,
      sourceDigest: fixture.projection.sourceDigest,
      candidateDigest: fixture.projection.candidateDigest,
      groups: [...Map.groupBy(targets, ({ groupId }) => groupId)].map(([groupId, values]) => ({
        groupId,
        paragraphs: values.map(({ paragraphId }) => ({ paragraphId, summary: `摘要 ${paragraphId}` })),
      })),
    })
    writeJson(
      path.join(fixture.reviewRoot, 'public-search-metadata-v1.json'),
      publicMetadataFixture(
        fixture.projection.materialization,
        fixture.projection.sourceDigest,
        fixture.projection.candidateDigest,
      ),
    )
    fixture.projection = buildNck1ReviewProjection(fixture.reviewRoot, {
      requireAnalyses: true, expectedCandidateDigest: fixture.projection.candidateDigest,
    })
  }
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
  if (fixture.projection.importProfile) {
    for (const [label, approvalScope] of [['omitted', undefined], ['mismatched', 'full_content']]) {
      assert.throws(
        () => reviewStore.approveRevision(
          fixturePaperId,
          revision.id,
          { bundleDigest: revision.bundleDigest, ...(approvalScope ? { approvalScope } : {}) },
          'synthetic-owner',
        ),
        (error) => error.code === 'IMPORT_REVIEW_APPROVAL_SCOPE_INVALID',
        `public approval scope ${label} must be rejected`,
      )
    }
  }
  const approval = reviewStore.approveRevision(
    fixturePaperId,
    revision.id,
    {
      bundleDigest: revision.bundleDigest,
      ...(fixture.projection.importProfile ? { approvalScope: 'layout_only' } : {}),
    },
    'synthetic-owner',
  )
  if (fixture.projection.importProfile) {
    assert.equal(approval.approvalScope, 'layout_only', 'public approval receipt records exact layout-only scope')
  }
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
    importReviewDbPath: path.join(tempRoot, 'import-review.sqlite'),
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
    ...(approval.importProfile
      ? {
          importProfile: approval.importProfile,
          paragraphSummariesDigest: approval.paragraphSummariesDigest,
          publicSearchMetadataDigest: approval.publicSearchMetadataDigest,
          ...(approval.analysisDigest ? { analysisDigest: approval.analysisDigest } : {}),
        }
      : { analysisDigest: approval.analysisDigest }),
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
      '/ops/owner-review.js': ['owner-review.js', 'text/javascript; charset=utf-8'],
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
          ? { role: request.headers['x-synthetic-role'] || 'owner',
              accountKind: request.headers['x-synthetic-kind'] || 'human', username: 'synthetic-owner' }
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
  const fileNames = [
    'reading-choice-analysis-v1.json',
    'seven-choices-analysis-v1.json',
    'cloze-analysis-v1.json',
    'grammar-fill-analysis-v1.json',
    'writing-analysis-v1.json',
    'listening-analysis-v1.json',
  ].filter((fileName) => existsSync(path.join(baseDir, 'analyses', fileName)))
  return digestJson(Object.fromEntries(fileNames.map((fileName) => [
    fileName,
    JSON.parse(readFileSync(path.join(baseDir, 'analyses', fileName), 'utf8')),
  ])))
}

async function requestReviewAsset(projection, relativePath, session) {
  const pathname = `/api/import-review-preview/revisions/rev-fixture/asset/${relativePath}`
  const routes = createImportReviewRoutes({
    getStore: () => ({ productPreviewForRevision: () => ({ preview: {
      paperAsset: projection.paperAsset,
      analysisSidecars: projection.analysisSidecars,
    } }) }),
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
      deviceScaleFactor: 2,
    })
    const screenErrors = []
    screenPage.on('pageerror', (error) => screenErrors.push(error.stack || error.message))
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
    await screenPage.route('**/paper-assets/**/analyses/**', (route) => {
      const fileName = new URL(route.request().url()).pathname.split('/').at(-1)
      const sidecar = screenProjection.analysisSidecars?.[fileName]
      return sidecar
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sidecar) })
        : route.fulfill({ status: 404, body: '' })
    })
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
    try {
      await screenTitle.waitFor()
    } catch (error) {
      throw new Error(`${error.message}\nScreen errors: ${screenErrors.join('\n')}\nScreen text: ${await screenPage.locator('body').innerText()}`, { cause: error })
    }
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
    assert.equal(await screenBody.evaluate(element => getComputedStyle(element).fontSize), '14px',
      'Screen prose retains the five号 10.5pt base independently of paper zoom')
    assert.equal(await screenPage.locator('.paper-browse-listening').count(), 0)
    if (process.env.LISTENING_QA_ARTIFACT_DIR) {
      mkdirSync(process.env.LISTENING_QA_ARTIFACT_DIR, { recursive: true })
      await screenPage.screenshot({ path: path.join(process.env.LISTENING_QA_ARTIFACT_DIR, 'screen-not-supplied.png') })
    }

    // Public discussion must name the viewed publication, not the newer private
    // Candidate. Exercise the shipped page and clipboard payload without sending
    // an external message or requiring a real Amp session in CI.
    const publicationDigest = `sha256:${'a'.repeat(64)}`
    let mappedPublication = { revisionId: 'rev-published-v7', sourceAssetVersion: 7, publicationDigest }
    screenProjection = { ...projection, consumption: {
      ...projection.consumption, sourceAssetVersion: 7, publicationDigest,
    } }
    await screenPage.route('**/api/import-reviews/papers/*/product-review?*', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        paperId: projection.paperId, latest: { id: 'rev-newer-private' },
        discussionThreadId: `T-00000000-0000-0000-0000-000000000007`, published: mappedPublication,
      }),
    }))
    for (const mapped of [true, false]) {
      if (!mapped) mappedPublication = null
      await screenPage.goto(screenUrl.href)
      const discuss = screenPage.getByRole('button', { name: '去 Amp 聊这份卷' })
      await discuss.waitFor()
      await screenPage.evaluate(() => {
        window.open = () => null
        navigator.clipboard.writeText = async text => { window.__copiedPaperContext = text }
      })
      await discuss.click()
      const copied = await screenPage.evaluate(() => window.__copiedPaperContext)
      assert.match(copied, /发布版本：v7/)
      assert(copied.includes(publicationDigest))
      assert(!copied.includes('rev-newer-private'), 'never substitute the latest private Candidate')
      const publicLine = copied.split('\n').find(line => line.startsWith('公开页面（可能已更新）：'))
      assert(publicLine && !publicLine.includes('reviewRevision='), 'public URL is not silently relabelled as private')
      if (mapped) {
        assert.match(copied, /对应发布版本的私有预览：.*reviewRevision=rev-published-v7/)
      } else {
        assert.match(copied, /未取得对应版本的私有预览/)
        assert(!copied.includes('reviewRevision='), 'missing mapping cannot manufacture a pinned preview')
      }
      assert.equal(await screenPage.getByRole('link', { name: '打开对应 Amp 线程' }).getAttribute('href'),
        'https://ampcode.com/threads/T-00000000-0000-0000-0000-000000000007')
    }
    screenProjection = listeningProjection
    screenUrl.searchParams.set('focusGroupId', `group:${projection.paperId}:listening.short-dialogue`)
    screenUrl.searchParams.set('lecture', '1')
    await screenPage.goto(screenUrl.href)
    await screenPage.locator('.paper-browse-listening .ps-question').first().waitFor()
    await screenPage.locator('[data-paper-question-id="question:listening:1"]').click()
    await screenPage.locator('.listening-analysis-panel').waitFor()
    await assertPaperFonts(screenPage, '.paper-browse-listening')
    await assertSharedPaperLayout(screenPage, '.paper-browse-listening', ['listening', 'listening-boundaries'], 24)
    const listeningFontSizes = await screenPage.locator('.paper-browse-listening :is(.ps-question-stem, .ps-option-text, .ps-listening-instruction, .ps-listening-section)')
      .evaluateAll(elements => elements.map(element => getComputedStyle(element).fontSize))
    assert.ok(listeningFontSizes.length > 0)
    assert.ok(listeningFontSizes.every(size => size === '14px'),
      'Listening stems, options, instructions and section titles retain the five号 base')
    assert.equal(await screenPage.locator('.paper-browse-listening').count(), 2)
    assert.equal(await screenPage.locator('.paper-browse-listening .ps-question').count(), 20)
    assert.deepEqual(await screenPage.locator('.paper-browse-listening .ps-question-no')
      .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontWeight)), Array(20).fill('400'))
    assert.deepEqual(
      await screenPage.locator('.paper-browse-listening .ps-question-no').allTextContents(),
      Array.from({ length: 20 }, (_, index) => `${index + 1}.`),
    )
    assert.equal(await screenPage.locator('.paper-browse-listening .ps-option').count(), 60)
    assert.match(await screenPage.locator('.listening-analysis-panel').textContent(), /听力原文/u)
    assert.equal(await screenPage.locator('audio').count(), 0, 'Review preview does not expose published playback')
    assert.doesNotMatch(
      await screenPage.locator('.paper-browse-content').textContent(),
      /Long listening transcript|官方答案|内容安全检查通过/,
      'student exam column stays free of listening transcript and analysis',
    )
    await screenPage.locator('[data-paper-question-id="question:listening:6"]').click()
    screenProjection = { ...listeningProjection, consumption: {
      ...listeningPublished.screen,
      listeningAudio: { ...listeningPublished.screen.listeningAudio, segments: undefined },
    } }
    await screenPage.goto(screenUrl.href)
    const continuousPlayer = screenPage.locator('.ps-listening-part .listening-player')
    await continuousPlayer.locator('.listening-player-trigger').click()
    const continuousLine = continuousPlayer.locator('.listening-player-line-spans:not(.listening-player-line-spans--played) .listening-player-line')
    assert.equal(await continuousLine.count(), 1, 'Without timestamps the whole recording has one continuous line')
    assert.equal(await continuousLine.evaluate(element => element.offsetLeft === 0
      && element.offsetWidth === element.parentElement.offsetWidth), true)
    await continuousPlayer.locator('.listening-player-trigger').click()
    // The sine fixture has no reviewed segmentation. Asymmetric synthetic cues
    // exercise short-question, first-section and dialogue-cue anchors in Screen.
    screenProjection = { ...listeningProjection, consumption: {
      ...listeningPublished.screen,
      listeningAudio: { ...listeningPublished.screen.listeningAudio, segments: [
        ...[[0, 0.7], [1.2, 2], [2.3, 3.3], [3.8, 4.5], [5.1, 6]].map(([startSeconds, endSeconds], index) => ({
          segmentId: `fixture-q${index + 1}`, firstQuestionId: `question:listening:${index + 1}`,
          questionNumbers: [index + 1], startSeconds, endSeconds,
        })),
        { segmentId: 'fixture-q6-7', firstQuestionId: 'question:listening:6', questionNumbers: [6, 7],
          startSeconds: 6.5, endSeconds: 8.2 },
      ] },
    } }
    await screenPage.goto(screenUrl.href)
    const fullPlayer = screenPage.locator('.ps-listening-part .listening-player[data-size="full"]')
    const trigger = fullPlayer.getByRole('button', { name: '整卷听力录音', exact: true })
    const audio = fullPlayer.locator('audio')
    await trigger.waitFor()
    await screenPage.locator('[data-paper-question-id="question:listening:6"]').click()
    await screenPage.locator('.listening-analysis-panel').waitFor()
    assert.equal(await screenPage.locator('.ps-listening-player').count(), 0,
      'Listening controls must not occupy standalone paper rows')
    assert.equal(await screenPage.locator('.ps-listening-section .ps-text-trail .listening-player').count(), 1)
    assert.equal(await screenPage.locator('.ps-question > .ps-text-trail .listening-player').count(), 5)
    assert.equal(await screenPage.locator('.ps-listening-segment-cue .ps-text-trail .listening-player').count(), 1)
    for (const width of [1280, 390]) {
      await screenPage.setViewportSize({ width, height: 900 })
      await screenPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const anchors = await screenPage.locator('.ps-text-trail').evaluateAll(trails => trails.map(trail => {
        const host = trail.parentElement
        const text = host.matches('.ps-question') ? host.querySelector('.ps-question-stem') : host
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
        let last = null
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.parentElement.closest('.ps-text-trail') && node.textContent.trim()) last = node
        }
        const range = document.createRange()
        const end = last.textContent.trimEnd().length
        range.setStart(last, end - 1)
        range.setEnd(last, end)
        const glyph = range.getBoundingClientRect()
        const button = trail.querySelector('.listening-player-trigger').getBoundingClientRect()
        return {
          host: host.className,
          gap: button.left - glyph.right,
          centerDelta: (button.top + button.bottom - glyph.top - glyph.bottom) / 2,
          localContext: trail.offsetParent === host,
          nestedButton: Boolean(trail.closest('button')),
        }
      }))
      assert.equal(anchors.length, 8)
      for (const anchor of anchors) {
        assert.equal(anchor.localContext, true, `${width}px ${anchor.host}: anchor belongs to its text host`)
        assert.equal(anchor.nestedButton, false, 'Audio control must not nest inside the question focus button')
        assert.ok(anchor.gap >= 0 && anchor.gap < 9 && Math.abs(anchor.centerDelta) < 3,
          `${width}px headphone follows the last text glyph: ${JSON.stringify(anchor)}`)
      }
      assert.equal(await screenPage.evaluate(() => {
        const nodes = [...document.querySelectorAll('.paper-browse-listening .ps-question, .ps-listening-chrome, .ps-listening-segment-cue')]
        const geometry = () => nodes.map(node => {
          const rect = node.getBoundingClientRect()
          return [rect.x, rect.y, rect.width, rect.height]
        })
        const before = JSON.stringify(geometry())
        const controls = [...document.querySelectorAll('.ps-text-trail, .ps-text-trail-anchor')]
        const display = controls.map(control => control.style.display)
        controls.forEach(control => { control.style.display = 'none' })
        const after = JSON.stringify(geometry())
        controls.forEach((control, index) => { control.style.display = display[index] })
        return before === after
      }), true, `${width}px Screen controls do not change question or heading geometry`)
    }
    await screenPage.setViewportSize({ width: 1280, height: 900 })
    assert.equal(await audio.count(), 1)
    assert.equal(await screenPage.locator('.ps-listening-part .ps-text-trail audio').count(), 1,
      'Whole-recording control is a Screen-only overlay after the listening heading')
    assert.equal(await audio.getAttribute('preload'), 'none')
    assert.equal(await audio.getAttribute('controls'), null, 'The progress line replaces native audio controls')
    await trigger.click()
    await screenPage.waitForFunction(() => document.querySelector('audio')?.readyState >= 1)
    assert.equal(await audio.evaluate((element) => Math.round(element.duration)), 12)
    await screenPage.waitForFunction(() => document.querySelector('audio').currentTime > 0)
    await fullPlayer.getByRole('button', { name: '暂停', exact: true }).click()
    await fullPlayer.getByRole('slider').press('Home')
    await fullPlayer.getByRole('slider').press('ArrowRight')
    await screenPage.waitForFunction(() => !document.querySelector('audio').seeking)
    assert.equal(await audio.evaluate((element) => Math.round(element.currentTime)), 5)
    await fullPlayer.getByRole('button', { name: '播放速度 1 倍，点击切换', exact: true }).click()
    assert.equal(await audio.evaluate((element) => element.playbackRate), 1.25)
    const lineGeometry = await fullPlayer.locator('.listening-player-line-spans:not(.listening-player-line-spans--played)')
      .evaluate(element => [...element.children].map(line => ({
        x: parseFloat(line.style.left) / element.clientWidth,
        width: parseFloat(line.style.width) / element.clientWidth,
      })))
    const cueTimes = [[0, .7], [1.2, 2], [2.3, 3.3], [3.8, 4.5], [5.1, 6], [6.5, 8.2]]
    assert.equal(lineGeometry.length, cueTimes.length)
    const recordingDuration = Number(await fullPlayer.getByRole('slider').getAttribute('aria-valuemax'))
    lineGeometry.forEach((line, index) => {
      const [start, end] = cueTimes[index]
      assert.ok(Math.abs(line.x - start / recordingDuration) < .001
        && Math.abs(line.width - (end - start) / recordingDuration) < .001,
      'Question lines preserve real timestamps and instruction/silence gaps')
    })
    const slider = fullPlayer.getByRole('slider')
    const beforeDrag = await audio.evaluate(element => element.currentTime)
    const trackBox = await slider.boundingBox()
    await screenPage.mouse.move(trackBox.x + trackBox.width * .3, trackBox.y + trackBox.height / 2)
    await screenPage.mouse.down()
    await screenPage.mouse.move(trackBox.x + trackBox.width * .6, trackBox.y + trackBox.height / 2)
    assert.equal(await audio.evaluate(element => element.currentTime), beforeDrag, 'Dragging previews without seeking audio')
    assert.ok(Math.abs(Number(await slider.getAttribute('aria-valuenow')) - recordingDuration * .6) <= 1)
    await screenPage.mouse.up()
    assert.ok(Math.abs(await audio.evaluate(element => element.currentTime) - recordingDuration * .6) < .1,
      'Pointer release commits one seek')
    await slider.press('Home')
    await slider.press('Shift+ArrowRight')
    assert.equal(await audio.evaluate(element => Math.round(element.currentTime)), recordingDuration,
      'Shift steps 15 seconds, clamped to the recording end')
    await slider.press('ArrowLeft')
    assert.equal(await audio.evaluate(element => Math.round(element.currentTime)), recordingDuration - 5)
    await fullPlayer.getByRole('button', { name: '跳到第 3 题', exact: true }).click()
    await screenPage.waitForFunction(() => {
      const audio = document.querySelector('.ps-listening-part audio')
      const mark = document.querySelector('.ps-listening-part [aria-label="跳到第 3 题"]')
      return !audio.paused && audio.currentTime >= 2.3 && audio.currentTime < 3.3
        && mark.getAttribute('aria-current') === 'true'
    })
    await fullPlayer.getByRole('button', { name: '暂停', exact: true }).click()
    assert.equal(await fullPlayer.getByRole('button', { name: '跳到第 3 题', exact: true }).getAttribute('aria-current'), 'true')
    // Cold-start a nonzero segment, then switch players before its end. A full
    // recording that merely plays successfully cannot prove these boundaries.
    const questionPlayers = screenPage.locator('.ps-question > .ps-text-trail .listening-player')
    const secondPlayer = questionPlayers.nth(1)
    const thirdPlayer = questionPlayers.nth(2)
    await questionPlayers.locator('audio').evaluateAll(elements => elements.forEach(element => {
      element.dataset.playStarts = '[]'
      element.addEventListener('playing', () => {
        const starts = JSON.parse(element.dataset.playStarts)
        element.dataset.playStarts = JSON.stringify([...starts, element.currentTime])
      })
    }))
    await secondPlayer.locator('.listening-player-trigger').click()
    await screenPage.waitForFunction(() => {
      const audio = document.querySelectorAll('.ps-question > .ps-text-trail audio')[1]
      return audio && !audio.paused && audio.currentTime >= 1.2 && audio.currentTime < 2
    })
    assert.equal(await audio.evaluate(element => element.paused), true)
    await thirdPlayer.locator('.listening-player-trigger').click()
    await screenPage.waitForFunction(() => {
      const audio = document.querySelectorAll('.ps-question > .ps-text-trail audio')[2]
      return audio && !audio.paused && audio.currentTime >= 2.3 && audio.currentTime < 3.3
    })
    assert.equal(await secondPlayer.locator('audio').evaluate(element => element.paused), true,
      'Switching question segments stops the previous recording')
    await screenPage.waitForFunction(() => {
      const audio = document.querySelectorAll('.ps-question > .ps-text-trail audio')[2]
      return audio?.paused && Math.abs(audio.currentTime - 3.3) < .01
    })
    await thirdPlayer.getByRole('button', { name: '播放', exact: true }).click()
    await screenPage.waitForFunction(() => {
      const audio = document.querySelectorAll('.ps-question > .ps-text-trail audio')[2]
      return audio && !audio.paused && audio.currentTime >= 2.3 && audio.currentTime < 3.3
    })
    await thirdPlayer.getByRole('button', { name: '暂停', exact: true }).click()
    for (const [player, start, plays] of [[secondPlayer, 1.2, 1], [thirdPlayer, 2.3, 2]]) {
      const starts = await player.locator('audio').evaluate(element => JSON.parse(element.dataset.playStarts))
      assert.equal(starts.length, plays)
      assert(starts.every(value => Math.abs(value - start) < .1),
        `Cold play and replay start at the selected segment, not earlier audio: ${starts}`)
    }
    await trigger.click()
    await screenPage.emulateMedia({ media: 'print' })
    assert.equal(await trigger.isVisible(), false, 'Screen-only listening control is hidden in print')
    await screenPage.emulateMedia({ media: 'screen' })
    const columns = await screenPage.locator('.paper-browse-listening .ps-option-list').first()
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').map(parseFloat))
    assert.equal(columns.length, 3)
    assert.ok(Math.max(...columns) - Math.min(...columns) < 1)
    const listeningViewport = screenPage.viewportSize()
    const listeningContent = screenPage.locator('.paper-browse-content')
    const listeningZoom = await listeningContent.evaluate(element => element.style.getPropertyValue('--paper-screen-zoom'))
    for (const width of [390, 1440]) {
      await screenPage.setViewportSize({ width, height: 1000 })
      for (const zoom of ['1', '1.35']) {
        await listeningContent.evaluate((element, value) => element.style.setProperty('--paper-screen-zoom', value), zoom)
        const layouts = await screenPage.locator('.paper-browse-listening .ps-option-list')
          .evaluateAll(lists => lists.map(list => {
            const bounds = list.getBoundingClientRect()
            return {
              desktopColumns: list.classList.contains('ps-option-list--three_columns') ? 3 : 1,
              columns: getComputedStyle(list).gridTemplateColumns.split(' ').length,
              width: bounds.width,
              overflow: [...list.children].filter(option => {
                const optionBounds = option.getBoundingClientRect()
                const text = document.createRange()
                text.selectNodeContents(option)
                return optionBounds.right > bounds.right + 1 || [...text.getClientRects()].some(rect =>
                  rect.right > optionBounds.right + 1 || rect.left < optionBounds.left - 1)
              }).map(option => option.textContent),
            }
          }))
        assert.ok(layouts.length > 0, 'Listening layout check requires real options')
        assert.deepEqual([...new Set(layouts.map(layout => layout.desktopColumns))].sort(), [1, 3],
          'The listening fixture exercises both single-column and three-column placement')
        assert.ok(layouts.every(layout => layout.columns === (width <= 700 ? 1 : layout.desktopColumns)),
          'Screen preserves desktop single-column/thirds and mobile single-column options')
        if (width <= 700) {
          assert.ok(layouts.every(layout => layout.width > width * 0.6),
            'Mobile options retain a readable measure instead of inheriting print-sized side margins')
        }
        assert.deepEqual(layouts.flatMap(layout => layout.overflow), [],
          `Listening option boxes and text fit their Screen columns at ${width}px, zoom ${zoom}`)
      }
    }
    await listeningContent.evaluate((element, value) => element.style.setProperty('--paper-screen-zoom', value), listeningZoom)
    await screenPage.setViewportSize(listeningViewport)
    await trigger.scrollIntoViewIfNeeded()
    if (process.env.LISTENING_QA_ARTIFACT_DIR) {
      await screenPage.screenshot({ path: path.join(process.env.LISTENING_QA_ARTIFACT_DIR, 'listening-lecture-desktop.png') })
    }
    await screenPage.getByRole('button', { name: '讲评', exact: true }).click()
    const segmentPlayer = screenPage.locator('.listening-player[data-size="segment"]').first()
    for (const player of [segmentPlayer, fullPlayer]) {
      await player.locator('.listening-player-trigger').click()
      for (const width of [390, 320, 1280]) {
        await screenPage.setViewportSize({ width, height: 900 })
        // Let the text-trail ResizeObserver commit its new anchor position;
        // checking before that commit can falsely accept the previous position.
        await screenPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        await screenPage.waitForFunction(() => {
          const card = document.querySelector('.listening-player-card')?.getBoundingClientRect()
          return card && card.left >= 7 && card.right <= document.documentElement.clientWidth - 7
        }, undefined, { timeout: 5000 }).catch(async error => {
          const geometry = await screenPage.evaluate(() => ({
            card: document.querySelector('.listening-player-card')?.getBoundingClientRect().toJSON(),
            paper: document.querySelector('.paper-browse-zoom')?.getBoundingClientRect().toJSON(),
            viewport: document.documentElement.clientWidth,
            openPlayers: document.querySelectorAll('.listening-player[data-open]').length,
          }))
          throw new Error(`Listening popup at ${width}px: ${JSON.stringify(geometry)}`, { cause: error })
        })
        // No forced click: also proves that the visible controls are not covered.
        await player.locator('.listening-player-speed').click()
        assert.ok(await player.locator('.listening-player-wave').evaluate((element) => element.getBoundingClientRect().width > 80),
          'fitting the popup must leave a usable seek track')
        if (process.env.LISTENING_QA_ARTIFACT_DIR && width === 390) {
          await screenPage.screenshot({ path: path.join(process.env.LISTENING_QA_ARTIFACT_DIR, `listening-${await player.getAttribute('data-size')}-narrow.png`) })
        }
      }
      await player.locator('.listening-player-trigger').click()
    }

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
    const reviewProjection = { ...listeningProjection, consumption: listeningPublished.screen }
    const originalConsumption = JSON.stringify(reviewProjection.consumption)
    const eightHtml = reviewPrintHtml(reviewProjection, 'student', buildPrintHtml, { includeListening: false })
    assert.equal([...eightHtml.matchAll(/<section\b[^>]*data-canonical-group-id=/g)].length, 9)
    assert.doesNotMatch(eightHtml, /<section\b[^>]*data-canonical-group-type="listening"/)
    assert.equal(JSON.stringify(reviewProjection.consumption), originalConsumption,
      'deriving the eight-page view must not mutate the full-paper consumption')
    assert.throws(() => reviewPrintHtml({ ...reviewProjection, consumption: {
      ...reviewProjection.consumption, visibleStructureDigest: `sha256:${'0'.repeat(64)}`,
    } }, 'student', buildPrintHtml, { includeListening: false }),
    error => error.code === 'CANONICAL_CONSUMPTION_REJECTED',
    'projection must validate its input before deriving a fresh view digest')
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
      await assertSharedPaperLayout(page, '.paper-print', versionType === 'student' ? ['listening', 'listening-boundaries'] : ['listening'])
      const questions = page.locator('[data-canonical-question-id^="question:listening:"]')
      assert.equal(await questions.count(), 20)
      assert.deepEqual(await questions.locator('.qnum')
        .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontWeight)), Array(20).fill('400'))
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

    const companionHtml = buildCompanionAnalysisHtml({
      paperAsset: listeningProjection.paperAsset,
      analyses: { listening: listeningProjection.analysisSidecars['listening-analysis-v1.json'] },
    })
    const companionPage = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
    })
    await companionPage.setContent(companionHtml, { waitUntil: 'load' })
    assert.equal(await companionPage.locator('.listening-material').count(), 10)
    assert.equal(await companionPage.locator('.question--listening').count(), 20)
    assert.equal(await companionPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true)
    const companionPdf = await companionPage.pdf({ format: 'A4', printBackground: true })
    assert.equal(companionPdf.subarray(0, 4).toString(), '%PDF')
    if (process.env.LISTENING_QA_ARTIFACT_DIR) {
      await companionPage.screenshot({ path: path.join(process.env.LISTENING_QA_ARTIFACT_DIR, 'companion-listening-desktop.png'), fullPage: true })
    }
    await companionPage.setViewportSize({ width: 390, height: 844 })
    await companionPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await companionPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true)
    assert.equal(await companionPage.locator('.analysis-body').evaluate((element) => getComputedStyle(element).columnCount), '1')
    if (process.env.LISTENING_QA_ARTIFACT_DIR) {
      await companionPage.screenshot({ path: path.join(process.env.LISTENING_QA_ARTIFACT_DIR, 'companion-listening-narrow.png'), fullPage: true })
    }
    await companionPage.close()

    // Late analysis must not publish text before its newly needed font arrives.
    // Keep the existing paper mounted if that independent download fails.
    const webFaces = JSON.parse(readFileSync(path.join(root, 'app/src/shared-ui/papersurface/paperWebFonts.json')))
    const rare = String.fromCodePoint(webFaces[0].shards.at(-1).ranges.at(-1)[1])
    const rarePaths = new Set(webFaces.map(face => `/fonts/paper/${face.shards.at(-1).path}`))
    screenProjection = structuredClone(listeningProjection)
    const lateMaterial = Object.values(screenProjection.analysisSidecars['listening-analysis-v1.json'].materials)[0]
    lateMaterial.transcript += ` ${rare}`
    screenUrl.searchParams.set('focusGroupId', `group:${projection.paperId}:listening.short-dialogue`)
    screenUrl.searchParams.set('questionId', 'question:listening:1')
    screenUrl.searchParams.set('lecture', '1')
    let releaseFonts
    const heldFonts = new Promise(resolve => { releaseFonts = resolve })
    let requestedFont
    const fontRequested = new Promise(resolve => { requestedFont = resolve })
    let corruptLateFont = false
    await screenPage.route('**/fonts/paper/web/**', async route => {
      if (!rarePaths.has(new URL(route.request().url()).pathname)) return route.continue()
      requestedFont()
      await heldFonts
      if (corruptLateFont) return route.fulfill({ status: 200, body: 'broken font' })
      return route.continue()
    })
    await screenPage.goto(screenUrl.href)
    await Promise.race([fontRequested, new Promise((_, reject) => setTimeout(() => reject(new Error('late font not requested')), 15_000))])
    await screenPage.locator('.paper-browse-listening').first().waitFor()
    assert(!(await screenPage.locator('body').textContent()).includes(rare), 'late text cannot render before its glyph provider')
    releaseFonts()
    await screenPage.locator('[data-paper-question-id="question:listening:1"]').click()
    await screenPage.waitForFunction(text => document.querySelector('.listening-analysis-panel')?.textContent.includes(text), rare)
    await assertPaperFonts(screenPage, '.paper-browse-listening')
    if (process.env.LISTENING_QA_ARTIFACT_DIR) await screenPage.screenshot({ path: path.join(process.env.LISTENING_QA_ARTIFACT_DIR, 'late-analysis-ready.png') })
    corruptLateFont = true
    await screenPage.reload()
    await screenPage.locator('.paper-browse-lecture-panel').getByRole('alert').filter({ hasText: '试卷字体加载失败' }).waitFor()
    assert(await screenPage.locator('.paper-browse-listening').count() > 0, 'late font failure keeps the admitted paper mounted')
    assert(!(await screenPage.locator('body').textContent()).includes(rare), 'failed late text cannot fall back to a system font')
    if (process.env.LISTENING_QA_ARTIFACT_DIR) await screenPage.screenshot({ path: path.join(process.env.LISTENING_QA_ARTIFACT_DIR, 'late-analysis-font-error.png') })
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

if (process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY !== '1') {
const listeningPublication = makeContext('listening-publication', { listening: true, sourceType: '模拟题' })
try {
  const listeningPackageRoot = path.join(listeningPublication.tempRoot, 'listening-package')
  const listeningPreparedRoot = path.join(listeningPublication.tempRoot, 'listening-package-review')
  makeExternalAnalyzedPackage(listeningPublication.reviewRoot, listeningPackageRoot)
  const preparedListening = await prepareNck1AnalyzedPackageReview({
    sourcePath: listeningPackageRoot,
    destinationDir: listeningPreparedRoot,
    expectedPaperId: paperId,
  })
  assert(preparedListening.analysisDigest)
  assert(buildNck1ReviewProjection(listeningPreparedRoot, {
    requireAnalyses: true,
    analysisProfile: 'complete-with-listening-v1',
  }).analysisSidecars['listening-analysis-v1.json'],
  'captured Listening requires and replays its package-bound teaching analysis')
  const listeningExportDb = path.join(listeningPublication.tempRoot, 'listening-export-review.sqlite')
  const listeningExportFiles = path.join(listeningPublication.tempRoot, 'listening-export-review-files')
  const listeningExportStore = createImportReviewStore({
    dbPath: listeningExportDb,
    filesRoot: listeningExportFiles,
    rendererBuildId: 'listening-package-export-verifier',
  })
  const listeningPreparedProjection = buildNck1ReviewProjection(listeningPreparedRoot, { requireAnalyses: true })
  const listeningExportManifest = reviewManifestFor(listeningPreparedRoot, listeningPreparedProjection)
  const listeningExportRevision = listeningExportStore.createRevision(listeningExportManifest).revision
  for (const file of listeningExportManifest.files) {
    const upload = listeningExportStore.fileForUpload(listeningExportRevision.id, file.path)
    mkdirSync(path.dirname(upload.destination), { recursive: true })
    writeFileSync(upload.destination, readFileSync(resolveReviewFile(listeningPreparedRoot, file.path)))
    listeningExportStore.completeFileUpload(listeningExportRevision.id, file.path, file)
  }
  listeningExportStore.finalizeRevision(listeningExportRevision.id)
  const listeningExportZip = path.join(listeningPublication.tempRoot, 'listening-normalized.zip')
  await exportAnalyzedPackageRevision({
    dbPath: listeningExportDb,
    filesRoot: listeningExportFiles,
    revisionId: listeningExportRevision.id,
    expectedPaperId: paperId,
    destination: listeningExportZip,
  })
  const listeningExportRoot = path.join(listeningPublication.tempRoot, 'listening-normalized')
  await readAnalyzedPackageArchive(listeningExportZip, { destination: listeningExportRoot })
  const listeningExportLoaded = loadAnalyzedPackageFiles(listeningExportRoot, { expectedPaperId: paperId })
  assert.equal(listeningExportLoaded.content.listening.transcript.length, 10)
  assert.equal(listeningExportLoaded.members.filter(({ role }) => role === 'audio').length, 1,
    'native semantic round-trip retains ten listening materials and the exact full MP3 resource')
  const listeningProjection = listeningPublication.projection
  const listeningCliRoot = path.join(import.meta.dirname, 'import-pipeline/papers', paperId)
  assert.equal(existsSync(listeningCliRoot), false, 'listening CLI fixture must not collide')
  symlinkSync(listeningPublication.reviewRoot, listeningCliRoot, 'dir')
  try {
    const verified = JSON.parse(execFileSync(process.execPath, [
      path.join(import.meta.dirname, 'import-pipeline/universal-nck1.mjs'), 'verify', paperId,
    ], { encoding: 'utf8' }))
    assert.equal(verified.sourceDigest, listeningProjection.sourceDigest, 'CLI must include exact audio source identity')
    assert.equal(verified.candidateDigest, listeningProjection.candidateDigest, 'CLI and Review must derive the same Candidate')
    assert.equal(verified.listening, 'captured')
    const evidenceDir = path.join(listeningPublication.reviewRoot, 'canonical-evidence')
    const before = new Map(readdirSync(evidenceDir).map(name => [name, readFileSync(path.join(evidenceDir, name))]))
    execFileSync(process.execPath, [
      path.join(import.meta.dirname, 'import-pipeline/universal-nck1.mjs'), 'build', paperId,
    ])
    const summary = JSON.parse(readFileSync(path.join(evidenceDir, 'candidate-summary.json')))
    assert.equal(summary.sourceDigest, verified.sourceDigest)
    assert.equal(summary.candidateDigest, verified.candidateDigest)
    for (const [name, bytes] of before) {
      if (name !== 'candidate-summary.json') assert.deepEqual(readFileSync(path.join(evidenceDir, name)), bytes,
        'rebuilding a summary must preserve retained confirmation and evidence')
    }
  } finally {
    rmSync(listeningCliRoot)
  }
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
  const listeningQuestionSix = listeningProjection.listeningReview.questions[5]
  assert.deepEqual(
    {
      questionId: listeningQuestionSix.questionId,
      questionNo: listeningQuestionSix.questionNo,
      officialAnswer: listeningQuestionSix.officialAnswer,
      transcriptSegments: listeningQuestionSix.transcriptSegments,
    },
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
  assert.equal(listeningQuestionSix.analysis.reasonZh, '原话直接给出关键信息，题干只是换了一种表达，因此选择官方答案。')
  assert.equal(listeningProjection.listeningReview.materials['text:6'].questionIds.length, 3)
  assert.equal(Math.round(listeningProjection.listeningReview.audio.durationSeconds), 12)
  assert.equal(listeningProjection.listeningReview.audio.comparison.verdict, 'partial_pass')
  assert.equal(listeningProjection.listeningReview.audio.scope.remainder, 'unchecked')
  assert.equal(listeningProjection.listeningReview.audio.summary, '首段快速匹配、后续内容未核对')
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
  assert.throws(() => assertListeningAudioSource(audioEvidence, changedListening), /source binding changed/)
  assert.throws(() => assertListeningAudioSource(audioEvidence, { state: 'not_supplied' }), /without Listening/)
  const result = publish(listeningPublication)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.ok(existsSync(path.join(result.publish.versionDir, 'listening/playback.mp3')))
  assert.ok(result.publish.consumers.screen.listeningAudio.url.includes('/versions/v1/'))
  const preparedWaveform = JSON.parse(readFileSync(path.join(listeningPublication.reviewRoot, LISTENING_WAVEFORM_FILE), 'utf8'))
  assert(reviewBundleFilePaths(listeningPublication.reviewRoot).some((file) => file.role === 'listening_audio_waveform'))
  assert.deepEqual(result.publish.consumers.screen.listeningAudio.waveform, preparedWaveform,
    'publication reuses the exact import waveform instead of decoding in Screen')
  const playbackUiPath = path.join(result.publish.versionDir, PUBLISHED_LISTENING_WAVEFORM_FILE)
  const playbackUiBytes = readFileSync(playbackUiPath)
  const { digest: uiDigest, ...uiValue } = JSON.parse(playbackUiBytes)
  assert.deepEqual(uiValue.waveform, preparedWaveform)
  assert.equal(uiDigest, digestJson(uiValue))
  const manifest = JSON.parse(readFileSync(path.join(result.publish.versionDir, 'canonical',
    `canonical-paper-publication-v${result.publish.consumers.screen.authorityRef.manifestVersion}.json`), 'utf8'))
  assert(manifest.sourceEvidence.every(({ relativePath }) => relativePath.startsWith('source-evidence/')),
    'presentation derivatives must not enter immutable Source Capture')
  const runtime = createCanonicalConsumerRuntime({ rootDir: listeningPublication.paperAssetsDir, db: listeningPublication.db })
  const publishedPrint = runtime.load({ paperId, consumerId: 'print_pdf' })
  assert.equal(runtime.load({ paperId, consumerId: 'screen' }).paperSourceType, '模拟题')
  assert.equal(publishedPrint.paperSourceType, '模拟题')
  const publishedPayload = canonicalConsumptionPrintPayload(publishedPrint, listeningProjection.paperName)
  const publishedHtml = buildPrintHtml({ ...publishedPayload,
    items: publishedPayload.items.map(({ questionGroupId }) => ({ detail: publishedPayload.details.get(questionGroupId) })),
    canonicalConsumption: publishedPrint, versionType: 'student' })
  assert.match(publishedHtml, /data-canonical-mock-name>2026 Contract Mock/,
    'public print consumes the persisted source classification, not test-injected metadata')
  for (const derivative of [null, Buffer.from('{bad json'), Buffer.from(JSON.stringify({ ...uiValue,
    waveform: { ...uiValue.waveform, reference: 999 }, digest: uiDigest }))]) {
    if (derivative) writeFileSync(playbackUiPath, derivative)
    else rmSync(playbackUiPath)
    const historical = runtime.load({ paperId, consumerId: 'screen' })
    assert.equal(historical.publicationDigest, manifest.publicationDigest)
    assert.equal(historical.listeningAudio.waveform, undefined, 'discard corrupt geometry; keep validated audio playable')
    assert.equal(historical.listeningAudio.segments, undefined, 'never consume unchecked timing data')
    writeFileSync(playbackUiPath, playbackUiBytes)
  }
  const mockPrint = await requestReviewPrint(listeningProjection, 'student')
  assert.equal(mockPrint.status, 200)
  assert.match(mockPrint.body, /data-canonical-mock-name/)
  assert.match(mockPrint.body, /data-canonical-cover-title>英 语/)
  const truePrint = await requestReviewPrint({ ...listeningProjection,
    consumption: { ...listeningProjection.consumption, paperSourceType: '真题' } }, 'student')
  assert.doesNotMatch(truePrint.body, /data-canonical-mock-name/)
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

const publicOnly = makeContext('public-only')
const publicConfigPath = path.join(publicOnly.reviewRoot, 'config.json')
const publicConfig = JSON.parse(readFileSync(publicConfigPath, 'utf8'))
publicConfig.importProfile = 'public-paper-v1'
writeJson(publicConfigPath, publicConfig)
for (const name of readdirSync(publicOnly.reviewRoot)) {
  if (name.startsWith('analysis-') && name.endsWith('.json')) rmSync(path.join(publicOnly.reviewRoot, name))
}
const summaryTargets = enumerateParagraphSummaryTargets(publicOnly.projection.materialization)
const summariesPath = path.join(publicOnly.reviewRoot, 'paragraph-summaries-v1.json')
const publicSummary = {
  schemaVersion: 'paragraph-summaries-v1',
  paperId,
  sourceDigest: publicOnly.projection.sourceDigest,
  candidateDigest: publicOnly.projection.candidateDigest,
  groups: [...Map.groupBy(summaryTargets, ({ groupId }) => groupId)].map(([groupId, targets]) => ({
    groupId,
    paragraphs: targets.map(({ paragraphId }) => ({ paragraphId, summary: `段落 ${paragraphId} 摘要。` })),
  })),
}
writeJson(summariesPath, publicSummary)
writeJson(
  path.join(publicOnly.reviewRoot, 'public-search-metadata-v1.json'),
  publicMetadataFixture(
    publicOnly.projection.materialization,
    publicOnly.projection.sourceDigest,
    publicOnly.projection.candidateDigest,
  ),
)
publicOnly.projection = buildNck1ReviewProjection(publicOnly.reviewRoot, { requireAnalyses: true })
assert.equal(publicOnly.projection.analysisDigest, null)
assert.equal(publicOnly.projection.importProfile, 'public-paper-v1')
const approvedPublicIdentity = approvedIdentity(publicOnly.projection)
rmSync(summariesPath)
assert.throws(
  () => buildNck1ReviewProjection(publicOnly.reviewRoot, { requireAnalyses: true }),
  /paragraph-summaries-v1.json is missing/,
)
const cliPaperRoot = path.join(import.meta.dirname, 'import-pipeline/papers', paperId)
const summaryRequestPath = path.join(publicOnly.tempRoot, 'paragraph-summary-request.json')
assert.equal(existsSync(cliPaperRoot), false, 'CLI request fixture paperId must not collide')
symlinkSync(publicOnly.reviewRoot, cliPaperRoot, 'dir')
try {
  const sourceVerify = JSON.parse(execFileSync(process.execPath, [
    path.join(import.meta.dirname, 'import-pipeline/universal-nck1.mjs'),
    'verify', paperId,
  ], { encoding: 'utf8' }))
  assert.equal(sourceVerify.ok, true, 'documented source verify runs before summaries exist')
  assert.equal(sourceVerify.importProfile, 'public-paper-v1')
  const prepared = JSON.parse(execFileSync(process.execPath, [
    path.join(import.meta.dirname, 'import-pipeline/review.mjs'),
    'prepare-summaries', paperId, '--output', summaryRequestPath,
  ], { encoding: 'utf8' }))
  const request = JSON.parse(readFileSync(summaryRequestPath, 'utf8'))
  assert.equal(request.schemaVersion, 'paragraph-summaries-request-v1')
  assert.equal(request.sourceDigest, prepared.sourceDigest)
  assert.equal(request.candidateDigest, prepared.candidateDigest)
  assert.equal(request.outputSchema.$id, 'paragraph-summaries-v1')
  assert.match(request.prompt, /Return JSON only/)
  assert.ok(request.groups.every((group) => group.sourceGroup && group.authoritativeAnswers && Array.isArray(group.targets)))
} finally {
  rmSync(cliPaperRoot)
}
writeJson(summariesPath, { ...publicSummary, sourceDigest: `sha256:${'0'.repeat(64)}` })
assert.throws(() => buildNck1ReviewProjection(publicOnly.reviewRoot), /SUMMARY_BINDING_STALE/)
writeJson(summariesPath, { ...publicSummary, candidateDigest: `sha256:${'1'.repeat(64)}` })
assert.throws(() => buildNck1ReviewProjection(publicOnly.reviewRoot), /SUMMARY_BINDING_STALE/)
writeJson(summariesPath, publicSummary)
const publicPublication = publishUniversalNck1Import({
  reviewRootDir: publicOnly.reviewRoot,
  approvedIdentity: approvedPublicIdentity,
  canonicalRequest: loadCanonicalImportRequest(publicOnly.requestPath),
  db: publicOnly.db,
  paperAssetsDir: publicOnly.paperAssetsDir,
})
assert.equal(publicPublication.ok, true)
assert.deepEqual(
  readFileSync(path.join(publicOnly.paperAssetsDir, paperId, 'latest/paragraph-summaries-v1.json')),
  readFileSync(summariesPath),
  'public-paper publication preserves exact approved summary bytes',
)
const changedPublicSummary = `${readFileSync(summariesPath, 'utf8')} `
writeFileSync(summariesPath, changedPublicSummary)
const changedAfterApproval = publishUniversalNck1Import({
  reviewRootDir: publicOnly.reviewRoot,
  approvedIdentity: approvedPublicIdentity,
  canonicalRequest: loadCanonicalImportRequest(publicOnly.requestPath),
  db: publicOnly.db,
  paperAssetsDir: publicOnly.paperAssetsDir,
})
assert.equal(changedAfterApproval.ok, false)
assert.equal(changedAfterApproval.canonicalAdmission.diagnostics[0].code, 'IMPORT_REVIEW_APPROVAL_IDENTITY_MISMATCH')
close(publicOnly)

const publicRollback = makeContext('public-rollback')
const rollbackConfigPath = path.join(publicRollback.reviewRoot, 'config.json')
writeJson(rollbackConfigPath, {
  ...JSON.parse(readFileSync(rollbackConfigPath, 'utf8')),
  importProfile: 'public-paper-v1',
})
for (const name of readdirSync(publicRollback.reviewRoot)) {
  if (name.startsWith('analysis-') && name.endsWith('.json')) rmSync(path.join(publicRollback.reviewRoot, name))
}
const rollbackTargets = enumerateParagraphSummaryTargets(publicRollback.projection.materialization)
writeJson(path.join(publicRollback.reviewRoot, 'paragraph-summaries-v1.json'), {
  schemaVersion: 'paragraph-summaries-v1', paperId,
  sourceDigest: publicRollback.projection.sourceDigest,
  candidateDigest: publicRollback.projection.candidateDigest,
  groups: [...Map.groupBy(rollbackTargets, ({ groupId }) => groupId)].map(([groupId, targets]) => ({
    groupId,
    paragraphs: targets.map(({ paragraphId }) => ({ paragraphId, summary: '有效摘要。' })),
  })),
})
writeJson(
  path.join(publicRollback.reviewRoot, 'public-search-metadata-v1.json'),
  publicMetadataFixture(
    publicRollback.projection.materialization,
    publicRollback.projection.sourceDigest,
    publicRollback.projection.candidateDigest,
  ),
)
publicRollback.projection = buildNck1ReviewProjection(publicRollback.reviewRoot)
assert.throws(
  () => publish(publicRollback, { forceDbFailure: true }),
  /Forced C7 DB failure/,
)
assert.equal(existsSync(path.join(publicRollback.paperAssetsDir, paperId, 'latest')), false)
assert.equal(publishedVersionCount(publicRollback), 0)
close(publicRollback)

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

const nativeReviewRoot = mkdtempSync(path.join(tmpdir(), 'eqb-native-review-replay-'))
try {
  const fixture = makeReviewRoot(nativeReviewRoot)
  const externalPackageRoot = path.join(nativeReviewRoot, 'external-package')
  const preparedReviewRoot = path.join(nativeReviewRoot, 'prepared-review')
  makeExternalAnalyzedPackage(fixture.reviewRoot, externalPackageRoot)
  const prepared = await prepareNck1AnalyzedPackageReview({
    sourcePath: externalPackageRoot,
    destinationDir: preparedReviewRoot,
    expectedPaperId: paperId,
  })
  assert(prepared.analysisDigest, 'complete originals-free package prepares all staged analyses')
  assert(reviewBundleFilePaths(preparedReviewRoot).some(({ path: relativePath }) =>
    relativePath === 'analyzed-package/members/package-manifest.json'),
  'the original package.json bytes remain a sealed Candidate identity member')
  const packageJsonPath = path.join(externalPackageRoot, 'package.json')
  const packageJsonBytes = readFileSync(packageJsonPath)
  const contentJsonPath = path.join(externalPackageRoot, 'content.json')
  const contentJsonBytes = readFileSync(contentJsonPath)
  const sevenJsonPath = path.join(externalPackageRoot, 'analysis-seven.json')
  const sevenJsonBytes = readFileSync(sevenJsonPath)
  async function rejectsPrepared(label, expected) {
    await assert.rejects(() => prepareNck1AnalyzedPackageReview({
      sourcePath: externalPackageRoot,
      destinationDir: path.join(nativeReviewRoot, `rejected-${label}`),
      expectedPaperId: paperId,
    }), expected)
  }
  const noOfficialSource = JSON.parse(packageJsonBytes)
  noOfficialSource.sources = noOfficialSource.sources.filter(({ role }) => role !== 'official_answers')
  writeJson(packageJsonPath, noOfficialSource)
  await rejectsPrepared('official-source', (error) =>
    error.code === 'ANALYZED_PACKAGE_INVALID')
  writeFileSync(packageJsonPath, packageJsonBytes)
  const selfDeclaredAnswers = JSON.parse(contentJsonBytes)
  selfDeclaredAnswers.answers[0].authority.documentId = 'content'
  selfDeclaredAnswers.answers[0].authority.pointer = '/answers/0'
  writeJson(contentJsonPath, selfDeclaredAnswers)
  await rejectsPrepared('official-locator', (error) =>
    error.code === 'ANALYZED_PACKAGE_OFFICIAL_PROVENANCE_REQUIRED')
  writeFileSync(contentJsonPath, contentJsonBytes)
  const wrongAnalysis = JSON.parse(sevenJsonBytes)
  const firstSeven = Object.values(wrongAnalysis.questions)[0]
  firstSeven.optionFit.correctOptionLabel = firstSeven.optionFit.correctOptionLabel === 'A' ? 'B' : 'A'
  writeJson(sevenJsonPath, wrongAnalysis)
  await rejectsPrepared('wrong-analysis-answer', (error) =>
    /答案.*不一致|conflicts with the authoritative answer/u.test(error.message))
  writeFileSync(sevenJsonPath, sevenJsonBytes)
  const missingAnalysisManifest = JSON.parse(packageJsonBytes)
  missingAnalysisManifest.files = missingAnalysisManifest.files.filter(({ analysisKey }) => analysisKey !== 'reading-a')
  writeJson(packageJsonPath, missingAnalysisManifest)
  const readingAPath = path.join(externalPackageRoot, 'analysis-reading-a.json')
  const readingABytes = readFileSync(readingAPath)
  rmSync(readingAPath)
  await rejectsPrepared('missing-analysis', /Missing required analyses/)
  writeFileSync(readingAPath, readingABytes)
  writeFileSync(packageJsonPath, packageJsonBytes)
  writeFileSync(packageJsonPath, `{"schemaVersion":"eqb-analyzed-package-v1",${packageJsonBytes.toString('utf8').trim().slice(1)}`)
  await rejectsPrepared('duplicate-json', (error) => error.code === 'ANALYZED_PACKAGE_JSON_INVALID')
  writeFileSync(packageJsonPath, packageJsonBytes)
  await assert.rejects(() => prepareNck1AnalyzedPackageReview({
    sourcePath: externalPackageRoot,
    destinationDir: path.join(nativeReviewRoot, 'wrong-target-review'),
    expectedPaperId: 'paper-foreign-correction-target',
  }), (error) => error.code === 'ANALYZED_PACKAGE_PAPER_ID_MISMATCH')
  writeFileSync(
    path.join(preparedReviewRoot, 'analysis-reading-a.json'),
    `${readFileSync(path.join(preparedReviewRoot, 'analysis-reading-a.json'), 'utf8')} `,
  )
  assert.throws(() => buildNck1ReviewProjection(preparedReviewRoot, { requireAnalyses: true }),
    (error) => error.code === 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH',
    'a staged analysis cannot replace its sealed package member')
  writeFileSync(path.join(preparedReviewRoot, 'analysis-reading-a.json'), readingABytes)
  convertToAnalyzedPackageReviewSource(fixture.reviewRoot)
  const projection = buildNck1ReviewProjection(fixture.reviewRoot, { requireAnalyses: true })
  assert.equal(projection.paperAsset.sources.primarySourceType, 'analyzed-package')
  assert.equal(Object.hasOwn(projection.materialization, 'documents'), false)
  assert.equal(Object.hasOwn(projection.materialization, 'sourceCoverage'), false)
  assert.equal(projection.analysisSidecars['reading-choice-analysis-v1.json'].paperId, paperId,
    'native package bytes still pass the existing full staged-analysis projection')
  const bundlePaths = reviewBundleFilePaths(fixture.reviewRoot)
  assert(bundlePaths.some(({ path: relativePath }) =>
    relativePath === 'analyzed-package/manifest.json'))
  assert(bundlePaths.some(({ path: relativePath }) =>
    relativePath === 'analyzed-package/content.json'))
  assert.equal(bundlePaths.some(({ path: relativePath }) =>
    relativePath === 'source/questions.pdf'), false,
  'original-free native Review inventory does not require raw source files')
  assert.equal(bundlePaths.filter(({ path: relativePath }) =>
    relativePath === 'analysis-reading-a.json').length, 1,
  'analysis members shared with staged validation are enumerated exactly once')

  const publicationDb = new DatabaseSync(path.join(nativeReviewRoot, 'publication.sqlite'))
  publicationDb.exec(readFileSync(path.join(root, 'data/sql/schema.sql'), 'utf8'))
  try {
    const confirmation = {
      schemaVersion: 'teacher-confirmation-v1',
      candidateDigest: projection.candidateDigest,
      sourceDigest: projection.sourceDigest,
      confirmed: true,
    }
    const canonicalRequest = materializeNck1CanonicalRequest(
      projection.sourceInput,
      confirmation,
    ).request
    const publication = publishUniversalNck1Import({
      reviewRootDir: fixture.reviewRoot,
      approvedIdentity: approvedIdentity(projection),
      canonicalRequest,
      db: publicationDb,
      paperAssetsDir: path.join(nativeReviewRoot, 'paper-assets'),
    })
    assert.equal(publication.ok, true,
      `original-free analyzed package promotes through reconstructed bytes: ${JSON.stringify(publication.canonicalAdmission)}`)
  } finally {
    publicationDb.close()
  }

  const dbPath = path.join(nativeReviewRoot, 'review.sqlite')
  const filesRoot = path.join(nativeReviewRoot, 'immutable-review')
  const store = createImportReviewStore({
    dbPath,
    filesRoot,
    rendererBuildId: 'native-review-replay-verifier',
  })
  const preparedProjection = buildNck1ReviewProjection(preparedReviewRoot, { requireAnalyses: true })
  const manifest = reviewManifestFor(preparedReviewRoot, preparedProjection)
  const created = store.createRevision(manifest)
  for (const file of manifest.files) {
    const upload = store.fileForUpload(created.revision.id, file.path)
    mkdirSync(path.dirname(upload.destination), { recursive: true })
    writeFileSync(upload.destination, readFileSync(resolveReviewFile(preparedReviewRoot, file.path)))
    store.completeFileUpload(created.revision.id, file.path, file)
  }
  store.finalizeRevision(created.revision.id)
  const reloadedStore = createImportReviewStore({
    dbPath,
    filesRoot,
    rendererBuildId: 'native-review-replay-verifier',
  })
  const productReader = createImportReviewStore({
    dbPath, filesRoot, rendererBuildId: 'native-review-replay-verifier',
    projectRevision() { throw new Error('Ordinary product reads must not rebuild source projection') },
  })
  const preview = productReader.productPreviewForRevision(created.revision.id).preview
  assert.deepEqual(preview.paperAsset, JSON.parse(JSON.stringify(preparedProjection.paperAsset)),
    'persisted exact Screen remains available after restart without source processing')
  assert.deepEqual(preview.consumption, JSON.parse(JSON.stringify(preparedProjection.consumption)),
    'the stored Screen uses the same canonical consumption data')
  assert.equal(productReader.paperDetail(paperId, { includeProjection: false }).latest.id, created.revision.id,
    'product review status does not trigger source processing')
  const firstFile = manifest.files[0]
  assert.equal(sha256(readFileSync(productReader.verifiedFileForRead(created.revision.id, firstFile.path).filePath)),
    firstFile.sha256, 'exact file reads do not rebuild projection')
  const replay = reloadedStore.projectionForRevision(created.revision.id).projection
  assert.deepEqual(replay.sourceInput, preparedProjection.sourceInput,
    'a process-style Review reload reconstructs the identical analyzed-package input')
  const exportedZip = path.join(nativeReviewRoot, 'normalized-export.zip')
  const exported = await exportAnalyzedPackageRevision({
    dbPath,
    filesRoot,
    revisionId: created.revision.id,
    expectedPaperId: paperId,
    destination: exportedZip,
  })
  assert.equal(exported.format, 'zip')
  assert(exported.files.some(({ path: relativePath }) => relativePath === 'package.json'),
    'real archive checker inventories normalized package output')
  const unpackedExport = path.join(nativeReviewRoot, 'normalized-export')
  await readAnalyzedPackageArchive(exportedZip, { destination: unpackedExport })
  const before = loadAnalyzedPackageFiles(externalPackageRoot, { expectedPaperId: paperId })
  const after = loadAnalyzedPackageFiles(unpackedExport, { expectedPaperId: paperId })
  assert.deepEqual(compareAnalyzedPackageSemantics(before, after), {
    equal: true,
    contentDifference: null,
    sourceAssetVersionDifferences: [],
  }, 'native originals-free package preserves exact normalized semantics after export and reimport')
  assert.equal(after.members.some(({ role }) => role === 'attachment'), false,
    'original attachments remain optional')
  const changed = structuredClone(after)
  const changedReading = changed.members.find(({ analysisKey }) => analysisKey === 'reading-a')
  const changedValue = JSON.parse(new TextDecoder().decode(changedReading.bytes))
  changedValue.groups[Object.keys(changedValue.groups)[0]].overview += ' retained-change'
  changedReading.bytes = new TextEncoder().encode(JSON.stringify(changedValue))
  assert.equal(compareAnalyzedPackageSemantics(after, changed).equal, false,
    'semantic comparison detects a changed retained analysis field')
  const replayManifest = JSON.parse(readFileSync(path.join(
    reloadedStore.revisionDirectory(created.revision.id),
    'universal-source-manifest.json',
  ), 'utf8'))
  const contentPath = path.join(
    reloadedStore.revisionDirectory(created.revision.id),
    replayManifest.members.find(({ role }) => role === 'content').path,
  )
  writeFileSync(contentPath, '{"tampered":true}')
  assert.throws(() => productReader.productPreviewForRevision(created.revision.id),
    { code: 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH' },
  'persisted product data cannot hide tampered revision inputs')
  assert.throws(
    () => reloadedStore.projectionForRevision(created.revision.id),
    (error) => error.code === 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH',
    'immutable Review store rejects native member tampering before replay',
  )
  await assert.rejects(() => exportAnalyzedPackageRevision({
    dbPath,
    filesRoot,
    revisionId: created.revision.id,
    expectedPaperId: paperId,
    destination: path.join(nativeReviewRoot, 'stale-export.zip'),
  }), (error) => error.code === 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH',
  'export refuses a stale/tampered immutable revision')
} finally {
  rmSync(nativeReviewRoot, { recursive: true, force: true })
}

const rawExport = makeOnlinePromotionContext('raw-legacy-export-refusal')
try {
  const rawZip = path.join(rawExport.tempRoot, 'raw-normalized.zip')
  await assert.rejects(() => exportAnalyzedPackageRevision({
    dbPath: path.join(rawExport.tempRoot, 'import-review.sqlite'),
    filesRoot: path.join(rawExport.tempRoot, 'review-files'),
    revisionId: rawExport.revision.id,
    expectedPaperId: paperId,
    destination: rawZip,
  }), (error) => error.code === 'ANALYZED_PACKAGE_CONTINUATION_INSTRUCTION_UNSUPPORTED'
    && error.path === '$.groups',
  'raw legacy source wording that needs a content-changing transformation fails with its exact path')

  const rawRevisionRoot = rawExport.reviewStore.revisionDirectory(rawExport.revision.id)
  const currentRaw = loadNck1ReviewSource(rawRevisionRoot)
  currentRaw.materialization = structuredClone(currentRaw.materialization)
  const continuation = currentRaw.materialization.groups.find(({ slotId }) =>
    slotId === 'writing.continuation')
  const priorPrompt = continuation.writingTask.prompt
  const currentPrompt = resolveCanonicalAuthority(
    nck1MaterializationCandidateAuthorityRef,
  ).closure.profiles.get('nck1').instructions['writing.continuation.prompt'].text
  continuation.writingTask.prompt = currentPrompt
  continuation.blocks.find((block) =>
    block.content?.some((item) => item.text === priorPrompt)).content[0].text = currentPrompt
  const currentRawFiles = convertRepresentableNck1ReviewSourceToAnalyzedPackageFiles(
    rawRevisionRoot,
    currentRaw,
  )
  const currentRawRoot = path.join(rawExport.tempRoot, 'current-standard-raw-package')
  for (const [relativePath, bytes] of currentRawFiles) {
    const target = path.join(currentRawRoot, relativePath)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }
  const currentRawLoaded = loadAnalyzedPackageFiles(currentRawRoot, { expectedPaperId: paperId })
  assert.equal(currentRawLoaded.content.groups.find(({ slotId }) =>
    slotId === 'writing.continuation').writingTask.prompt, currentPrompt,
  'one representable current-standard raw Review fixture converts without changing current text')
  assert.match(currentRawLoaded.manifest.sources[0].description, /external transcription/u)
} finally {
  rmSync(rawExport.tempRoot, { recursive: true, force: true })
}

const externalListeningPromotion = makeOnlinePromotionContext(
  'external-listening',
  paperId,
  null,
  { listening: true, analyzedPackage: true },
)
try {
  assert.equal(
    externalListeningPromotion.approval.externalListeningReview.reviewMethod,
    'owner_screen_pdf_approval',
  )
  assert.equal(
    Object.hasOwn(externalListeningPromotion.approval.externalListeningReview, 'engine'),
    false,
    'Owner receipt records no invented ASR engine or comparison score',
  )
  const restartedStore = createImportReviewStore({
    dbPath: path.join(externalListeningPromotion.tempRoot, 'import-review.sqlite'),
    filesRoot: path.join(externalListeningPromotion.tempRoot, 'review-files'),
    rendererBuildId: 'renderer-single-paper-promotion-verifier',
  })
  const persistedReviewProof = restartedStore.mintExternalListeningPublicationProof(
    paperId,
    promotionRequest(externalListeningPromotion.approval),
  )
  const persistedReviewIdentity = externalListeningReviewProofIdentity(persistedReviewProof)
  assert.equal(persistedReviewIdentity.approvalId, externalListeningPromotion.approval.approvalId,
    'only the persisted current Owner approval mints external Listening proof identity')
  assert.equal(Object.isFrozen(persistedReviewIdentity), true,
    'external Listening proof identity is read-only')
  assert.equal(externalListeningReviewProofIdentity(structuredClone(persistedReviewProof)), null,
    'cloning a store-minted proof cannot preserve authority')
  const service = createSinglePaperPromotionService({
    getStore: () => restartedStore,
    openDatabase: externalListeningPromotion.openDatabase,
    paperAssetsDir: externalListeningPromotion.paperAssetsDir,
  })
  const promoted = service.promote(
    paperId,
    promotionRequest(externalListeningPromotion.approval),
    'synthetic-agent',
  )
  assert.equal(promoted.status, 'published',
    'approved external MP3 publishes through the existing single-paper service')
  const publishedAudio = readFileSync(path.join(
    externalListeningPromotion.paperAssetsDir,
    paperId,
    'versions/v1/listening/playback.mp3',
  ))
  assert.equal(
    sha256(publishedAudio),
    externalListeningPromotion.projection.listeningReview.audio.playbackAudioSha256,
    'immutable publication preserves the exact reviewed MP3',
  )
  assert.match(promoted.consumers.screen.listeningAudio.url, /\/versions\/v1\/listening\/playback\.mp3$/,
    'current publication readback resolves the immutable reviewed audio version')
} finally {
  rmSync(externalListeningPromotion.tempRoot, { recursive: true, force: true })
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

// The sidecar is optional for legacy versions, but a claimed reviewed sidecar
// must survive the same atomic receipt, recovery and rollback as Canonical.
// These cases are authored here for Ship; preview builds do not execute them.
function attachSourceReferences(context) {
  const sidecar = prepareSourceReferences(context.projection)
  const documents = context.projection.materialization.documents.filter(document => document.role === 'official_answers')
  const evidence = documents.map(document => ({ documentSha256: document.sha256,
    locator: { kind: 'page_region', documentId: document.documentId, page: 1,
      region: { x: 0, y: 0, width: 1, height: 1 } } }))
  for (const group of sidecar.groups) for (const kind of ['essays', 'scoring']) {
    group[kind] = { state: 'not_supplied', evidence, entries: [] }
  }
  writeJson(path.join(context.reviewRoot, SOURCE_REFERENCES_FILE), sidecar)
  context.projection = buildNck1ReviewProjection(context.reviewRoot, { requireAnalyses: true })
  const approvedManifest = reviewManifestFor(context.reviewRoot, context.projection)
  return { approvedManifest, approvedIdentity: { ...approvedIdentity(context.projection),
    bundleDigest: approvedManifest.bundleDigest, approvalId: 'approval-source-reference-fixture',
    revisionId: 'revision-source-reference-fixture' } }
}

const referencePreCommit = makeContext('references-precommit')
try {
  const approval = attachSourceReferences(referencePreCommit)
  const exact = readFileSync(path.join(referencePreCommit.reviewRoot, SOURCE_REFERENCES_FILE))
  assert.throws(() => publish(referencePreCommit), /approved Review|schema/i)
  assert.throws(() => publish(referencePreCommit, { ...approval, failurePoint: 'db-write' }))
  assert.equal(publishedVersionCount(referencePreCommit), 0)
  assert(!existsSync(path.join(referencePreCommit.paperAssetsDir, paperId, 'latest')))
  rmSync(path.join(referencePreCommit.reviewRoot, SOURCE_REFERENCES_FILE))
  assert.throws(() => publish(referencePreCommit, approval), /inventory/i, 'deleted approved sidecar cannot silently become legacy')
  writeFileSync(path.join(referencePreCommit.reviewRoot, SOURCE_REFERENCES_FILE), exact)
  const result = publish(referencePreCommit, approval)
  const consumption = Object.values(result.publish.consumers)[0]
  const read = () => readSourceReferencePublication({ db: referencePreCommit.db,
    paperAssetsDir: referencePreCommit.paperAssetsDir, consumption })
  assert.equal(read().commitment.bundleDigest, approval.approvedManifest.bundleDigest)
  assert(read().sourceReferencesBytes.equals(exact))
  const file = path.join(result.publish.versionDir, SOURCE_REFERENCES_FILE)
  writeFileSync(file, Buffer.from('{}'))
  assert.throws(read, /字节/)
  writeFileSync(file, exact)
  const swapped = { ...consumption, publicationDigest: `sha256:${'0'.repeat(64)}` }
  assert.throws(() => readSourceReferencePublication({ db: referencePreCommit.db,
    paperAssetsDir: referencePreCommit.paperAssetsDir, consumption: swapped }), /不一致/)
} finally { close(referencePreCommit) }

const referenceRecovery = makeContext('references-recovery')
try {
  const approval = attachSourceReferences(referenceRecovery)
  const exact = readFileSync(path.join(referenceRecovery.reviewRoot, SOURCE_REFERENCES_FILE))
  assert.throws(() => publish(referenceRecovery, { ...approval, failurePoint: 'committed-reload' }))
  const paperDir = path.join(referenceRecovery.paperAssetsDir, paperId)
  const journal = path.join(paperDir, '.latest-swap.json')
  const latest = path.join(paperDir, 'latest', SOURCE_REFERENCES_FILE)
  writeFileSync(latest, Buffer.from('{}'))
  assert.throws(() => recoverInterruptedPaperImportPublish({ db: referenceRecovery.db,
    paperAssetsDir: referenceRecovery.paperAssetsDir, paperId }), /Review bytes/)
  assert(existsSync(journal), 'failed recovery retains committed evidence')
  writeFileSync(latest, exact)
  const retry = publish(referenceRecovery, approval)
  assert.equal(retry.status, 'idempotent')
  assert.equal(publishedVersionCount(referenceRecovery), 1)
  assert(!existsSync(journal))
  writeFileSync(latest, Buffer.from('{}'))
  assert.throws(() => rollbackPaperImportPublication({ db: referenceRecovery.db,
    paperAssetsDir: referenceRecovery.paperAssetsDir, paperId, versionName: 'v1' }), /Review bytes/)
  writeFileSync(latest, exact)
} finally { close(referenceRecovery) }

const referenceRollback = makeContext('references-rollback')
try {
  const legacy = publish(referenceRollback)
  assert.equal(readSourceReferencePublication({ db: referenceRollback.db, paperAssetsDir: referenceRollback.paperAssetsDir,
    consumption: Object.values(legacy.publish.consumers)[0] }), null)
  // A new reviewed source, not a late mutable attachment to legacy v1.
  Object.assign(referenceRollback, makeReviewRoot(path.join(referenceRollback.tempRoot, 'v2'),
    paperId, 'new source for the second reviewed version'))
  const configPath = path.join(referenceRollback.reviewRoot, 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  writeJson(configPath, { ...config, provenance: { ...config.provenance, year: 2026, month: 11 } })
  const approval = attachSourceReferences(referenceRollback)
  const current = publish(referenceRollback, approval)
  assert.equal(current.publish.assetVersion, 2)
  const months = () => referenceRollback.db.prepare('SELECT DISTINCT month FROM sources').all().map(row => row.month)
  assert.deepEqual(months(), [11])
  const exact = readFileSync(path.join(current.publish.versionDir, SOURCE_REFERENCES_FILE))
  rollbackPaperImportPublication({ db: referenceRollback.db, paperAssetsDir: referenceRollback.paperAssetsDir, paperId, versionName: 'v1' })
  const latest = path.join(referenceRollback.paperAssetsDir, paperId, 'latest', SOURCE_REFERENCES_FILE)
  assert(!existsSync(latest), 'rolling back to a legacy version removes the later answer sidecar')
  assert.deepEqual(months(), [null], 'old unknown month must replace the newer month during rollback')
  rollbackPaperImportPublication({ db: referenceRollback.db, paperAssetsDir: referenceRollback.paperAssetsDir, paperId, versionName: 'v2' })
  assert(readFileSync(latest).equals(exact))
  assert.deepEqual(months(), [11])
} finally { close(referenceRollback) }

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

// An approved historical paper without listening/navigation must publish under
// its retained authority, not today's default; summary bindings make drift fail.
const retainedOnline = makeOnlinePromotionContext('retained-v66', paperId, null, {
  publicPaper: true, retainedAuthorityRef: nck1MaterializationHistoricalAuthorityRef66,
})
try {
  assert(!existsSync(path.join(retainedOnline.reviewRoot, 'listening-review-v1.json')))
  const service = createSinglePaperPromotionService({
    getStore: () => retainedOnline.reviewStore,
    openDatabase: retainedOnline.openDatabase,
    paperAssetsDir: retainedOnline.paperAssetsDir,
  })
  const result = await service.promote(paperId, promotionRequest(retainedOnline.approval), 'synthetic-owner')
  assert.equal(result.status, 'published', JSON.stringify(result))
  assert.equal(result.consumers.screen.authorityRef.manifestVersion, '66')
  assert.equal(result.promotion.candidateDigest, retainedOnline.approval.candidateDigest)
} finally {
  rmSync(retainedOnline.tempRoot, { recursive: true, force: true })
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

  let afterPublishCalls = 0
  const promotionService = createSinglePaperPromotionService({
    getStore: () => online.reviewStore,
    openDatabase: online.openDatabase,
    paperAssetsDir: online.paperAssetsDir,
    afterPublish: () => { afterPublishCalls += 1 },
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
  assert.equal(fixedPdfResponse.status, 200, `Review fixed PDF must render through the real public route${fixedPdfResponse.ok ? '' : `: ${await fixedPdfResponse.text()}`}`)
  assert.equal(fixedPdfResponse.headers.get('x-eqb-pagination-edition'), 'friendly8')
  assert.equal(fixedPdfResponse.headers.get('x-eqb-pagination-pages'), '8')
  const fixedPdfPath = path.join(online.tempRoot, 'review-fixed8.pdf')
  writeFileSync(fixedPdfPath, Buffer.from(await fixedPdfResponse.arrayBuffer()))
  assert.match(execFileSync('pdfinfo', [fixedPdfPath], { encoding: 'utf8' }), /Pages:\s+8\b/)
  const reviewRow = reviewPage.locator(`[data-review-paper="${paperId}"]`)
  await reviewRow.getByText('待发布', { exact: true }).waitFor()
  assert.equal(await reviewPage.locator('iframe, #approval-check').count(), 0)
  assert.match(await reviewRow.locator('.owner-review-name a').getAttribute('href'),
    new RegExp(`reviewRevision=${online.revision.id}`))
  const pathname = `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}/promotions`
  let body = JSON.stringify(promotionRequest(online.approval))
  for (const headers of [
    { authorization: 'Bearer synthetic-agent-token' },
    { 'x-synthetic-owner': '1' },
  ]) {
    const denied = await fetch(`${started.origin}${pathname}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body,
    })
    assert.equal(denied.status, 401, 'Agent and Owner cannot use the privileged ship-token route')
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

  const ownerPath = `/api/import-reviews/papers/${paperId}/revisions/${online.revision.id}/publish`
  const ownerInput = { intent: 'publish', bundleDigest: online.revision.bundleDigest,
    rendererBuildId: online.revision.rendererBuildId }
  const ownerHeaders = { 'x-synthetic-owner': '1', 'content-type': 'application/json',
    origin: started.origin, 'x-eqb-csrf': 'owner-review' }
  const ownerPublish = (input = ownerInput, headers = ownerHeaders, url = ownerPath) => fetch(`${started.origin}${url}`, {
    method: 'POST', headers, body: JSON.stringify(input),
  })
  for (const headers of [
    { 'content-type': 'application/json' },
    { authorization: 'Bearer synthetic-agent-token', 'content-type': 'application/json' },
    { ...ownerHeaders, 'x-synthetic-role': 'member' },
    { ...ownerHeaders, 'x-synthetic-kind': 'import_agent' },
    { ...ownerHeaders, origin: 'https://hostile.test' },
    { ...ownerHeaders, origin: '' },
    { ...ownerHeaders, 'x-eqb-csrf': '' },
  ]) assert.equal((await ownerPublish(ownerInput, headers)).status, 403)
  for (const input of [
    { ...ownerInput, bundleDigest: `sha256:${'0'.repeat(64)}` },
    { ...ownerInput, rendererBuildId: 'old-renderer' },
  ]) assert.equal((await ownerPublish(input)).status, 409)
  assert.equal((await ownerPublish({ ...ownerInput, intent: undefined })).status, 400)
  assert.equal((await ownerPublish(ownerInput, ownerHeaders, ownerPath.replace(online.revision.id, 'old-revision'))).status, 409)
  assert.equal(afterPublishCalls, 0)

  // Returning a whole paper needs no invented question/page. A browser cannot
  // return an unseen revision, and unresolved feedback blocks auto-approval.
  const returnUrl = `${started.origin}/api/import-reviews/papers/${paperId}/issues`
  const feedback = { revisionId: online.revision.id, bundleDigest: online.revision.bundleDigest,
    surface: 'paper', message: 'Synthetic whole-paper return for revision review.' }
  assert.equal((await fetch(returnUrl, { method: 'POST', headers: ownerHeaders,
    body: JSON.stringify({ ...feedback, bundleDigest: 'stale' }) })).status, 409)
  const returned = await fetch(returnUrl, { method: 'POST', headers: ownerHeaders, body: JSON.stringify(feedback) })
  assert.equal(returned.status, 201)
  const returnedIssue = (await returned.json()).issues[0]
  assert.equal(online.reviewStore.getRevision(online.revision.id).approval, null)
  assert.equal((await ownerPublish()).status, 409)
  online.reviewStore.updateIssue(paperId, returnedIssue.id, { action: 'dismiss' })
  await reviewPage.reload()
  const [promoted] = await Promise.all([
    reviewPage.waitForResponse(response => new URL(response.url()).pathname === ownerPath),
    reviewRow.getByRole('button', { name: '发布到题库', exact: true }).click(),
  ])
  assert.equal(promoted.status(), 200)
  const promotedBody = await promoted.json()
  online.approval = online.reviewStore.getRevision(online.revision.id).approval
  body = JSON.stringify(promotionRequest(online.approval))
  assert.equal(online.approval.approvedBy, 'synthetic-owner')
  assert.equal(promotedBody.promotion.requestedBy, 'synthetic-owner')
  const duplicateOwner = await ownerPublish()
  assert.equal((await duplicateOwner.json()).promotion.promotionId, promotedBody.promotion.promotionId)
  assert.equal(promotedBody.status, 'published')
  assert.equal(promotedBody.promotion.state, 'published')
  assert.equal(promotedBody.promotion.versionName, 'v1')
  assert.equal(promotedBody.promotion.revisionId, online.approval.revisionId)
  assert.equal(
    promotedBody.promotion.analysisPublicationDigest,
    analysisDigestAt(path.join(online.paperAssetsDir, paperId, 'versions/v1')),
  )
  assert.equal(afterPublishCalls, 1, 'a real publish fires afterPublish exactly once')
  // Detail #352: api.mjs must wire that hook to the process-lifetime read
  // caches, otherwise promoted groups stay invisible to 配相似 until restart.
  {
    const apiSource = readFileSync(path.join(root, 'server/api.mjs'), 'utf8')
    const wiring = apiSource.match(/createSinglePaperPromotionService\(\{[\s\S]*?\}\)/)?.[0] || ''
    assert.match(wiring, /afterPublish/, 'api.mjs promotion service wires afterPublish')
    assert.match(wiring, /similarQuestionsStore\.invalidate\(\)/, 'publish clears the similar-questions raw index cache')
    assert.match(wiring, /teachingFacetIndex\.invalidate\(\)/, 'publish clears the teaching facet index')
    assert.match(wiring, /paperSurfaceAnalysisAvailability\.invalidate\(\)/, 'publish clears the analysis-availability cache')
  }
  await reviewPage.reload()
  await reviewRow.getByText('已发布', { exact: true }).waitFor()
  assert.equal(await reviewRow.getByRole('button', { name: '发布到题库' }).count(), 0)
  assert.equal(await reviewRow.getByRole('link', { name: '查看已发布' }).count(), 1)

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
  assert.equal(afterPublishCalls, 1, 'idempotent/failed promotions never re-fire afterPublish')

  const viewedPublication = { sourceAssetVersion: promotedBody.promotion.assetVersion,
    publicationDigest: promotedBody.promotion.canonicalPublicationDigest }
  assert.equal(online.reviewStore.publishedReview(paperId, viewedPublication).revisionId, online.revision.id)
  const repairIssue = online.reviewStore.createIssue(paperId, {
    revisionId: online.revision.id, surface: 'screen',
    groupId: Object.keys(online.projection.paperAsset.content.groups)[0],
    message: 'The first option needs more space.', ...viewedPublication,
  }, 'synthetic-owner').issues[0]
  assert.equal(repairIssue.publicationDigest, viewedPublication.publicationDigest)
  assert.deepEqual(online.reviewStore.getRevision(online.revision.id).approval, online.approval,
    'feedback never erases the immutable approval of a published version')
  const nextFixture = makeReviewRoot(
    path.join(online.tempRoot, 'next-approved-revision'),
    paperId,
    'newer approved synthetic source that has not been promoted',
  )
  const nextManifest = reviewManifestFor(nextFixture.reviewRoot, nextFixture.projection)
  nextManifest.resolvesIssueIds = [repairIssue.id]
  nextManifest.bundleDigest = reviewBundleDigest(nextManifest)
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
  const approvalInput = { bundleDigest: nextRevision.bundleDigest, approvalScope: 'layout_only' }
  assert.throws(() => online.reviewStore.approveRevision(paperId, nextRevision.id,
    approvalInput, 'synthetic-owner'), { code: 'IMPORT_REVIEW_ISSUES_UNRESOLVED' },
  'unconfirmed repairs still block approval')
  const concurrentIssue = online.reviewStore.createIssue(paperId, {
    revisionId: nextRevision.id, surface: 'screen', groupId: repairIssue.groupId,
    message: 'A second problem was noticed while rechecking the repair.',
  }, 'synthetic-owner').issues.find(issue => issue.id !== repairIssue.id && issue.state === 'open')
  assert.throws(() => online.reviewStore.approveRevision(paperId, nextRevision.id,
    approvalInput, 'synthetic-owner'),
  { code: 'IMPORT_REVIEW_ISSUES_UNRESOLVED' }, 'another open issue still blocks approval')
  assert.equal(online.reviewStore.paperDetail(paperId).issues.find(issue =>
    issue.id === repairIssue.id).state, 'fixed_pending_review',
  'approval does not silently confirm a repair')
  assert.throws(() => online.reviewStore.updateIssue(paperId, concurrentIssue.id, { action: 'close' }),
    { code: 'IMPORT_REVIEW_ISSUE_NOT_FIXED' }, 'an unfixed issue cannot be closed')
  online.reviewStore.updateIssue(paperId, concurrentIssue.id, { action: 'dismiss', note: 'Synthetic control only' })
  online.reviewStore.updateIssue(paperId, repairIssue.id, { action: 'close', note: 'Repair rechecked' })
  online.reviewStore.approveRevision(
    paperId,
    nextRevision.id,
    approvalInput,
    'synthetic-owner',
  )
  assert.equal(online.reviewStore.paperDetail(paperId).issues.find(issue =>
    issue.id === repairIssue.id).state, 'closed', 'existing issue closure remains separate from approval')
  await reviewPage.reload()
  await reviewRow.getByText('待发布', { exact: true }).waitFor()
  assert.equal(await reviewRow.getByText('已发布', { exact: true }).count(), 0,
    'a newer unshipped revision is not labelled published by the old receipt')
  assert.equal(await reviewRow.getByRole('button', { name: '发布到题库' }).isEnabled(), true)
  assert.equal((await ownerPublish()).status, 409, 'old browser version cannot publish a newer revision')

  const discussionThreadId = `T-${randomUUID()}`
  const replacementThreadId = `T-${randomUUID()}`
  const replayWithThreadHeader = () => fetch(`${started.origin}/api/import-agent-reviews/revisions`, {
    method: 'POST', headers: { 'content-type': 'application/json',
      authorization: 'Bearer synthetic-agent-token', 'x-amp-thread-id': replacementThreadId },
    body: JSON.stringify(nextManifest),
  })
  assert.equal((await replayWithThreadHeader()).status, 201)
  assert.equal(online.reviewStore.paperDetail(paperId, { includeProjection: false }).discussionThreadId, null,
    'ambient upload audit metadata cannot establish the discussion binding')
  const discussionUrl = `${started.origin}/api/import-agent-reviews/papers/${paperId}/discussion-thread`
  const linkThread = (threadId, expectedThreadId, authorized = true) => fetch(discussionUrl, {
    method: 'PUT', headers: { 'content-type': 'application/json',
      ...(authorized ? { authorization: 'Bearer synthetic-agent-token' } : {}) },
    body: JSON.stringify({ threadId, expectedThreadId }),
  })
  assert.equal((await linkThread(discussionThreadId, null, false)).status, 401)
  assert.equal((await linkThread('https://example.com/not-an-amp-thread', null)).status, 400)
  assert.equal((await linkThread(discussionThreadId, null)).status, 200)
  assert.equal((await linkThread(discussionThreadId, null)).status, 200, 'exact replay remains idempotent')
  assert.equal((await replayWithThreadHeader()).status, 201)
  const discussionDetailUrl = `${started.origin}/api/import-reviews/papers/${paperId}/product-review`
  assert.equal((await fetch(discussionDetailUrl)).status, 403)
  const discussionDetail = await (await fetch(discussionDetailUrl, { headers: { 'x-synthetic-owner': '1' } })).json()
  assert.equal(discussionDetail.discussionThreadId, discussionThreadId, 'later upload cannot hijack the existing discussion')
  assert.equal((await linkThread(replacementThreadId, null)).status, 409, 'unbound-only linking cannot replace an existing discussion')
  assert.equal((await linkThread(replacementThreadId, discussionThreadId)).status, 200)
  assert.equal((await linkThread(discussionThreadId, null)).status, 409, 'a stale handoff cannot undo the new binding')
  assert.equal(online.reviewStore.paperDetail(paperId, { includeProjection: false }).discussionThreadId, replacementThreadId)

  const feedbackUrl = `${started.origin}/api/import-reviews/papers/${paperId}/issues`
  const historicalFeedback = { revisionId: online.revision.id, ...viewedPublication,
    surface: 'pdf', edition: 'economy8', pageNumber: 3, message: 'This issue is on the still-public v1, not the private v2.' }
  const newApprovalBeforeFeedback = online.reviewStore.getRevision(nextRevision.id).approval
  for (const headers of [{}, { authorization: 'Bearer synthetic-agent-token' }]) {
    assert.equal((await fetch(feedbackUrl, { method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(historicalFeedback) })).status, 403)
  }
  const wrongVersion = await fetch(feedbackUrl, { method: 'POST',
    headers: { 'x-synthetic-owner': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ ...historicalFeedback, sourceAssetVersion: 2 }) })
  assert.equal(wrongVersion.status, 404, 'a publication digest cannot be paired with a different asset version')
  const historicalResponse = await fetch(feedbackUrl, { method: 'POST',
    headers: { 'x-synthetic-owner': '1', 'content-type': 'application/json' }, body: JSON.stringify(historicalFeedback) })
  assert.equal(historicalResponse.status, 201)
  const historicalDetail = await historicalResponse.json()
  assert.equal(historicalDetail.latest.id, nextRevision.id)
  const recorded = historicalDetail.issues.find(issue => issue.message === historicalFeedback.message)
  assert.equal(recorded.revisionId, online.revision.id)
  assert.equal(recorded.publicationDigest, viewedPublication.publicationDigest)
  assert.equal(recorded.pageNumber, 3)
  assert.deepEqual(online.reviewStore.getRevision(nextRevision.id).approval, newApprovalBeforeFeedback,
    'recording historical feedback does not rewrite a newer private approval')
  assert.equal(online.reviewStore.latestPromotion(paperId).versionName, 'v1',
    'feedback alone neither publishes a repair nor withdraws the public version')
} finally {
  if (onlineBrowser) await onlineBrowser.close()
  if (onlineServer) await new Promise((resolve) => onlineServer.close(resolve))
  await closeChromiumPool()
  rmSync(online.tempRoot, { recursive: true, force: true })
}

const plannedPromotion = makeOnlinePromotionContext('planned', paperId, ['reading.b'])
try {
  const service = createSinglePaperPromotionService({ getStore: () => plannedPromotion.reviewStore,
    openDatabase: plannedPromotion.openDatabase, paperAssetsDir: plannedPromotion.paperAssetsDir })
  const first = service.promote(paperId, promotionRequest(plannedPromotion.approval), 'synthetic-ship')
  assert.equal(first.status, 'published')
  const clozeV1 = JSON.parse(readFileSync(path.join(plannedPromotion.reviewRoot, 'analysis-cloze.json')))
  const clozeGroupId = Object.keys(clozeV1.groups)[0]
  const summaryV1 = clozeV1.groups[clozeGroupId].overview
  const firstDb = plannedPromotion.openDatabase()
  let summaryRow
  try {
    summaryRow = firstDb.prepare(`
      SELECT p.summary
      FROM question_groups qg JOIN passages p ON p.id = qg.passage_id
      WHERE qg.id = ?
    `).get(clozeGroupId)
  } finally {
    firstDb.close()
  }
  assert.equal(summaryRow.summary, summaryV1, 'v1 publication exposes the approved cloze introduction in DB list/search storage')
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
  const summaryV2 = '第二版完形简介：人物先遭遇困难，随后采取行动并在关键事件中迎来明确转折。'
  clozeV1.groups[clozeGroupId].overview = summaryV2
  writeJson(path.join(plannedPromotion.reviewRoot, 'analysis-cloze.json'), clozeV1)
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
  for (const file of ['reading-choice-analysis-v1.json', 'seven-choices-analysis-v1.json', 'cloze-analysis-v1.json', 'grammar-fill-analysis-v1.json']) {
    const sidecar = JSON.parse(readFileSync(path.join(paperDir, 'versions/v2/analyses', file)))
    assert.equal(sidecar.sourceAssetVersion, 2)
    for (const group of Object.values(sidecar.groups)) {
      assert.equal(group.teachingContent.sourceAssetVersion, 2,
        `${file} nested annotation authority must advance with the published version`)
    }
  }
  const db = plannedPromotion.openDatabase({ readOnly: false })
  try {
    summaryRow = db.prepare(`
      SELECT p.summary
      FROM question_groups qg JOIN passages p ON p.id = qg.passage_id
      WHERE qg.id = ?
    `).get(clozeGroupId)
    assert.equal(summaryRow.summary, summaryV2, 'v2 publication atomically exposes only its approved introduction')
    rollbackPaperImportPublication({ db, paperAssetsDir: plannedPromotion.paperAssetsDir, paperId, versionName: 'v1' })
    summaryRow = db.prepare(`
      SELECT p.summary
      FROM question_groups qg JOIN passages p ON p.id = qg.passage_id
      WHERE qg.id = ?
    `).get(clozeGroupId)
    assert.equal(summaryRow.summary, summaryV1, 'rollback restores the exact v1 DB introduction instead of stale v2 metadata')
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
  const duplicate = service.promoteOwner(paperId, preCommitPromotion.revision.id, {
    intent: 'publish', bundleDigest: preCommitPromotion.revision.bundleDigest,
    rendererBuildId: preCommitPromotion.revision.rendererBuildId,
  }, 'synthetic-owner')
  assert.equal(duplicate.status, 'publishing', 'Owner click cannot replay an interrupted publisher')
  assert.deepEqual(duplicate.promotion, publishing, 'interruption evidence and guard remain unchanged')
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

const publicCommittedWithoutReceipt = makeOnlinePromotionContext(
  'public-committed-without-receipt',
  paperId,
  null,
  { publicPaper: true },
)
try {
  assert.equal(publicCommittedWithoutReceipt.revision.manifest.schemaVersion, 'web-import-review-bundle-v2')
  const interrupted = createSinglePaperPromotionService({
    getStore: () => publicCommittedWithoutReceipt.reviewStore,
    openDatabase: publicCommittedWithoutReceipt.openDatabase,
    paperAssetsDir: publicCommittedWithoutReceipt.paperAssetsDir,
    afterPublish() { throw new Error('forced public receipt crash') },
  })
  const scopedRequest = publicCommittedWithoutReceipt.reviewStore.registerPublicationRequest(paperId, {
    requestId: `publication-request-${randomUUID()}`,
    revisionId: publicCommittedWithoutReceipt.revision.id,
    secretHash: sha256('synthetic-scoped-capability'),
  }, 'synthetic-import-agent')
  publicCommittedWithoutReceipt.reviewStore.grantPublicationRequest(scopedRequest.requestId, 'synthetic-owner')
  assert.throws(
    () => interrupted.promoteScoped(
      paperId,
      scopedRequest.requestId,
      sha256('synthetic-scoped-capability'),
      'synthetic-import-agent',
    ),
    /forced public receipt crash/,
  )
  const replay = interrupted.promoteScoped(paperId, scopedRequest.requestId,
    sha256('synthetic-scoped-capability'), 'synthetic-import-agent')
  assert.equal(replay.status, 'publishing', 'consumed replay reports retained UNKNOWN without invoking publisher again')
  const durable = publicCommittedWithoutReceipt.reviewStore.latestPromotion(paperId)
  assert.equal(durable.importProfile, 'public-paper-v1')
  assert.equal(
    durable.paragraphSummariesDigest,
    publicCommittedWithoutReceipt.approval.paragraphSummariesDigest,
  )
  const latestSummaryPath = path.join(
    publicCommittedWithoutReceipt.paperAssetsDir,
    paperId,
    'latest/paragraph-summaries-v1.json',
  )
  const exactSummaryBytes = readFileSync(latestSummaryPath)
  writeFileSync(latestSummaryPath, Buffer.concat([exactSummaryBytes, Buffer.from(' ')]))
  const resume = () => createSinglePaperPromotionService({
    getStore: () => publicCommittedWithoutReceipt.reviewStore,
    openDatabase: publicCommittedWithoutReceipt.openDatabase,
    paperAssetsDir: publicCommittedWithoutReceipt.paperAssetsDir,
    publish() { throw new Error('publisher must not run during public recovery') },
  }).promote(
    paperId,
    promotionRequest(publicCommittedWithoutReceipt.approval, 'retry_ship'),
    'ship-authorizer-token',
  )
  assert.throws(resume, /paragraph summar|digest|byte/i, 'committed public recovery rejects byte drift')
  writeFileSync(latestSummaryPath, exactSummaryBytes)
  const resumed = resume()
  assert.equal(resumed.status, 'idempotent')
  assert.equal(resumed.promotion.state, 'published')
  assert.equal(
    /^sha256:[a-f0-9]{64}$/.test(resumed.promotion.paragraphSummariesPublicationDigest),
    true,
  )
} finally {
  rmSync(publicCommittedWithoutReceipt.tempRoot, { recursive: true, force: true })
}

const publicApprovalIdentity = makeOnlinePromotionContext(
  'public-approval-identity',
  paperId,
  null,
  { publicPaper: true },
)
try {
  publicApprovalIdentity.reviewStore.beginPromotion(
    paperId,
    promotionRequest(publicApprovalIdentity.approval),
    'ship-authorizer-token',
  )
  const original = publicApprovalIdentity.approval
  const receiptDb = new DatabaseSync(publicApprovalIdentity.importReviewDbPath)
  const writeReceipt = (receipt) => receiptDb.prepare(`
    UPDATE import_review_revisions SET approval_receipt_json = ? WHERE id = ?
  `).run(JSON.stringify(receipt), original.revisionId)
  for (const [label, mutate] of [
    ['missing public approval profile', (receipt) => { delete receipt.importProfile }],
    ['altered public approval profile', (receipt) => { receipt.importProfile = 'legacy' }],
    ['missing paragraph summaries digest', (receipt) => { delete receipt.paragraphSummariesDigest }],
    ['altered paragraph summaries digest', (receipt) => {
      receipt.paragraphSummariesDigest = `sha256:${'0'.repeat(64)}`
    }],
  ]) {
    const receipt = structuredClone(original)
    mutate(receipt)
    writeReceipt(receipt)
    assert.throws(
      () => publicApprovalIdentity.reviewStore.latestPromotion(paperId),
      (error) => error.code === 'IMPORT_REVIEW_PROMOTION_IDENTITY_MISMATCH',
      `${label} must fail closed instead of projecting a legacy promotion`,
    )
  }
  writeReceipt(original)
  receiptDb.close()
  assert.equal(publicApprovalIdentity.reviewStore.latestPromotion(paperId).importProfile, 'public-paper-v1')
} finally {
  rmSync(publicApprovalIdentity.tempRoot, { recursive: true, force: true })
}

const publicOptionalAnalyses = makeOnlinePromotionContext(
  'public-optional-analyses',
  paperId,
  null,
  { publicPaper: true, preservePublicAnalyses: true },
)
try {
  assert(publicOptionalAnalyses.projection.analysisDigest, 'fixture has complete optional analyses')
  assert.equal(
    publicOptionalAnalyses.revision.manifest.analysisDigest,
    publicOptionalAnalyses.projection.analysisDigest,
    'v2 manifest normalization preserves the digest of actual complete optional analyses',
  )
  assert.equal(
    publicOptionalAnalyses.approval.analysisDigest,
    publicOptionalAnalyses.projection.analysisDigest,
    'v2 approval preserves optional analysis identity',
  )
  const begun = publicOptionalAnalyses.reviewStore.beginPromotion(
    paperId,
    promotionRequest(publicOptionalAnalyses.approval),
    'ship-authorizer-token',
  )
  assert.equal(begun.promotion.analysisDigest, publicOptionalAnalyses.projection.analysisDigest)
  const identityDb = new DatabaseSync(publicOptionalAnalyses.importReviewDbPath)
  const originalManifest = publicOptionalAnalyses.revision.manifest
  const writeManifest = (manifest) => identityDb.prepare(`
    UPDATE import_review_revisions SET manifest_json = ? WHERE id = ?
  `).run(JSON.stringify(manifest), publicOptionalAnalyses.approval.revisionId)
  for (const mutate of [
    (manifest) => { delete manifest.analysisDigest },
    (manifest) => { manifest.analysisDigest = `sha256:${'0'.repeat(64)}` },
  ]) {
    const manifest = structuredClone(originalManifest)
    mutate(manifest)
    writeManifest(manifest)
    assert.throws(
      () => publicOptionalAnalyses.reviewStore.latestPromotion(paperId),
      (error) => error.code === 'IMPORT_REVIEW_PROMOTION_IDENTITY_MISMATCH',
      'optional analysis presence and value stay bound to the durable promotion',
    )
  }
  writeManifest(originalManifest)
  identityDb.close()
} finally {
  rmSync(publicOptionalAnalyses.tempRoot, { recursive: true, force: true })
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
  const failureService = createSinglePaperPromotionService({
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
  })
  const failed = failureService.promote(
    paperId,
    promotionRequest(knownFailure.approval),
    'ship-authorizer-token',
  )
  assert.equal(failed.status, 'failed')
  assert.equal(failed.promotion.state, 'failed')
  const duplicate = failureService.promoteOwner(paperId, knownFailure.revision.id, {
    intent: 'publish', bundleDigest: knownFailure.revision.bundleDigest,
    rendererBuildId: knownFailure.revision.rendererBuildId,
  }, 'synthetic-owner')
  assert.equal(duplicate.status, 'failed')
  assert.deepEqual(duplicate.promotion, failed.promotion, 'Owner click retains failure without retrying publication')
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
  let remoteOcrReceipt = null
  let submittedRepair = null
  reviewServer = createServer(async (request, response) => {
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
    if (request.method === 'POST' && url.pathname === '/api/import-agent-reviews/revisions') {
      submittedRepair = await readJsonRouteBody(request)
      response.writeHead(409, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ code: 'IMPORT_REVIEW_BASE_REVISION_STALE', error: 'fixture base advanced' }))
      return
    }
    if (request.method === 'GET'
      && url.pathname === '/api/import-agent-reviews/revisions/rev-historical-ocr/ocr-confirmation'
      && remoteOcrReceipt) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ receipt: remoteOcrReceipt }))
      return
    }
    if (
      request.method === 'GET'
      && url.pathname
        === `/api/import-agent-reviews/revisions/${encodeURIComponent(approval.revisionId)}/files`
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
  await assert.rejects(
    runReviewCommand(['hydrate', cliPaperId, '--revision'], commandEnv),
    /requires an exact revision id/,
  )
  await assert.rejects(
    runReviewCommand(['hydrate', cliPaperId, '--revision', 'rev-not-present'], commandEnv),
    /no finalized Candidate revision to hydrate: rev-not-present/,
  )
  assert(!existsSync(cliPaperDir), 'an explicit missing revision never falls back to latest')
  const latestBeforeHistoricalRestore = status.latest
  const historicalRevision = { ...status.latest, state: 'superseded' }
  status.revisions = [historicalRevision]
  status.latest = {
    ...status.latest,
    id: 'rev-newer-uploading',
    state: 'uploading',
    finalizedAt: null,
    manifest: null,
  }
  status.latestRevisionId = status.latest.id
  status.files = []
  const exactHydrateArgs = ['hydrate', cliPaperId, '--revision', historicalRevision.id]
  for (const invalid of [
    { paperId: 'paper-another-source' },
    { reviewKind: 'ocr' },
    { state: 'uploading' },
    { finalizedAt: null },
  ]) {
    status.revisions = [{ ...historicalRevision, ...invalid }]
    await assert.rejects(
      runReviewCommand(exactHydrateArgs, commandEnv),
      /no finalized Candidate revision to hydrate/,
    )
    assert(!existsSync(cliPaperDir), 'ineligible historical revision creates no workspace')
  }
  status.revisions = [historicalRevision]
  hydrateFailure = 'changed'
  await assert.rejects(
    runReviewCommand(exactHydrateArgs, commandEnv),
    /Hydrated Review file changed in transit/,
  )
  assert.deepEqual(hydrateTemps(), hydrateTempsBefore, 'historical integrity failure removes only its temporary workspace')
  hydrateFailure = null
  const exactHydrated = JSON.parse((await runReviewCommand(exactHydrateArgs, commandEnv)).stdout)
  assert.equal(exactHydrated.revisionId, historicalRevision.id)
  assert.equal(exactHydrated.bundleDigest, bundleDigest)
  for (const file of files) {
    assert.deepEqual(
      readFileSync(resolveReviewFile(cliPaperDir, file.path)),
      readFileSync(resolveReviewFile(sourceReviewRoot, file.path)),
      'historical restore uses the selected revision bytes, not the latest inventory',
    )
  }
  await assert.rejects(
    runReviewCommand(exactHydrateArgs, commandEnv),
    /Local paper workspace already exists/,
  )
  const inventoryRevisionId = `rev-${randomUUID()}`
  status.revisions = [{ ...historicalRevision, id: inventoryRevisionId }, status.latest]
  const changedFile = files[0]
  const changedPath = resolveReviewFile(cliPaperDir, changedFile.path)
  const originalBytes = readFileSync(changedPath)
  const modifiedBytes = Buffer.concat([originalBytes, Buffer.from('local unfinished repair')])
  writeFileSync(changedPath, modifiedBytes)
  writeFileSync(path.join(cliPaperDir, 'local-only-note.txt'), 'Preserve this unfinished note')
  symlinkSync(sourceReviewRoot, path.join(cliPaperDir, 'outside-workspace'))
  const inventory = JSON.parse((await runReviewCommand(
    ['cleanup-plan', cliPaperId, '--revision', inventoryRevisionId], commandEnv,
  )).stdout)
  assert.equal(inventory.revisionId, inventoryRevisionId)
  assert.equal(inventory.mode, 'inspection_only')
  assert.equal(inventory.eligibleForDeletion, false, 'remote manifest matching alone never permits deletion')
  assert.equal(inventory.reclaimableBytes, null, 'logical bytes are not reclaimed disk space')
  assert(inventory.blockers.includes('uploading_revision_requires_reconciliation'))
  assert(inventory.blockers.includes('independent_backup_and_restore_not_proven'))
  assert.equal(inventory.files.find(file => file.path === changedFile.path).preserve, 'differs_from_remote_manifest')
  assert.equal(inventory.files.find(file => file.path === 'local-only-note.txt').preserve, 'outside_remote_manifest')
  assert.equal(inventory.files.find(file => file.path === 'outside-workspace').preserve, 'symlink_or_special_file')
  assert(!inventory.files.some(file => file.path.startsWith('outside-workspace/')), 'inventory never follows directory symlinks')
  assert(inventory.files.some(file => file.preserve === null), 'unchanged remote-bound files are distinguished from local edits')
  assert.deepEqual(readFileSync(changedPath), modifiedBytes, 'inspection preserves unfinished edits')
  assert.equal(readFileSync(path.join(cliPaperDir, 'local-only-note.txt'), 'utf8'), 'Preserve this unfinished note')
  await assert.rejects(runReviewCommand(['cleanup-plan', cliPaperId], commandEnv), /requires --revision/)
  writeFileSync(changedPath, originalBytes)
  rmSync(path.join(cliPaperDir, 'local-only-note.txt'))
  rmSync(path.join(cliPaperDir, 'outside-workspace'))
  status.revisions = [historicalRevision]
  await assert.rejects(runReviewCommand(['push', cliPaperId], commandEnv), /IMPORT_REVIEW_BASE_REVISION_STALE/)
  assert.equal(submittedRepair.expectedBaseRevisionId, historicalRevision.id,
    'a repair must name its restored source revision, not silently use the newer latest')
  rmSync(cliPaperDir, { recursive: true, force: true })
  status.latest = latestBeforeHistoricalRestore
  status.latestRevisionId = status.latest.id
  status.revisions = [status.latest]
  status.files = files
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

  // Public-paper recovery needs the exact server-held OCR receipt, not only
  // the Candidate report. A later OCR revision must not substitute for it.
  rmSync(cliPaperDir, { recursive: true, force: true })
  const configPath = path.join(sourceReviewRoot, 'config.json')
  writeJson(configPath, { ...JSON.parse(readFileSync(configPath, 'utf8')), importProfile: 'public-paper-v1' })
  writeJson(path.join(sourceReviewRoot, 'paragraph-summaries-v1.json'), {
    schemaVersion: 'paragraph-summaries-v1', paperId: cliPaperId,
    sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
    groups: [...Map.groupBy(enumerateParagraphSummaryTargets(projection.materialization), ({ groupId }) => groupId)]
      .map(([groupId, targets]) => ({ groupId,
        paragraphs: targets.map(({ paragraphId }) => ({ paragraphId, summary: '恢复校验用段落摘要。' })) })),
  })
  writeJson(path.join(sourceReviewRoot, 'public-search-metadata-v1.json'),
    publicMetadataFixture(projection.materialization, projection.sourceDigest, projection.candidateDigest))
  const ocrReport = {
    schemaVersion: 'agent-ocr-correction-report-v2', paperId: cliPaperId,
    sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
    ocrRevisionId: 'rev-historical-ocr', ocrConfirmationId: 'ocr-confirmation-fixture',
    originalSourceSetDigest: nck1OcrSourceSetDigest(projection.manifest.documents),
    ocrEvidenceDigest: sha256(Buffer.from('historical-ocr-fixture')), entries: [],
  }
  writeJson(path.join(sourceReviewRoot, 'agent-ocr-correction-report-v2.json'), ocrReport)
  const restoredProjection = buildNck1ReviewProjection(sourceReviewRoot)
  files.splice(0, files.length, ...reviewBundleFilePaths(sourceReviewRoot).map(file => {
    const bytes = readFileSync(resolveReviewFile(sourceReviewRoot, file.path))
    return { ...file, sha256: sha256(bytes), byteLength: bytes.length }
  }))
  const repairManifest = { ...manifestBase, schemaVersion: 'web-import-review-bundle-v3',
    importProfile: 'public-paper-v1', paragraphSummariesDigest: restoredProjection.paragraphSummariesDigest,
    publicSearchMetadataDigest: restoredProjection.publicSearchMetadataDigest,
    ocrCorrectionReportVersion: ocrReport.schemaVersion, ocrCorrectionReportDigest: digestJson(ocrReport), files }
  repairManifest.bundleDigest = reviewBundleDigest(repairManifest)
  status.latest = { ...status.latest, manifest: repairManifest, bundleDigest: repairManifest.bundleDigest }
  remoteOcrReceipt = {
    schemaVersion: 'web-import-ocr-review-confirmation-v1', paperId: cliPaperId,
    revisionId: ocrReport.ocrRevisionId, confirmationId: ocrReport.ocrConfirmationId,
    reviewerKind: 'import_agent', sourceSetDigest: ocrReport.originalSourceSetDigest,
    evidenceDigest: ocrReport.ocrEvidenceDigest,
    correctionReport: { sourceSetDigest: ocrReport.originalSourceSetDigest, entries: [] },
    confirmation: { documents: [] },
  }
  const originalOcrReceipt = structuredClone(remoteOcrReceipt)
  for (const change of [{ paperId: 'paper-other' }, { revisionId: 'rev-newer-ocr' },
    { confirmationId: 'wrong-confirmation' }, { reviewerKind: 'owner' },
    { evidenceDigest: sha256(Buffer.from('wrong-evidence')) }]) {
    remoteOcrReceipt = { ...originalOcrReceipt, ...change }
    await assert.rejects(runReviewCommand(['hydrate', cliPaperId], commandEnv), /exact historical correction binding/)
    assert(!existsSync(cliPaperDir))
    assert.deepEqual(hydrateTemps(), hydrateTempsBefore)
  }
  remoteOcrReceipt = originalOcrReceipt
  await runReviewCommand(['hydrate', cliPaperId], commandEnv)
  assert.deepEqual(JSON.parse(readFileSync(path.join(cliPaperDir, 'signals/agent-proofreading-receipt.json'), 'utf8')),
    originalOcrReceipt, 'restore the server receipt unchanged instead of recreating an approval')
  assert(!existsSync(path.join(cliPaperDir, 'signals/source-intake-initialization.json')),
    'restoration must not transfer a different worker\'s source claim')
} finally {
  if (reviewServer) {
    await new Promise((resolve) => reviewServer.close(resolve))
  }
  rmSync(cliPaperDir, { recursive: true, force: true })
  rmSync(cliTempRoot, { recursive: true, force: true })
}

console.log('verify-universal-nck1-publish: PASS')
}
