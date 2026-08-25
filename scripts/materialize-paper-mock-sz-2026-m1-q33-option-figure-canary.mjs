#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  readingOptionFigureAuthorityRef,
  resolveCanonicalAuthority,
} from '../shared/paper-canonical/authority.mjs'
import {
  readingOptionFigureConsumerContractRefs,
} from '../shared/paper-canonical/consumers.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import {
  digestJson,
  sha256,
  stableStringify,
} from '../shared/paper-canonical/stable.mjs'
import { confirmVisualImportCandidate } from '../server/paper-canonical/visualCandidate.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const paperId = 'paper-mock-sz-2026-m1'
const groupId = 'group-mock-sz-2026-m1-reading-d'
const questionId = 'q-mock-sz-2026-m1-033'
const labels = ['A', 'B', 'C', 'D']
const evidenceRoot = path.join(
  repoRoot,
  'scripts/import-pipeline/papers/paper-mock-sz-2026-m1/visual-candidates/q33',
)
const canaryRoot = path.join(evidenceRoot, 'canary')
const publicPaperRoot = path.join(
  repoRoot,
  'app/public/paper-assets/paper-mock-sz-2026-m1/latest',
)
const screenConsumptionPath = path.join(
  repoRoot,
  'app/public/qa/paper-mock-sz-2026-m1-q33-screen-consumption.json',
)

function stableId(prefix, value) {
  return `${prefix}:${digestJson(value).slice('sha256:'.length, 28)}`
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function immutablePngDocument(selection, label) {
  const bytes = new Uint8Array(Buffer.from(selection.artifact.encodedBytes, 'base64'))
  if (
    selection.method !== 'source_crop'
    || bytes.byteLength !== selection.artifact.byteLength
    || sha256(bytes) !== selection.artifact.sha256
  ) {
    throw new Error(`Option ${label} is not the exact confirmed source_crop PNG`)
  }
  const inputKey = `q33_confirmed_source_crop_${label.toLowerCase()}`
  const roles = ['figure_media', 'source_provenance']
  const artifactId = stableId('source-document', { sha256: selection.artifact.sha256 })
  return {
    document: {
      documentId: stableId('document', {
        digest: selection.artifact.sha256,
        roles,
        inputKey,
      }),
      inputKey,
      roles,
      mediaType: 'image/png',
      originalName: `reading-d-q33-option-${label.toLowerCase()}-source-crop.png`,
      byteLength: bytes.byteLength,
      sha256: selection.artifact.sha256,
      immutableArtifactRef: {
        artifactId,
        relativePath: `source-evidence/${artifactId.slice('source-document:'.length)}.bin`,
        sha256: selection.artifact.sha256,
        byteLength: bytes.byteLength,
      },
      encodedBytes: selection.artifact.encodedBytes,
    },
    artifactId,
    bytes,
  }
}

function makeSuccessorSourceCapture({ base, visual, selections }) {
  const baseQuestionDocument = base.documents.find(
    (document) => document.mediaType === 'application/pdf'
      && visual.documents.some((candidate) => (
        candidate.mediaType === 'application/pdf'
        && candidate.sha256 === document.sha256
      )),
  )
  if (!baseQuestionDocument) {
    throw new Error('Q33 visual evidence does not bind the current immutable question PDF')
  }
  const visualSpans = new Map(
    visual.sourceSpans.map((span) => [span.sourceSpanId, span]),
  )
  const visualObservations = new Map(
    visual.observations.map((observation) => [observation.observationId, observation]),
  )
  const mediaDocuments = new Map()
  const addedObservations = []
  const addedSpans = []
  for (const [index, selection] of selections.entries()) {
    const label = labels[index]
    const sourceObservation = visualObservations.get(selection.observationId)
    const sourceSpan = visualSpans.get(sourceObservation?.sourceSpanId)
    if (!sourceObservation || !sourceSpan || sourceSpan.coordinate?.kind !== 'page_region') {
      throw new Error(`Option ${label} lacks exact page-region source evidence`)
    }
    const media = immutablePngDocument(selection, label)
    mediaDocuments.set(label, media)
    addedObservations.push({
      ...structuredClone(sourceObservation),
      documentId: baseQuestionDocument.documentId,
      extraction: {
        adapterId: 'confirmed-pdf-xobject-source-crop',
        version: '1',
      },
    })
    addedSpans.push({
      ...structuredClone(sourceSpan),
      documentId: baseQuestionDocument.documentId,
      documentDigest: baseQuestionDocument.sha256,
    })
  }
  const body = {
    schemaVersion: 'source-capture-v1',
    documents: [
      ...structuredClone(base.documents),
      ...labels.map((label) => mediaDocuments.get(label).document),
    ],
    observations: [
      ...structuredClone(base.observations),
      ...addedObservations,
    ],
    sourceSpans: [
      ...structuredClone(base.sourceSpans),
      ...addedSpans,
    ],
    assertions: structuredClone(base.assertions),
  }
  const digest = digestJson(body)
  return {
    sourceCapture: {
      ...body,
      captureId: `source-capture:${digest.slice('sha256:'.length, 28)}`,
      digest,
    },
    mediaDocuments,
  }
}

function successorContractRef(closure, familyContractId) {
  const family = closure.families.get(familyContractId)
  if (!family) throw new Error(`Successor authority lacks ${familyContractId}`)
  return {
    familyContractDigest: digestJson(family),
    familyContractId,
    familyContractVersion: family.version,
    manifestDigest: closure.authorityRef.manifestDigest,
    manifestId: closure.authorityRef.manifestId,
    manifestVersion: closure.authorityRef.manifestVersion,
  }
}

function semanticDigest(group) {
  const {
    sourceMap: _sourceMap,
    sourceFingerprint: _sourceFingerprint,
    semanticDigest: _semanticDigest,
    ...semantic
  } = group
  return digestJson(semantic)
}

function sourceFingerprint(group, sourceCapture) {
  const sourceSpanIds = [...new Set(
    group.sourceMap.entries.flatMap((entry) => entry.sourceSpanRefs),
  )]
  return digestJson({
    captureDigest: sourceCapture.digest,
    sourceSpanId: sourceSpanIds[0],
    recordIds: group.sourceMap.entries.flatMap(
      (entry) => entry.transformationRecordIds,
    ),
  })
}

function makeSuccessorGroups({ baseGroups, closure, sourceCapture, selections, mediaDocuments }) {
  const groups = structuredClone(baseGroups)
  for (const group of groups) {
    if (group.variant.family === 'continuation-writing') {
      group.variant = {
        family: 'continuation-writing',
        mode: 'legacy_opaque',
        writingTaskId: group.variant.writingTaskId,
        sourceTaskType: 'continuation',
        contentBlockRefs: group.content.blocks.map((block) => block.nodeId),
        sourceStarterBlockRefs: group.content.blocks
          .map((block) => block.nodeId)
          .filter((nodeId) => nodeId.includes(':starter:')),
        wordCountTarget: group.variant.wordCountRuling.target,
        wordCountTargetCertainty: 'explicit_legacy_field',
        wordCountScope: 'unspecified',
        choiceOwnership: { ownership: 'none' },
        response: {
          kind: 'generic_response_box',
          answerRegionRef: group.variant.response.answerRegionRef,
          ownership: 'product',
        },
      }
    }
    group.contractRef = successorContractRef(
      closure,
      group.contractRef.familyContractId,
    )
    group.sourceMap.captureId = sourceCapture.captureId
  }
  const readingGroup = groups.find((group) => group.identity.groupId === groupId)
  if (!readingGroup) throw new Error('Current Shenzhen Reading D group is missing')
  const set = readingGroup.variant.choiceOwnership.sets.find(
    (candidate) => candidate.questionId === questionId,
  )
  const question = readingGroup.variant.questions.find(
    (candidate) => candidate.questionId === questionId,
  )
  if (!set || !question || question.correctOptionId !== `option:${questionId}:D`) {
    throw new Error('Q33 identity or source-backed official answer drifted')
  }
  const mediaByLabel = new Map()
  set.options = set.options.map((option, index) => {
    const label = labels[index]
    const selection = selections[index]
    if (
      option.optionId !== selection.owner.optionId
      || option.label !== label
      || stableStringify(selection.owner) !== stableStringify({
        kind: 'reading_option',
        groupId,
        questionId,
        optionId: option.optionId,
      })
    ) {
      throw new Error(`Option ${label} confirmation owner does not match Canonical identity`)
    }
    const mediaId = `media:${questionId}:${label}`
    const mediaDocument = mediaDocuments.get(label)
    const media = {
      mediaId,
      mimeType: 'image/png',
      sha256: selection.artifact.sha256,
      pixelWidth: selection.artifact.pixelWidth,
      pixelHeight: selection.artifact.pixelHeight,
      sourceArtifactRef: {
        artifactId: mediaDocument.artifactId,
      },
    }
    mediaByLabel.set(label, media)
    return {
      optionId: option.optionId,
      label,
      figure: { mediaId },
    }
  })
  readingGroup.media.push(...labels.map((label) => mediaByLabel.get(label)))
  const oldOptionNodeIds = new Set(labels.map(
    (label) => `text:${groupId}:${questionId}:option:${label}`,
  ))
  readingGroup.sourceMap.entries = readingGroup.sourceMap.entries.filter(
    (entry) => !(
      entry.target.kind === 'content_node'
      && oldOptionNodeIds.has(entry.target.id)
    ),
  )
  for (const [index, label] of labels.entries()) {
    const selection = selections[index]
    const optionEntry = readingGroup.sourceMap.entries.find(
      (entry) => entry.target.kind === 'option'
        && entry.target.id === selection.owner.optionId,
    )
    if (!optionEntry) throw new Error(`Option ${label} source-map identity is missing`)
    const sourceSpanId = `source-span:${selection.observationId}`
    optionEntry.sourceSpanRefs = [sourceSpanId]
    readingGroup.sourceMap.entries.push({
      target: {
        id: mediaByLabel.get(label).mediaId,
        kind: 'media',
      },
      sourceSpanRefs: [sourceSpanId],
      transformationRecordIds: [],
    })
  }
  for (const group of groups) {
    group.sourceFingerprint = sourceFingerprint(group, sourceCapture)
    group.semanticDigest = semanticDigest(group)
  }
  return groups
}

function makeSuccessorPlan(basePlan, closure) {
  const plan = structuredClone(basePlan)
  const profile = closure.profiles.get(plan.profileRef.profileId)
  if (!profile) throw new Error(`Successor authority lacks Profile ${plan.profileRef.profileId}`)
  plan.authorityRef = structuredClone(closure.authorityRef)
  plan.profileRef = {
    profileDigest: digestJson(profile),
    profileId: profile.profileId,
    profileVersion: profile.version,
  }
  return plan
}

function mediaArtifacts(projected, sourceCapture) {
  const documentByArtifactId = new Map(
    sourceCapture.documents.map((document) => [
      document.immutableArtifactRef?.artifactId,
      document,
    ]),
  )
  const artifacts = []
  const seen = new Set()
  for (const occurrence of projected.nodes.filter((node) => node.kind === 'group')) {
    for (const media of occurrence.media || []) {
      if (seen.has(media.mediaId)) continue
      const document = documentByArtifactId.get(media.sourceArtifactRef?.artifactId)
      if (
        !document
        || document.sha256 !== media.sha256
        || document.mediaType !== media.mimeType
        || typeof document.encodedBytes !== 'string'
      ) {
        throw new Error(`Media ${media.mediaId} does not resolve to exact captured bytes`)
      }
      artifacts.push({
        mediaId: media.mediaId,
        mimeType: media.mimeType,
        sha256: media.sha256,
        pixelWidth: media.pixelWidth,
        pixelHeight: media.pixelHeight,
        sourceArtifactRef: structuredClone(media.sourceArtifactRef),
        encodedBytes: document.encodedBytes,
      })
      seen.add(media.mediaId)
    }
  }
  return artifacts
}

function makeConsumption({ projected, sourceCapture, plan, consumerId }) {
  const occurrencesByFamily = new Map()
  for (const occurrence of projected.nodes.filter((node) => node.kind === 'group')) {
    const list = occurrencesByFamily.get(occurrence.familyContractId) || []
    list.push(occurrence)
    occurrencesByFamily.set(occurrence.familyContractId, list)
  }
  const selections = [...occurrencesByFamily].map(([
    familyContractId,
    projectedOccurrences,
  ]) => ({
    mode: 'canonical',
    familyContractId,
    groupIds: projectedOccurrences.map((occurrence) => occurrence.groupId),
    projectedOccurrences,
    ...(
      ['cloze', 'grammar-fill', 'reading'].includes(familyContractId)
        ? {
            projectedOccurrenceDigests: projectedOccurrences.map((occurrence) => ({
              groupId: occurrence.groupId,
              digest: digestJson(occurrence),
            })),
          }
        : {}
    ),
  }))
  const visibleStructure = projected.nodes.flatMap((node) => {
    if (
      node.kind === 'part'
      || node.kind === 'section'
      || node.kind === 'instruction'
    ) return [structuredClone(node)]
    if (node.kind === 'group') {
      return [{
        kind: 'group',
        slotId: node.slotId,
        groupId: node.groupId,
        familyContractId: node.familyContractId,
      }]
    }
    if (node.kind === 'answer_region') return []
    throw new Error(`Unknown projected visible node ${node.kind}`)
  })
  return {
    disposition: 'ready',
    paperId,
    sourceAssetVersion: 10,
    publicationDigest: digestJson({
      kind: 'local-q33-owner-confirmed-canary',
      authorityRef: plan.authorityRef,
      sourceCaptureDigest: sourceCapture.digest,
      consumerId,
    }),
    consumerContractRef: structuredClone(
      readingOptionFigureConsumerContractRefs[consumerId],
    ),
    sourceAssetDigest: sourceCapture.documents.find(
      (document) => document.mediaType === 'application/pdf',
    ).sha256,
    authorityRef: structuredClone(plan.authorityRef),
    selections,
    visibleStructure,
    profileRef: structuredClone(plan.profileRef),
    visibleStructureDigest: digestJson(visibleStructure),
    mediaArtifacts: mediaArtifacts(projected, sourceCapture),
    diagnostics: [],
  }
}

function assetFramingPolicy(confirmedSelection) {
  return {
    schemaVersion: 'q33-figure-asset-framing-policy-v1',
    paperId,
    questionId,
    candidatePackageDigest: confirmedSelection.candidatePackageDigest,
    confirmationDigest: confirmedSelection.confirmationDigest,
    principle: 'The asset owns complete source-authored figure pixels; the renderer owns every placement decision.',
    contentEnvelope: {
      kind: 'exact_pdf_embedded_image_extent',
      includes: [
        'the complete meaning-bearing diagram',
        'source-backed internal whitespace and light gaps',
        'only edge clearance already present in the embedded source object',
      ],
      excludes: [
        'question stem',
        'A-D option labels',
        'page margins',
        'comparison-track padding',
        'fixed renderer image-box whitespace',
      ],
      noAutomaticTrim: 'JPEG edge noise and white pixels are not an authority for deleting source-authored whitespace.',
      noTransparencyRewrite: 'White pixels remain exact source bytes because white gaps and highlights may carry question meaning.',
    },
    rendererOwnership: {
      controls: [
        'physical target size',
        'four-track placement',
        'alignment',
        'responsive fit-down',
        'print pagination',
      ],
      invariant: 'preserve aspect ratio with contain; never crop, stretch, rotate, relabel, or reinterpret the selected asset',
      portabilityLimit: 'Portable means reusable in renderer-owned boxes at a legible size, not permission to change orientation, aspect ratio, or semantic whitespace.',
    },
    selectedAssets: confirmedSelection.confirmedSelections.map((selection) => ({
      optionId: selection.owner.optionId,
      method: selection.method,
      candidateDigest: selection.candidateDigest,
      artifactSha256: selection.artifact.sha256,
      pixelWidth: selection.artifact.pixelWidth,
      pixelHeight: selection.artifact.pixelHeight,
    })),
    placementProofIntent: [
      { name: 'canonical', widthPt: 96, heightPt: 60 },
      { name: 'compact_square', widthPt: 54, heightPt: 54 },
      { name: 'large_portrait', widthPt: 72, heightPt: 96 },
    ],
  }
}

export async function materializeQ33OptionFigureCanary() {
  const [
    candidatePackage,
    teacherConfirmation,
    visualSourceCapture,
    baseSourceCapture,
    basePlan,
    baseQuestionGroups,
  ] = await Promise.all([
    readJson(path.join(evidenceRoot, 'visual-import-candidate-v1.json')),
    readJson(path.join(evidenceRoot, 'visual-teacher-confirmation-v1.json')),
    readJson(path.join(evidenceRoot, 'source-capture-v1.json')),
    readJson(path.join(publicPaperRoot, 'canonical/source-capture-v1.json')),
    readJson(path.join(publicPaperRoot, 'canonical/canonical-paper-plan-v1.json')),
    readJson(path.join(publicPaperRoot, 'canonical/canonical-question-groups-v1.json')),
  ])
  const confirmedSelection = confirmVisualImportCandidate(
    candidatePackage,
    teacherConfirmation,
  )
  if (
    confirmedSelection.status !== 'confirmed'
    || confirmedSelection.confirmedSelections.length !== labels.length
    || confirmedSelection.unresolvedIssues.length !== 0
    || confirmedSelection.confirmedSelections.some(
      (selection) => selection.method !== 'source_crop',
    )
  ) {
    throw new Error('Q33 canary requires four exact Owner-confirmed source_crop selections')
  }
  const selections = labels.map((label) => {
    const optionId = `option:${questionId}:${label}`
    const matches = confirmedSelection.confirmedSelections.filter(
      (selection) => selection.owner.optionId === optionId,
    )
    if (matches.length !== 1) throw new Error(`Option ${label} is not confirmed exactly once`)
    return matches[0]
  })
  const authority = resolveCanonicalAuthority(readingOptionFigureAuthorityRef)
  if (!authority.ok) throw new Error('Reading Figure Option authority is unavailable')
  const { sourceCapture, mediaDocuments } = makeSuccessorSourceCapture({
    base: baseSourceCapture,
    visual: visualSourceCapture,
    selections,
  })
  const groups = makeSuccessorGroups({
    baseGroups: baseQuestionGroups.groups,
    closure: authority.closure,
    sourceCapture,
    selections,
    mediaDocuments,
  })
  const plan = makeSuccessorPlan(basePlan, authority.closure)
  const projected = projectCanonicalPaper({
    plan,
    groups,
    sourceCapture,
    authorityClosure: authority.closure,
  })
  const screenConsumption = makeConsumption({
    projected,
    sourceCapture,
    plan,
    consumerId: 'screen',
  })
  const printConsumption = makeConsumption({
    projected,
    sourceCapture,
    plan,
    consumerId: 'print_pdf',
  })
  const canonicalGroup = groups.find((group) => group.identity.groupId === groupId)
  const policy = assetFramingPolicy(confirmedSelection)
  const canaryManifestBase = {
    schemaVersion: 'q33-option-figure-canary-v1',
    paperId,
    groupId,
    questionId,
    authorityRef: structuredClone(readingOptionFigureAuthorityRef),
    candidatePackageDigest: confirmedSelection.candidatePackageDigest,
    confirmationDigest: confirmedSelection.confirmationDigest,
    assetFramingPolicyDigest: digestJson(policy),
    canonicalGroupDigest: digestJson(canonicalGroup),
    screenConsumptionDigest: digestJson(screenConsumption),
    printConsumptionDigest: digestJson(printConsumption),
    sourceCaptureDigest: sourceCapture.digest,
    state: 'owner_confirmed_local_canary',
  }
  const canaryManifest = {
    ...canaryManifestBase,
    canaryDigest: digestJson(canaryManifestBase),
  }
  await Promise.all([
    writeJson(path.join(canaryRoot, 'asset-framing-policy-v1.json'), policy),
    writeJson(path.join(canaryRoot, 'canonical-question-group-v2.json'), canonicalGroup),
    writeJson(path.join(canaryRoot, 'print-consumption-v1.json'), printConsumption),
    writeJson(path.join(canaryRoot, 'q33-option-figure-canary-v1.json'), canaryManifest),
    writeJson(screenConsumptionPath, screenConsumption),
  ])
  return {
    confirmedSelection,
    policy,
    canonicalGroup,
    sourceCapture,
    screenConsumption,
    printConsumption,
    canaryManifest,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await materializeQ33OptionFigureCanary()
  console.log(JSON.stringify({
    canaryDigest: result.canaryManifest.canaryDigest,
    confirmationDigest: result.confirmedSelection.confirmationDigest,
    selectedMethods: result.confirmedSelection.confirmedSelections.map(
      (selection) => selection.method,
    ),
    canonicalGroupDigest: result.canaryManifest.canonicalGroupDigest,
    screenConsumptionSha256: sha256(`${stableStringify(result.screenConsumption)}\n`),
  }, null, 2))
}
