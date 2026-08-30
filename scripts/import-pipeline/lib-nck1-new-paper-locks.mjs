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
  if (!String(application.applicationGiven || '').trim()) {
    throw new Error('applicationGiven title is required for new NCK1 papers')
  }
}

export function applicationBlockText(group, suffix) {
  const block = (group?.content?.blocks || []).find((candidate) => (
    String(candidate.nodeId || '').endsWith(suffix)
  ))
  return (block?.inlines || []).map((inline) => inline.text).join('')
}

export function assertNck1ApplicationChrome(group) {
  if (!group || group.variant?.family !== 'application-writing') {
    throw new Error('application-writing group missing')
  }
  const prompt = applicationBlockText(group, ':prompt')
  const notice = applicationBlockText(group, ':notice')
  const title = applicationBlockText(group, ':given:title')
  if (prompt.includes('（词数') || prompt.includes('(词数')) {
    throw new Error('application prompt must not glue the word-count suffix')
  }
  if (!/^注意：/.test(notice) || !/个左右/.test(notice)) {
    throw new Error('application notice block missing NCK1 注意 chrome')
  }
  if (group.variant.givenSkeleton?.presence !== 'provided') {
    throw new Error('application givenSkeleton.presence must be provided')
  }
  if (!title.trim()) {
    throw new Error('application given title is empty')
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
  const application = projectStagedWritingAnalysis(envelope.groups?.[applicationGroupId]?.writing)
  const continuation = projectStagedWritingAnalysis(envelope.groups?.[continuationGroupId]?.writing)
  validateWritingAnalysisCandidate(application)
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
