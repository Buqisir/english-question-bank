import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { agentReader, blocksOf, json, legacyHashMatches, localPaper, ndjson, readLegacy, rowLocator,
  tierOf, validPaperId } from './source.mjs'
import { matcher, phraseWinners } from './match.mjs'
import { locatePhraseOccurrence, normalizePhraseText } from '../../../shared/paper-dictionary/phraseOccurrence.mjs'

const { positionals: [command], values: args } = parseArgs({ allowPositionals: true, options: {
  work: { type: 'string' }, data: { type: 'string' }, paper: { type: 'string', multiple: true },
  local: { type: 'string', multiple: true }, legacy: { type: 'string' }, scope: { type: 'string' },
} })
assert(['prepare', 'apply', 'check'].includes(command) && args.work, '用法见 dict-update/README.md')
const data = args.data ?? fileURLToPath(new URL('../../../server/paper-dictionary/otter-data/', import.meta.url))
const dir = name => join(data, name)
const work = name => join(args.work, name)
const shard = id => join('occurrences', `${id}.ndjson`)
const state = id => join('update', `${id}.json`)
const exists = file => existsSync(dir(file))
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
const scopeFile = args.scope ? resolve(args.scope) : fileURLToPath(new URL('./scope.json', import.meta.url))
const scopeAllows = ({ include, exclude }, id) => include.includes(id) || !exclude.includes(id)
const targetIdentity = paper => paper ? [paper.revisionId ?? null, paper.status, paper.type] : null

async function targetsFor(local) {
  if (local) return { list: local.map(path => localPaper(path)), versioned: true }
  const get = agentReader()
  const { papers: list, view } = await get('papers?view=dictionary')
  const versioned = view === 'dictionary'
  return { list, versioned, detail: async paper => {
    const name = `papers/${paper.paperId}`
    return get(versioned ? `${name}?view=dictionary&revision=${encodeURIComponent(paper.revisionId)}` : name)
  } }
}

async function prepare() {
  assert(!existsSync(work('changes.json')), '这批已经进入 apply，新批次请使用新的 --work')
  const selected = new Set(args.paper ?? [])
  for (const id of selected) assert(validPaperId(id), `卷 ID 无效 ${id}`)
  assert(!args.local || !selected.size, '--local 和 --paper 分开使用')
  const local = args.local?.map(path => resolve(path))
  const { list, versioned, detail } = await targetsFor(local)
  assert(list.length && new Set(list.map(p => p.paperId)).size === list.length, '试卷清单为空或有重复 ID')
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
    if (!summary || (!scopeAllows(scope, id) && !bootstrap)) continue
    if (exists(state(id)) && versioned && exists(shard(id)) &&
        JSON.stringify(json(dir(state(id))).target) === JSON.stringify(targetIdentity(summary))) continue
    let paper
    try { paper = detail ? await detail(summary) : summary }
    catch (error) { skipped[id] = error.message; continue }
    if (paper.paperId !== id || JSON.stringify(targetIdentity(paper)) !== JSON.stringify(targetIdentity(summary))) {
      skipped[id] = '列表与详情版本不一致'
      continue
    }
    papers.set(id, paper)
    if (bootstrap) {
      const blocks = blocksOf(paper)
      const rows = readShard(id)
      if (!legacyHashMatches(rows, blocks)) { skipped[id] = '旧分片块哈希与目标卷不符'; continue }
      sameLegacy++
      legacy.set(id, { blocks, rows })
    }
  }
  if (legacy.size) await readLegacy(args.legacy ?? join(homedir(), 'Projects/otter-dict-work'), legacy, entries)
  const match = matcher(entries)
  const packets = new Map()
  const stats = { added: 0, changed: 0, withdrawn: 0, hits: 0, automatic: 0, pending: counters() }
  const plan = []
  for (const id of targets) {
    assert(validPaperId(id), `卷 ID 无效 ${id}`)
    if (skipped[id]) continue
    const summary = available.get(id)
    const old = exists(state(id)) ? json(dir(state(id))) : legacy.get(id)
    const included = scopeAllows(scope, id)
    const paper = included ? papers.get(id) : null
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
    const blocks = {}
    const changed = {}
    const archive = old?.archive ?? {}
    const oldBlocks = exists(shard(id)) ? old.blocks : {}
    if (bootstrap) for (const [key, block] of Object.entries(oldBlocks)) {
      for (const row of aliases(block).flatMap(locator => at.get(locator) ?? [])) {
        if (row.blockHash && row.sentenceText) (archive[key] ??= {})[fingerprint(row)] = row.senseId
      }
    }
    for (const [key, block] of Object.entries(current)) {
      const previous = oldBlocks[key]
      const { raw, ...info } = block
      if (previous?.hash === block.hash) {
        blocks[key] = { ...info, wordCounts: previous.wordCounts ?? {} }
        continue
      }
      const rows = match(id, block).map(row => {
        const prior = archive[key]?.[fingerprint(row)]
        const entry = entries.get(row.entryId)
        if (prior !== undefined) return { ...row, pick: prior }
        stats.hits++
        if (entry.kind !== 'phrase' && entry.senses.length === 1) {
          stats.automatic++
          return { ...row, pick: entry.senses[0].senseId }
        }
        const packetKey = `${tierOf(paper)}/${names.get(row.entryId).split('/').at(-1)}`
        if (!packets.has(packetKey)) {
          const { entryId, headword, senses } = entry
          packets.set(packetKey, { entryId, headword, senses: senses.map(({ senseId, pos, glossZh, note }) =>
            ({ senseId, pos, glossZh, note })), sentences: [] })
        }
        const { sentences } = packets.get(packetKey)
        const chars = [...row.sentenceText]
        const marked = `${chars.slice(0, row.start).join('')}【${row.surface}】${chars.slice(row.end).join('')}`
        const idx = sentences.length
        sentences.push({ idx, text: marked })
        stats.pending[tierOf(paper)]++
        return { ...row, packetKey, idx }
      })
      blocks[key] = { ...info, wordCounts: {} }
      changed[key] = { raw, rows }
    }
    const removed = Object.keys(oldBlocks).filter(key => !blocks[key])
    const moved = Object.keys(blocks).filter(key => oldBlocks[key] && (
      ref(blocks[key]) !== ref(oldBlocks[key]) || JSON.stringify(blocks[key].locator) !== JSON.stringify(oldBlocks[key].locator)))
    const existed = exists(shard(id))
    const before = Object.fromEntries(Object.entries(oldBlocks).map(([key, b]) =>
      [key, { locator: ref(b), aliases: aliases(b), wordCounts: b.wordCounts ?? {},
        rows: aliases(b).flatMap(locator => at.get(locator) ?? []) }]))
    const represented = new Set(Object.values(before).flatMap(b => b.rows))
    if (represented.size !== activeRows.length) { skipped[id] = '旧分片存在无法定位的命中'; continue }
    const metadataOnly = Boolean(paper && existed && !removed.length && !Object.keys(changed).length &&
      !moved.length && old.tier === tierOf(paper))
    if (!paper) stats.withdrawn++
    else if (!existed) stats.added++
    else if (!metadataOnly) stats.changed++
    else if (!bootstrap && JSON.stringify(old.target) === JSON.stringify(targetIdentity(summary))) continue
    plan.push({ id, title: paper?.title, target: targetIdentity(summary), included, metadataOnly,
      legacyHits: old?.legacyHits, legacyRows: old?.legacyRows ?? (bootstrap ? activeRows : undefined),
      tier: paper && tierOf(paper),
      oldTier: old?.tier, before, blocks, changed, archive,
      base: [read(dir(shard(id))), read(dir(state(id)))].map(text => text === null ? null : digest(text)) })
  }
  mkdirSync(args.work, { recursive: true })
  const snapshot = body({ plan, packets: [...packets.keys()], local, scopeFile, versioned })
  assert([null, snapshot].includes(read(work('plan.json'))), '卷面或词典基线已变化，请使用新的 --work')
  for (const [key, packet] of packets) {
    const file = work(`packets/${key}`)
    mkdirSync(join(file, '..'), { recursive: true })
    const existing = read(file)
    assert(existing === null || existing === body(packet), `旧题包已变化，请使用新的 --work ${key}`)
    save(file, body(packet))
  }
  save(work('plan.json'), snapshot)
  console.log(JSON.stringify({ ...stats, sameLegacy, skipped }))
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
  const { list, versioned: verified } = await targetsFor(local)
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
    const answers = ndjson(readFileSync(work(`out/${key.replace(/\.json$/u, '.ndjson')}`), 'utf8'))
    assert.equal(answers.length, packet.sentences.length, `答卷题数不符 ${key}`)
    answers.forEach(({ idx, pick }, i) => {
      assert(idx === i && (['NONE', 'UNSURE'].includes(pick) ||
        entries.get(packet.entryId).senses.some(sense => sense.senseId === pick)), `无效答卷 ${key} ${idx}`)
    })
    picks.set(key, answers)
  }
  const staged = work('changes.json')
  if (existsSync(staged)) {
    assert(!deferred.length || json(staged).every(([file, , after]) => read(dir(file)) === after),
      `已暂存批次的目标版本变化，保留现场 ${deferred.join(', ')}`)
  } else {
    const changes = buildChanges(accepted, picks)
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

function buildChanges(plan, picks) {
  const changes = []
  const queue = []
  const touched = new Map()
  const current = new Map()
  const updated = new Map()
  const change = (file, after, base = read(dir(file))) => {
    if (base !== after) changes.push([file, base === null ? null : digest(base), after])
  }
  for (const p of plan) {
    assert.deepEqual([shard(p.id), state(p.id)].map(file => {
      const text = read(dir(file))
      return text === null ? null : digest(text)
    }), p.base, `准备后分片已变化 ${p.id}`)
    const saveState = () => change(state(p.id), body({ target: p.target, tier: p.tier, blocks: p.blocks,
      archive: p.archive, legacyHits: p.legacyHits, legacyRows: p.legacyRows }))
    if (p.metadataOnly) { saveState(); continue }
    for (const b of Object.values(p.before)) count(b, p.oldTier, -1)
    const rows = []
    for (const [key, block] of Object.entries(p.blocks)) {
      const edit = p.changed[key]
      const previous = p.before[key]
      const blockRows = edit ? [] : previous.rows.map(row => ref(block) === previous.locator ? row :
        ({ ...row, [block.kind === 'paragraph' ? 'paragraphId' : 'questionId']: block.id }))
      if (edit) {
        const annotations = p.archive[key] ??= {}
        for (const { packetKey, idx, pick = picks.get(packetKey)?.[idx]?.pick, ...row } of edit.rows) {
          annotations[fingerprint(row)] = pick
          const phrase = entries.get(row.entryId).kind === 'phrase'
          if (!phrase) block.wordCounts[row.entryId] = (block.wordCounts[row.entryId] ?? 0) + 1
          if (pick === 'NONE') queue.push({ ...row, tier: p.tier })
          if (!['NONE', 'UNSURE'].includes(pick)) blockRows.push({ ...row, senseId: pick })
        }
        const winners = phraseWinners(blockRows.filter(row => entries.get(row.entryId).kind === 'phrase'))
        blockRows.splice(0, blockRows.length, ...blockRows.filter(row => entries.get(row.entryId).kind !== 'phrase'), ...winners)
        validate(blockRows, edit.raw)
      }
      count({ ...block, rows: blockRows }, p.tier, 1)
      rows.push(...blockRows)
      for (const row of blockRows.filter(row => row.sentenceText)) {
        const examples = current.get(row.senseId) ?? []
        examples.push({ row, paper: p, block })
        current.set(row.senseId, examples)
      }
    }
    updated.set(p.id, p)
    change(shard(p.id), p.tier ? lineBody(rows) : null)
    saveState()
  }
  for (const entry of entries.values()) {
    const before = JSON.stringify(entry)
    for (const sense of entry.senses) {
      sense.examples = sense.examples.filter(example => {
        const p = updated.get(example.source.paperId)
        if (!p) return true
        const { paragraphId, questionId, optionBank, option } = example.source.locator
        const id = paragraphId ?? (optionBank ? `option-bank:${optionBank}` :
          option && !questionId?.includes('#option=') ? `${questionId}#option=${option}` : questionId)
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
        const same = (current.get(sense.senseId) ?? []).filter(item => item.paper === p &&
          normalizePhraseText(item.row.sentenceText).text === normalizePhraseText(example.text).text &&
          (ref(item.block) === source || item.block.kind === 'option' || item.block.kind === 'bank'))
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
  save(work('new-senses.ndjson'), lineBody(queue))
  return changes

  function count({ wordCounts, rows }, tier, sign) {
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
      if (entries.get(row.entryId).kind === 'phrase') adjust(row.entryId, null, 1)
    }
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
  for (const { id, changed } of plan.filter(p => applied.has(p.id))) {
    const byLocator = Map.groupBy(readShard(id), rowLocator)
    for (const { raw, rows } of Object.values(changed)) if (rows.length) {
      validate(byLocator.get(rowLocator(rows[0])) ?? [], raw)
    }
  }
  console.log('分片引用、变动块短语定位与重叠检查通过')
}
