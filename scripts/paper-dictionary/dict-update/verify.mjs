import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { makeRecord, recordRows, sentencesOf } from './annotations.mjs'
import { matcher } from './match.mjs'
import { reanchorLegacy } from './legacyAnchors.mjs'
import { blocksOf, localPaper } from './source.mjs'

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
  paper('Pick it up now.')
  const stalePhrase = JSON.parse(run('prepare', 'stale-phrase', '--local', dir, '--legacy', dir))
  assert.equal(stalePhrase.legacyDropped, 1)
  assert.equal(stalePhrase.pending.mock, 1)
  paper('Pick it up.')
  const baseline = JSON.parse(run('prepare', 'legacy', '--local', dir, '--legacy', dir))
  assert.equal(baseline.sameLegacy, 1)
  assert.equal(baseline.changed, 1)
  assert.equal(baseline.legacyRetained, 1)
  assert.equal(baseline.legacyDropped, 0)
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
  paper('Pick  it up.')
  const phraseSpacing = JSON.parse(run('prepare', 'phrase-spacing', '--local', dir))
  assert.equal(phraseSpacing.changed, 1)
  assert.equal(phraseSpacing.pending.mock, 0)
  run('apply', 'phrase-spacing')
  run('check', 'phrase-spacing')
  assert.deepEqual(JSON.parse(readFileSync(join(dir, shard), 'utf8')).parts, [[0, 4], [9, 11]])
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
  paper('We  record birds. We record songs! We record games.')
  const spaces = JSON.parse(run('prepare', 'spaces', '--local', dir))
  assert.equal(spaces.changed, 1)
  assert.equal(spaces.pending.mock, 0)
  run('apply', 'spaces')
  const spaced = readFileSync(join(dir, shard), 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(spaced.find(row => row.senseId === sense).start, retained.start + 1)
  assert.equal(spaced.find(row => row.senseId === added.senseId).start, retained.start)
  assert.equal(readWord().senses[0].examples[0].exampleId, pinned)
  const savedState = readFileSync(join(dir, state))
  rmSync(join(dir, state))
  const stale = spaced.map(({ blockHash, sentenceText, ...row }) => row)
  const saveRows = rows => writeFileSync(join(dir, shard), rows.map(row => `${JSON.stringify(row)}\n`).join(''))
  saveRows(stale)
  writeFileSync(join(dir, 'occurrences.ndjson.gz'), gzipSync([...spaced, { sentence: 3, start: 3, end: 9 }].map(row => JSON.stringify({
    source: { paperId, groupId: 'g', locator: { paragraph: 1, sentence: row.sentence } },
    tier: 'mock', sentenceText: row.sentenceText, hits: { record: [[row.start, row.end]] },
  })).join('\n') + '\n'))
  writeFileSync(join(dir, 'phrases/hits.ndjson'), '')
  const recall = 'entries/w-recall.json'
  write(recall, { entryId: 'w:recall', headword: 'recall', kind: 'word', lists: ['3000'], variants: [], forms: [],
    version: 1, counts, unassignedCounts: counts, senses: [
      { senseId: 'w:recall#s1', pos: 'v.', glossZh: '回想', counts, examples: [] },
    ] })
  paper('We record birds. We recall songs! We play games.')
  const adoption = JSON.parse(run('prepare', 'adopt-legacy', '--local', dir, '--legacy', dir))
  assert.equal(adoption.changed, 1)
  assert.equal(adoption.legacyRetained, 1)
  assert.equal(adoption.legacyDropped, 1)
  assert.equal(adoption.pending.mock, 0)
  assert.equal(adoption.unmarked, 1)
  run('apply', 'adopt-legacy')
  const adopted = JSON.parse(readFileSync(join(dir, state), 'utf8'))
  const target = localPaper(dir)
  const [targetBlock] = Object.values(blocksOf(target))
  assert.equal(adopted.target[0], target.revisionId)
  assert.equal(Object.values(adopted.blocks)[0].rawHash, targetBlock.rawHash)
  assert.equal(JSON.parse(readFileSync(join(dir, shard), 'utf8').trim()).senseId, sense)
  assert.equal(readWord().counts.mock, 1)
  assert.equal(JSON.parse(readFileSync(join(dir, recall), 'utf8')).counts.mock, 1)
  assert.equal(JSON.parse(run('prepare', 'daily', '--local', dir, '--pending')).pending.mock, 1)
  mkdirSync(join(dir, 'daily/out/mock'), { recursive: true })
  writeFileSync(join(dir, 'daily/out/mock/w-recall.ndjson'), '{"idx":0,"pick":"w:recall#s1"}\n')
  run('apply', 'daily')
  run('check', 'daily')
  const reviewedRecall = JSON.parse(readFileSync(join(dir, recall), 'utf8'))
  assert.equal(reviewedRecall.counts.mock, 1)
  assert.equal(reviewedRecall.senses[0].counts.mock, 1)
  assert.equal(JSON.parse(run('prepare', 'daily-again', '--local', dir, '--pending')).pending.mock, 0)
  paper('The record lists birds. We recall songs! We recall games.')
  const revised = JSON.parse(run('prepare', 'after-adoption', '--local', dir))
  assert.equal(revised.pending.mock, 1)
  assert.match(readFileSync(join(dir, 'after-adoption', packetPath), 'utf8'), /The 【record】 lists birds\./u)
  answer('after-adoption', [{ idx: 0, pick: 'w:record#s2' }])
  run('apply', 'after-adoption')
  assert.equal(readWord().counts.mock, 1)
  assert.equal(readWord().senses[0].counts.mock, 0)
  assert.equal(readWord().senses[1].counts.mock, 1)
  assert.equal(JSON.parse(readFileSync(join(dir, recall), 'utf8')).counts.mock, 2)
  saveRows(spaced)
  writeFileSync(join(dir, state), savedState)
  paper('We  record birds. We record songs! We record games.')
  write(word, { ...edited, senses: edited.senses.map(s => s.senseId === sense ? {
    ...s, examples: [{ ...s.examples[0], text: 'We  record birds.' }],
  } : s) })

  const abbreviation = { entryId: 'w:a.m.', headword: 'a.m.', lists: ['3000'], variants: [], forms: [] }
  const [abbrBlock] = Object.values(blocksOf({ paperId, groups: [
    { groupId: 'abbreviations', passage: { paragraphs: [{ text: 'Come at 8 a.m. Leave at 9 a. m.' }] } },
  ] }))
  assert.deepEqual(matcher(new Map([[abbreviation.entryId, abbreviation]]))(paperId, abbrBlock).map(row => row.surface),
    ['a.m.', 'a. m.'])

  const friend = { entryId: 'w:friend', headword: 'friend', lists: ['3000'], variants: [],
    forms: [{ form: 'friends', tags: [] }] }
  const testEntries = new Map([[friend.entryId, friend]])
  const [testBlock] = Object.values(blocksOf({ paperId, groups: [
    { groupId: 'friend', passage: { paragraphs: [{ text: 'His friends’ invitation. My friends left. Other friends stayed.' }] } },
  ] }))
  const legacy = [{ entryId: friend.entryId, sentence: 1, start: 9, end: 16, surface: 'friends', senseId: 'friend-1' },
    { entryId: friend.entryId, sentence: 2, start: 1, end: 8, surface: 'friends', senseId: 'friend-2' }]
  const quotes = new Map([[legacy[0], 'His friends’ invitation.'], [legacy[1], 'My friends left.']])
  const anchored = reanchorLegacy(paperId, testBlock, legacy, matcher(testEntries)(paperId, testBlock), testEntries, quotes)
  assert.deepEqual([...anchored.assigned].map(([row, [saved]]) => [row.sentence, row.start, saved.senseId]),
    [[1, 4, 'friend-1'], [2, 3, 'friend-2']])
  const friends = { ...friend, entryId: 'w:friends', headword: 'friends', forms: [] }
  testEntries.set(friends.entryId, friends)
  const transferred = reanchorLegacy(paperId, testBlock, [legacy[1]], matcher(testEntries)(paperId, testBlock), testEntries, quotes)
  assert.equal(transferred.assigned.size, 0)
  assert.equal(transferred.reasons.get(legacy[1]), 'changedEntry')
  assert.deepEqual([...transferred.review].map(row => [row.entryId, row.sentence]), [['w:friends', 2]])

  const it = { ...friend, entryId: 'w:it', headword: 'it', forms: [] }
  const june = { ...it, entryId: 'w:june', headword: 'June' }
  const sentenceEntries = new Map([it, june].map(entry => [entry.entryId, entry]))
  const [sentenceBlock] = Object.values(blocksOf({ paperId, groups: [{ groupId: 'original-quote', passage: {
    paragraphs: [{ text: 'It was cold. It went well. It is failure that brings improvement. Dates:1 June-31 July.' }],
  } }] }))
  const emphasis = { entryId: it.entryId, sentence: 2, start: 0, end: 2, surface: 'It', senseId: 'emphasis' }
  const alias = { ...emphasis, questionId: 'alias' }
  const date = { entryId: june.entryId, sentence: 4, start: 8, end: 12, surface: 'June', senseId: 'month' }
  const currentMatches = matcher(sentenceEntries)(paperId, sentenceBlock)
  const corrected = reanchorLegacy(paperId, sentenceBlock, [emphasis, alias, date], currentMatches, sentenceEntries,
    new Map([[emphasis, 'It is failure that brings improvement.']]))
  assert.deepEqual([...corrected.assigned.keys()].map(row => [row.surface, row.sentence, row.start]),
    [['It', 3, 0], ['June', 4, 8]])
  assert.deepEqual([...corrected.assigned.values()][0], [emphasis, alias])
  const missing = reanchorLegacy(paperId, sentenceBlock, [emphasis], currentMatches, sentenceEntries,
    new Map([[emphasis, 'It was the only way.']]))
  assert.equal(missing.assigned.size, 0)
  assert.equal(missing.reasons.get(emphasis), 'missingOriginalSentenceForm')
  const [ambiguousBlock] = Object.values(blocksOf({ paperId, groups: [{ groupId: 'ambiguous', passage: {
    paragraphs: [{ text: 'It was cold, but it went well.' }],
  } }] }))
  const ambiguous = { ...emphasis, sentence: 1, start: 8, end: 10 }
  const uncertain = reanchorLegacy(paperId, ambiguousBlock, [ambiguous],
    matcher(sentenceEntries)(paperId, ambiguousBlock), sentenceEntries)
  assert.equal(uncertain.assigned.size, 0)
  assert.equal(uncertain.reasons.get(ambiguous), 'ambiguousAnchor')
  assert.equal(uncertain.review.size, 2)

  const record = { ...it, entryId: 'w:record', headword: 'record' }
  const day = { ...it, entryId: 'w:day', headword: 'day', forms: [{ form: 'days', tags: [] }] }
  const gym = { ...it, entryId: 'w:gym', headword: 'gym' }
  const edgeEntries = new Map([record, day, gym].map(entry => [entry.entryId, entry]))
  const [edgeBlock] = Object.values(blocksOf({ paperId, groups: [{ groupId: 'edge-cases', passage: {
    paragraphs: [{ text: 'The record lists 13days. __38__ We met at the gym, another gym.' }],
  } }] }))
  const verb = { ...emphasis, entryId: record.entryId, surface: 'record', sentence: 1, start: 0, end: 6 }
  const days = { ...emphasis, entryId: day.entryId, surface: 'days', sentence: 1, start: 19, end: 23 }
  const firstGym = { ...emphasis, entryId: gym.entryId, surface: 'gym', sentence: 2, start: 21, end: 24 }
  const edge = reanchorLegacy(paperId, edgeBlock, [verb, days, firstGym], matcher(edgeEntries)(paperId, edgeBlock),
    edgeEntries, new Map([[firstGym, 'We met at the gym, another gym.']]))
  assert.deepEqual([...edge.assigned.keys()].map(row => [row.surface, row.start]), [['days', 19], ['gym', 21]])
  assert.deepEqual([...edge.review].map(row => row.surface), ['record'])

  const [splitBlock] = Object.values(blocksOf({ paperId, groups: [{ groupId: 'archive-split', passage: {
    paragraphs: [{ text: 'Dr. Smith called. It was fine.” It went well. It ended.' }],
  } }] }))
  const splitRows = [
    { ...emphasis, sentence: 2, start: 0, end: 2, senseId: 'first' },
    { ...emphasis, sentence: 2, start: 14, end: 16, senseId: 'second' },
    { ...emphasis, sentence: 3, start: 0, end: 2, senseId: 'third' },
  ]
  const split = reanchorLegacy(paperId, splitBlock, splitRows, matcher(sentenceEntries)(paperId, splitBlock), sentenceEntries)
  assert.deepEqual([...split.assigned].map(([row, [saved]]) => [row.sentenceText, saved.senseId]), [
    ['It was fine.”', 'first'], ['It went well.', 'second'], ['It ended.', 'third'],
  ])

  const dialogue = 'He smiled.“We made it,” he said.'
  const [dialogueBlock] = Object.values(blocksOf({ paperId, groups: [{ groupId: 'dialogue', passage: {
    paragraphs: [{ text: dialogue }],
  } }] }))
  const makeIt = { entryId: 'w:make-it', kind: 'phrase', headword: 'make it', variants: [],
    forms: [{ form: 'made it', tags: [] }] }
  const phraseEntries = new Map([[makeIt.entryId, makeIt]])
  const start = dialogue.indexOf('made it')
  const archived = { entryId: makeIt.entryId, senseId: 'arrive', sentence: 1, sentenceStart: 0,
    sentenceText: dialogue, start, end: start + 7, surface: 'made it', blockHash: dialogueBlock.hash }
  const phraseHits = matcher(phraseEntries)(paperId, dialogueBlock)
  assert.equal(phraseHits.length, 0)
  const [restored] = reanchorLegacy(paperId, dialogueBlock, [archived], phraseHits, phraseEntries).assigned.keys()
  assert.equal(restored?.start, start)
  assert.equal(recordRows(makeRecord(sentencesOf(dialogue), [restored]))[0].sentenceText, dialogue)

  const otherDir = join(dir, 'other')
  mkdirSync(otherDir)
  const other = JSON.parse(readFileSync(join(dir, 'paper-asset.json'), 'utf8'))
  other.paper = { paperId: 'paper-gaokao-other', title: 'Other fixture' }
  other.content.groups.g.passage.paragraphs[0].text = 'We record the air.'
  write('other/paper-asset.json', other)
  mkdirSync(join(dir, 'other-batch/out/gaokao'), { recursive: true })
  writeFileSync(join(dir, 'other-batch/out/gaokao/w-record.ndjson'), `${JSON.stringify({ idx: 0, pick: sense })}\n`)
  run('prepare', 'other-batch', '--local', otherDir)
  run('apply', 'other-batch')
  const interim = readWord()
  interim.senses[0].examples = interim.senses[0].examples.filter(example => example.source.paperId === paperId)
  write(word, interim)
  rmSync(join(dir, state))
  writeFileSync(join(dir, 'occurrences.ndjson.gz'), gzipSync(JSON.stringify({
    source: { paperId, groupId: 'g', locator: { paragraph: 1, sentence: 1 } },
    tier: 'mock', hits: { record: [[4, 10], [21, 27], [38, 44]] },
  }) + '\n'))
  assert.equal(JSON.parse(run('prepare', 'legacy-withdraw', '--scope', join(dir, 'scope.json'), '--legacy', dir,
    '--local', dir, '--local', otherDir)).withdrawn, 1)
  run('apply', 'legacy-withdraw')
  assert.throws(() => readFileSync(join(dir, shard)), { code: 'ENOENT' })
  const remaining = readWord()
  assert.deepEqual(remaining.counts, { gaokao: 1, mock: 0 })
  assert.equal(remaining.senses[0].examples[0].source.paperId, other.paper.paperId)
  assert.equal(JSON.parse(readFileSync(join(dir, state), 'utf8')).legacyRows.length, 2)
} finally {
  rmSync(dir, { recursive: true })
}
