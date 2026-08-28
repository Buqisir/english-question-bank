import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  compileNck1MaterializationCandidatePreview,
  importCanonicalCandidate,
} from '../../shared/paper-canonical/compiler.mjs'
import { resolveCanonicalAuthority } from '../../shared/paper-canonical/authority.mjs'
import { consumerContractRefs } from '../../shared/paper-canonical/consumers.mjs'
import { projectCanonicalPaper } from '../../shared/paper-canonical/projector.mjs'
import { digestJson, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import {
  assertCanonicalConsumptionVisibleStructure,
  assertCanonicalVisibleStructure,
} from '../../shared/paper-canonical/visibleStructure.mjs'

function fail(message, code = 'IMPORT_REVIEW_CANDIDATE_INVALID') {
  const error = new Error(message)
  error.code = code
  throw error
}

export function reviewMediaFileName(media) {
  const extension = ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  })[media.mimeType]
  if (!extension) fail(`Unsupported Candidate media type: ${media.mimeType}`)
  return `${media.mediaId.replaceAll(':', '__')}.${extension}`
}

function normalizedRelativePath(value, label) {
  if (
    typeof value !== 'string'
    || !value
    || value.includes('\\')
    || path.posix.isAbsolute(value)
    || path.posix.normalize(value) !== value
    || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) fail(`${label} has an invalid relative path`, 'IMPORT_REVIEW_PATH_INVALID')
  return value
}

export function resolveReviewFile(rootDir, relativePath, label = 'Review file') {
  const normalized = normalizedRelativePath(relativePath, label)
  const root = path.resolve(rootDir)
  const resolved = path.resolve(root, ...normalized.split('/'))
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    fail(`${label} escapes the revision root`, 'IMPORT_REVIEW_PATH_INVALID')
  }
  return resolved
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} is missing`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    fail(`${label} is not valid JSON`)
  }
}

export function loadNck1ReviewSource(rootDir) {
  const config = readJson(resolveReviewFile(rootDir, 'config.json'), 'config.json')
  const manifest = readJson(
    resolveReviewFile(rootDir, 'universal-source-manifest.json'),
    'universal-source-manifest.json',
  )
  if (
    manifest.schemaVersion !== 'universal-nck1-source-manifest-v1'
    || manifest.paperId !== config.paperId
    || !Array.isArray(manifest.documents)
  ) fail('Universal NCK1 source manifest is incomplete')
  const materializationPath = resolveReviewFile(
    rootDir,
    normalizedRelativePath(manifest.materializationPath, 'materializationPath'),
  )
  if (!existsSync(materializationPath)) fail('Source Materialization is missing')
  const materializationBytes = new Uint8Array(readFileSync(materializationPath))
  let materialization
  try {
    materialization = JSON.parse(new TextDecoder().decode(materializationBytes))
  } catch {
    fail('Source Materialization is not valid JSON')
  }
  const documentPathById = new Map(manifest.documents.map((document) => [
    document.documentId,
    resolveReviewFile(rootDir, normalizedRelativePath(document.path, `document ${document.documentId}`)),
  ]))
  const sourceInput = {
    kind: 'nck1-source-materialization',
    materializationBytes,
    documents: materialization.documents.map((document) => {
      const sourcePath = documentPathById.get(document.documentId)
      if (!sourcePath || !existsSync(sourcePath)) {
        fail(`Materialized document is unavailable: ${document.documentId}`)
      }
      return {
        documentId: document.documentId,
        bytes: new Uint8Array(readFileSync(sourcePath)),
      }
    }),
    media: materialization.media.map((media) => {
      const relativePath = path.posix.join(
        normalizedRelativePath(manifest.mediaDirectory, 'mediaDirectory'),
        reviewMediaFileName(media),
      )
      const mediaPath = resolveReviewFile(rootDir, relativePath)
      if (!existsSync(mediaPath)) fail(`Materialized media is unavailable: ${media.mediaId}`)
      return { mediaId: media.mediaId, bytes: new Uint8Array(readFileSync(mediaPath)) }
    }),
  }
  return { config, manifest, materialization, sourceInput }
}

export function reviewBundleFilePaths(rootDir) {
  const { manifest, materialization } = loadNck1ReviewSource(rootDir)
  return [
    { path: 'config.json', mediaType: 'application/json', role: 'config' },
    {
      path: 'universal-source-manifest.json',
      mediaType: 'application/json',
      role: 'source_manifest',
    },
    {
      path: normalizedRelativePath(manifest.materializationPath, 'materializationPath'),
      mediaType: 'application/json',
      role: 'materialization',
    },
    ...manifest.documents.map((document) => ({
      path: normalizedRelativePath(document.path, `document ${document.documentId}`),
      mediaType: document.mediaType,
      role: document.role,
    })),
    ...materialization.media.map((media) => ({
      path: path.posix.join(
        normalizedRelativePath(manifest.mediaDirectory, 'mediaDirectory'),
        reviewMediaFileName(media),
      ),
      mediaType: media.mimeType,
      role: 'content_media',
    })),
  ]
}

function visibleStructure(projected) {
  const structure = projected.nodes.flatMap((node) => {
    if (['part', 'section', 'instruction'].includes(node.kind)) {
      return [structuredClone(node)]
    }
    if (node.kind === 'group') {
      return [{
        kind: 'group',
        slotId: node.slotId,
        groupId: node.groupId,
        familyContractId: node.familyContractId,
      }]
    }
    if (node.kind === 'answer_region') return []
    fail(`Candidate projection contains unknown node kind: ${node.kind}`)
  })
  assertCanonicalVisibleStructure(
    structure,
    projected.nodes
      .filter((node) => node.kind === 'group')
      .map((node) => ({
        slotId: node.slotId,
        groupId: node.groupId,
        familyContractId: node.familyContractId,
      })),
  )
  return structure
}

function mediaArtifacts(projected, sourceCapture) {
  const documents = new Map(sourceCapture.documents.map((document) => [
    document.immutableArtifactRef?.artifactId,
    document,
  ]))
  const artifacts = new Map()
  for (const occurrence of projected.nodes) {
    if (occurrence.kind !== 'group') continue
    for (const media of occurrence.media || []) {
      const document = documents.get(media.sourceArtifactRef?.artifactId)
      if (
        !document
        || document.sha256 !== media.sha256
        || document.mediaType !== media.mimeType
        || typeof document.encodedBytes !== 'string'
      ) fail(`Candidate media does not close against source bytes: ${media.mediaId}`)
      const artifact = {
        mediaId: media.mediaId,
        mimeType: media.mimeType,
        sha256: media.sha256,
        pixelWidth: media.pixelWidth,
        pixelHeight: media.pixelHeight,
        sourceArtifactRef: media.sourceArtifactRef,
        encodedBytes: document.encodedBytes,
      }
      const existing = artifacts.get(media.mediaId)
      if (existing && stableStringify(existing) !== stableStringify(artifact)) {
        fail(`Candidate media identity is ambiguous: ${media.mediaId}`)
      }
      artifacts.set(media.mediaId, artifact)
    }
  }
  return [...artifacts.values()]
}

function buildConsumption(candidate, compilation) {
  const { sourceCapture, canonicalPaper } = compilation.artifacts
  const authority = resolveCanonicalAuthority(canonicalPaper.paperPlan.authorityRef)
  if (!authority.ok) fail('Candidate preview authority is unavailable')
  const projected = projectCanonicalPaper({
    plan: canonicalPaper.paperPlan,
    groups: canonicalPaper.questionGroups,
    sourceCapture,
    authorityClosure: authority.closure,
  })
  const groupsByFamily = new Map()
  for (const group of canonicalPaper.questionGroups) {
    const familyContractId = group.contractRef.familyContractId
    const groupIds = groupsByFamily.get(familyContractId) || []
    groupIds.push(group.identity.groupId)
    groupsByFamily.set(familyContractId, groupIds)
  }
  const selections = [...groupsByFamily].map(([familyContractId, groupIds]) => {
    const projectedOccurrences = projected.nodes.filter(
      (node) => node.kind === 'group' && groupIds.includes(node.groupId),
    )
    return {
      mode: 'canonical',
      familyContractId,
      groupIds,
      projectedOccurrences,
      ...(['cloze', 'grammar-fill'].includes(familyContractId)
        ? {
            projectedOccurrenceDigests: projectedOccurrences.map((occurrence) => ({
              groupId: occurrence.groupId,
              digest: digestJson(occurrence),
            })),
          }
        : {}),
    }
  })
  const structure = visibleStructure(projected)
  const consumption = {
    disposition: 'ready',
    paperId: canonicalPaper.paperPlan.paperId,
    sourceAssetVersion: candidate.interpretation.sourceAssetVersion,
    sourceAssetDigest: candidate.source.sha256,
    authorityRef: structuredClone(canonicalPaper.paperPlan.authorityRef),
    profileRef: structuredClone(canonicalPaper.paperPlan.profileRef),
    consumerContractRef: structuredClone(consumerContractRefs.screen),
    visibleStructure: structure,
    visibleStructureDigest: digestJson(structure),
    selections,
    mediaArtifacts: mediaArtifacts(projected, sourceCapture),
    diagnostics: [],
  }
  assertCanonicalConsumptionVisibleStructure(consumption)
  return consumption
}

function compatibilityText(
  blocks,
  questionNoByBlankId = new Map(),
  family = null,
) {
  return blocks
    .filter((block) => block.kind === 'paragraph')
    .map((block) => {
      let text = ''
      for (const [index, inline] of block.content.entries()) {
        if (inline.kind === 'text') {
          text += inline.text
          continue
        }
        const marker = `__${questionNoByBlankId.get(inline.blankId)}__`
        if (family !== 'grammar-fill') {
          text += marker
          continue
        }
        const nextInline = block.content[index + 1]
        const prefix = /[\p{L}\p{N}_]$/u.test(text) ? ' ' : ''
        const suffix =
          nextInline?.kind === 'text'
          && /^(?:[\p{L}\p{N}_]|\()/u.test(nextInline.text)
            ? ' '
            : ''
        text += `${prefix}${marker}${suffix}`
      }
      return text
    })
    .join('\n')
}

export function buildNck1CompatibilityPaperAsset({
  config,
  materialization,
  sourceAssetVersion,
  primarySourceType = 'pdf',
}) {
  const groupTypes = {
    reading: 'reading',
    'seven-choices': 'sevenChoices',
    cloze: 'cloze',
    'grammar-fill': 'grammarFill',
    'application-writing': 'writing',
    'continuation-writing': 'writing',
  }
  const groups = {}
  const questions = {}
  const blanks = {}
  const writingTasks = {}
  const answerKey = {}
  const answers = new Map(materialization.answers.map((answer) => [answer.questionId, answer]))
  for (const group of materialization.groups) {
    const questionIds = group.questions.map((question) => question.questionId)
    const blankIds = group.questions.map((question) => question.blankId).filter(Boolean)
    const questionNoByBlankId = new Map(group.questions
      .filter((question) => question.blankId)
      .map((question) => [question.blankId, question.canonicalNumber]))
    const writingTaskId = group.writingTask ? `writing-task:${group.groupId}` : undefined
    groups[group.groupId] = {
      groupId: group.groupId,
      groupType: groupTypes[group.family],
      title: group.slotId,
      questionIds,
      ...(blankIds.length > 0 ? { blankIds } : {}),
      ...(writingTaskId ? { writingTaskId } : {}),
      passage: {
        paragraphs: group.blocks
          .filter((block) => block.kind === 'paragraph')
          .map((block) => ({
            paragraphId: block.blockId,
            text: compatibilityText(
              [block],
              questionNoByBlankId,
              group.family,
            ),
          })),
      },
      ...(group.optionBank.length > 0
        ? { optionBank: group.optionBank.map(({ label, text }) => ({ label, text })) }
        : {}),
    }
    for (const question of group.questions) {
      questions[question.questionId] = {
        questionId: question.questionId,
        questionNo: question.canonicalNumber,
        groupId: group.groupId,
        stem: question.stem,
        ...(question.options.length > 0
          ? { options: question.options.map(({ label, text }) => ({ label, text })) }
          : {}),
        ...(question.blankId ? { blankId: question.blankId } : {}),
      }
      if (question.blankId) {
        blanks[question.blankId] = {
          blankId: question.blankId,
          groupId: group.groupId,
          questionId: question.questionId,
          ...(question.prompt ? { prompt: question.prompt } : {}),
        }
      }
      const answer = answers.get(question.questionId)
      if (answer) {
        answerKey[question.questionId] = {
          questionId: question.questionId,
          questionNo: question.canonicalNumber,
          answer: answer.value,
        }
      }
    }
    if (group.writingTask) {
      writingTasks[writingTaskId] = {
        writingTaskId,
        groupId: group.groupId,
        taskType: group.writingTask.taskType,
        title: group.slotId,
        instruction: group.writingTask.prompt,
        wordCountTarget: group.writingTask.wordCountTarget,
        ...(group.writingTask.material.length > 0
          ? { materialText: group.writingTask.material.join('\n') }
          : {}),
        ...(group.writingTask.starters.length > 0
          ? { continuationStarters: group.writingTask.starters }
          : {}),
      }
    }
  }
  return {
    schemaVersion: 'paper-asset-v1',
    paper: {
      paperId: materialization.paperId,
      title: config.provenance.paperName,
      subject: 'English',
      source: config.provenance.source,
      assetVersion: sourceAssetVersion,
      status: 'draft',
    },
    sources: { primarySourceType },
    layoutTree: { parts: [] },
    content: {
      blocks: materialization.groups.map((group) => ({ type: 'group', groupId: group.groupId })),
      groups,
      questions,
      ...(Object.keys(blanks).length > 0 ? { blanks } : {}),
      ...(Object.keys(writingTasks).length > 0 ? { writingTasks } : {}),
    },
    answerKey: { answers: answerKey },
    analysis: {},
  }
}

function configuredSourceType(config, paperId) {
  const sourceType = config.provenance?.sourceType
    || (paperId.startsWith('paper-mock-') ? '模拟题' : '真题')
  if (!['真题', '模拟题', '校本题', '自编题'].includes(sourceType)) {
    fail(`Unsupported sourceType: ${sourceType}`)
  }
  return sourceType
}

function configuredYear(config, paperId) {
  const explicit = Number(config.provenance?.year)
  if (Number.isInteger(explicit) && explicit >= 1900 && explicit <= 2100) {
    return explicit
  }
  const inferred = Number(
    /(?:19|20)\d{2}/.exec(
      `${paperId} ${config.provenance?.paperName || ''}`,
    )?.[0],
  )
  if (!Number.isInteger(inferred)) {
    fail('Universal NCK1 compatibility metadata requires a factual year')
  }
  return inferred
}

export function buildNck1CompatibilityPackage({
  config,
  manifest,
  materialization,
  sourceAssetVersion = 1,
}) {
  const sourceDocument = materialization.documents.find((document) =>
    ['question_source', 'question_and_answers'].includes(document.role))
  const manifestDocument = manifest.documents.find((document) =>
    document.documentId === sourceDocument?.documentId)
  if (!sourceDocument || !manifestDocument) {
    fail('Universal NCK1 compatibility metadata requires one question source')
  }
  const sourceFileSha256 = String(sourceDocument.sha256 || '').replace(/^sha256:/, '')
  if (!/^[a-f0-9]{64}$/.test(sourceFileSha256)) {
    fail('Universal NCK1 question source digest is invalid')
  }
  const sourceType = configuredSourceType(config, materialization.paperId)
  const year = configuredYear(config, materialization.paperId)
  const defaultTags = Array.isArray(config.provenance?.defaultTags)
    ? config.provenance.defaultTags
    : [sourceType, String(year)]
  const primarySourceType = sourceDocument.mediaType?.includes('wordprocessingml')
    ? 'docx'
    : 'pdf'
  const paperAsset = buildNck1CompatibilityPaperAsset({
    config,
    materialization,
    sourceAssetVersion,
    primarySourceType,
  })
  const answerKey = {
    schemaVersion: 'answer-key-v1',
    paperId: materialization.paperId,
    sourceAssetVersion,
    answers: structuredClone(paperAsset.answerKey.answers),
  }
  return {
    paperAsset,
    answerKey,
    importMeta: {
      schemaVersion: 'import-meta-v1',
      paperId: materialization.paperId,
      sourceFileName: path.basename(manifestDocument.path),
      sourceFileSha256,
      paper: {
        year,
        region: config.provenance?.region || config.provenance.source,
        paperName: config.provenance.paperName,
        examCode: materialization.paperId.replace(/^paper-/, ''),
        subject: 'English',
        sourceType,
        defaultTags,
      },
    },
    sourceAssetDigest: sourceFileSha256,
  }
}

export function buildNck1ReviewProjection(rootDir) {
  const loaded = loadNck1ReviewSource(rootDir)
  const imported = importCanonicalCandidate(loaded.sourceInput)
  if (!imported.candidate || imported.issues.length > 0) {
    const issue = imported.issues[0]
    fail(`${issue?.code || 'MATERIALIZATION_INVALID'}: ${issue?.message || 'Candidate derivation failed'}`)
  }
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  if (!preview.compilation) {
    const issue = preview.unresolvedIssues?.[0]
    fail(`${issue?.code || 'CANDIDATE_PREVIEW_INVALID'}: ${issue?.message || 'Candidate preview compilation failed'}`)
  }
  const consumption = buildConsumption(preview.candidate, preview.compilation)
  return {
    ...loaded,
    paperId: loaded.materialization.paperId,
    paperName: loaded.config.provenance.paperName,
    sourceDigest: preview.candidate.source.sha256,
    candidateDigest: preview.candidate.candidateDigest,
    visibleStructureDigest: consumption.visibleStructureDigest,
    candidate: preview.candidate,
    compilation: preview.compilation,
    consumption,
    paperAsset: buildNck1CompatibilityPaperAsset({
      config: loaded.config,
      materialization: loaded.materialization,
      sourceAssetVersion: preview.candidate.interpretation.sourceAssetVersion,
      primarySourceType: loaded.materialization.documents.some((document) =>
        document.mediaType?.includes('wordprocessingml'))
        ? 'docx'
        : 'pdf',
    }),
  }
}

export function printConsumption(screenConsumption) {
  return {
    ...structuredClone(screenConsumption),
    consumerContractRef: structuredClone(consumerContractRefs.print_pdf),
  }
}
