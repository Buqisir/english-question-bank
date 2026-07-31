import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { grammarFillRhythm } from '../../shared/paper-canonical/grammarFillRhythm.mjs'

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
    return JSON.parse(bytes)
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
  const asset = readJson(
    assetBytes,
    'chrome immutable source asset',
  )
  const blocks = asset?.content?.blocks
  if (!Array.isArray(blocks)) {
    reject('Canonical Grammar Fill chrome immutable source blocks are invalid')
  }
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

  const publicOracle = grammarFillRhythm.publicArtifactOracle
  let sourceBinding = null
  if (
    sourcePaperId === publicOracle.paperId
    && Number(canonicalConsumption.authorityRef?.manifestVersion) >= 20
  ) {
    if (
      sourceAssetVersion !== publicOracle.sourceAssetVersion
      || sourceAssetDigest
        !== `sha256:${publicOracle.sourceBindings.paperAsset.sha256}`
      || groupId !== publicOracle.grammarFill.groupId
    ) {
      reject('Canonical Grammar Fill public source authority disagrees')
    }
    const group = asset.content?.groups?.[groupId]
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
        const question = asset.content.questions?.[questionId]
        const blank = asset.content.blanks?.[blankId]
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
    if (versionType === 'teacher') {
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
        paperAsset: sourceAssetDigest,
        officialAnswers: officialAnswerDigest,
        ...(
          versionType === 'teacher'
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
