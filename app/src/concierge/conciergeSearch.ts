/**
 * conciergeSearch — runs a natural-language intent against the question bank.
 *
 * Strategy:
 *   1. If apiKey is present, ask the question-bank steward (DeepSeek backend).
 *   2. If steward returns needsClarification=true, surface that without ranking.
 *   3. If apiKey is missing or the call throws, run a local keyword fallback
 *      across title / passageTitle / summary / hit / source / region / tags.
 *
 * Pure-ish: only side effect is the network call inside doStewardCall.
 */

import type { QuestionGroupCard } from '../domain/questionBank.ts'
import {
  askQuestionBankSteward,
  type QuestionBankStewardResult,
  type SemanticSearchMatch,
} from '../services/questionGroups.ts'

export type ConciergeSearchInput = {
  /** Raw user intent text. */
  intent: string
  /** Optional pending query held while we wait for a clarification reply. */
  pendingQuery?: string | null
  /** All known question groups; required for keyword fallback rendering. */
  questionGroups: QuestionGroupCard[]
  /** DeepSeek key. Empty string means "go straight to fallback". */
  apiKey: string
  /** Optional override for tests; defaults to the real ask call. */
  doStewardCall?: (message: string, apiKey: string) => Promise<QuestionBankStewardResult>
  /** Test hook; production keeps this short enough to avoid a stuck search UI. */
  stewardTimeoutMs?: number
}

export type ConciergeSearchHit = {
  group: QuestionGroupCard
  /** Steward-supplied reason or local keyword reason. Never displayed as a score. */
  reason: string
}

export type ConciergeSearchOutcome =
  | {
      kind: 'results'
      hits: ConciergeSearchHit[]
      assistantMessage: string
      /** Original intent message used for the round (unmodified user input). */
      query: string
      /** Final message sent to backend (may include "原 query；补充说明：" prefix). */
      sentMessage: string
      source: 'steward'
    }
  | {
      kind: 'results'
      hits: ConciergeSearchHit[]
      assistantMessage: string
      query: string
      sentMessage: string
      source: 'fallback'
      fallbackReason: string
    }
  | {
      kind: 'clarification'
      assistantMessage: string
      clarificationQuestion: string
      query: string
      sentMessage: string
    }

const KEYWORD_FIELDS: Array<keyof QuestionGroupCard> = [
  'title',
  'passageTitle',
  'summary',
  'hit',
  'source',
  'region',
  'paperName',
  'section',
]

function normalize(text: string) {
  return String(text || '').toLowerCase().trim()
}

function tokenize(query: string): string[] {
  // Split on whitespace and Chinese punctuation; keep words >= 2 chars (or any CJK char).
  const raw = query
    .replace(/[，。、；：！？,.!?;:()（）【】"'《》<>\\/|]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
  return raw
}

/** Keyword fallback ranking: count hits across known card fields + tags + topicLabels. */
export function rankByKeywords(
  groups: QuestionGroupCard[],
  query: string,
  limit = 12,
): ConciergeSearchHit[] {
  const tokens = tokenize(query).map(normalize).filter((t) => t.length > 0)
  if (tokens.length === 0) {
    return groups.slice(0, limit).map((group) => ({ group, reason: '近期题组' }))
  }
  const scored = groups.map((group) => {
    const haystack = [
      ...KEYWORD_FIELDS.map((field) => String(group[field] ?? '')),
      ...(group.tags || []),
      ...(group.topicLabels || []).map((label) => label.label),
    ]
      .map(normalize)
      .join(' ')
    let hits = 0
    const matchedTokens: string[] = []
    for (const token of tokens) {
      if (haystack.includes(token)) {
        hits += 1
        matchedTokens.push(token)
      }
    }
    return { group, hits, matchedTokens }
  })
  return scored
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map(({ group, matchedTokens }) => ({
      group,
      reason: matchedTokens.length > 0 ? `匹配关键词：${matchedTokens.join('、')}` : '关键词匹配',
    }))
}

function hitsFromStewardMatches(
  matches: SemanticSearchMatch[],
  questionGroups: QuestionGroupCard[],
): ConciergeSearchHit[] {
  const groupById = new Map(questionGroups.map((g) => [g.id, g]))
  return matches
    .map((match) => {
      const group = groupById.get(match.questionGroupId) || match.questionGroup
      if (!group) return null
      return { group, reason: (match.reason || '').trim() }
    })
    .filter((hit): hit is ConciergeSearchHit => hit !== null)
}

function buildSentMessage(intent: string, pendingQuery: string | null | undefined): string {
  const trimmed = intent.trim()
  if (pendingQuery && trimmed && trimmed !== pendingQuery) {
    return `${pendingQuery}；补充说明：${trimmed}`
  }
  return trimmed
}

const DEFAULT_STEWARD_TIMEOUT_MS = 6000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        globalThis.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function runConciergeSearch(
  input: ConciergeSearchInput,
): Promise<ConciergeSearchOutcome> {
  const intent = input.intent.trim()
  const sentMessage = buildSentMessage(intent, input.pendingQuery)
  const apiKey = (input.apiKey || '').trim()
  const doStewardCall = input.doStewardCall || askQuestionBankSteward

  if (!apiKey) {
    return {
      kind: 'results',
      hits: rankByKeywords(input.questionGroups, intent),
      assistantMessage: '没填 AI 密钥，先用本地题库帮你找。',
      query: intent,
      sentMessage,
      source: 'fallback',
      fallbackReason: 'missing-api-key',
    }
  }

  try {
    const result = await withTimeout(
      doStewardCall(sentMessage, apiKey),
      input.stewardTimeoutMs ?? DEFAULT_STEWARD_TIMEOUT_MS,
      'question-bank steward',
    )
    if (result.needsClarification) {
      return {
        kind: 'clarification',
        assistantMessage: result.assistantMessage || '能再说细一点吗？',
        clarificationQuestion: result.clarificationQuestion || result.assistantMessage || '能再说细一点吗？',
        query: intent,
        sentMessage,
      }
    }
    const matches = result.search?.matches || result.matches || []
    return {
      kind: 'results',
      hits: hitsFromStewardMatches(matches, input.questionGroups),
      assistantMessage: result.assistantMessage || '找到一些可能匹配的题组。',
      query: intent,
      sentMessage,
      source: 'steward',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Surface the technical error in the dev console only; UI gets a soft Chinese line.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[concierge] steward call failed; using keyword fallback:', message)
    }
    return {
      kind: 'results',
      hits: rankByKeywords(input.questionGroups, intent),
      assistantMessage: '管家暂时没连上，我先用本地题库帮你找。',
      query: intent,
      sentMessage,
      source: 'fallback',
      fallbackReason: 'api-error',
    }
  }
}

/**
 * Build a "find similar" intent string for a known group.
 * Uses title / summary / tags so users see why the new search is relevant.
 */
export function buildSimilarIntent(group: QuestionGroupCard): string {
  const tags = (group.tags || []).slice(0, 3)
  const tagText = tags.length > 0 ? `；标签 ${tags.join('、')}` : ''
  const summary = (group.summary || '').trim()
  const summaryText = summary ? `；主题接近「${summary.slice(0, 40)}」` : ''
  return `找类似这道题：${group.title}${summaryText}${tagText}`
}
