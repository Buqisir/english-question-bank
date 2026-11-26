import assert from 'node:assert/strict'
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
      blocks[key] = { kind, raw, hash, locator, groupId, id }
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
          o.optionId ?? `${id}:${hash}:${ordinal}`)
      }
    }
    const shared = new Set()
    for (const o of group.optionBank ?? []) {
      const text = o.text ?? o.content
      if (typeof text !== 'string' || !text.trim()) continue
      const stable = o.optionId ?? hashPhraseBlock(text)
      if (shared.has(stable)) continue
      shared.add(stable)
      add('bank', `option-bank:${o.label}`, { optionBank: o.label }, text, stable)
    }
  }
  return blocks
}

export async function readLegacy(archive, ids, entries) {
  assert(archive, '处理旧分片需要 --legacy-corpus 和 --legacy-hits')
  const result = new Map()
  for await (const p of lines(archive.corpus)) {
    if (ids.has(p.paperId)) result.set(p.paperId, { tier: tierOf(p), blocks: blocksOf(p) })
  }
  const wordIds = new Map([...entries.values()].filter(e => e.kind !== 'phrase')
    .map(e => [e.headword, e.entryId]))
  for (const p of result.values()) {
    p.byLocator = new Map(Object.values(p.blocks).map(b => [legacyLocator(b.groupId, b.locator), b]))
  }
  for await (const { source, tier, hits } of lines(archive.hits, true)) {
    const p = result.get(source.paperId)
    if (!p) continue
    p.tier = tier
    const block = p.byLocator.get(legacyLocator(source.groupId, source.locator))
    assert(block, `旧词频找不到原文块 ${source.paperId} ${legacyLocator(source.groupId, source.locator)}`)
    const counts = block.wordCounts ??= {}
    for (const [headword, spans] of Object.entries(hits)) {
      const id = wordIds.get(headword)
      if (id) counts[id] = (counts[id] ?? 0) + spans.length
    }
  }
  for (const id of ids) assert(result.has(id) && result.get(id).tier, `旧分片缺少原始语料 ${id}`)
  return result
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
  const asset = json(join(dir, 'paper-asset.json'))
  const { paperId, title } = asset.paper
  const groups = asset.content.blocks.filter(b => b.type === 'group').map(({ groupId }) => {
    const group = asset.content.groups[groupId]
    return { ...group, groupId, questions: (group.questionIds ?? []).map(id =>
      ({ ...asset.content.questions[id], questionId: id })) }
  })
  return { paperId, title, type: type ?? (paperId.startsWith('paper-mock-') ? 'mock' : 'real'), groups }
}

export function agentReader() {
  const token = readFileSync(join(homedir(), '.config/eqbank/agent-token'), 'utf8').trim()
  assert(token, 'Agent 口令为空')
  return async path => {
    const response = await fetch(`https://eqbank.cc/api/agent/v1/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Agent 接口 ${response.status} ${path}`)
    return response.json()
  }
}
