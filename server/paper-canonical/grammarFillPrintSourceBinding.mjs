import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { grammarFillRhythm } from '../../shared/paper-canonical/grammarFillRhythm.mjs'
import { stableStringify } from '../../shared/paper-canonical/stable.mjs'
import {
  rederiveRegisteredConfirmedCanonicalPublicationSource,
} from './registeredConfirmedCanonicalAdmission.mjs'

function reject(message) {
  const error = new Error(message)
  error.code = 'CANONICAL_CONSUMPTION_REJECTED'
  throw error
}

function digestBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function readJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    reject(`Canonical Grammar Fill ${label} is invalid`)
  }
}

function assertSafeRelativePath(relativePath, label, prefix = null) {
  if (
    typeof relativePath !== 'string'
    || (prefix && !relativePath.startsWith(prefix))
    || relativePath.includes('..')
    || path.isAbsolute(relativePath)
  ) {
    reject(`Canonical Grammar Fill ${label} path is invalid`)
  }
}

function formatGrammarFillAnalysis(entry) {
  return [
    entry?.reason ? `【${entry.answer}】${entry.reason}` : '',
    entry?.teachingNote ? `点拨：${entry.teachingNote}` : '',
  ].filter(Boolean).join('\n')
}

function sameBytes(left, right) {
  return left instanceof Uint8Array
    && right instanceof Uint8Array
    && left.byteLength === right.byteLength
    && left.every((byte, index) => byte === right[index])
}

function readPublishedArtifact({ versionDir, descriptor, label }) {
  assertSafeRelativePath(descriptor?.relativePath, label, 'canonical/')
  if (
    !Number.isInteger(descriptor.byteLength)
    || typeof descriptor.sha256 !== 'string'
  ) {
    reject(`Canonical Grammar Fill ${label} descriptor is invalid`)
  }
  const artifactPath = path.join(versionDir, descriptor.relativePath)
  if (!existsSync(artifactPath)) {
    reject(`Canonical Grammar Fill ${label} is unavailable`)
  }
  const bytes = readFileSync(artifactPath)
  if (
    bytes.byteLength !== descriptor.byteLength
    || digestBytes(bytes) !== descriptor.sha256
  ) {
    reject(`Canonical Grammar Fill ${label} digest disagrees`)
  }
  return bytes
}

function isDocxPackage(bytes) {
  return bytes?.byteLength >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && bytes[2] === 0x03
    && bytes[3] === 0x04
}

/**
 * A published trusted-DOCX asset is raw ZIP bytes, never a JSON source
 * projection. Re-open it through the registered Candidate/Confirmation
 * authority and ensure that the re-derived Canonical Paper is exactly the one
 * selected by this immutable Publication before Print/PDF consumes it.
 */
function verifyTrustedDocxPublicationSource({
  assetBytes,
  sourcePaperId,
  sourceAssetVersion,
  sourceAssetDigest,
  canonicalConsumption,
  versionDir,
}) {
  const authority = canonicalConsumption.authorityRef
  const authorityVersion = authority?.manifestVersion
  if (
    typeof authority?.manifestId !== 'string'
    || typeof authorityVersion !== 'string'
    || typeof authority?.manifestDigest !== 'string'
    || typeof canonicalConsumption.publicationDigest !== 'string'
  ) {
    reject('Canonical Grammar Fill trusted DOCX Publication identity is unavailable')
  }
  const publicationPath = path.join(
    versionDir,
    'canonical',
    `canonical-paper-publication-v${authorityVersion}.json`,
  )
  if (!existsSync(publicationPath)) {
    reject('Canonical Grammar Fill trusted DOCX Publication manifest is unavailable')
  }
  const publication = readJson(
    readFileSync(publicationPath),
    'trusted DOCX Publication manifest',
  )
  if (
    publication?.paperId !== sourcePaperId
    || publication.publicationDigest !== canonicalConsumption.publicationDigest
    || publication.sourceAssetVersion !== sourceAssetVersion
    || publication.sourceAssetDigest !== sourceAssetDigest
    || publication.sourceAssetDocumentId === undefined
    || publication.authority?.manifestId !== authority.manifestId
    || publication.authority?.manifestVersion !== authorityVersion
    || publication.authority?.manifestDigest !== authority.manifestDigest
  ) {
    reject('Canonical Grammar Fill trusted DOCX Publication envelope disagrees')
  }
  const artifacts = new Map(
    Array.isArray(publication.artifacts)
      ? publication.artifacts.map((artifact) => [artifact.role, artifact])
      : [],
  )
  const sourceCaptureBytes = readPublishedArtifact({
    versionDir,
    descriptor: artifacts.get('source_capture'),
    label: 'trusted DOCX Source Capture',
  })
  const planBytes = readPublishedArtifact({
    versionDir,
    descriptor: artifacts.get('paper_plan'),
    label: 'trusted DOCX Canonical Paper Plan',
  })
  const groupsBytes = readPublishedArtifact({
    versionDir,
    descriptor: artifacts.get('question_groups'),
    label: 'trusted DOCX Canonical Question Groups',
  })
  const sourceCapture = readJson(sourceCaptureBytes, 'trusted DOCX Source Capture')
  const sourceDocument = sourceCapture?.documents?.filter(
    (document) => document?.documentId === publication.sourceAssetDocumentId,
  )
  if (
    sourceDocument?.length !== 1
    || sourceDocument[0].mediaType
      !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || sourceDocument[0].sha256 !== sourceAssetDigest
    || sourceDocument[0].byteLength !== assetBytes.byteLength
    || ![
      'question_source',
      'official_answer_source',
      'source_provenance',
    ].every((role) => sourceDocument[0].roles?.includes(role))
    || typeof sourceDocument[0].encodedBytes !== 'string'
  ) {
    reject('Canonical Grammar Fill trusted DOCX Source Capture binding is invalid')
  }
  const capturedBytes = new Uint8Array(Buffer.from(sourceDocument[0].encodedBytes, 'base64'))
  if (!sameBytes(capturedBytes, assetBytes)) {
    reject('Canonical Grammar Fill trusted DOCX Source Capture bytes disagree')
  }
  const sourceEvidence = publication.sourceEvidence?.filter(
    (descriptor) => descriptor?.documentId === publication.sourceAssetDocumentId,
  )
  if (sourceEvidence?.length !== 1) {
    reject('Canonical Grammar Fill trusted DOCX source evidence is ambiguous')
  }
  assertSafeRelativePath(
    sourceEvidence[0].relativePath,
    'trusted DOCX source evidence',
    'source-evidence/',
  )
  const sourceEvidencePath = path.join(versionDir, sourceEvidence[0].relativePath)
  if (!existsSync(sourceEvidencePath)) {
    reject('Canonical Grammar Fill trusted DOCX source evidence is unavailable')
  }
  const sourceEvidenceBytes = readFileSync(sourceEvidencePath)
  if (
    sourceEvidence[0].byteLength !== assetBytes.byteLength
    || sourceEvidence[0].sha256 !== sourceAssetDigest
    || digestBytes(sourceEvidenceBytes) !== sourceEvidence[0].sha256
    || !sameBytes(sourceEvidenceBytes, assetBytes)
  ) {
    reject('Canonical Grammar Fill trusted DOCX source evidence disagrees')
  }
  const envelopes = sourceCapture.documents?.filter(
    (document) => document?.mediaType
      === 'application/vnd.eqb.docx-source-envelope+json',
  )
  if (envelopes?.length !== 1 || typeof envelopes[0].encodedBytes !== 'string') {
    reject('Canonical Grammar Fill trusted DOCX envelope is unavailable')
  }
  const envelope = readJson(
    new Uint8Array(Buffer.from(envelopes[0].encodedBytes, 'base64')),
    'trusted DOCX envelope',
  )
  if (
    envelope?.schemaVersion !== 'docx-source-envelope-v2'
    || envelope.sourceDocument?.inputKey !== sourceDocument[0].inputKey
    || envelope.sourceDocument?.mediaType !== sourceDocument[0].mediaType
    || envelope.sourceDocument?.sha256 !== sourceAssetDigest
    || envelope.sourceDocument?.byteLength !== assetBytes.byteLength
  ) {
    reject('Canonical Grammar Fill trusted DOCX envelope binding disagrees')
  }

  let registered
  try {
    registered = rederiveRegisteredConfirmedCanonicalPublicationSource({
      paperId: sourcePaperId,
      sourceBytes: new Uint8Array(assetBytes),
    })
  } catch {
    reject('Canonical Grammar Fill trusted DOCX authority derivation disagrees')
  }
  const canonicalPaper = registered?.compilation?.artifacts?.canonicalPaper
  const plan = readJson(planBytes, 'trusted DOCX Canonical Paper Plan')
  const groups = readJson(groupsBytes, 'trusted DOCX Canonical Question Groups')
  if (
    registered?.identity?.paperId !== sourcePaperId
    || registered.identity?.sourceDigest !== sourceAssetDigest
    || canonicalPaper?.paperPlan?.paperId !== sourcePaperId
    || stableStringify(canonicalPaper.paperPlan) !== stableStringify(plan)
    || stableStringify(canonicalPaper.questionGroups) !== stableStringify(groups?.groups)
  ) {
    reject('Canonical Grammar Fill trusted DOCX Canonical identity disagrees')
  }
}

function loadChromeSourceAsset({ sourceAsset, versionDir }) {
  if (Array.isArray(sourceAsset?.content?.blocks)) {
    return {
      asset: sourceAsset,
      digest: null,
      kind: 'source_asset',
    }
  }
  if (sourceAsset?.schemaVersion !== 'source-capture-v1') {
    reject('Canonical Grammar Fill chrome immutable source blocks are invalid')
  }
  const documents = sourceAsset.documents?.filter(
    (document) => document.roles?.includes('asset-projection'),
  )
  if (documents?.length !== 1) {
    reject('Canonical Grammar Fill legacy structured source identity is ambiguous')
  }
  const document = documents[0]
  const ref = document.immutableArtifactRef
  assertSafeRelativePath(
    ref?.relativePath,
    'legacy structured source artifact',
    'source-evidence/',
  )
  const sourcePath = path.join(versionDir, ref.relativePath)
  if (!existsSync(sourcePath)) {
    reject('Canonical Grammar Fill legacy structured source is unavailable')
  }
  const sourceBytes = readFileSync(sourcePath)
  const sourceDigest = digestBytes(sourceBytes)
  if (
    sourceDigest !== document.sha256
    || sourceDigest !== ref.sha256
    || sourceBytes.byteLength !== ref.byteLength
  ) {
    reject('Canonical Grammar Fill legacy structured source digest disagrees')
  }
  const asset = readJson(
    sourceBytes,
    'legacy structured source asset',
  )
  if (!Array.isArray(asset?.content?.blocks)) {
    reject('Canonical Grammar Fill legacy structured source blocks are invalid')
  }
  return {
    asset,
    digest: sourceDigest,
    kind: 'legacy_source_capture',
  }
}

export function loadCanonicalGrammarFillPrintChrome({
  exportItems,
  canonicalConsumption,
  paperAssetsDir,
  versionType,
}) {
  const selection = canonicalConsumption?.selections?.find(
    (candidate) =>
      candidate.familyContractId === 'grammar-fill'
      && candidate.mode === 'canonical',
  )
  if (!selection) return null
  if (selection.groupIds.length !== 1 || !paperAssetsDir) {
    reject('Canonical Grammar Fill chrome source identity is unavailable')
  }
  const groupId = selection.groupIds[0]
  const item = exportItems.find((candidate) => candidate.detail.id === groupId)
  const sourcePaperId = item?.detail.paperId
  if (typeof sourcePaperId !== 'string' || sourcePaperId.length === 0) {
    reject('Canonical Grammar Fill chrome paper identity is unavailable')
  }
  const sourceAssetVersion = canonicalConsumption.sourceAssetVersion
  const sourceAssetDigest = canonicalConsumption.sourceAssetDigest
  if (
    !Number.isInteger(sourceAssetVersion)
    || typeof sourceAssetDigest !== 'string'
  ) {
    reject('Canonical Grammar Fill chrome source binding is unavailable')
  }
  const versionDir = path.join(
    paperAssetsDir,
    sourcePaperId,
    'versions',
    `v${sourceAssetVersion}`,
  )
  const assetPath = path.join(versionDir, 'paper-asset.json')
  if (!existsSync(assetPath)) {
    reject('Canonical Grammar Fill chrome immutable source asset is unavailable')
  }
  const assetBytes = readFileSync(assetPath)
  if (digestBytes(assetBytes) !== sourceAssetDigest) {
    reject('Canonical Grammar Fill chrome immutable source digest disagrees')
  }
  if (isDocxPackage(assetBytes)) {
    verifyTrustedDocxPublicationSource({
      assetBytes,
      sourcePaperId,
      sourceAssetVersion,
      sourceAssetDigest,
      canonicalConsumption,
      versionDir,
    })
    return null
  }
  const asset = readJson(
    assetBytes,
    'chrome immutable source asset',
  )
  const chromeSource = loadChromeSourceAsset({
    sourceAsset: asset,
    versionDir,
  })
  const chromeAsset = chromeSource.asset
  const chromeAssetDigest = chromeSource.digest || sourceAssetDigest
  const publicOracle = grammarFillRhythm.publicArtifactOracle
  const requiresPublicSourceBinding =
    sourcePaperId === publicOracle.paperId
    && Number(canonicalConsumption.authorityRef?.manifestVersion) >= 20
  if (
    chromeSource.kind === 'legacy_source_capture'
    && !requiresPublicSourceBinding
  ) return null
  const blocks = chromeAsset.content.blocks
  const groupIndex = blocks.findIndex(
    (block) => block.type === 'group' && block.groupId === groupId,
  )
  if (groupIndex < 0) {
    reject('Canonical Grammar Fill chrome Group identity is unavailable')
  }
  const section = blocks[groupIndex - 2]
  const instruction = blocks[groupIndex - 1]
  const previousGroup = blocks.slice(0, groupIndex).findLast(
    (block) => block.type === 'group',
  )
  const partContext = blocks.slice(0, groupIndex).findLast(
    (block) => block.type === 'partHeading',
  )
  const followingPart = blocks.slice(groupIndex + 1).find(
    (block) => block.type === 'partHeading',
  )
  if (
    section?.type !== 'sectionHeading'
    || instruction?.type !== 'instruction'
    || previousGroup?.type !== 'group'
    || partContext?.type !== 'partHeading'
    || followingPart?.type !== 'partHeading'
    || [
      section.text,
      instruction.text,
      partContext.text,
      followingPart.text,
    ].some((text) => typeof text !== 'string' || text.length === 0)
  ) {
    reject('Canonical Grammar Fill chrome source adjacency is incomplete')
  }

  let sourceBinding = null
  if (requiresPublicSourceBinding) {
    if (
      sourceAssetVersion !== publicOracle.sourceAssetVersion
      || chromeAssetDigest
        !== `sha256:${publicOracle.sourceBindings.paperAsset.sha256}`
      || groupId !== publicOracle.grammarFill.groupId
    ) {
      reject('Canonical Grammar Fill public source authority disagrees')
    }
    const group = chromeAsset.content?.groups?.[groupId]
    if (
      !group
      || JSON.stringify(
        group.passage?.paragraphs?.map((paragraph) => paragraph.paragraphId),
      ) !== JSON.stringify(publicOracle.grammarFill.paragraphIds)
      || JSON.stringify(group.questionIds)
        !== JSON.stringify(publicOracle.grammarFill.questionIds)
      || JSON.stringify(group.blankIds)
        !== JSON.stringify(publicOracle.grammarFill.blankIds)
    ) {
      reject('Canonical Grammar Fill immutable source identity disagrees')
    }

    const authorityVersion =
      canonicalConsumption.authorityRef?.manifestVersion
    const publicationManifestPath = path.join(
      versionDir,
      'canonical',
      `canonical-paper-publication-v${authorityVersion}.json`,
    )
    if (!existsSync(publicationManifestPath)) {
      reject('Canonical Grammar Fill immutable Publication manifest is unavailable')
    }
    const publicationManifest = readJson(
      readFileSync(publicationManifestPath),
      'immutable Publication manifest',
    )
    if (
      publicationManifest.publicationDigest
        !== canonicalConsumption.publicationDigest
      || publicationManifest.sourceAssetDigest !== sourceAssetDigest
      || publicationManifest.authority?.manifestDigest
        !== canonicalConsumption.authorityRef?.manifestDigest
    ) {
      reject('Canonical Grammar Fill immutable Publication envelope disagrees')
    }
    const sourceCaptureDescriptor = publicationManifest.artifacts?.find(
      (descriptor) => descriptor.role === 'source_capture',
    )
    assertSafeRelativePath(
      sourceCaptureDescriptor?.relativePath,
      'Source Capture descriptor',
    )
    const sourceCapturePath = path.join(
      versionDir,
      sourceCaptureDescriptor.relativePath,
    )
    if (!existsSync(sourceCapturePath)) {
      reject('Canonical Grammar Fill Source Capture is unavailable')
    }
    const sourceCaptureBytes = readFileSync(sourceCapturePath)
    if (
      digestBytes(sourceCaptureBytes) !== sourceCaptureDescriptor.sha256
      || sourceCaptureBytes.byteLength !== sourceCaptureDescriptor.byteLength
    ) {
      reject('Canonical Grammar Fill Source Capture digest disagrees')
    }
    const sourceCapture = readJson(
      sourceCaptureBytes,
      'Source Capture',
    )
    const officialAnswerDocuments = sourceCapture.documents?.filter(
      (document) =>
        document.inputKey === 'official_answers'
        && document.roles?.includes('official_answer_source'),
    )
    if (officialAnswerDocuments?.length !== 1) {
      reject('Canonical Grammar Fill official-answer source identity is ambiguous')
    }
    const officialAnswerDocument = officialAnswerDocuments[0]
    const officialAnswerRef = officialAnswerDocument.immutableArtifactRef
    assertSafeRelativePath(
      officialAnswerRef?.relativePath,
      'official-answer artifact',
      'source-evidence/',
    )
    const officialAnswerPath = path.join(
      versionDir,
      officialAnswerRef.relativePath,
    )
    if (!existsSync(officialAnswerPath)) {
      reject('Canonical Grammar Fill immutable official answers are unavailable')
    }
    const officialAnswerBytes = readFileSync(officialAnswerPath)
    const officialAnswerDigest = digestBytes(officialAnswerBytes)
    if (
      officialAnswerDigest !== officialAnswerDocument.sha256
      || officialAnswerDigest !== officialAnswerRef.sha256
      || officialAnswerDigest
        !== `sha256:${publicOracle.sourceBindings.officialAnswers.sha256}`
    ) {
      reject('Canonical Grammar Fill official-answer digest disagrees')
    }
    const officialAnswers = readJson(
      officialAnswerBytes,
      'official answers',
    )
    const projectedOccurrenceDigest =
      selection.projectedOccurrenceDigests?.find(
        (candidate) => candidate.groupId === groupId,
      )?.digest
    if (
      projectedOccurrenceDigest
        !== publicOracle.expectedProjectedOccurrenceDigest
    ) {
      reject('Canonical Grammar Fill projected occurrence source digest disagrees')
    }
    const projectedOccurrence = selection.projectedOccurrences?.find(
      (candidate) =>
        candidate?.kind === 'group' && candidate.groupId === groupId,
    )
    if (
      !projectedOccurrence
      || projectedOccurrence.familyContractId !== 'grammar-fill'
      || !Array.isArray(projectedOccurrence.blanks)
    ) {
      reject('Canonical Grammar Fill projected prompt authority is unavailable')
    }
    const projectedBlankById = new Map(
      projectedOccurrence.blanks.map((blank) => [blank?.blankId, blank]),
    )
    const questionSupplements =
      publicOracle.grammarFill.questionIds.map((questionId, index) => {
        const blankId = publicOracle.grammarFill.blankIds[index]
        const question = chromeAsset.content.questions?.[questionId]
        const blank = chromeAsset.content.blanks?.[blankId]
        const projectedBlank = projectedBlankById.get(blankId)
        const answer = officialAnswers.answers?.[questionId]?.answer
        const prompt = blank?.prompt ?? null
        if (
          question?.blankId !== blankId
          || blank?.questionId !== questionId
          || projectedBlank?.questionId !== questionId
          || !Object.hasOwn(projectedBlank, 'prompt')
          || prompt !== projectedBlank.prompt
          || answer !== publicOracle.grammarFill.answers[questionId]
        ) {
          reject(`Canonical Grammar Fill source row disagrees: ${questionId}`)
        }
        return {
          questionId,
          blankId,
          prompt,
          answer,
        }
      })
    if (versionType === 'teacher' && chromeSource.kind === 'source_asset') {
      const analysisAuthority = publicOracle.sourceBindings.teacherAnalysis
      const analysisPath = path.join(
        paperAssetsDir,
        sourcePaperId,
        'latest',
        analysisAuthority.path,
      )
      if (!existsSync(analysisPath)) {
        reject('Canonical Grammar Fill reviewed Teacher analysis is unavailable')
      }
      const analysisBytes = readFileSync(analysisPath)
      const analysis = readJson(
        analysisBytes,
        'reviewed Teacher analysis',
      )
      if (
        digestBytes(analysisBytes)
          !== `sha256:${analysisAuthority.sha256}`
        || analysis.schemaVersion !== analysisAuthority.schemaVersion
        || analysis.meta?.reviewStatus !== analysisAuthority.reviewStatus
      ) {
        reject('Canonical Grammar Fill reviewed Teacher analysis authority disagrees')
      }
      for (const supplement of questionSupplements) {
        const analysisRow = analysis.blanks?.[supplement.questionId]
        const explanation = formatGrammarFillAnalysis(analysisRow)
        if (
          analysisRow?.blankId !== supplement.blankId
          || (analysisRow?.hint ?? null) !== supplement.prompt
          || typeof analysisRow?.answer !== 'string'
          || analysisRow.answer.length === 0
        ) {
          reject(
            `Canonical Grammar Fill reviewed analysis identity disagrees: ${supplement.questionId}`,
          )
        }
        if (typeof explanation !== 'string' || explanation.length === 0) {
          reject(
            `Canonical Grammar Fill reviewed analysis row is unavailable: ${supplement.questionId}`,
          )
        }
        supplement.explanation = explanation
        const question = item.detail.questions.find(
          (candidate) => candidate.id === supplement.questionId,
        )
        if (question && !question.explanation) {
          question.explanation = explanation
        }
      }
    }
    sourceBinding = {
      paperId: sourcePaperId,
      sourceAssetVersion,
      groupId,
      projectedOccurrenceDigest,
      geometry: {
        blankWidthEm: grammarFillRhythm.blankGeometry.widthEm,
        promptGapEm: grammarFillRhythm.promptGeometry.gapEm,
        promptAttachment: grammarFillRhythm.promptGeometry.attachment,
      },
      sourceDigests: {
        paperAsset: chromeAssetDigest,
        ...(
          chromeSource.kind === 'legacy_source_capture'
            ? { sourceCapture: sourceAssetDigest }
            : {}
        ),
        officialAnswers: officialAnswerDigest,
        ...(
          versionType === 'teacher' && chromeSource.kind === 'source_asset'
            ? {
                teacherAnalysis:
                  `sha256:${publicOracle.sourceBindings.teacherAnalysis.sha256}`,
              }
            : {}
        ),
      },
      questionSupplements,
    }
  }
  return {
    groupId,
    previousFamilyGroupId: previousGroup.groupId,
    ...(sourceBinding ? { sourceBinding } : {}),
  }
}
