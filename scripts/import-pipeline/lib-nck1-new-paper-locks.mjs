/**
 * New-paper locks that must hold for every future NCK1 import, not one mock.
 *
 * - Format ③ always requires staged writing analyses and NCK1 application chrome.
 * - Any paper that already dropped analysis-application.json /
 *   analysis-continuation.json is held to the same writing contract.
 * - Historical format ① / ② papers without those files stay backfillable.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  persistWritingAnalysisGroup,
  validateWritingAnalysisCandidate,
} from '../../server/writing-analysis/writingAnalysisBackfillService.mjs'
import {
  projectNck1StagedWritingAnalysis,
} from '../../server/import-review/nck1AnalysisProjection.mjs'
import { writingNoticeGroups, writingWordCount } from '../../shared/paper-canonical/applicationWritingDisplay.mjs'
import {
  isApplicationReviewCardV2,
  isCompleteApplicationReviewCard,
} from '../../shared/writing/applicationReviewCard.mjs'

export const WRITING_ANALYSIS_KEYS = ['application', 'continuation']

export function isFormat3Config(config) {
  return String(config?.format) === '3'
}

export function writingAnalysisPath(paperDir, key) {
  return path.join(paperDir, `analysis-${key}.json`)
}

export function hasStagedWritingAnalysis(paperDir) {
  return WRITING_ANALYSIS_KEYS.some((key) => existsSync(writingAnalysisPath(paperDir, key)))
}

export function requiresLockedWritingAnalysis(config, paperDir) {
  return isFormat3Config(config) || hasStagedWritingAnalysis(paperDir)
}

export function loadStagedWritingAnalysis(paperDir, key) {
  const filePath = writingAnalysisPath(paperDir, key)
  if (!existsSync(filePath)) {
    throw new Error(`missing papers analysis-${key}.json`)
  }
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

export function projectStagedWritingAnalysis(raw) {
  return projectNck1StagedWritingAnalysis(raw)
}

export function assertApplicationChromeFromGroups(application) {
  if (!application || typeof application !== 'object') {
    throw new Error('application group missing')
  }
  const prompt = (application.paragraphs || []).map((paragraph) => paragraph.text).join('\n')
  if (/[（(]词数/.test(prompt)) {
    throw new Error('application prompt must not glue the word-count suffix')
  }
  // This legacy staging shape cannot prove a response region's contents.
  // Do not demand/invent a title; Canonical refs below own the given text.
}

// Layout QA supplements Candidate validation; source observations and role
// validity remain the existing Canonical compiler's responsibility.
export function assertApplicationGivenOwnership(group) {
  if (!group || group.variant?.family !== 'application-writing') {
    throw new Error('application-writing group missing')
  }
  const { variant } = group
  if (variant.mode === 'legacy_opaque') {
    throw new Error('application fixed-text ownership needs source review: revise legacy_opaque to structured givenSkeleton before approving layout')
  }
  const blocks = new Map((group.content?.blocks || []).map(block => [block.nodeId, block]))
  const text = id => (blocks.get(id)?.inlines || []).map(inline => inline.text || '').join('')
  const promptIds = variant.promptBlockRefs || []
  const skeleton = variant.givenSkeleton
  if (skeleton?.presence === 'none' && skeleton.answerRegionAbsenceAssertionRef) return
  if (skeleton?.presence !== 'provided' || !skeleton.parts?.length) {
    throw new Error('application givenSkeleton needs source-provided parts or evidenced absence')
  }
  for (const part of skeleton.parts) {
    if (!text(part.blockRef).trim() || promptIds.includes(part.blockRef)) {
      throw new Error('application given text must occur only inside its response box, not again in the prompt')
    }
    const top = ['title', 'salutation', 'opening'].includes(part.role)
    if (part.placement !== (top ? 'answer_region_top' : 'answer_region_bottom')) {
      throw new Error('application given text has the wrong response-box placement')
    }
  }
}

export function assertNck1ApplicationChrome(group) {
  assertApplicationGivenOwnership(group)
  const promptIds = new Set(group.variant.promptBlockRefs)
  const paragraphs = group.content.blocks.filter(block => promptIds.has(block.nodeId))
    .map(block => (block.inlines || []).map(inline => inline.text || '').join(''))
  const prompt = paragraphs.join('\n')
  if (prompt.includes('（词数') || prompt.includes('(词数')) {
    throw new Error('application prompt must not glue the word-count suffix')
  }
  const notices = writingNoticeGroups(paragraphs)
  if (notices.length !== 1 || writingWordCount(notices[0].lines.map(line => line.text).join(' ')) === null) {
    throw new Error('application notice block missing NCK1 注意 chrome')
  }
}

export function assertPublishedWritingAnalysisEnvelope(envelope, {
  paperId,
  applicationGroupId,
  continuationGroupId,
}) {
  if (envelope?.schemaVersion !== 'writing-analysis-v1') {
    throw new Error('published writing-analysis-v1.json missing or wrong schemaVersion')
  }
  if (envelope.paperId !== paperId) {
    throw new Error(`writing-analysis paperId ${envelope.paperId} != ${paperId}`)
  }
  const rawApplication = envelope.groups?.[applicationGroupId]?.writing
  if (isApplicationReviewCardV2(rawApplication?.reviewCard)) {
    const application = projectStagedWritingAnalysis(rawApplication)
    validateWritingAnalysisCandidate(application)
  } else if (
    rawApplication?.taskType !== 'application'
    || typeof rawApplication.modelAnswer !== 'string'
    || !rawApplication.modelAnswer.trim()
    || !isCompleteApplicationReviewCard(rawApplication.reviewCard)
  ) {
    throw new Error('historical published application writing analysis is malformed')
  } else {
    // Historical expressions remain in the archived envelope, but must not
    // bypass the remaining model/source/task-family validation on readback.
    const { highlightExpressions: _retiredExpressions, ...application } = rawApplication
    validateWritingAnalysisCandidate(application)
  }
  const rawContinuation = envelope.groups?.[continuationGroupId]?.writing
  // Published V1 sidecars remain readable without being rewritten. Only new
  // staged production is required to enter through the V2 projector.
  const continuation = rawContinuation?.continuationAnalysis?.schemaVersion === 'continuation-analysis-v1'
    ? structuredClone(rawContinuation)
    : projectStagedWritingAnalysis(rawContinuation)
  validateWritingAnalysisCandidate(continuation)
}

export function persistStagedWritingAnalyses({
  paperAssetsDir,
  paperId,
  applicationGroupId,
  continuationGroupId,
  applicationRaw,
  continuationRaw,
}) {
  const application = projectStagedWritingAnalysis(applicationRaw)
  const continuation = projectStagedWritingAnalysis(continuationRaw)
  validateWritingAnalysisCandidate(application)
  validateWritingAnalysisCandidate(continuation)
  persistWritingAnalysisGroup(
    { paperAssetsDir },
    { paperId, groupId: applicationGroupId },
    application,
  )
  persistWritingAnalysisGroup(
    { paperAssetsDir },
    { paperId, groupId: continuationGroupId },
    continuation,
  )
}
