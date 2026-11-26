import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const dir = mkdtempSync(join(tmpdir(), 'dict-update-test-'))
const tool = fileURLToPath(new URL('./index.mjs', import.meta.url))
const run = (command, work, ...args) => execFileSync(process.execPath,
  [tool, command, '--data', dir, '--work', join(dir, work), ...args], { encoding: 'utf8' })
const counts = { gaokao: 0, mock: 0 }
const entry = 'entries/w-pick-up.json'
const paperId = 'paper-mock-test'
const write = (name, value) => writeFileSync(join(dir, name), JSON.stringify(value))
const paper = text => write('paper-asset.json', { paper: { paperId, title: 'Fixture' }, content: {
  blocks: [{ type: 'group', groupId: 'g' }], groups: { g: { passage: { paragraphs: [
    { paragraphId: 'p', text },
  ] } } },
} })
try {
  for (const name of ['entries', 'occurrences', 'first/out/mock']) mkdirSync(join(dir, name), { recursive: true })
  write(entry, { entryId: 'w:pick-up', headword: 'pick up', kind: 'phrase', variants: [], forms: [],
    pattern: { alternatives: [['pick', { slot: 'sb/sth' }, 'up']] }, version: 1, counts, unassignedCounts: counts,
    senses: [{ senseId: 'w:pick-up#s1', counts, examples: [] }] })
  paper('Pick it up.')
  assert.equal(JSON.parse(run('prepare', 'first', '--local', dir)).pending.mock, 1)
  writeFileSync(join(dir, 'first/out/mock/w-pick-up.ndjson'), '{"idx":0,"pick":"w:pick-up#s1"}\n')
  run('apply', 'first')
  run('check', 'first')
  const initial = readFileSync(join(dir, entry), 'utf8')
  run('apply', 'first')
  assert.equal(readFileSync(join(dir, entry), 'utf8'), initial)
  assert.deepEqual(JSON.parse(run('prepare', 'same', '--local', dir)),
    { added: 0, changed: 0, withdrawn: 0, hits: 0, automatic: 0, pending: counts, unmarked: 0, sameLegacy: 0, skipped: {} })
  const shard = `occurrences/${paperId}.ndjson`
  const state = `update/${paperId}.json`
  const initialShard = readFileSync(join(dir, shard), 'utf8')
  rmSync(join(dir, state))
  mkdirSync(join(dir, 'phrases'))
  writeFileSync(join(dir, 'occurrences.ndjson.gz'), gzipSync(''))
  writeFileSync(join(dir, 'phrases/hits.ndjson'), JSON.stringify({
    source: { paperId, groupId: 'g', locator: { paragraph: 1, sentence: 1 } },
    tier: 'mock', entryCanonical: 'pick up', sentence: 'Pick it up.', start: 0, end: 10,
  }) + '\n')
  const baseline = JSON.parse(run('prepare', 'legacy', '--local', dir, '--legacy', dir))
  assert.equal(baseline.sameLegacy, 1)
  assert.equal(baseline.changed, 0)
  run('apply', 'legacy')
  assert.equal(readFileSync(join(dir, shard), 'utf8'), initialShard)
  assert.equal(JSON.parse(readFileSync(join(dir, state), 'utf8')).legacyRows.length, 1)
  assert.equal(Object.values(JSON.parse(readFileSync(join(dir, state), 'utf8')).legacyHits)[0].phrases.length, 1)
  paper('Pick this up.')
  run('prepare', 'new', '--local', dir)
  paper('She left.')
  assert.deepEqual(JSON.parse(run('apply', 'new')).deferred, [paperId])
  assert.equal(readFileSync(join(dir, shard), 'utf8'), initialShard)
  paper('She left.')
  assert.equal(JSON.parse(run('prepare', 'edit', '--local', dir)).changed, 1)
  run('apply', 'edit')
  assert.deepEqual(JSON.parse(readFileSync(join(dir, entry), 'utf8')).counts, counts)
  paper('Pick it up.')
  assert.equal(JSON.parse(run('prepare', 'restore', '--local', dir)).pending.mock, 0)
  run('apply', 'restore')
  run('check', 'restore')
  assert.equal(JSON.parse(readFileSync(join(dir, entry), 'utf8')).counts.mock, 1)
  const optionPaper = label => write('paper-asset.json', { paper: { paperId, title: 'Fixture' }, content: {
    blocks: [{ type: 'group', groupId: 'g' }], groups: { g: {
      optionBank: [{ label, text: 'Pick it up.' }],
    } },
  } })
  optionPaper('A')
  mkdirSync(join(dir, 'option/out/mock'), { recursive: true })
  run('prepare', 'option', '--local', dir)
  writeFileSync(join(dir, 'option/out/mock/w-pick-up.ndjson'), '{"idx":0,"pick":"w:pick-up#s1"}\n')
  run('apply', 'option')
  optionPaper('B')
  assert.equal(JSON.parse(run('prepare', 'move', '--local', dir)).pending.mock, 0)
  run('apply', 'move')
  assert.equal(JSON.parse(readFileSync(join(dir, shard), 'utf8')).questionId, 'option-bank:B')
  const moved = JSON.parse(readFileSync(join(dir, entry), 'utf8'))
  assert.equal(moved.senses[0].examples[0].source.locator.optionBank, 'B')
  write('scope.json', { include: [], exclude: [paperId] })
  assert.equal(JSON.parse(run('prepare', 'exclude', '--scope', join(dir, 'scope.json'), '--local', dir)).withdrawn, 1)
  run('apply', 'exclude')
  assert.deepEqual(JSON.parse(readFileSync(join(dir, entry), 'utf8')).counts, counts)
  assert.throws(() => readFileSync(join(dir, shard)), { code: 'ENOENT' })
  const word = 'entries/w-record.json'
  const readWord = () => JSON.parse(readFileSync(join(dir, word), 'utf8'))
  const sense = 'w:record#s1'
  const answer = (batch, rows) => {
    mkdirSync(join(dir, batch, 'out/mock'), { recursive: true })
    writeFileSync(join(dir, batch, 'out/mock/w-record.ndjson'), rows.map(row => `${JSON.stringify(row)}\n`).join(''))
  }
  write(word, { entryId: 'w:record', headword: 'record', kind: 'word', lists: ['3000'], variants: [], forms: [],
    version: 1, counts, unassignedCounts: counts, senses: [
      { senseId: sense, pos: 'v.', glossZh: '录制', counts, examples: [] },
      { senseId: 'w:record#s2', pos: 'n.', glossZh: '记录', counts, examples: [] },
    ] })
  paper('We record birds. We record songs. We record games.')
  const budget = JSON.parse(run('prepare', 'word', '--local', dir))
  assert.equal(budget.pending.mock, 2)
  assert.equal(budget.unmarked, 1)
  answer('word', [{ idx: 0, pick: sense }, { idx: 1, pick: 'NONE' }])
  run('apply', 'word')
  assert.equal(readWord().counts.mock, 3)
  const wordHash = JSON.parse(readFileSync(join(dir, shard), 'utf8')).blockHash
  const pinned = readWord().senses[0].examples[0].exampleId
  paper('We record birds. We record songs! We record games.')
  assert.equal(JSON.parse(run('prepare', 'punctuation', '--local', dir)).pending.mock, 1)
  const packetPath = 'packets/mock/w-record.json'
  const packet = JSON.parse(readFileSync(join(dir, 'punctuation', packetPath), 'utf8'))
  assert.deepEqual(packet.sentences, [{ idx: 0, text: 'We 【record】 songs!' }])
  run('apply', 'punctuation')
  assert.equal(readWord().senses[0].examples[0].exampleId, pinned)
  const retained = JSON.parse(readFileSync(join(dir, shard), 'utf8'))
  assert.equal(retained.senseId, sense)
  assert.notEqual(retained.blockHash, wordHash)
  assert.equal(JSON.parse(run('prepare', 'rejudge', '--local', dir, '--entry', 'w:record')).pending.mock, 2)
  answer('rejudge', [{ idx: 0, pick: 'NONE', newSense: { pos: 'v.', glossZh: '把声音录下来' } }])
  run('apply', 'rejudge')
  run('check', 'rejudge')
  const edited = readWord()
  assert.equal(edited.counts.mock, 3)
  assert.equal(edited.unassignedCounts.mock, 1)
  assert.equal(edited.senses[0].counts.mock, 1)
  assert.equal(edited.senses[0].examples[0].exampleId, pinned)
  const added = edited.senses.at(-1)
  assert.equal(added.examples[0].text, 'We record songs!')
  assert.equal(JSON.parse(readFileSync(join(dir, 'editorial-senses.json'), 'utf8'))[added.senseId].glossZh, added.glossZh)
} finally {
  rmSync(dir, { recursive: true })
}
