import { SCHEMA_VERSION, TOKENIZER_VERSION } from '../../../../../../shared/sentence-analysis/constants.mjs'
import { tokenizeSentence } from '../../../../../../shared/sentence-analysis/tokenize.mjs'
import { validateSentenceAnalysis } from '../../../../../../shared/sentence-analysis/validate.mjs'
import type { SentenceAnalysisV1, SentenceTarget } from '../../../../../../shared/sentence-analysis/types.d.mts'

export type SentenceAnalysisProvider = {
  analyze(target: SentenceTarget, options: { signal: AbortSignal }): Promise<SentenceAnalysisV1>
}

type FixtureModule = { coreFixtures?: Array<Record<string, unknown>>; paperFixtures?: Array<Record<string, unknown>> }

let fixturesPromise: Promise<SentenceAnalysisV1[]> | null = null

function loadFixtures() {
  if (!fixturesPromise) {
    fixturesPromise = Promise.all([
      import('../../../../../../shared/sentence-analysis/fixtures/core-samples.mjs'),
      import('../../../../../../shared/sentence-analysis/fixtures/paper-2026-i.mjs'),
      import('../../../../../../shared/sentence-analysis/compileFixture.mjs'),
    ]).then(([core, paper, compiler]) => {
      const sources = [
        ...((core as FixtureModule).coreFixtures || []),
        ...((paper as FixtureModule).paperFixtures || []),
      ]
      return sources.map((fixture) => compiler.compileFixture(
        fixture as { sentenceText: string },
        { id: String(fixture.id || 'fixture') },
      ))
    })
  }
  return fixturesPromise
}

function unavailable(target: SentenceTarget): SentenceAnalysisV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    tokenizerVersion: TOKENIZER_VERSION,
    source: { ...target },
    producer: { kind: 'fixture', id: 'fixture-provider' },
    status: 'unavailable',
    unavailableReason: '该句暂无分析数据（本期为演示数据）',
    tokens: tokenizeSentence(target.sentenceText),
    rootClauseIds: [],
    units: [],
    relations: [],
    restores: [],
    translation: null,
  }
}

function withTargetSource(analysis: SentenceAnalysisV1, target: SentenceTarget): SentenceAnalysisV1 {
  return {
    ...analysis,
    source: {
      paperId: target.paperId,
      sourceRevision: target.sourceRevision,
      streamId: target.streamId,
      start: target.start,
      end: target.end,
      sentenceText: target.sentenceText,
    },
  }
}

export class SentenceAnalysisRequestError extends Error {
  code: string

  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

export const apiProvider: SentenceAnalysisProvider = {
  async analyze(target, { signal }) {
    const response = await fetch('/api/paper-sentence-analysis/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        paperId: target.paperId,
        sourceRevision: target.sourceRevision,
        streamId: target.streamId,
        start: target.start,
        end: target.end,
        sentenceText: target.sentenceText,
      }),
      signal,
    })
    const data = await response.json().catch(() => null) as
      | { analysis?: SentenceAnalysisV1; error?: string; code?: string }
      | null
    if (!response.ok || !data?.analysis) {
      throw new SentenceAnalysisRequestError(data?.error || '分析失败，请重试', data?.code || `HTTP_${response.status}`)
    }
    return data.analysis
  },
}

export function createSentenceAnalysisProvider(mode: 'fixture' | 'api'): SentenceAnalysisProvider {
  return mode === 'fixture' ? fixtureProvider : apiProvider
}

async function findFixture(target: SentenceTarget): Promise<SentenceAnalysisV1 | null> {
  const fixtures = await loadFixtures()
  const bound = fixtures.find((fixture) => (
    fixture.source.paperId === target.paperId
    && fixture.source.streamId === target.streamId
    && fixture.source.start === target.start
    && fixture.source.end === target.end
    && fixture.source.sentenceText === target.sentenceText
  ))
  const generic = fixtures.find((fixture) => fixture.source.paperId === 'fixture' && fixture.source.sentenceText === target.sentenceText)
  const found = bound || generic
  return found ? validated(withTargetSource(found, target)) : null
}

function validated(analysis: SentenceAnalysisV1) {
  const result = validateSentenceAnalysis(analysis)
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '))
  return result.value
}

export const fixtureProvider: SentenceAnalysisProvider = {
  async analyze(target, { signal }) {
    const delay = 300 + Math.random() * 500
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, delay)
      const abort = () => {
        window.clearTimeout(timer)
        reject(new DOMException('aborted', 'AbortError'))
      }
      if (signal.aborted) {
        abort()
        return
      }
      signal.addEventListener('abort', abort, { once: true })
    })
    return (await findFixture(target)) || validated(unavailable(target))
  },
}
