#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

import {
  compileNck1MaterializationCandidatePreview,
  importCanonicalCandidate,
} from '../../shared/paper-canonical/compiler.mjs'
import {
  resolveCanonicalAuthority,
} from '../../shared/paper-canonical/authority.mjs'
import {
  consumerContractRefs,
} from '../../shared/paper-canonical/consumers.mjs'
import {
  projectCanonicalPaper,
} from '../../shared/paper-canonical/projector.mjs'
import {
  digestJson,
  stableStringify,
} from '../../shared/paper-canonical/stable.mjs'
import {
  assertCanonicalConsumptionVisibleStructure,
  assertCanonicalVisibleStructure,
} from '../../shared/paper-canonical/visibleStructure.mjs'

const papersRoot = path.join(import.meta.dirname, 'papers')
const paperId = process.argv[2]
const port = Number(process.env.PORT || process.argv[3])

function fail(message) {
  throw new Error(message)
}

function mediaFileName(media) {
  const extension = ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  })[media.mimeType]
  if (!extension) fail(`Unsupported Candidate media type: ${media.mimeType}`)
  return `${media.mediaId.replaceAll(':', '__')}.${extension}`
}

function loadPaper() {
  if (!/^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(paperId || '')) {
    fail('Usage: nck1-candidate-preview-server.mjs <paperId> with PORT set')
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail('Candidate preview server requires a valid PORT')
  }
  const paperDir = path.join(papersRoot, paperId)
  const manifestPath = path.join(paperDir, 'universal-source-manifest.json')
  const configPath = path.join(paperDir, 'config.json')
  if (!existsSync(manifestPath) || !existsSync(configPath)) {
    fail(`Universal NCK1 Candidate is missing: ${paperId}`)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const materializationPath = path.join(paperDir, manifest.materializationPath)
  const materializationBytes = new Uint8Array(readFileSync(materializationPath))
  const materialization = JSON.parse(new TextDecoder().decode(materializationBytes))
  const documentPaths = new Map(manifest.documents.map((document) => [
    document.documentId,
    path.join(paperDir, document.path),
  ]))
  const sourceInput = {
    kind: 'nck1-source-materialization',
    materializationBytes,
    documents: materialization.documents.map((document) => ({
      documentId: document.documentId,
      bytes: new Uint8Array(readFileSync(documentPaths.get(document.documentId))),
    })),
    media: materialization.media.map((media) => ({
      mediaId: media.mediaId,
      bytes: new Uint8Array(readFileSync(path.join(
        paperDir,
        manifest.mediaDirectory,
        mediaFileName(media),
      ))),
    })),
  }
  const imported = importCanonicalCandidate(sourceInput)
  if (!imported.candidate || imported.issues.length > 0) {
    const issue = imported.issues[0]
    fail(`${issue?.code || 'MATERIALIZATION_INVALID'}: ${issue?.message || 'Candidate derivation failed'}`)
  }
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  if (!preview.compilation) {
    const issue = preview.unresolvedIssues?.[0]
    fail(`${issue?.code || 'CANDIDATE_PREVIEW_INVALID'}: ${issue?.message || 'Candidate preview compilation failed'}`)
  }
  return {
    config,
    materialization,
    candidate: preview.candidate,
    compilation: preview.compilation,
  }
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
            projectedOccurrenceDigests: projectedOccurrences.map(
              (occurrence) => ({
                groupId: occurrence.groupId,
                digest: digestJson(occurrence),
              }),
            ),
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

function plainText(blocks) {
  return blocks
    .filter((block) => block.kind === 'paragraph')
    .map((block) => block.content
      .filter((inline) => inline.kind === 'text')
      .map((inline) => inline.text)
      .join(''))
    .join('\n')
}

function passageParagraphs(group) {
  return group.blocks
    .filter((block) => block.kind === 'paragraph')
    .map((block) => ({
      paragraphId: block.blockId,
      text: plainText([block]),
    }))
}

function buildPaperAsset(config, materialization, candidate) {
  const groupType = {
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
  const answersByQuestionId = new Map(
    materialization.answers.map((answer) => [answer.questionId, answer]),
  )
  const answerKey = {}
  for (const group of materialization.groups) {
    const questionIds = group.questions.map((question) => question.questionId)
    const blankIds = group.questions
      .map((question) => question.blankId)
      .filter(Boolean)
    const writingTaskId = group.writingTask
      ? `writing-task:${group.groupId}`
      : undefined
    groups[group.groupId] = {
      groupId: group.groupId,
      groupType: groupType[group.family],
      title: group.slotId,
      questionIds,
      ...(blankIds.length > 0 ? { blankIds } : {}),
      ...(writingTaskId ? { writingTaskId } : {}),
      passage: {
        paragraphs: passageParagraphs(group),
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
      const answer = answersByQuestionId.get(question.questionId)
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
      assetVersion: candidate.interpretation.sourceAssetVersion,
      status: 'draft',
    },
    sources: { primarySourceType: 'pdf' },
    layoutTree: { parts: [] },
    content: {
      blocks: materialization.groups.map((group) => ({
        type: 'group',
        groupId: group.groupId,
      })),
      groups,
      questions,
      ...(Object.keys(blanks).length > 0 ? { blanks } : {}),
      ...(Object.keys(writingTasks).length > 0 ? { writingTasks } : {}),
    },
    answerKey: { answers: answerKey },
    analysis: {},
  }
}

const loaded = loadPaper()
const consumption = buildConsumption(loaded.candidate, loaded.compilation)
const paperAsset = buildPaperAsset(
  loaded.config,
  loaded.materialization,
  loaded.candidate,
)

function sendJson(response, status, body) {
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(`${JSON.stringify(body)}\n`)
}

createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  if (url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true, paperId, mode: 'candidate-preview' })
    return
  }
  if (
    url.pathname === '/api/paper-canonical/consumption'
    && url.searchParams.get('paperId') === paperId
  ) {
    sendJson(response, 200, consumption)
    return
  }
  if (url.pathname === `/paper-assets/${paperId}/latest/paper-asset.json`) {
    sendJson(response, 200, paperAsset)
    return
  }
  if (url.pathname === `/paper-assets/${paperId}/paper-asset.json`) {
    sendJson(response, 200, paperAsset)
    return
  }
  sendJson(response, 404, { error: 'Candidate preview resource not found' })
}).listen(port, '127.0.0.1', () => {
  console.log(`NCK1 Candidate consumer preview API listening on ${port} for ${paperId}`)
})
