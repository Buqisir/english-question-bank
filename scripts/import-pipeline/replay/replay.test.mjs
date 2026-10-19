import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { applyDeclarations, compare, validateDeclarations } from './compare.mjs'
import { digest, sha256, verifyCorpus } from './corpus.mjs'

test('exact comparator observes order, IDs, text, roles, state, source binding, review and transcript ownership', () => {
  const before = { groups: [{ groupId: 'g1', taskType: 'application', essays: { state: 'captured', entries: [{
    referenceId: 'r1', sourceLabel: '范文', paragraphs: [{ paragraphId: 'p1', role: 'body', text: 'A sample.',
      source: { documentSha256: 'abc', locator: { documentId: 'answers', page: 2 }, continuationSources: [] } }],
  }, { referenceId: 'r2' }] } }], review: [{ itemId: 'i1', issue: 'review' }],
  documents: [{ documentId: 'answers', pages: [{ page: 2, stateBefore: false, stateAfter: true, transitions: [true],
    joins: 1, items: [{ text: 'M: A sample.', lines: 'L1,L2', words: 'w1-w3', sourceItemIndexes: [0, 1],
      wordNumbers: [1, 2, 3], emphasis: [{ text: 'sample', marks: ['bold'] }], uncertain: 'check', reason: 'source' }] }] }],
  totalJoins: 1 }
  const mutations = [
    (v) => { v.groups[0].groupId = 'g2' },
    (v) => { v.groups[0].taskType = 'continuation' },
    (v) => { v.groups[0].essays.state = 'not_supplied' },
    (v) => { v.groups[0].essays.entries.reverse() },
    (v) => { v.groups[0].essays.entries[0].referenceId = 'other' },
    (v) => { v.groups[0].essays.entries[0].sourceLabel = '参考答案' },
    (v) => { v.groups[0].essays.entries[0].paragraphs[0].paragraphId = 'p2' },
    (v) => { v.groups[0].essays.entries[0].paragraphs[0].role = 'closing' },
    (v) => { v.groups[0].essays.entries[0].paragraphs[0].text += ' ' },
    (v) => { v.groups[0].essays.entries[0].paragraphs[0].source.documentSha256 = 'def' },
    (v) => { v.groups[0].essays.entries[0].paragraphs[0].source.locator.page = 3 },
    (v) => { v.groups[0].essays.entries[0].paragraphs[0].source.continuationSources.push({ page: 3 }) },
    (v) => { v.review.pop() },
    (v) => { v.review.push({ itemId: 'i2', issue: 'extra' }) },
    (v) => { v.documents[0].pages[0].items[0].text += '!' },
    (v) => { v.documents[0].pages[0].items[0].sourceItemIndexes.pop() },
    (v) => { v.documents[0].pages[0].items[0].lines = 'L1' },
    (v) => { v.documents[0].pages[0].items[0].words = 'w1' },
    (v) => { v.documents[0].pages[0].items[0].wordNumbers.pop() },
    (v) => { v.documents[0].pages[0].items[0].emphasis[0].marks = ['underline'] },
    (v) => { delete v.documents[0].pages[0].items[0].uncertain },
    (v) => { v.documents[0].pages[0].items[0].reason = 'other' },
    (v) => { v.documents[0].pages[0].stateAfter = false },
    (v) => { v.documents[0].pages[0].transitions.pop() },
    (v) => { v.documents[0].pages[0].joins = 0 },
    (v) => { v.totalJoins = 0 },
  ]
  assert.deepEqual(compare(before, structuredClone(before)), [])
  for (const mutate of mutations) {
    const after = structuredClone(before)
    mutate(after)
    const diffs = compare(before, after)
    assert.ok(diffs.length)
    assert.ok(applyDeclarations('paper-a', 'R', diffs, [], new Set()).every((diff) => diff.status === 'UNEXPECTED'))
  }
})

test('declarations require exact values, identity and occurrence; no blanket accept', () => {
  const diffs = compare({ groups: [{ groupId: 'g', text: 'old' }] }, { groups: [{ groupId: 'g', text: 'new' }] })
  const entry = { paperId: 'paper-a', channel: 'R', path: '/groups/0/text', target: { groupId: 'g' },
    before: { present: true, value: 'old' }, after: { present: true, value: 'new' }, reason: 'correct source' }
  const entries = validateDeclarations({ schemaVersion: 'eqb-replay-expectations-v1', changes: [entry] })
  const used = new Set()
  assert.equal(applyDeclarations('paper-a', 'R', diffs, entries, used)[0].status, 'EXPECTED')
  assert.equal(used.size, 1)
  const absent = new Set()
  applyDeclarations('paper-a', 'R', [], entries, absent)
  assert.equal(absent.size, 0) // runner rejects every unused declaration
  for (const wrong of [{ paperId: 'paper-b' }, { path: '/groups' }, { target: { groupId: 'other' } },
    { after: { present: true, value: 'wrong' } }]) {
    assert.equal(applyDeclarations('paper-a', 'R', diffs, [{ ...entry, ...wrong }], new Set())[0].status, 'UNEXPECTED')
  }
  const hashed = { ...entry, before: { sha256: digest(entry.before) }, after: { sha256: digest(entry.after) } }
  assert.equal(applyDeclarations('paper-a', 'R', diffs, [hashed], new Set())[0].status, 'EXPECTED')
  assert.throws(() => validateDeclarations({ schemaVersion: 'eqb-replay-expectations-v1', changes: [{ acceptAll: true }] }))
  assert.throws(() => validateDeclarations({ schemaVersion: 'eqb-replay-expectations-v1', changes: [entry, entry] }))
})

test('frozen input bytes and manifest are independently checked', () => {
  const directory = mkdtempSync('/tmp/eqb-replay-test-')
  try {
    mkdirSync(path.join(directory, 'inputs'))
    const bytes = Buffer.from('{"text":"source"}\n')
    const input = path.join(directory, 'inputs/source.json')
    writeFileSync(input, bytes)
    const body = { schemaVersion: 'eqb-replay-corpus-v1', papers: [{ paperId: 'paper-a', inputs: {
      materialization: { type: 'materialization', sourcePath: '/source.json', frozenPath: 'inputs/source.json',
        sha256: sha256(bytes), bytes: bytes.length },
    } }] }
    const manifestPath = path.join(directory, 'manifest.json')
    writeFileSync(manifestPath, JSON.stringify({ ...body, corpusDigest: digest(body) }))
    verifyCorpus(directory)
    writeFileSync(input, '{"text":"edited"}\n')
    assert.throws(() => verifyCorpus(directory), /input digest changed/u)
    writeFileSync(input, bytes)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.papers[0].paperId = 'paper-b'
    writeFileSync(manifestPath, JSON.stringify(manifest))
    assert.throws(() => verifyCorpus(directory), /manifest digest changed/u)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
