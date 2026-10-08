import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { alignGloss } from '../shared/vocabulary-notebook/highlight.mjs'
import { extractNotebookOccurrence } from '../shared/vocabulary-notebook/occurrence.mjs'
import { parseNotebookGloss, parseNotebookHeadword } from '../server/vocabulary-notebook/flashSense.mjs'
import { createVocabularyNotebookRuntime } from '../server/vocabulary-notebook/runtime.mjs'

let failed = 0
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS ${name}`)
  else {
    failed += 1
    console.log(`FAIL ${name}${detail ? ` ${detail}` : ''}`)
  }
}

check('a short gloss highlights once and not inside a longer word', (() => {
  const ok = alignGloss('研究人员采用了不同的方法来解决这个问题。', '方法')
  const inside = alignGloss('银行开门了。', '行')
  const twice = alignGloss('方法是一种方法。', '方法')
  const many = alignGloss('研究人员采用了不同的方法。', '方法；接近')
  return ok.status === 'ready' && ok.ranges[0].quote === '方法'
    && inside.status === 'unavailable'
    && twice.status === 'unavailable'
    && many.status === 'unavailable'
})())

const passage = 'The researchers adopted a different approach to the problem. We slowly approached the village.'
const approachAt = passage.indexOf('approach')
const extracted = extractNotebookOccurrence({
  text: passage,
  groupId: 'reading-a',
  role: 'passage-body',
}, approachAt, approachAt + 'approach'.length)
check('only the sentence containing the word is saved', extracted.sentenceText.startsWith('The researchers')
  && !extracted.sentenceText.includes('village')
  && extracted.selectionInSentence.start === approachAt)

const optionText = 'a different approach'
const optionAt = optionText.indexOf('approach')
const option = extractNotebookOccurrence({
  text: optionText,
  groupId: 'g',
  role: 'option',
}, optionAt, optionAt + 'approach'.length)
check('an option stays a fragment', option.sourceKind === 'fragment' && option.sentenceText === 'a different approach')

check('flash must return one listed sense, not the first by default', parseNotebookGloss('{"gloss":"接近"}', [
  { n: 1, gloss: '方法；办法' },
  { n: 2, gloss: '接近' },
]) === '接近' && parseNotebookGloss('{"sense":0}', [{ n: 1, gloss: '站着' }]) === null
  && parseNotebookGloss('{"gloss":"方法；办法"}', [{ n: 1, gloss: '方法；办法' }]) === '方法；办法'
  && parseNotebookGloss('{"gloss":"别的"}', [{ n: 1, gloss: '方法；办法' }]) === null)
check('an ambiguous form is kept only when flash names one headword', parseNotebookHeadword('{"headword":"finish"}', ['finish', 'finished']) === 'finish'
  && parseNotebookHeadword('{"sense":0}', ['finish', 'finished']) === null
  && parseNotebookHeadword('{"headword":"ended"}', ['finish', 'finished']) === null)

const dir = mkdtempSync(path.join(tmpdir(), 'eqb-notebook-'))
const dbPath = path.join(dir, 'user.sqlite')
function openUserDatabase() {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

const sourceText = 'The researchers adopted a different approach to the problem. The second approach worked.'
const firstAt = sourceText.indexOf('approach')
const secondAt = sourceText.lastIndexOf('approach')
let senseCalls = 0
let translateCalls = 0
const paper = {
  source: {
    paperId: 'paper-a',
    sourceRevision: 'rev-1',
    sourceProjectionVersion: 'paper-selection-source-v2',
    streams: [
      { streamId: 'reading-a/body', text: sourceText, role: 'passage-body', groupId: 'reading-a', flow: true, leaves: [] },
      { streamId: 'reading-b/body', text: 'Another approach appeared.', role: 'passage-body', groupId: 'reading-b', flow: true, leaves: [] },
    ],
  },
  paperTitle: '2026 届高三一模英语',
  publicationDigest: null,
  groups: new Map([
    ['reading-a', { label: 'A篇', order: 0 }],
    ['reading-b', { label: 'B篇', order: 1 }],
  ]),
}
const runtime = createVocabularyNotebookRuntime({
  rootDir: dir,
  openUserDatabase,
  loadPaper: () => paper,
  lookupWord: (surface) => ({
    lexicalKey: `lemma:${surface}`,
    headword: surface,
    lexicalStrategy: 'dictionary',
    dictionaryVersion: 'test',
    pronunciations: [{ pos: 'n.', items: [{ dialect: '美', ipa: '/əˈproʊtʃ/' }] }],
    candidates: [{ n: 1, gloss: '方法' }, { n: 2, gloss: '接近' }],
  }),
  pickSense: async ({ word }) => {
    senseCalls += 1
    return { gloss: word === 'approach' ? '方法' : '接近' }
  },
  translate: async () => {
    translateCalls += 1
    return { results: [{ translation: '研究人员采用了不同的方法来解决这个问题。' }] }
  },
})

function addBody(streamId, start, end, selectedText, mutation) {
  return {
    schemaVersion: 'vocabulary-notebook-add-v1',
    clientMutationId: mutation,
    paperId: 'paper-a',
    sourceRevision: 'rev-1',
    segments: [{ streamId, start, end, selectedText }],
  }
}

const first = await runtime.add('local', addBody('reading-a/body', firstAt, firstAt + 8, 'approach', 'mutation-approach'))
const again = await runtime.add('local', addBody('reading-a/body', firstAt, firstAt + 8, 'approach', 'mutation-approach'))
const second = await runtime.add('local', addBody('reading-a/body', secondAt, secondAt + 8, 'approach', 'mutation-second'))
const otherPassage = await runtime.add('local', addBody('reading-b/body', 8, 16, 'approach', 'mutation-b'))
check('the same occurrence is saved once', first.created && !again.created && first.contextId === again.contextId)
check('another occurrence in the same passage is separate', second.created && second.entryId === first.entryId)
check('the same word in another passage is a separate entry', otherPassage.created && otherPassage.entryId !== first.entryId)

const stateBody = (mutation) => addBody('reading-a/body', firstAt, firstAt + 8, 'approach', mutation)
check('the read-only check accepts the id the client service generates', runtime.selectionState('local', stateBody(`state-${randomUUID()}`)).state === 'occurrence-exists')
check('an id built from long paper and stream ids is over the request limit', (() => {
  try {
    runtime.selectionState('local', stateBody('state-paper-mock-sz-2026-m1-group-mock-sz-2026-m1-reading-a/passage/body/para-mock-sz-2026-m1-reading-a-1-30'))
    return false
  } catch (error) {
    return error.code === 'NOTEBOOK_REQUEST_INVALID'
  }
})())

const before = senseCalls + translateCalls
runtime.listPapers('local')
check('reading the list does not call a model', senseCalls + translateCalls === before)

const enriched = await runtime.enrich('local', first.contextId, { context: {}, signal: undefined, requestId: 'req-1' })
check('enrichment stores the sentence translation and one sense', enriched.saved === true)
const detail = runtime.listPaper('local', 'paper-a')
const entryA = detail.revisions[0].groups.find((group) => group.groupLabel === 'A篇').entries[0]
check('A篇 stays A篇 and both contexts are visible', entryA.contexts.length === 2 && entryA.meanings.includes('方法'))
check('the Chinese gloss is bold only where it matches', entryA.contexts.some((context) => context.targetRanges[0]?.quote === '方法'))

const removed = runtime.deleteContext('local', second.contextId)
check('deleting one context keeps the other', removed.deleted && !removed.entryRemoved)
const replay = await (async () => {
  try {
    await runtime.add('local', addBody('reading-a/body', secondAt, secondAt + 8, 'approach', 'mutation-second'))
    return false
  } catch (error) {
    return error.code === 'NOTEBOOK_MUTATION_CONSUMED'
  }
})()
check('replaying a deleted save does not recreate it', replay)
check('half a word is rejected', await (async () => {
  try {
    await runtime.add('local', addBody('reading-a/body', firstAt, firstAt + 4, 'appr', 'mutation-half'))
    return false
  } catch (error) {
    return error.code === 'NOTEBOOK_NOT_A_WORD'
  }
})())
check('a client cannot supply its own user id', await (async () => {
  try {
    await runtime.add('local', { ...addBody('reading-a/body', firstAt, firstAt + 8, 'approach', 'mutation-extra'), userId: 'other' })
    return false
  } catch (error) {
    return error.code === 'NOTEBOOK_REQUEST_INVALID'
  }
})())

const finishedText = 'By the time I finished, I saw procrastination differently.'
const finishedAt = finishedText.indexOf('finished')
const finishedDb = path.join(dir, 'finished.sqlite')
const finishedRuntime = createVocabularyNotebookRuntime({
  rootDir: dir,
  openUserDatabase: () => new DatabaseSync(finishedDb),
  loadPaper: () => ({
    ...paper,
    source: {
      ...paper.source,
      streams: [{ streamId: 'reading-b/body', text: finishedText, role: 'passage-body', groupId: 'reading-b', flow: true, leaves: [] }],
    },
  }),
  lookupWord: () => ({
    lexicalKey: 'surface:finished',
    headword: 'finished',
    lexicalStrategy: 'ambiguous',
    dictionaryVersion: 'test',
    pronunciations: [],
    candidates: [],
    choices: [
      {
        headword: 'finish',
        pos: 'v.',
        glosses: ['完成；做完'],
        entries: [{
          headword: 'finish',
          posGroups: [{
            posLabel: 'v.',
            pronunciations: [{ ipa: '/ˈfɪnɪʃ/', dialectLabel: '美' }],
            senses: [{ senseId: 's', priority: 'core', shortGloss: '完成；做完' }],
          }],
        }],
      },
      {
        headword: 'finished',
        pos: 'adj.',
        glosses: ['完成的；结束的'],
        entries: [{
          headword: 'finished',
          posGroups: [{
            posLabel: 'adj.',
            pronunciations: [{ ipa: '/ˈfɪnɪʃt/', dialectLabel: '美' }],
            senses: [{ senseId: 's2', priority: 'core', shortGloss: '完成的；结束的' }],
          }],
        }],
      },
    ],
  }),
  pickHeadword: async () => ({ headword: 'finish' }),
  pickSense: async () => ({ gloss: '完成' }),
  translate: async () => ({ results: [{ translation: '等我做完时，我对拖延有了不同的看法。' }] }),
})
const finishedSave = await finishedRuntime.add('local', addBody('reading-b/body', finishedAt, finishedAt + 8, 'finished', 'mutation-finished'))
await finishedRuntime.enrich('local', finishedSave.contextId, { context: {}, requestId: 'finished' })
const finishedPaper = finishedRuntime.listPaper('local', 'paper-a')
const finishedEntry = finishedPaper.revisions[0].groups[0].entries[0]
check('finished in this sentence is stored as finish', finishedEntry.headword === 'finish' && finishedEntry.meanings.includes('完成'))

if (failed) {
  console.log(`FAIL ${failed}`)
  process.exit(1)
}
console.log('OK vocabulary notebook checks')
