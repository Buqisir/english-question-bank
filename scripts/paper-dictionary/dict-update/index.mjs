import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { agentReader, blocksOf, json, localPaper, ndjson, readLegacy, rowLocator,
  tierOf, validPaperId } from './source.mjs'
import { matcher, phraseWinners } from './match.mjs'
import { reanchorLegacy } from './legacyAnchors.mjs'
import { budget, editorialSense, legacyRecord, makeRecord, normalizedSentenceKey, position, recordRows, reusePicks, sentencesOf,
  UNMARKED, unresolved, verifiedLegacyHit } from './annotations.mjs'
import { codePointOffset, locatePhraseOccurrence, normalizePhraseText } from '../../../shared/paper-dictionary/phraseOccurrence.mjs'
import { splitSentences } from '../../../shared/paper-selection/segmentation.mjs'

const { positionals: [command], values: args } = parseArgs({ allowPositionals: true, options: {
  work: { type: 'string' }, data: { type: 'string' }, paper: { type: 'string', multiple: true },
  local: { type: 'string', multiple: true }, legacy: { type: 'string' }, scope: { type: 'string' },
  entry: { type: 'string' },
} })
assert(['prepare', 'apply', 'check'].includes(command) && args.work, '用法见 dict-update/README.md')
const data = args.data ?? fileURLToPath(new URL('../../../server/paper-dictionary/otter-data/', import.meta.url))
const dir = name => join(data, name)
const work = name => join(args.work, name)
const shard = id => join('occurrences', `${id}.ndjson`)
const state = id => join('update', `${id}.json`)
const exists = file => existsSync(dir(file))
const editorialFile = 'editorial-senses.json'
const editorial = exists(editorialFile) ? json(dir(editorialFile)) : {}
const digest = text => createHash('sha256').update(text).digest('hex')
const body = value => `${JSON.stringify(value, null, 2)}\n`
const lineBody = rows => rows.map(row => `${JSON.stringify(row)}\n`).join('')
const read = file => existsSync(file) ? readFileSync(file, 'utf8') : null
const save = (file, content) => {
  assert(typeof content === 'string' || content === null)
  if (content === null) {
    if (existsSync(file)) unlinkSync(file)
    return
  }
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, content, { mode: 0o600 })
  renameSync(temporary, file)
}
const readShard = id => ndjson(read(dir(shard(id))) ?? '')
const paperIds = () => readdirSync(dir('occurrences')).filter(f => f.endsWith('.ndjson')).map(f => f.slice(0, -7))
const names = new Map()
const entries = new Map()
for (const file of readdirSync(dir('entries')).filter(f => f.endsWith('.json'))) {
  const entry = json(dir(join('entries', file)))
  names.set(entry.entryId, join('entries', file))
  entries.set(entry.entryId, entry)
}
const counters = () => ({ gaokao: 0, mock: 0 })
const fingerprint = row => JSON.stringify([row.blockHash, row.sentence, row.start, row.end, row.entryId, row.parts])
const ref = b => JSON.stringify([b.groupId, b.id])
const aliases = b => [ref(b), ...(b.aliases ?? []).map(id => ref({ ...b, id }))]
const senseOf = row => entries.get(row.entryId)?.senses.find(sense => sense.senseId === row.senseId)
function exampleLocator(example) {
  const { paragraphId, questionId, optionBank, option } = example.source.locator
  return paragraphId ?? (optionBank ? `option-bank:${optionBank}` :
    option && !questionId?.includes('#option=') ? `${questionId}#option=${option}` : questionId)
}
const quoteKey = (paperId, senseId, locator, sentence, start, end) =>
  JSON.stringify([paperId, senseId, locator, sentence, start, end])
const scopeFile = args.scope ? resolve(args.scope) : fileURLToPath(new URL('./scope.json', import.meta.url))
const scopeAllows = ({ include, exclude }, id) => include.includes(id) || !exclude.includes(id)
const targetIdentity = paper => paper ? [paper.revisionId ?? null, paper.status, paper.type] : null
function rawChanged(previous, block, saved) {
  if (previous.rawHash) return previous.rawHash !== block.rawHash
  if (!saved) return false
  const sentences = splitSentences(block.raw)
  return JSON.stringify(saved.sentences) !== JSON.stringify(sentences.map(({ text }) => text.trim())) ||
    saved.rows.some(({ sentence, sentenceStart }) => {
      const source = sentences[sentence - 1]
      return source && sentenceStart != null && sentenceStart !== codePointOffset(block.raw,
        source.start + source.text.length - source.text.trimStart().length)
    })
}

async function targetsFor(local) {
  if (local) return { list: local.map(path => localPaper(path)), versioned: true }
  const get = agentReader()
  const { papers: list, view } = await get('papers?view=dictionary')
  const versioned = view === 'dictionary'
  let exported
  const exportPapers = () => exported ??= get('export').then(rows => new Map(rows.map(row => [row.paperId, row])))
    .catch(error => { console.warn(`无法读取生产快照 ${error.message}`); return new Map() })
  return { list, versioned, detail: async (paper, bootstrap = false) => {
    const snapshot = bootstrap && !versioned ? (await exportPapers()).get(paper.paperId) : undefined
    if (snapshot && JSON.stringify(targetIdentity(snapshot)) === JSON.stringify(targetIdentity(paper))) {
      return snapshot
    }
    const name = `papers/${paper.paperId}`
    return get(versioned ? `${name}?view=dictionary&revision=${encodeURIComponent(paper.revisionId)}` : name)
  } }
}

async function prepare() {
  assert(!existsSync(work('changes.json')), '这批已经进入 apply，新批次请使用新的 --work')
  const selected = new Set(args.paper ?? [])
  const rejudge = args.entry
  if (rejudge) assert(entries.has(rejudge), `未知词条 ${rejudge}`)
  for (const id of selected) assert(validPaperId(id), `卷 ID 无效 ${id}`)
  assert(!args.local || !selected.size, '--local 和 --paper 分开使用')
  const local = args.local?.map(path => resolve(path))
  const { list, versioned, detail } = await targetsFor(local)
  assert((versioned || list.length) && new Set(list.map(p => p.paperId)).size === list.length, '试卷清单无版本或有重复 ID')
  const available = new Map(list.map(p => [p.paperId, p]))
  const ids = args.local ? [...available.keys()] : selected.size ? [...selected] :
    [...new Set([...available.keys(), ...paperIds()])]
  const targets = ids.filter(id => available.has(id) ? tierOf(available.get(id)) : exists(shard(id)))
  const scope = json(scopeFile)
  const papers = new Map()
  const legacy = new Map()
  const skipped = {}
  let sameLegacy = 0
  for (const id of targets) {
    const summary = available.get(id)
    const bootstrap = exists(shard(id)) && !exists(state(id))
    if (rejudge && bootstrap) { skipped[id] = '请先执行首次归档'; continue }
    if (!summary || !scopeAllows(scope, id)) {
      if (bootstrap && !rejudge) {
        const rows = readShard(id)
        const blocks = Object.fromEntries(rows.map(row =>
          [rowLocator(row), { groupId: row.groupId, id: row.paragraphId ?? row.questionId, locator: {} }]))
        blocks.counts = { locator: {}, wordCounts: {} }
        legacy.set(id, { blocks, rows, unavailable: true })
      }
      continue
    }
    if (rejudge && !exists(shard(id))) continue
    if (!rejudge && exists(state(id)) && versioned && exists(shard(id)) &&
        JSON.stringify(json(dir(state(id))).target) === JSON.stringify(targetIdentity(summary))) continue
    let paper
    try { paper = detail ? await detail(summary, bootstrap) : summary }
    catch (error) { skipped[id] = error.message; continue }
    if (paper.paperId !== id || JSON.stringify(targetIdentity(paper)) !== JSON.stringify(targetIdentity(summary))) {
      skipped[id] = '列表与详情版本不一致'
      continue
    }
    papers.set(id, paper)
    if (bootstrap) {
      const blocks = blocksOf(paper)
      const rows = readShard(id)
      sameLegacy++
      legacy.set(id, { blocks, rows })
    }
  }
  if (legacy.size) await readLegacy(args.legacy ?? join(homedir(), 'Projects/otter-dict-work'), legacy, entries)
  const legacyQuotes = new Map()
  for (const entry of entries.values()) for (const sense of entry.senses) for (const example of sense.examples) {
    const { paperId, groupId, locator } = example.source
    const id = exampleLocator(example)
    if (!legacy.has(paperId) || !id || !example.target) continue
    const key = quoteKey(paperId, sense.senseId, JSON.stringify([groupId, id]),
      locator.sentence, example.target.start, example.target.end)
    legacyQuotes.set(key, example.text)
  }
  const match = matcher(entries)
  const packets = new Map()
  const stats = { added: 0, changed: 0, withdrawn: 0, hits: 0, automatic: 0, pending: counters() }
  let legacyDropped = 0
  let legacyRetained = 0
  let legacyReanchored = 0
  const legacyReasons = {}
  if (rejudge) stats.rejudge = rejudge
  stats.unmarked = 0
  const plan = []
  for (const id of targets) {
    assert(validPaperId(id), `卷 ID 无效 ${id}`)
    if (skipped[id]) continue
    const summary = available.get(id)
    const old = exists(state(id)) ? json(dir(state(id))) : legacy.get(id)
    const included = scopeAllows(scope, id)
    const paper = included ? papers.get(id) : null
    if (rejudge && !paper) continue
    if (included && summary && !paper) continue
    if (!paper && !exists(shard(id))) continue
    const bootstrap = legacy.has(id)
    if (exists(shard(id)) && (!old || (bootstrap && (!old.tier || old.incomplete)))) {
      skipped[id] = '旧语料缺来源或无法定位'
      continue
    }
    const current = paper ? blocksOf(paper) : {}
    const activeRows = readShard(id)
    const at = Map.groupBy(activeRows, rowLocator)
    const exampleQuotes = new Map(activeRows.flatMap(row => {
      if (!bootstrap || row.sentenceText) return []
      const quote = legacyQuotes.get(quoteKey(id, row.senseId, rowLocator(row), row.sentence, row.start, row.end))
      return quote ? [[row, quote]] : []
    }))
    const blocks = {}
    const changed = {}
    const archive = old?.archive ?? {}
    const records = old?.records ?? {}
    const oldBlocks = exists(shard(id)) ? old.blocks : {}
    const retainedLegacy = new Set()
    const reviewLegacy = new Set()
    const missedLegacy = new Map()
    const layoutChanged = rejudge && !bootstrap && (Object.keys(current).length !== Object.keys(oldBlocks).length ||
      Object.entries(current).some(([key, block]) => {
        const previous = oldBlocks[key]
        return previous?.hash !== block.hash || rawChanged(previous, block, records[key]?.[previous.hash]) ||
          ref(previous) !== ref(block)
      }))
    if (layoutChanged) {
      skipped[id] = '目标卷面已变，先执行常规更新'
      continue
    }
    for (const [key, block] of Object.entries(current)) {
      const previous = oldBlocks[key]
      const { raw, ...info } = block
      if (bootstrap) {
        const confirmed = aliases(block).flatMap(locator => at.get(locator) ?? [])
        const matches = match(id, block)
        const originalPositions = new Set(matches.map(position))
        const { rows, assigned, reasons, review } = reanchorLegacy(id, block, confirmed, matches, entries, exampleQuotes)
        for (const [saved, reason] of reasons) missedLegacy.set(saved, reason)
        for (const row of rows) {
          const verified = assigned.get(row) ?? []
          if (!verified.length || new Set(verified.map(saved => saved.senseId)).size !== 1) {
            if (review.has(row) || verified.length) reviewLegacy.add(row)
            for (const saved of verified) missedLegacy.set(saved, 'conflictingSense')
            stats.hits++
          } else {
            row.pick = verified[0].senseId
          }
        }
        const phrases = phraseWinners(rows.filter(row => entries.get(row.entryId).kind === 'phrase'),
          row => Number(row.pick !== undefined))
        const legacyMoves = {}
        for (const row of [...rows.filter(row => entries.get(row.entryId).kind !== 'phrase'), ...phrases]) {
          if (row.pick === undefined) continue
          const anchored = position(row)
          for (const saved of assigned.get(row) ?? []) {
            retainedLegacy.add(saved)
            if (position(saved) !== anchored || !originalPositions.has(anchored) || saved.surface !== row.surface) {
              legacyReanchored++
              const previousAnchors = legacyMoves[anchored] ??= []
              previousAnchors.push([rowLocator(saved), saved.sentence, saved.start, saved.end])
            }
          }
        }
        for (const row of rows) if (row.pick !== undefined && !phrases.includes(row) && entries.get(row.entryId).kind === 'phrase') {
          for (const saved of assigned.get(row) ?? []) missedLegacy.set(saved, 'phraseOverlap')
        }
        blocks[key] = { ...info, wordCounts: {}, talliedPhrases: true }
        changed[key] = { raw, rows, sentences: sentencesOf(raw), legacyMoves }
        continue
      }
      if (previous && !records[key]?.[previous.hash]) {
        const byHash = records[key] ??= {}
        const confirmed = aliases(previous).flatMap(locator => at.get(locator) ?? [])
        if (previous.hash === block.hash) {
          byHash[previous.hash] = legacyRecord(block, old.legacyHits?.[key], confirmed, match(id, block))
        } else {
          const rows = confirmed.filter(row => row.sentenceText).map(row => ({ ...row, pick: row.senseId }))
          const sentences = old.legacyHits?.[key]?.sentences
          if (sentences) byHash[previous.hash] = { sentences, rows }
        }
      }
      const sameHash = previous?.hash === block.hash
      const reanchor = sameHash && rawChanged(previous, block, records[key]?.[previous.hash])
      if (sameHash && !reanchor) {
        blocks[key] = { ...info, wordCounts: previous.wordCounts ?? {}, talliedPhrases: previous.talliedPhrases }
        if (rejudge) {
          const record = records[key]?.[block.hash]
          const pending = new Map((record ? recordRows(record) : [])
            .filter(row => row.entryId === rejudge && unresolved(row.pick) &&
              (entries.get(rejudge).kind !== 'phrase' || row.counted))
            .map(row => [position(row), row]))
          if (pending.size) {
            const rows = match(id, block).flatMap(row => {
              const old = pending.get(position(row))
              return old?.sentenceText === row.sentenceText ? [{ ...row, counted: old.counted }] : []
            })
            if (rows.length) changed[key] = { raw, rows }
          }
        }
        continue
      }
      const hits = match(id, block)
      const sentences = sentencesOf(raw)
      const saved = records[key]?.[block.hash] ?? records[key]?.[previous?.hash]
      const reused = reusePicks(saved, sentences, hits, reanchor)
      const rows = hits.map(row => {
        const prior = reused.get(position(row)) ?? (!previous ? archive[key]?.[fingerprint(row)] : undefined)
        const entry = entries.get(row.entryId)
        if (prior !== undefined) return { ...row, pick: prior }
        if (reanchor) return { ...row, pick: UNMARKED }
        stats.hits++
        if (entry.kind !== 'phrase' && entry.senses.length === 1) {
          stats.automatic++
          return { ...row, pick: entry.senses[0].senseId }
        }
        return row
      })
      const keepWordCounts = reanchor
      const wordCounts = keepWordCounts ? Object.fromEntries(Object.entries(previous.wordCounts ?? {})
        .filter(([entryId]) => entries.get(entryId).kind !== 'phrase')) : {}
      blocks[key] = { ...info, wordCounts, talliedPhrases: true }
      changed[key] = { raw, rows, sentences, keepWordCounts, reanchor }
    }
    const removed = Object.keys(oldBlocks).filter(key => !blocks[key])
    const moved = Object.keys(blocks).filter(key => oldBlocks[key] && (
      ref(blocks[key]) !== ref(oldBlocks[key]) || JSON.stringify(blocks[key].locator) !== JSON.stringify(oldBlocks[key].locator)))
    const existed = exists(shard(id))
    const before = Object.fromEntries(Object.entries(oldBlocks).map(([key, b]) =>
      [key, { locator: ref(b), aliases: aliases(b), wordCounts: b.wordCounts ?? {}, talliedPhrases: b.talliedPhrases,
        rows: aliases(b).flatMap(locator => at.get(locator) ?? []) }]))
    const represented = new Set(Object.values(before).flatMap(b => b.rows))
    if (bootstrap) {
      // A removed or renamed block still contributes to the old counts.
      before.counts.rows.push(...activeRows.filter(row => !represented.has(row)))
      if (paper) {
        legacyRetained += retainedLegacy.size
        legacyDropped += activeRows.length - retainedLegacy.size
        for (const row of activeRows) if (!retainedLegacy.has(row)) {
          const reason = missedLegacy.get(row) ?? (entries.has(row.entryId) ? 'missingBlock' : 'removedEntry')
          legacyReasons[reason] = (legacyReasons[reason] ?? 0) + 1
        }
      }
      for (const row of before.counts.rows) represented.add(row)
      // Deleted entries have no active counters, but their rows stay in legacyRows.
      for (const block of Object.values(before)) block.rows = block.rows.filter(row => entries.has(row.entryId))
    }
    if (represented.size !== activeRows.length) { skipped[id] = '旧分片存在无法定位的命中'; continue }
    const edits = Object.values(changed).flatMap(edit => edit.rows)
    const selectedRows = rejudge ? new Set(edits) :
      new Set([...reviewLegacy, ...budget(edits.filter(row => !reviewLegacy.has(row)), tierOf(paper ?? {}), entries)])
    for (const row of edits) {
      if (selectedRows.has(row)) {
        const packetKey = `${tierOf(paper)}/${names.get(row.entryId).split('/').at(-1)}`
        if (!packets.has(packetKey)) {
          const { entryId, headword, senses } = entries.get(row.entryId)
          packets.set(packetKey, { entryId, headword, senses: senses.map(({ senseId, pos, glossZh, note }) =>
            ({ senseId, pos, glossZh, note })), sentences: [] })
        }
        const { sentences } = packets.get(packetKey)
        const chars = [...row.sentenceText]
        const marked = `${chars.slice(0, row.start).join('')}【${row.surface}】${chars.slice(row.end).join('')}`
        const idx = sentences.length
        sentences.push({ idx, text: marked })
        stats.pending[tierOf(paper)]++
        Object.assign(row, { packetKey, idx })
      } else if (row.pick === undefined) row.pick = UNMARKED
      if (row.pick === UNMARKED) stats.unmarked++
    }
    const metadataOnly = Boolean(paper && existed && !removed.length && !Object.keys(changed).length &&
      !moved.length && old.tier === tierOf(paper))
    if (!paper) stats.withdrawn++
    else if (!existed) stats.added++
    else if (!metadataOnly) stats.changed++
    else if (!bootstrap && JSON.stringify(old.target) === JSON.stringify(targetIdentity(summary))) continue
    plan.push({ id, title: paper?.title, target: targetIdentity(summary), included, metadataOnly, rejudge, records,
      legacyHits: old?.legacyHits, legacyRows: old?.legacyRows ?? (bootstrap ? activeRows : undefined),
      tier: paper && tierOf(paper),
      oldTier: old?.tier, before, blocks, changed, archive,
      base: [read(dir(shard(id))), read(dir(state(id)))].map(text => text === null ? null : digest(text)) })
  }
  mkdirSync(args.work, { recursive: true })
  const snapshot = JSON.stringify({ plan, packets: [...packets.keys()], local, scopeFile, versioned }) + '\n'
  const previousPlan = read(work('plan.json'))
  assert(previousPlan === null || previousPlan === snapshot ||
    JSON.stringify(JSON.parse(previousPlan)) + '\n' === snapshot, '卷面或词典基线已变化，请使用新的 --work')
  for (const [key, packet] of packets) {
    const file = work(`packets/${key}`)
    mkdirSync(join(file, '..'), { recursive: true })
    const existing = read(file)
    assert(existing === null || existing === body(packet), `旧题包已变化，请使用新的 --work ${key}`)
    save(file, body(packet))
  }
  save(work('plan.json'), snapshot)
  console.log(JSON.stringify({ ...stats, sameLegacy,
    ...(legacy.size ? { legacyRetained, legacyReanchored, legacyDropped, legacyReasons } : {}), skipped }))
}

function validate(rows, raw) {
  for (const row of rows) assert(senseOf(row), `无效义项引用 ${row.entryId} ${row.senseId}`)
  const phrases = rows.filter(row => entries.get(row.entryId).kind === 'phrase')
  assert(phrases.every(row => locatePhraseOccurrence(normalizePhraseText(raw), row, row.sentenceText,
    entries.get(row.entryId))), '短语定位校验失败')
  assert.equal(phraseWinners(phrases).length, phrases.length, '短语命中重叠')
}

async function apply() {
  const { plan, packets, local, scopeFile, versioned } = json(work('plan.json'))
  assert(versioned, '生产目标版本接口尚未部署，这批只可 dry-run')
  const { list, versioned: verified, detail } = await targetsFor(local)
  assert(verified, '无法复核目标版本')
  const available = new Map(list.map(paper => [paper.paperId, paper]))
  const scope = json(scopeFile)
  const accepted = plan.filter(({ id, target, included }) =>
    JSON.stringify(targetIdentity(available.get(id))) === JSON.stringify(target) && scopeAllows(scope, id) === included)
  const deferred = plan.filter(p => !accepted.includes(p)).map(p => p.id)
  const needed = new Set(accepted.flatMap(p => Object.values(p.changed).flatMap(edit =>
    edit.rows.map(row => row.packetKey).filter(Boolean))))
  const picks = new Map()
  for (const key of packets.filter(key => needed.has(key))) {
    const packet = json(work(`packets/${key}`))
    const answers = new Map()
    for (const answer of ndjson(read(work(`out/${key.replace(/\.json$/u, '.ndjson')}`)) ?? '')) {
      const { idx, pick, newSense } = answer
      assert(Number.isInteger(idx) && packet.sentences[idx]?.idx === idx && !answers.has(idx) &&
        (['NONE', 'UNSURE'].includes(pick) ||
        entries.get(packet.entryId).senses.some(sense => sense.senseId === pick)), `无效答卷 ${key} ${idx}`)
      assert(newSense === undefined || (pick === 'NONE' && newSense && typeof newSense === 'object' &&
        !Array.isArray(newSense)), `新义需要从 NONE 回填 ${key} ${idx}`)
      answers.set(idx, answer)
    }
    picks.set(key, answers)
  }
  const staged = work('changes.json')
  if (existsSync(staged)) {
    assert(!deferred.length || json(staged).every(([file, , after]) => read(dir(file)) === after),
      `已暂存批次的目标版本变化，保留现场 ${deferred.join(', ')}`)
  } else {
    const changes = await buildChanges(accepted, picks,
      list.filter(paper => tierOf(paper) && scopeAllows(scope, paper.paperId)), detail)
    save(work('applied-papers.json'), body(accepted.map(p => p.id)))
    save(staged, body(changes))
  }
  const changes = json(staged)
  for (const [file, before, after] of changes) {
    const text = read(dir(file))
    assert(text === after || (text === null ? null : digest(text)) === before, `基线已变化 ${file}`)
  }
  for (const [file, , after] of changes) {
    if (read(dir(file)) === after) continue
    mkdirSync(join(dir(file), '..'), { recursive: true })
    save(dir(file), after)
  }
  console.log(JSON.stringify({ files: changes.length, deferred }))
}

async function buildChanges(plan, picks, available, detail) {
  const changes = []
  const queue = []
  const touched = new Map()
  const current = new Map()
  const updated = new Map()
  const editorialBefore = JSON.stringify(editorial)
  const entryBefore = new Map()
  const change = (file, after, base = read(dir(file))) => {
    if (base !== after) changes.push([file, base === null ? null : digest(base), after])
  }
  for (const p of plan) {
    assert.deepEqual([shard(p.id), state(p.id)].map(file => {
      const text = read(dir(file))
      return text === null ? null : digest(text)
    }), p.base, `准备后分片已变化 ${p.id}`)
    const saveState = () => change(state(p.id), body({ target: p.target, tier: p.tier, blocks: p.blocks,
      archive: p.archive, records: p.records, legacyHits: p.legacyHits, legacyRows: p.legacyRows }))
    if (p.metadataOnly) { saveState(); continue }
    for (const b of Object.values(p.before)) count(b, p.oldTier, -1)
    const rows = []
    for (const [key, block] of Object.entries(p.blocks)) {
      const edit = p.changed[key]
      const previous = p.before[key]
      let exampleRows
      const blockRows = edit && !p.rejudge ? [] : previous.rows.map(row => ref(block) === previous.locator ? row :
        ({ ...row, [block.kind === 'paragraph' ? 'paragraphId' : 'questionId']: block.id }))
      if (edit) {
        const byHash = p.records[key] ??= {}
        const record = byHash[block.hash] ??= { rows: [], sentences: edit.sentences }
        const replacements = new Map()
        for (const { packetKey, idx, pick: prior, counted, ...row } of edit.rows) {
          const answer = picks.get(packetKey)?.get(idx)
          if (p.rejudge && !answer) continue
          let pick = prior ?? answer?.pick ?? UNMARKED
          if (answer?.newSense) pick = addEditorialSense(row, answer.newSense)
          if (pick === 'NONE') queue.push({ ...row, tier: p.tier })
          replacements.set(position(row), { ...row, pick, counted })
        }
        const updates = [...replacements.values()]
        if (p.rejudge) {
          byHash[block.hash] = makeRecord(record.sentences, record.rows.map(row => {
            const next = replacements.get(position(row))
            if (!next) return row
            const history = [...row.history ?? [], row.pick]
            return { ...next, history }
          }))
        } else {
          const words = updates.filter(row => entries.get(row.entryId).kind !== 'phrase')
          const phrases = phraseWinners(updates.filter(row => entries.get(row.entryId).kind === 'phrase'),
            row => Number(!unresolved(row.pick)))
          for (const row of [...words, ...phrases]) {
            row.counted = true
            if (!edit.keepWordCounts || entries.get(row.entryId).kind === 'phrase') {
              block.wordCounts[row.entryId] = (block.wordCounts[row.entryId] ?? 0) + 1
            }
          }
          const previousRows = new Map(record.rows.map(row => [position(row), row]))
          byHash[block.hash] = makeRecord(edit.sentences, updates.map(row => {
            const old = previousRows.get(position(row))
            const history = old && old.pick !== row.pick ? [...old.history ?? [], old.pick] : old?.history
            return { ...row, history }
          }))
        }
        exampleRows = updates.filter(row => (row.counted || p.rejudge) && !unresolved(row.pick))
          .map(({ pick, counted, ...row }) => ({ ...row, senseId: pick }))
        blockRows.push(...exampleRows)
        validate(p.rejudge ? exampleRows : blockRows, edit.raw)
      }
      count({ ...block, rows: blockRows }, p.tier, 1)
      rows.push(...blockRows)
      for (const row of (p.rejudge ? exampleRows ?? [] : blockRows).filter(row => row.sentenceText)) {
        const examples = current.get(row.senseId) ?? []
        examples.push({ row, paper: p, block, key })
        current.set(row.senseId, examples)
      }
    }
    updated.set(p.id, p)
    change(shard(p.id), p.tier ? lineBody(rows) : null)
    saveState()
  }
  await addReplacementExamples(available, detail, updated, current)
  for (const entry of entries.values()) {
    const before = entryBefore.get(entry.entryId) ?? JSON.stringify(entry)
    for (const sense of entry.senses) {
      sense.examples = sense.examples.filter(example => {
        const p = updated.get(example.source.paperId)
        if (!p || p.rejudge) return true
        const id = exampleLocator(example)
        if (!id) return Boolean(p.tier)
        const source = JSON.stringify([example.source.groupId, id])
        const retained = Object.entries(p.blocks).find(([key]) => !p.changed[key] && p.before[key].aliases.includes(source))
        if (retained) {
          const [key, b] = retained
          const moved = ref(b) !== p.before[key].locator
          example.source.locator = { ...example.source.locator, ...b.locator,
            ...(moved ? { [b.kind === 'paragraph' ? 'paragraphId' : 'questionId']: b.id } : {}) }
          return true
        }
        const same = (current.get(sense.senseId) ?? []).filter(({ paper, row, key }) => {
          if (paper !== p || !p.before[key]?.aliases.includes(source)) return false
          const moved = p.changed[key]?.legacyMoves?.[position(row)]
          if (moved?.some(([locator, sentence, start, end]) => locator === source &&
            sentence === example.source.locator.sentence && start === example.target?.start && end === example.target?.end)) return true
          if (p.changed[key]?.reanchor && example.target) {
            const anchor = normalizedSentenceKey({ sentenceText: example.text, entryId: row.entryId,
              ...example.target, parts: example.parts ?? example.highlightRanges })
            return anchor && anchor === normalizedSentenceKey(row)
          }
          return row.sentenceText === example.text &&
            (!example.target || (example.target.start === row.start && example.target.end === row.end))
        })
        if (same.length !== 1) return false
        const refreshed = toExample(same[0])
        Object.assign(example, refreshed, { exampleId: example.exampleId })
        return true
      })
      for (const item of (current.get(sense.senseId) ?? []).sort((a, b) => a.paper.tier.localeCompare(b.paper.tier))) {
        if (sense.examples.length >= 3) break
        if (!sense.examples.some(example => example.text === item.row.sentenceText)) sense.examples.push(toExample(item))
      }
    }
    if (touched.has(entry.entryId)) updateCounts(entry, touched.get(entry.entryId))
    if (before !== JSON.stringify(entry)) {
      entry.version++
      entry.updatedAt = new Date().toISOString().slice(0, 10)
      change(names.get(entry.entryId), body(entry))
    }
  }
  if (editorialBefore !== JSON.stringify(editorial)) change(editorialFile, body(editorial))
  save(work('new-senses.ndjson'), lineBody(queue))
  return changes

  function addEditorialSense(row, draft) {
    const entry = entries.get(row.entryId)
    const id = editorialSense(draft, entry, editorial, spec =>
      `${row.entryId}#s-new-${digest(JSON.stringify(spec)).slice(0, 16)}`)
    if (!entry.senses.some(sense => sense.senseId === id)) {
      if (!entryBefore.has(row.entryId)) entryBefore.set(row.entryId, JSON.stringify(entry))
      const { entryId, ...sense } = editorial[id]
      entry.senses.push({ ...sense, counts: counters(), origin: 'dictionary', folded: true, examples: [] })
    }
    return id
  }

  function count({ wordCounts, rows, talliedPhrases }, tier, sign) {
    const adjust = (id, key, n) => {
      if (!touched.has(id)) touched.set(id, new Map())
      const byKey = touched.get(id)
      if (!byKey.has(key)) byKey.set(key, counters())
      byKey.get(key)[tier] += sign * n
    }
    for (const [id, n] of Object.entries(wordCounts)) adjust(id, null, n)
    for (const row of rows) {
      assert(senseOf(row), `无效义项引用 ${row.senseId}`)
      adjust(row.entryId, row.senseId, 1)
      if (!talliedPhrases && entries.get(row.entryId).kind === 'phrase') adjust(row.entryId, null, 1)
    }
  }
}

async function addReplacementExamples(available, detail, updated, current) {
  const withdrawn = new Set([...updated.values()].filter(paper => !paper.tier).map(paper => paper.id))
  if (!withdrawn.size) return
  const wanted = new Map()
  for (const entry of entries.values()) for (const sense of entry.senses) {
    if (sense.examples.some(example => withdrawn.has(example.source.paperId))) {
      wanted.set(sense.senseId, new Set(sense.examples.filter(example => !updated.has(example.source.paperId))
        .map(example => example.text)))
    }
  }
  if (!wanted.size) return
  const match = matcher(entries)
  for (const summary of [...available].sort((a, b) => tierOf(a).localeCompare(tierOf(b)))) {
    const id = summary.paperId
    if (updated.has(id) || !exists(shard(id))) continue
    if (exists(state(id)) &&
        JSON.stringify(json(dir(state(id))).target) !== JSON.stringify(targetIdentity(summary))) continue
    const rows = readShard(id).filter(row => wanted.has(row.senseId) && wanted.get(row.senseId).size < 3)
    if (!rows.length) continue
    let paper
    try { paper = detail ? await detail(summary) : summary }
    catch (error) {
      console.warn(`补位跳过 ${id} ${error.message}`)
      continue
    }
    if (paper.paperId !== id || JSON.stringify(targetIdentity(paper)) !== JSON.stringify(targetIdentity(summary))) continue
    const locations = new Map(Object.values(blocksOf(paper)).flatMap(block =>
      aliases(block).map(locator => [locator, block])))
    for (const [locator, savedRows] of Map.groupBy(rows, rowLocator)) {
      const block = locations.get(locator)
      if (!block) continue
      const candidates = new Map(match(id, block).map(row => [position(row), row]))
      for (const saved of savedRows) {
        const row = candidates.get(position(saved))
        const seen = wanted.get(saved.senseId)
        if (!row || !verifiedLegacyHit(saved, row) || seen.size >= 3 || seen.has(row.sentenceText)) continue
        seen.add(row.sentenceText)
        const examples = current.get(saved.senseId) ?? []
        examples.push({ row, paper: { id, title: paper.title, tier: tierOf(paper) }, block })
        current.set(saved.senseId, examples)
      }
    }
    if ([...wanted.values()].every(seen => seen.size >= 3)) break
  }
}

function updateCounts(entry, deltas) {
  if (![...deltas.values()].some(count => count.gaokao || count.mock)) return
  const adjust = (item, key) => {
    for (const [tier, n] of Object.entries(deltas.get(key) ?? {})) item.counts[tier] += n
    item.origin = item.counts.gaokao ? 'gaokao' : item.counts.mock ? 'mock' : 'dictionary'
    item.folded = item.origin === 'dictionary'
  }
  adjust(entry, null)
  for (const sense of entry.senses) adjust(sense, sense.senseId)
  for (const tier of Object.keys(counters())) {
    const remainder = entry.counts[tier] - entry.senses.reduce((n, s) => n + s.counts[tier], 0)
    assert(remainder >= 0 && entry.senses.every(s => s.counts[tier] >= 0), `旧语料计数对不上 ${entry.entryId} ${tier}`)
    entry.unassignedCounts[tier] = remainder
  }
}

function toExample({ row, paper, block }) {
  const { paragraphId, questionId, sentence, sentenceText, start, end, parts } = row
  return { exampleId: `${row.entryId}#e-${digest(JSON.stringify([paper.id, row.groupId, paragraphId ?? questionId,
    row.blockHash, sentence, start, end])).slice(0, 16)}`, text: sentenceText, tier: paper.tier,
  source: { paperId: paper.id, paperTitle: paper.title, groupId: row.groupId,
    locator: { ...block.locator, ...(paragraphId ? { paragraphId } : { questionId }), sentence } },
  target: { start, end }, ...(parts ? { parts, highlightRanges: parts } : {}) }
}

if (command === 'prepare') await prepare()
if (command === 'apply') await apply()
if (command === 'check') {
  for (const [file, , after] of json(work('changes.json'))) {
    assert.equal(read(dir(file)), after, `批次尚未完整应用 ${file}`)
  }
  const { plan } = json(work('plan.json'))
  for (const id of paperIds()) for (const row of readShard(id)) {
    assert(row.paperId === id && senseOf(row), `无效分片引用 ${id} ${row.senseId}`)
  }
  const applied = new Set(json(work('applied-papers.json')))
  for (const { id, changed, rejudge } of plan.filter(p => applied.has(p.id))) {
    const byLocator = Map.groupBy(readShard(id), rowLocator)
    for (const { raw, rows } of Object.values(changed)) if (rows.length) {
      const indexed = byLocator.get(rowLocator(rows[0])) ?? []
      const targets = new Set(rows.map(position))
      validate(rejudge ? indexed.filter(row => row.entryId === rejudge && targets.has(position(row))) : indexed, raw)
    }
  }
  console.log('分片引用、变动块短语定位与重叠检查通过')
}
