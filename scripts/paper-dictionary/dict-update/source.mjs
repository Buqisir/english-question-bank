import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { hashPhraseBlock } from '../../../shared/paper-dictionary/phraseOccurrence.mjs'
import { inlineText } from '../../../server/agent-api/agentPassage.mjs'

export const json = path => JSON.parse(readFileSync(path, 'utf8'))
export const ndjson = text => text.split('\n').filter(line => line.trim()).map(JSON.parse)
export const tierOf = paper => ({ real: 'gaokao', mock: 'mock' })[paper.type]
export const rowLocator = row => JSON.stringify([row.groupId, row.paragraphId ?? row.questionId])
export const validPaperId = id => /^paper-[a-zA-Z0-9-]+$/u.test(id)
export function blocksOf(paper) {
  const blocks = {}
  for (const group of paper.groups) {
    const { groupId } = group
    const add = (kind, id, locator, raw, stableId = id) => {
      if (typeof raw !== 'string' || !raw.trim()) return
      const hash = hashPhraseBlock(raw)
      const key = JSON.stringify([groupId, kind, stableId])
      assert(!blocks[key], `块 ID 重复 ${paper.paperId} ${key}`)
      const rawHash = createHash('sha256').update(raw).digest('hex')
      blocks[key] = { kind, raw, hash, rawHash, locator, groupId, id }
    }
    group.passage?.paragraphs?.forEach((p, index) =>
      add('paragraph', p.paragraphId ?? p.blockId ?? `paragraph:${index + 1}`,
        { paragraph: index + 1 }, p.text ?? inlineText(p.nodes)))
    for (const q of group.questions ?? []) {
      const number = q.number ?? q.questionNo
      const id = q.questionId ?? `question:${number}`
      add('stem', id, { question: number }, q.stem)
      const duplicates = new Map()
      for (const o of group.optionBank?.length ? [] : q.options ?? []) {
        const text = o.content ?? o.text
        if (typeof text !== 'string' || !text.trim()) continue
        const hash = hashPhraseBlock(text)
        const ordinal = duplicates.get(hash) ?? 0
        duplicates.set(hash, ordinal + 1)
        add('option', `${id}#option=${o.label}`, { question: number, option: o.label }, text,
          o.optionId && o.optionId !== `option:${id}:${o.label}` ? o.optionId : `${id}:${hash}:${ordinal}`)
      }
    }
    const shared = new Set()
    for (const o of group.optionBank ?? []) {
      const text = o.text ?? o.content
      if (typeof text !== 'string' || !text.trim()) continue
      const stable = o.optionId && o.optionId !== `option:${o.label}` ? o.optionId : hashPhraseBlock(text)
      if (shared.has(stable)) continue
      shared.add(stable)
      add('bank', `option-bank:${o.label}`, { optionBank: o.label }, text, stable)
      blocks[JSON.stringify([groupId, 'bank', stable])].aliases = (group.questions ?? []).map(q =>
        `${q.questionId ?? `question:${q.number ?? q.questionNo}`}#option=${o.label}`)
    }
  }
  return blocks
}

export async function readLegacy(directory, candidates, entries) {
  const wordIds = new Map([...entries.values()].filter(e => e.kind !== 'phrase')
    .map(e => [e.headword, e.entryId]))
  for (const p of candidates.values()) {
    p.byLocator = new Map(Object.entries(p.blocks).map(([key, b]) => [legacyLocator(b.groupId, b.locator), key]))
    p.legacyHits = {}
    p.blocks.counts ??= { locator: {}, wordCounts: {} }
  }
  const archivedBlock = (p, key) => p.legacyHits[key] ??= { words: [], phrases: [] }
  const find = (p, source) =>
    p.byLocator.get(legacyLocator(source.groupId, source.locator)) ??
    (source.locator.option && p.byLocator.get(legacyLocator(source.groupId, { optionBank: source.locator.option }))) ??
    legacyLocator(source.groupId, source.locator)
  for await (const { source, tier, hits } of lines(join(directory, 'occurrences.ndjson.gz'), true)) {
    const p = candidates.get(source.paperId)
    if (!p) continue
    p.tier = tier
    const key = find(p, source)
    const counts = p.blocks.counts.wordCounts
    for (const [headword, spans] of Object.entries(hits)) {
      const id = wordIds.get(headword)
      if (!id) continue
      counts[id] = (counts[id] ?? 0) + spans.length
      const archived = archivedBlock(p, key)
      archived.words.push([source.locator, id, spans])
    }
  }
  for await (const { source, tier, entryCanonical, sentence, start, end, parts } of lines(join(directory, 'phrases/hits.ndjson'))) {
    const p = candidates.get(source.paperId)
    if (!p) continue
    p.tier ??= tier
    const key = find(p, source)
    const archived = archivedBlock(p, key)
    archived.phrases.push({ entryCanonical, sentence, start, end, parts, locator: source.locator })
  }
  for (const p of candidates.values()) {
    const words = Map.groupBy(p.rows.filter(row => entries.get(row.entryId)?.kind === 'word'), row => row.entryId)
    p.incomplete = [...words].some(([id, rows]) => (p.blocks.counts.wordCounts[id] ?? 0) < rows.length)
  }
}

function legacyLocator(groupId, { paragraph, question, option, optionBank }) {
  return JSON.stringify([groupId, paragraph, question, option, optionBank])
}

async function* lines(path, compressed = false) {
  const stream = createReadStream(path)
  const input = compressed ? stream.pipe(createGunzip()) : stream
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (line.trim()) yield JSON.parse(line)
  }
}

export function localPaper(dir, type) {
  const content = readFileSync(join(dir, 'paper-asset.json'), 'utf8')
  const asset = JSON.parse(content)
  const { paperId, title } = asset.paper
  const groups = asset.content.blocks.filter(b => b.type === 'group').map(({ groupId }) => {
    const group = asset.content.groups[groupId]
    return { ...group, groupId, questions: (group.questionIds ?? []).map(id =>
      ({ ...asset.content.questions[id], questionId: id })) }
  })
  return { paperId, title, type: type ?? (paperId.startsWith('paper-mock-') ? 'mock' : 'real'), groups,
    status: 'local', revisionId: createHash('sha256').update(content).digest('hex') }
}

export function agentReader() {
  const token = readFileSync(join(homedir(), '.config/eqbank/agent-token'), 'utf8').trim()
  assert(token, 'Agent 口令为空')
  return async path => {
    const response = await fetch(`https://eqbank.cc/api/agent/v1/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(path === 'export' ? 120_000 : 30_000),
    })
    if (!response.ok) throw new Error(`Agent 接口 ${response.status} ${path}`)
    return path === 'export' ? ndjson(await response.text()) : response.json()
  }
}
