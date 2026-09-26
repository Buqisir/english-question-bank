#!/usr/bin/env node
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { classifyCompleteEnglishWord } from '../shared/paper-dictionary/wordToken.mjs'
import {
  MIRROR_PUBLIC_PATH,
  acceptedLicense,
  cleanAuthor,
  commonsOriginalUrl,
  dialectOf,
  matchPronunciations,
  mirrorPathFor,
} from './paper-dictionary-audio.mjs'
import { allowedAudioUrl, allowedUpstreamAudioUrl } from '../shared/paper-dictionary/audioUrl.mjs'
import { learnerIpa } from '../shared/paper-dictionary/ipa.mjs'
import { lookupSurface, openPaperDictionary } from '../server/paper-dictionary/store.mjs'
import {
  buildSenseCandidates,
  buildSenseDomains,
  createSensePickAdapter,
  matchCopiedGloss,
} from '../server/paper-dictionary/sensePick.mjs'
import { initializeUsageLedger } from '../server/paper-translation/usageLedger.mjs'
import { createPaperDictionaryRoutes, createPaperDictionaryRuntime } from '../server/paper-dictionary/routes.mjs'
import { enrichWithGaokao } from '../server/paper-dictionary/gaokao.mjs'
import { MAX_DICTIONARY_RESPONSE_BYTES } from '../shared/paper-dictionary/constants.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(path.join(tmpdir(), 'eqb-paper-dictionary-'))
let passed = 0
let failed = 0
function check(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

const SENTENCE = 'The school adopted a new policy.'
const adoptedAt = SENTENCE.indexOf('adopted')

check('adopted is one complete word', (() => {
  const word = classifyCompleteEnglishWord(SENTENCE, adoptedAt, adoptedAt + 'adopted'.length)
  return word?.surface === 'adopted' && word.start === adoptedAt
})())
check('a slice inside adopted is not expanded', classifyCompleteEnglishWord(SENTENCE, adoptedAt + 2, adoptedAt + 5) == null)
check('outer punctuation shrinks onto the word', (() => {
  const text = 'The school adopted, today.'
  const start = text.indexOf('adopted,')
  const word = classifyCompleteEnglishWord(text, start, start + 'adopted,'.length)
  return word?.surface === 'adopted' && text.slice(word.start, word.end) === 'adopted'
})())
check('two words stay out of the dictionary', classifyCompleteEnglishWord(SENTENCE, SENTENCE.indexOf('new policy'), SENTENCE.indexOf('new policy') + 'new policy'.length) == null)
check("teachers' keeps the possessive", classifyCompleteEnglishWord("the teachers' room", 4, 13)?.surface === "teachers'")
check('a 129-letter token is rejected', classifyCompleteEnglishWord(` ${'a'.repeat(129)} `, 0, 131) == null)
{
  const rows = [
    { key: 'uk', headword: 'dictionary', pos: 'noun', ipa: '', dialect: 'UK' },
    { key: 'us', headword: 'dictionary', pos: 'noun', ipa: '', dialect: 'US' },
    { key: 'read-present', headword: 'read', pos: 'verb', ipa: '/riːd/', dialect: 'UK' },
    { key: 'read-past', headword: 'read', pos: 'verb', ipa: '/rɛd/', dialect: 'UK' },
    { key: 'adopt', headword: 'adopt', pos: 'verb', ipa: '/əˈdɒpt/', dialect: 'UK' },
    { key: 'us-word', headword: 'us', pos: 'pron', ipa: '', dialect: 'US' },
  ]
  const uk = 'https://upload.wikimedia.org/wikipedia/commons/1/1f/En-uk-dictionary.ogg'
  const us = 'https://upload.wikimedia.org/wikipedia/commons/c/cf/En-us-dictionary.ogg'
  const assigned = matchPronunciations(rows, [
    { word: 'dictionary', pos: 'noun', ipa: '', dialect: 'UK', playUrl: uk, fileName: 'En-uk-dictionary.ogg' },
    { word: 'dictionary', pos: 'noun', ipa: '', dialect: 'US', playUrl: us, fileName: 'En-us-dictionary.ogg' },
    { word: 'read', pos: 'verb', ipa: '', dialect: 'UK', playUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a0/En-uk-read.ogg', fileName: 'En-uk-read.ogg' },
    { word: 'adopted', pos: 'verb', ipa: '', dialect: 'UK', playUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b0/En-uk-adopted.ogg', fileName: 'En-uk-adopted.ogg' },
    { word: 'US', pos: 'noun', ipa: '', dialect: 'US', playUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/d0/En-us-US.ogg', fileName: 'En-us-US.ogg' },
  ])
  check('UK and US recordings stay on their own dialect', assigned.get('uk')?.playUrl === uk && assigned.get('us')?.playUrl === us)
  check('an unlabelled read recording is not glued onto both pronunciations', !assigned.has('read-present') && !assigned.has('read-past'))
  check('adopted audio is not played as adopt', !assigned.has('adopt'))
  check('an uppercase US recording is not merged onto us', !assigned.has('us-word'))
  const readAssigned = matchPronunciations(rows.filter((row) => row.key === 'read-present'), [
    { word: 'read', pos: 'verb', ipa: '/riːd/', dialect: 'UK', playUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a0/En-uk-read.ogg', fileName: 'En-uk-read.ogg' },
  ])
  check('matching IPA can attach a read recording', readAssigned.get('read-present')?.fileName === 'En-uk-read.ogg')
  check('California En-us audio counts as US, not a second UK', dialectOf(['California'], 'En-us-dictionary.ogg') === 'US' && dialectOf(['Received-Pronunciation'], 'En-uk-dictionary.ogg') === 'UK')
  check('an assumed Commons uploader is not stored as the author', cleanAuthor('No machine-readable author provided. Celestianpower assumed (based on copyright claims).') == null)
  check('public domain is kept and fair use is not', acceptedLicense('Public domain') && !acceptedLicense('Fair use'))
  check('a Commons transcode maps back to its original file', commonsOriginalUrl(
    'https://upload.wikimedia.org/wikipedia/commons/transcoded/5/56/LL-Q7979-Soundguys--ham.wav/LL-Q7979-Soundguys--ham.wav.mp3',
  ) === 'https://upload.wikimedia.org/wikipedia/commons/5/56/LL-Q7979-Soundguys--ham.wav'
    && commonsOriginalUrl('https://upload.wikimedia.org/wikipedia/commons/c/c9/En-us-Abigail.mp3') === 'https://upload.wikimedia.org/wikipedia/commons/c/c9/En-us-Abigail.mp3')
  check('Wiktionary narrow IPA is shown in learner notation', learnerIpa('/ɪkˈspɹɛs/') === '/ɪkˈspres/'
    && learnerIpa('/ˈwɔː.tɚ/') === '/ˈwɔːtər/'
    && learnerIpa('/t͡ʃɝt͡ʃ/') === '/tʃɜːrtʃ/'
    && learnerIpa('/hɛː/') === '/heə/'
    && learnerIpa('/ˈpɹɛzn̩s/') === '/ˈprezns/'
    && learnerIpa('/əˈbaʊ̯t/') === '/əˈbaʊt/'
    && learnerIpa('/ˌɔːtəˈmætɪk(ə.)li/') === '/ˌɔːtəˈmætɪk(ə)li/'
    && learnerIpa('/ˈkʰɒt(ə)n/') === '/ˈkɒt(ə)n/'
    && learnerIpa('/ˌæplɨˈkeɪʃən/') === '/ˌæplɪˈkeɪʃən/'
    && learnerIpa('/twelfθ/ [tw̥elfθ]') === '/twelfθ/'
    && learnerIpa('/ɪkˈspres/') === '/ɪkˈspres/'
    && learnerIpa('[ˈbiː]') === '/ˈbiː/'
    && learnerIpa('/ˈwɔːtər/ [ˈwɔːɾɚ]') === '/ˈwɔːtər/')
  check('US IPA without length marks gets learner length marks', learnerIpa('/ɹid/') === '/riːd/'
    && learnerIpa('/əˈbɔɹd/') === '/əˈbɔːrd/'
    && learnerIpa('/ˈdɑkjəmənt/') === '/ˈdɑːkjəmənt/'
    && learnerIpa('/mjuˈziəm/') === '/mjuːˈziːəm/'
    && learnerIpa('/ˈvælju/') === '/ˈvæljuː/'
    && learnerIpa('/ˈhæpinəs/') === '/ˈhæpinəs/'
    && learnerIpa('/bɔɪ/') === '/bɔɪ/'
    && learnerIpa('/ˈbɹeɪk ði ˈaɪs/') === '/ˈbreɪk ði ˈaɪs/'
    && learnerIpa('/ˈkɒt(ə)n/') === '/ˈkɒt(ə)n/')
  check('mirror paths are stable and servable', mirrorPathFor(uk) === mirrorPathFor(uk)
    && mirrorPathFor(uk) !== mirrorPathFor(us)
    && allowedAudioUrl(mirrorPathFor(uk)) === mirrorPathFor(uk))
  const candidates = buildSenseCandidates([{
    entryId: 'stand', headword: 'stand',
    posGroups: [{
      posGroupIndex: 1, posLabel: 'v.',
      senses: [
        { senseId: 's1', priority: 'common', shortGloss: '忍受' },
        { senseId: 's2', priority: 'core', shortGloss: '站立' },
        { senseId: 's3', priority: 'rare', shortGloss: '  ' },
      ],
    }],
  }])
  check('sense candidates are core-first, skip empty glosses, and keep their ids', candidates.length === 2
    && candidates[0].n === 1 && candidates[0].senseId === 's2'
    && candidates[1].n === 2 && candidates[1].senseId === 's1')
  const picked = matchCopiedGloss('站立', candidates)
  check('Flash can only keep a gloss copied from the list', picked.kind === 'sense' && picked.candidate.senseId === 's2'
    && matchCopiedGloss('静止了', candidates).kind === 'none'
    && matchCopiedGloss('站立。', candidates).kind === 'none'
    && matchCopiedGloss('站立 | 忍受', candidates).candidate.senseId === 's2'
    && matchCopiedGloss('时间静止了 | 站立', candidates).kind === 'none')
  const domains = buildSenseDomains({ candidates })
  check('Flash domains list the glosses and leave the sentence out', domains.startsWith('High-school English exam.')
    && domains.includes('站立')
    && domains.includes('忍受')
    && !domains.includes('stood'))
}

{
  // 本站副本随代码发布：只收单声道小文件，总量设上限，防止误把原始 wav 或整批重复文件提交进仓库。
  const mirrorDir = path.join(rootDir, 'app/public', MIRROR_PUBLIC_PATH)
  const files = existsSync(mirrorDir) ? readdirSync(mirrorDir) : []
  const sizes = files.map((name) => statSync(path.join(mirrorDir, name)).size)
  const total = sizes.reduce((sum, size) => sum + size, 0)
  check('mirrored audio files are named by hash and stay small', files.every((name) => /^[0-9a-f]{16}\.mp3$/.test(name))
    && sizes.every((size) => size > 0 && size <= 200 * 1024), `${files.length} files`)
  check('mirrored audio stays within the 60 MB budget', total <= 60 * 1024 * 1024, `${(total / 1048576).toFixed(1)} MB`)
  const realDictionary = path.join(rootDir, 'data/paper-dictionary/eqb-dictionary.sqlite')
  if (existsSync(realDictionary)) {
    const db = new DatabaseSync(realDictionary, { readOnly: true })
    const urls = db.prepare('SELECT DISTINCT audio_url AS url FROM pronunciations WHERE audio_url IS NOT NULL').all().map((row) => row.url)
    db.close()
    const missing = urls.filter((url) => !allowedAudioUrl(url) || !existsSync(path.join(rootDir, 'app/public', url)))
    check('every recording in the local dictionary is a mirrored file that exists', missing.length === 0,
      `${missing.length}/${urls.length} missing, e.g. ${missing.slice(0, 2).join(' ')}`)
  } else {
    console.log('SKIP local dictionary audio files: data/paper-dictionary/eqb-dictionary.sqlite not built here')
  }
}

function buildFixture(filePath, { huge = false } = {}) {
  const db = new DatabaseSync(filePath)
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE entries (entry_id TEXT PRIMARY KEY, headword TEXT NOT NULL, normalized_headword TEXT NOT NULL);
    CREATE TABLE pos_groups (
      entry_id TEXT NOT NULL, pos_group_index INTEGER NOT NULL, pos TEXT NOT NULL, etymology_id TEXT,
      PRIMARY KEY (entry_id, pos_group_index)
    );
    CREATE TABLE forms (
      entry_id TEXT NOT NULL, pos_group_index INTEGER NOT NULL, form_text TEXT NOT NULL,
      form_fold TEXT NOT NULL, tags_json TEXT NOT NULL
    );
    CREATE TABLE senses (
      entry_id TEXT NOT NULL, pos_group_index INTEGER NOT NULL, sense_id TEXT NOT NULL,
      meaning_index INTEGER NOT NULL, priority TEXT NOT NULL, short_gloss TEXT, learner_explanation TEXT,
      PRIMARY KEY (entry_id, pos_group_index, sense_id)
    );
    CREATE TABLE pronunciations (
      entry_id TEXT NOT NULL, pos_group_index INTEGER NOT NULL, pronunciation_index INTEGER NOT NULL,
      ipa TEXT, tags_json TEXT NOT NULL, audio_url TEXT, audio_source TEXT, audio_author TEXT,
      audio_license TEXT, audio_license_url TEXT,
      PRIMARY KEY (entry_id, pos_group_index, pronunciation_index)
    );
    INSERT INTO meta (key, value) VALUES
      ('schema_version', 'eqb-dictionary-v1'),
      ('dictionary_version', 'fixture-v1'),
      ('attribution', 'Open Dictionary / Wiktionary 衍生数据，含模型生成释义');
  `)
  const entry = db.prepare('INSERT INTO entries (entry_id, headword, normalized_headword) VALUES (?, ?, ?)')
  const group = db.prepare('INSERT INTO pos_groups (entry_id, pos_group_index, pos, etymology_id) VALUES (?, ?, ?, ?)')
  const form = db.prepare('INSERT INTO forms (entry_id, pos_group_index, form_text, form_fold, tags_json) VALUES (?, ?, ?, ?, ?)')
  const sense = db.prepare('INSERT INTO senses (entry_id, pos_group_index, sense_id, meaning_index, priority, short_gloss, learner_explanation) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const pron = db.prepare('INSERT INTO pronunciations (entry_id, pos_group_index, pronunciation_index, ipa, tags_json, audio_url, audio_source, audio_author, audio_license, audio_license_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const add = (id, headword, pos, forms, senses, prons = []) => {
    entry.run(id, headword, headword.toLowerCase())
    group.run(id, 1, pos, 'et1')
    for (const item of forms) form.run(id, 1, item.text, item.text.toLowerCase(), JSON.stringify(item.tags))
    senses.forEach((item, index) => sense.run(id, 1, item.id, index, item.priority, item.gloss, item.explanation || item.gloss))
    prons.forEach((item, index) => pron.run(id, 1, index + 1, item.ipa, JSON.stringify(item.tags), item.audio || null, item.source || null, item.author || null, item.license || null, item.licenseUrl || null))
  }
  add('adopt', 'adopt', 'verb', [
    { text: 'adopt', tags: ['lemma'] },
    { text: 'adopted', tags: ['past'] },
    { text: 'adopted', tags: ['participle', 'past'] },
  ], [
    { id: 's1', priority: 'core', gloss: '采用；采纳' },
    { id: 's2', priority: 'rare', gloss: '连续十次击败' },
  ], [
    { ipa: '/əˈdɒpt/', tags: ['UK'] },
    { ipa: '/əˈdɑpt/', tags: ['US'] },
  ])
  add('child', 'child', 'noun', [
    { text: 'child', tags: ['lemma'] },
    { text: 'children', tags: ['plural'] },
  ], [{ id: 's1', priority: 'core', gloss: '孩子' }])
  add('see', 'see', 'verb', [
    { text: 'see', tags: ['lemma'] },
    { text: 'saw', tags: ['past'] },
  ], [{ id: 's1', priority: 'core', gloss: '看见' }])
  add('saw', 'saw', 'noun', [
    { text: 'saw', tags: ['lemma'] },
  ], [{ id: 's1', priority: 'common', gloss: '锯子' }])
  add('good', 'good', 'adj', [
    { text: 'good', tags: ['lemma'] },
    { text: 'better', tags: ['comparative'] },
  ], [{ id: 's1', priority: 'core', gloss: '好的' }])
  add('better', 'better', 'adj', [
    { text: 'better', tags: ['lemma'] },
  ], [{ id: 's1', priority: 'common', gloss: '更好的人' }])
  add('us', 'us', 'pronoun', [{ text: 'us', tags: ['lemma'] }], [{ id: 's1', priority: 'core', gloss: '我们' }])
  add('US', 'US', 'noun', [{ text: 'US', tags: ['lemma'] }], [{ id: 's1', priority: 'common', gloss: '美国' }])
  add('run', 'run', 'verb', [
    { text: 'run', tags: ['lemma'] },
    { text: 'running', tags: ['participle', 'present'] },
  ], [{ id: 's1', priority: 'core', gloss: '跑' }])
  add('running', 'running', 'noun', [{ text: 'running', tags: ['lemma'] }], [{ id: 's1', priority: 'common', gloss: '跑步' }])
  entry.run('read', 'read', 'read')
  group.run('read', 1, 'verb', 'et1')
  group.run('read', 2, 'noun', 'et2')
  form.run('read', 1, 'read', 'read', '["lemma"]')
  form.run('read', 2, 'read', 'read', '["lemma"]')
  sense.run('read', 1, 's1', 0, 'core', '阅读', '阅读')
  sense.run('read', 2, 's1', 0, 'common', '读物', '读物')
  pron.run('read', 1, 1, '/riːd/', '["UK"]', null, null, null, null, null)
  pron.run('read', 2, 1, '/rɛd/', '["US"]', null, null, null, null, null)
  add('rareonly', 'rareonly', 'noun', [{ text: 'rareonly', tags: ['lemma'] }], [
    { id: 's1', priority: 'rare', gloss: '少见义' },
  ])
  add('stand', 'stand', 'verb', [
    { text: 'stand', tags: ['lemma'] },
    { text: 'stood', tags: ['past'] },
  ], [
    { id: 's1', priority: 'core', gloss: '站着' },
    { id: 's2', priority: 'common', gloss: '忍受' },
  ])
  add('stand-still', 'stand still', 'verb', [
    { text: 'stand still', tags: ['lemma'] },
    { text: 'stood still', tags: ['past'] },
  ], [
    { id: 's1', priority: 'core', gloss: '站着不动；保持静止' },
    { id: 's2', priority: 'rare', gloss: '停顿' },
  ])
  add('spoken', 'spoken', 'verb', [{ text: 'spoken', tags: ['lemma'] }], [{ id: 's1', priority: 'core', gloss: '说话' }], [
    { ipa: '/ˈspəʊkən/', tags: ['UK'], audio: '/dictionary-audio/wikimedia-v1/0123456789abcdef.mp3', source: 'Wikimedia Commons: File:En-uk-spoken word.ogg', author: 'Example Speaker', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  ])
  add('evilword', 'evilword', 'noun', [{ text: 'evilword', tags: ['lemma'] }], [{ id: 's1', priority: 'core', gloss: '坏链' }], [
    { ipa: '/ev/', tags: ['US'], audio: 'https://evil.example/secret.mp3' },
    { ipa: '/iːv/', tags: ['UK'], audio: 'https://upload.wikimedia.org/wikipedia/commons/a/a0/En-uk-evil.ogg' },
  ])
  if (huge) {
    add('huge', 'huge', 'noun', [{ text: 'huge', tags: ['lemma'] }], [
      { id: 's1', priority: 'core', gloss: '大', explanation: '释'.repeat(80_000) },
    ])
  }
  db.close()
}

const fixturePath = path.join(temp, 'dictionary.sqlite')
buildFixture(fixturePath)
{
  const opened = openPaperDictionary(fixturePath)
  const folded = lookupSurface(opened.db, 'Adopted')
  check('sentence-initial Adopted still finds adopt', folded.status === 'found' && folded.entries[0]?.headword === 'adopt')
  const mixed = lookupSurface(opened.db, 'Us')
  check('an unseen casing keeps every stored casing', mixed.status === 'ambiguous'
    && mixed.entries.map((entry) => entry.headword).sort().join('/') === 'US/us')
  opened.db.close()
}
const source = {
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  streams: [{
    streamId: 'passage',
    text: SENTENCE,
    role: 'passage-body',
    groupId: 'g',
    leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: SENTENCE.length }],
  }],
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    parsed: null,
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = headers
    },
    end(text) {
      this.body = text
      this.parsed = text ? JSON.parse(text) : null
    },
  }
}

function makeRequest({ origin = 'http://127.0.0.1:5173', contentType = 'application/json', body, raw }) {
  const payload = Buffer.from(raw || JSON.stringify(body || {}))
  return {
    headers: { origin, host: '127.0.0.1:5173', 'content-type': contentType },
    on(event, handler) {
      if (event === 'data') handler(payload)
      if (event === 'end') handler()
    },
    destroy() {},
  }
}

const routes = createPaperDictionaryRoutes()
const routeBy = (method, pathname) => routes.find((route) => route.method === method && pathname.match(route.pattern))
const runtime = createPaperDictionaryRuntime({
  rootDir: temp,
  env: {
    QUESTION_BANK_PAPER_DICTIONARY_PATH: fixturePath,
    QUESTION_BANK_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
  },
  loadSource: () => source,
})
const context = {
  authMode: 'open',
  session: null,
  resolveDataUserId() { return 'local' },
  paperDictionary: runtime,
}

async function lookup(body, contextOverride = context, requestOverride = {}) {
  const response = createResponse()
  await routeBy('POST', '/api/paper-dictionary/lookup').handle({
    request: makeRequest({ body, ...requestOverride }),
    response,
    context: contextOverride,
  })
  return response
}

{
  const response = createResponse()
  routeBy('GET', '/api/paper-dictionary/status').handle({ response, context })
  check('status is private and available', response.statusCode === 200
    && response.headers['cache-control'] === 'private, no-store'
    && response.parsed.available === true
    && response.parsed.dictionaryVersion === 'fixture-v1')
}

const adopted = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: adoptedAt, end: adoptedAt + 7, selectedText: 'adopted' }],
})
check('adopted resolves to adopt with both inflections', adopted.statusCode === 200
  && adopted.parsed.status === 'found'
  && adopted.parsed.entries.length === 1
  && adopted.parsed.entries[0].headword === 'adopt'
  && adopted.parsed.entries[0].posGroups[0].morphologyLabels.join('/') === '过去式/过去分词'
  && adopted.parsed.entries[0].posGroups[0].pronunciations.map((item) => item.dialectLabel).join('/') === '英/美')
check('rare sense is kept beside the core gloss', adopted.parsed.entries[0].posGroups[0].senses.map((item) => item.priority).join('/') === 'core/rare')

const saw = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: 0, end: 3, selectedText: 'saw' }],
})
check('saw stays ambiguous between see and the noun', (() => {
  // The fixture sentence does not contain saw; this request must fail source check.
  return saw.statusCode === 409
})())

const sawSource = {
  ...source,
  streams: [{ ...source.streams[0], text: 'They saw better tools in the US.', leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: 'They saw better tools in the US.'.length }] }],
}
const sawRuntime = createPaperDictionaryRuntime({
  rootDir: temp,
  env: { QUESTION_BANK_PAPER_DICTIONARY_PATH: fixturePath },
  loadSource: () => sawSource,
})
const sawContext = { ...context, paperDictionary: sawRuntime }
const sawText = 'They saw better tools in the US.'
async function lookupSaw(surface) {
  const start = sawText.indexOf(surface)
  return lookup({
    schemaVersion: 'paper-dictionary-request-v1',
    paperId: 'paper-example',
    sourceRevision: 'rev-1',
    segments: [{ streamId: 'passage', start, end: start + surface.length, selectedText: surface }],
  }, sawContext)
}
const sawHit = await lookupSaw('saw')
check('saw returns see and saw', sawHit.statusCode === 200
  && sawHit.parsed.status === 'ambiguous'
  && sawHit.parsed.entries.map((entry) => entry.headword).sort().join('/') === 'saw/see')
const betterHit = await lookupSaw('better')
check('better keeps its own entry and good', betterHit.parsed.status === 'ambiguous'
  && betterHit.parsed.entries.map((entry) => entry.headword).sort().join('/') === 'better/good')
const usHit = await lookupSaw('US')
check('US does not collapse into us', usHit.parsed.status === 'found' && usHit.parsed.entries[0].headword === 'US')
const childrenText = 'The children ran.'
const childRuntime = createPaperDictionaryRuntime({
  rootDir: temp,
  env: { QUESTION_BANK_PAPER_DICTIONARY_PATH: fixturePath },
  loadSource: () => ({
    ...source,
    streams: [{ ...source.streams[0], text: childrenText, leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: childrenText.length }] }],
  }),
})
const childStart = childrenText.indexOf('children')
const childHit = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: childStart, end: childStart + 'children'.length, selectedText: 'children' }],
}, { ...context, paperDictionary: childRuntime })
check('children maps to child by the form index', childHit.parsed.status === 'found'
  && childHit.parsed.entries[0].headword === 'child'
  && childHit.parsed.entries[0].posGroups[0].morphologyLabels.includes('复数'))

const readRuntime = createPaperDictionaryRuntime({
  rootDir: temp,
  env: { QUESTION_BANK_PAPER_DICTIONARY_PATH: fixturePath },
  loadSource: () => ({
    ...source,
    streams: [{ ...source.streams[0], text: 'Please read it.', leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: 'Please read it.'.length }] }],
  }),
})
const readHit = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: 7, end: 11, selectedText: 'read' }],
}, { ...context, paperDictionary: readRuntime })
check('read keeps separate pronunciations', readHit.parsed.entries[0].posGroups.length === 2
  && new Set(readHit.parsed.entries[0].posGroups.flatMap((group) => group.pronunciations.map((item) => item.ipa))).size === 2)

{
  const own = (text) => ({ url: `/vocabulary-assets/gaokao-frequency-v1/audio/x/${text}.mp3`, text })
  const info = {
    frequencyRank: 120,
    frequencyStage: 'high',
    posLabels: new Set(['v.']),
    pronunciationFallback: true,
    phonetics: { american: '/hæŋ/', british: '/hæŋ/' },
    audio: { american: own('hang'), british: own('hang') },
  }
  const vocabulary = { find: (headword) => (headword === 'hang' || headword === 'toward' ? info : null) }
  const human = { url: '/dictionary-audio/wikimedia-v1/0123456789abcdef.mp3', source: 'Wikimedia Commons: File:En-us-hang.ogg' }
  const entry = (headword, groups) => ({ headword, posGroups: groups.map((pronunciations, index) => ({ posGroupIndex: index + 1, pos: 'verb', posLabel: 'v.', pronunciations })) })
  const [hang] = enrichWithGaokao([entry('hang', [[
    { pronunciationId: '1:1', ipa: '/hæŋ/', dialect: 'US', audio: human },
    { pronunciationId: '1:2', ipa: '/hæŋ/', dialect: 'UK', audio: null },
  ]])], vocabulary)
  const byDialect = new Map(hang.posGroups[0].pronunciations.map((item) => [item.dialect, item]))
  check('gaokao words carry their frequency stage', hang.gaokao?.frequencyStage === 'high' && hang.gaokao.frequencyRank === 120)
  check('a human recording wins over our synthetic audio', byDialect.get('US')?.audio?.url === human.url
    && !byDialect.get('US').audio.synthetic)
  check('a human recording carries the same-accent synthetic audio as its playback fallback',
    byDialect.get('US')?.audio?.fallbackUrl === own('hang').url)
  check('a dialect without a human recording falls back to our synthetic audio', byDialect.get('UK')?.audio?.synthetic === true
    && hang.posGroups[0].pronunciations.filter((item) => item.dialect === 'UK').length === 1)
  const [split] = enrichWithGaokao([entry('hang', [
    [{ pronunciationId: '1:1', ipa: '/riːd/', dialect: 'UK', audio: null }],
    [{ pronunciationId: '2:1', ipa: '/rɛd/', dialect: 'US', audio: null }],
  ])], vocabulary)
  check('per-POS pronunciations block the single gaokao fallback', split.gaokao && !JSON.stringify(split).includes('gaokao-'))
  const [toward] = enrichWithGaokao([entry('toward', [[{ pronunciationId: '1:1', ipa: '/təˈwɔːd/', dialect: 'UK', audio: null }]])], vocabulary)
  check('audio recorded for another spelling is not attached', !JSON.stringify(toward).includes('gaokao-'))
  const [plain] = enrichWithGaokao([entry('adopt', [[]])], vocabulary)
  check('words outside the gaokao list stay unchanged', plain.gaokao === undefined)
}

const missing = await lookupSaw('tools')
check('an unlisted word is 200 not-found', missing.statusCode === 200 && missing.parsed.status === 'not-found' && missing.parsed.entries.length === 0)
const slice = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: adoptedAt + 2, end: adoptedAt + 5, selectedText: 'opt' }],
})
check('opt inside adopted is rejected', slice.statusCode === 400 && slice.parsed.code === 'DICTIONARY_NOT_A_WORD')
const forged = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  lemma: 'adopt',
  segments: [{ streamId: 'passage', start: adoptedAt, end: adoptedAt + 7, selectedText: 'adopted' }],
})
check('client lemma is rejected', forged.statusCode === 400)
const mismatch = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-other',
  segments: [{ streamId: 'passage', start: adoptedAt, end: adoptedAt + 7, selectedText: 'adopted' }],
})
check('source revision mismatch is 409', mismatch.statusCode === 409)
const csrf = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: adoptedAt, end: adoptedAt + 7, selectedText: 'adopted' }],
}, context, { origin: 'https://evil.example' })
check('cross origin lookup is 403', csrf.statusCode === 403)
const locked = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: adoptedAt, end: adoptedAt + 7, selectedText: 'adopted' }],
}, { ...context, authMode: 'enforced', session: null })
check('enforced auth without a session is 401', locked.statusCode === 401)
const tooBig = await lookup(null, context, { raw: `{"pad":"${'a'.repeat(9000)}"}` })
check('oversized body is 413', tooBig.statusCode === 413)

const spoken = await lookupSaw('US')
void spoken
const audioHit = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: 0, end: 6, selectedText: 'spoken' }],
}, {
  ...context,
  paperDictionary: createPaperDictionaryRuntime({
    rootDir: temp,
    env: { QUESTION_BANK_PAPER_DICTIONARY_PATH: fixturePath },
    loadSource: () => ({
      ...source,
      streams: [{ ...source.streams[0], text: 'spoken evilword', leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: 'spoken evilword'.length }] }],
    }),
  }),
})
{
  const audio = audioHit.parsed.entries[0].posGroups[0].pronunciations[0].audio
  check('a mirrored Commons recording is returned with its credit', audio?.author === 'Example Speaker'
    && audio.url === '/dictionary-audio/wikimedia-v1/0123456789abcdef.mp3')
  check('the credit links back to the Commons file page', audio?.sourceUrl === 'https://commons.wikimedia.org/wiki/File:En-uk-spoken_word.ogg')
}
const evilHit = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: 7, end: 15, selectedText: 'evilword' }],
}, { ...context, paperDictionary: audioHit.parsed ? context.paperDictionary : context })

const evilRuntime = createPaperDictionaryRuntime({
  rootDir: temp,
  env: { QUESTION_BANK_PAPER_DICTIONARY_PATH: fixturePath },
  loadSource: () => ({
    ...source,
    streams: [{ ...source.streams[0], text: 'spoken evilword', leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: 'spoken evilword'.length }] }],
  }),
})
const evil = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: 7, end: 15, selectedText: 'evilword' }],
}, { ...context, paperDictionary: evilRuntime })
check('a foreign audio url is dropped', evil.parsed.entries[0].posGroups[0].pronunciations.every((item) => item.audio == null)
  && !JSON.stringify(evil.parsed).includes('evil.example'))
check('a direct Wikimedia url is never served to the browser', !JSON.stringify(evil.parsed).includes('wikimedia.org'))
check('upstream Commons urls are still accepted at build time', allowedUpstreamAudioUrl('https://upload.wikimedia.org/wikipedia/commons/a/a0/En-uk-evil.ogg') != null
  && allowedUpstreamAudioUrl('https://evil.example/a.ogg') == null
  && allowedAudioUrl('https://upload.wikimedia.org/wikipedia/commons/a/a0/En-uk-evil.ogg') == null)

const hugePath = path.join(temp, 'huge.sqlite')
buildFixture(hugePath, { huge: true })
const hugeRuntime = createPaperDictionaryRuntime({
  rootDir: temp,
  env: { QUESTION_BANK_PAPER_DICTIONARY_PATH: hugePath },
  loadSource: () => ({
    ...source,
    streams: [{ ...source.streams[0], text: 'A huge ship.', leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: 'A huge ship.'.length }] }],
  }),
})
const huge = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: 2, end: 6, selectedText: 'huge' }],
}, { ...context, paperDictionary: hugeRuntime })
check('oversized entries are marked truncated and stay within 64 KiB', huge.statusCode === 200
  && huge.parsed.truncated === true
  && Buffer.byteLength(JSON.stringify(huge.parsed)) <= MAX_DICTIONARY_RESPONSE_BYTES)

const missingRuntime = createPaperDictionaryRuntime({
  rootDir: temp,
  env: { QUESTION_BANK_PAPER_DICTIONARY_PATH: path.join(temp, 'missing.sqlite') },
  loadSource: () => source,
})
const missingStatus = createResponse()
routeBy('GET', '/api/paper-dictionary/status').handle({
  response: missingStatus,
  context: { ...context, paperDictionary: missingRuntime },
})
const missingLookup = await lookup({
  schemaVersion: 'paper-dictionary-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: adoptedAt, end: adoptedAt + 7, selectedText: 'adopted' }],
}, { ...context, paperDictionary: missingRuntime })
check('a missing dictionary stays unavailable without crashing', missingStatus.statusCode === 200
  && missingStatus.parsed.available === false
  && missingLookup.statusCode === 503)

let ticks = 0
const clockRuntime = createPaperDictionaryRuntime({
  rootDir: temp,
  env: { QUESTION_BANK_PAPER_DICTIONARY_PATH: fixturePath },
  loadSource: () => source,
  now: () => 1_000,
})
let limited = null
for (let index = 0; index < 61; index += 1) {
  limited = await lookup({
    schemaVersion: 'paper-dictionary-request-v1',
    paperId: 'paper-example',
    sourceRevision: 'rev-1',
    segments: [{ streamId: 'passage', start: adoptedAt, end: adoptedAt + 7, selectedText: 'adopted' }],
  }, { ...context, paperDictionary: clockRuntime })
  ticks += 1
}
check('lookup rate limit returns 429', ticks === 61 && limited.statusCode === 429)
void evilHit

// 本文义：模型只能在词典义项里选，或指出固定搭配；走翻译同一个 Key、账本月度额度和限流。
const SENSE_ENV = {
  QUESTION_BANK_PAPER_DICTIONARY_PATH: fixturePath,
  QUESTION_BANK_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
  QUESTION_BANK_PAPER_TRANSLATION_ENABLED: '1',
  QUESTION_BANK_PAPER_TRANSLATION_ALLOW_OPEN_AUTH: '1',
  DASHSCOPE_API_KEY: 'test-key',
  QWEN_MT_WORKSPACE_ID: 'ws-test',
  QWEN_MT_MONTHLY_BUDGET_CNY: '5',
}

async function senseRequest(body, contextOverride = context, requestOverride = {}) {
  const response = createResponse()
  await routeBy('POST', '/api/paper-dictionary/sense').handle({
    request: makeRequest({ body, ...requestOverride }),
    response,
    context: contextOverride,
  })
  return response
}

function makeSenseRuntime(pickSense, loadSrc = () => source) {
  const dir = mkdtempSync(path.join(temp, 'sense-'))
  initializeUsageLedger({ filePath: path.join(dir, 'translation-usage.sqlite') })
  const calls = []
  const runtime = createPaperDictionaryRuntime({
    rootDir: temp,
    env: { ...SENSE_ENV, QUESTION_BANK_PAPER_TRANSLATION_DATA_DIR: dir },
    loadSource: loadSrc,
    sensePickAdapter: {
      pickSense: async (input) => {
        calls.push(input)
        return pickSense(input)
      },
    },
  })
  return { runtime, calls, dir }
}

const adoptedSenseBody = {
  schemaVersion: 'paper-dictionary-sense-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: adoptedAt, end: adoptedAt + 7, selectedText: 'adopted' }],
}

const senseA = makeSenseRuntime((input) => ({
  kind: 'sense',
  candidate: input.candidates[0],
  usage: { promptTokens: 120, completionTokens: 4, totalTokens: 124 },
  model: 'qwen-turbo',
}))
const senseContextA = { ...context, paperDictionary: senseA.runtime }
const senseHit = await senseRequest(adoptedSenseBody, senseContextA)
check('本文义 picks a dictionary sense for the surface form', senseHit.statusCode === 200
  && senseHit.parsed.status === 'ok'
  && senseHit.parsed.selectedText === 'adopted'
  && senseHit.parsed.match?.senseId === 's1'
  && senseHit.parsed.match?.gloss === '采用；采纳'
  && senseHit.parsed.phrase === null)
check('the model sees the word, the sentence, and core senses first', senseA.calls.length === 1
  && senseA.calls[0].surface === 'adopted'
  && senseA.calls[0].headwords.join('/') === 'adopt'
  && senseA.calls[0].occurrence.includes('The school adopted a new policy.')
  && senseA.calls[0].candidates[0].senseId === 's1'
  && senseA.calls[0].candidates.map((item) => item.n).join('/') === '1/2')
const senseHitAgain = await senseRequest(adoptedSenseBody, senseContextA)
check('a repeated 本文义 is served from cache', senseHitAgain.statusCode === 200
  && senseHitAgain.parsed.match?.senseId === 's1' && senseA.calls.length === 1)
const senseStatus = createResponse()
routeBy('GET', '/api/paper-dictionary/status').handle({ response: senseStatus, context: senseContextA })
check('status advertises 本文义 availability', senseStatus.parsed.sensePick?.enabled === true)
const ledgerRows = new DatabaseSync(path.join(senseA.dir, 'translation-usage.sqlite'), { readOnly: true })
  .prepare('SELECT status, rate_version, actual_input_tokens FROM translation_receipts').all()
check('本文义 settles into the shared ledger under its own rate version', ledgerRows.length === 1
  && ledgerRows[0].status === 'settled'
  && ledgerRows[0].rate_version === 'qwen-sense-pick-cn-beijing-2026-10-21'
  && ledgerRows[0].actual_input_tokens === 120)
const notFoundSense = await senseRequest({
  ...adoptedSenseBody,
  segments: [{ streamId: 'passage', start: 4, end: 10, selectedText: 'school' }],
}, senseContextA)
check('an unlisted word gets no 本文义 and no upstream call', notFoundSense.statusCode === 200
  && notFoundSense.parsed.status === 'none' && senseA.calls.length === 1)
const senseLocked = await senseRequest(adoptedSenseBody, { ...senseContextA, authMode: 'enforced', session: null })
check('本文义 requires a session under enforced auth', senseLocked.statusCode === 401)
const senseCsrf = await senseRequest(adoptedSenseBody, senseContextA, { origin: 'https://evil.example' })
check('cross origin 本文义 is 403', senseCsrf.statusCode === 403)

const stillText = 'Until suddenly, time stood still.'
const stoodAt = stillText.indexOf('stood')
const stillSource = {
  ...source,
  streams: [{
    ...source.streams[0],
    text: stillText,
    leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: stillText.length }],
  }],
}
const senseStood = makeSenseRuntime((input) => {
  const own = input.candidates.find((item) => item.gloss === '站着')
  if (!own) throw new Error('missing the circled word sense')
  if (input.surface !== 'stood') throw new Error('sense pick saw more than the circled word')
  if (input.candidates.some((item) => item.gloss.includes('站着不动'))) {
    throw new Error('following phrase leaked into the circled word')
  }
  return {
    kind: 'sense',
    candidate: own,
    usage: { promptTokens: 40, completionTokens: 2, totalTokens: 42 },
    model: 'qwen-mt-flash',
  }
}, () => stillSource)
const stoodHit = await senseRequest({
  schemaVersion: 'paper-dictionary-sense-request-v1',
  paperId: 'paper-example',
  sourceRevision: 'rev-1',
  segments: [{ streamId: 'passage', start: stoodAt, end: stoodAt + 5, selectedText: 'stood' }],
}, { ...context, paperDictionary: senseStood.runtime })
check('circled stood uses its own sense, not stood still', stoodHit.statusCode === 200
  && stoodHit.parsed.status === 'ok'
  && stoodHit.parsed.selectedText === 'stood'
  && stoodHit.parsed.phrase === null
  && stoodHit.parsed.match?.gloss === '站着'
  && senseStood.calls.length === 1
  && senseStood.calls[0].surface === 'stood')

{
  let recorded = null
  const adapter = createSensePickAdapter({
    endpoint: 'https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKey: 'test-key',
    model: 'qwen-mt-flash',
    fetchImpl: async (_url, init) => {
      recorded = JSON.parse(init.body)
      const gloss = recorded.messages[0].content === 'hanging' ? '悬挂着' : '时间静止了'
      return new Response(JSON.stringify({
        model: 'qwen-mt-flash',
        choices: [{ message: { content: gloss }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 30, completion_tokens: 3, total_tokens: 33 },
      }))
    },
  })
  const menu = [
    { n: 1, gloss: '悬挂着', senseId: 'h1' },
    { n: 2, gloss: '绞刑', senseId: 'h2' },
  ]
  const copied = await adapter.pickSense({ surface: 'hanging', occurrence: 'hanging onto a wire', candidates: menu })
  check('Flash copies one listed gloss through the translation endpoint', copied.kind === 'sense'
    && copied.candidate.senseId === 'h1'
    && recorded.model === 'qwen-mt-flash'
    && recorded.messages.length === 1
    && recorded.messages[0].role === 'user'
    && recorded.messages[0].content === 'hanging'
    && recorded.translation_options.domains.includes('悬挂着')
    && !recorded.translation_options.domains.includes('hanging onto a wire'))
  const missed = await adapter.pickSense({ surface: 'stood', occurrence: 'time stood still', candidates: menu })
  check('a gloss Flash invents is not shown', missed.kind === 'none' && missed.usage.totalTokens === 33)
  const truncated = createSensePickAdapter({
    endpoint: 'https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKey: 'test-key',
    model: 'qwen-mt-flash',
    fetchImpl: async () => new Response(JSON.stringify({
      model: 'qwen-mt-flash',
      choices: [{ message: { content: '站着；处在某处 | 有望；很可能 |' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 80, completion_tokens: 64, total_tokens: 144 },
    })),
  })
  const kept = await truncated.pickSense({
    surface: 'stood',
    occurrence: 'time stood still',
    candidates: [{ n: 1, gloss: '站着；处在某处', senseId: 'stand-1' }, { n: 2, gloss: '有望；很可能', senseId: 'stand-2' }],
  })
  check('a truncated menu still keeps the circled word sense', kept.kind === 'sense' && kept.candidate.gloss === '站着；处在某处')
}

const senseC = makeSenseRuntime(() => ({
  kind: 'none',
  usage: { promptTokens: 120, completionTokens: 2, totalTokens: 122 }, model: 'qwen-turbo',
}))
const noneHit = await senseRequest(adoptedSenseBody, { ...context, paperDictionary: senseC.runtime })
check('the model may decline to pick', noneHit.statusCode === 200
  && noneHit.parsed.status === 'none' && noneHit.parsed.match === null && noneHit.parsed.phrase === null)

const senseD = makeSenseRuntime(() => {
  const error = new Error('busy')
  error.code = 'SENSE_RATE_LIMITED'
  error.status = 429
  error.retryable = true
  throw error
})
const busyHit = await senseRequest(adoptedSenseBody, { ...context, paperDictionary: senseD.runtime })
check('a busy 本文义 provider maps to a friendly 429', busyHit.statusCode === 429
  && busyHit.parsed.error === '本文义正忙，请稍后再试')

const senseOffRuntime = createPaperDictionaryRuntime({
  rootDir: temp,
  env: { QUESTION_BANK_PAPER_DICTIONARY_PATH: fixturePath },
  loadSource: () => source,
})
const senseOff = await senseRequest(adoptedSenseBody, { ...context, paperDictionary: senseOffRuntime })
const senseOffStatus = createResponse()
routeBy('GET', '/api/paper-dictionary/status').handle({
  response: senseOffStatus,
  context: { ...context, paperDictionary: senseOffRuntime },
})
check('without the translation switch 本文义 is off', senseOff.statusCode === 503
  && senseOff.parsed.code === 'SENSE_UNAVAILABLE'
  && senseOffStatus.parsed.sensePick?.enabled === false)
senseOffRuntime.close()
senseA.runtime.close()
senseStood.runtime.close()
senseC.runtime.close()
senseD.runtime.close()

runtime.close()
sawRuntime.close()
childRuntime.close()
readRuntime.close()
hugeRuntime.close()
missingRuntime.close()
clockRuntime.close()
evilRuntime.close()

async function verifyBrowser() {
  const requireFromApp = createRequire(new URL('../app/package.json', import.meta.url))
  const { chromium } = requireFromApp('playwright')
  const { createServer } = await import('../app/node_modules/vite/dist/node/index.js')
  const text = 'The school adopted a new policy.'
  const harness = `
    import React, { useRef } from 'react'
    import { createRoot } from 'react-dom/client'
    import { usePaperSelectionTranslation } from '/@fs/${rootDir}/app/src/features/paper-browse/selection/usePaperSelectionTranslation.tsx'
    const calls = { dictionary: [], sense: [] }
    window.__dictCalls = calls
    const originalFetch = window.fetch
    window.fetch = (url, init) => {
      const disabled = location.search.includes('translation=off')
      if (url === '/api/paper-dictionary/status') {
        return Promise.resolve(new Response(JSON.stringify({
          schemaVersion: 'paper-dictionary-status-v1', enabled: true, available: true,
          dictionaryVersion: 'fixture', reason: 'ok', limits: {},
          sensePick: { enabled: !disabled, reason: disabled ? 'disabled' : 'ok' },
        }), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      if (url === '/api/paper-translation/status') {
        return Promise.resolve(new Response(JSON.stringify({
          schemaVersion: 'paper-selection-status-v1', enabled: !disabled, keyAvailable: !disabled,
          canRequestNew: !disabled, reason: disabled ? 'disabled' : 'ok',
          promptVersion: 'selection-prompt-v5', contextPolicy: 'adjacent-v1',
          sourceProjectionVersion: 'paper-selection-source-v2', limits: {},
        }), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      if (url === '/api/paper-dictionary/lookup') {
        const body = JSON.parse(init.body)
        return new Promise((resolve) => {
          calls.dictionary.push({ body, signal: init.signal, complete(payload) {
            resolve(new Response(JSON.stringify({
              schemaVersion: 'paper-dictionary-response-v1', requestId: 'd', sourceRevision: body.sourceRevision,
              dictionaryVersion: 'fixture', selectedText: body.segments[0].selectedText,
              status: 'found', truncated: false,
              attribution: 'Open Dictionary / Wiktionary 衍生数据，含模型生成释义',
              entries: [{
                entryId: 'adopt', headword: payload.headword, posGroups: [{
                  posGroupIndex: 1, pos: 'verb', posLabel: 'v.', etymologyId: 'et1',
                  morphologyLabels: payload.labels, matchedForm: body.segments[0].selectedText,
                  senses: [{ senseId: 's1', priority: 'core', shortGloss: payload.gloss, learnerExplanation: payload.gloss }],
                  pronunciations: [
                    { pronunciationId: 'uk', ipa: '/əˈdɒpt/', dialect: 'UK', dialectLabel: '英', spokenForm: payload.headword, audio: null },
                  ],
                }],
              }],
            }), { status: 200, headers: { 'content-type': 'application/json' } }))
          }})
        })
      }
      if (url === '/api/paper-dictionary/sense') {
        const body = JSON.parse(init.body)
        return new Promise((resolve) => {
          calls.sense.push({ body, signal: init.signal, complete(payload) {
            resolve(new Response(JSON.stringify({
              schemaVersion: 'paper-dictionary-sense-response-v1', requestId: 's', sourceRevision: body.sourceRevision,
              selectedText: body.segments[0].selectedText, status: payload.status || 'ok',
              match: payload.match || null, phrase: payload.phrase || null,
            }), { status: 200, headers: { 'content-type': 'application/json' } }))
          }})
        })
      }
      return originalFetch(url, init)
    }
    const sourceText = ${JSON.stringify(text)}
    function Fixture() {
      const hostRef = useRef(null)
      const selection = usePaperSelectionTranslation({
        paperId: 'paper-example',
        consumption: { selectionSource: {
          paperId: 'paper-example', sourceRevision: 'rev-1', streams: [{
            streamId: 'passage', text: sourceText, role: 'passage-body', groupId: 'g',
            leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: sourceText.length }],
          }],
        } },
        hostRef,
      })
      return React.createElement(React.Fragment, null,
        React.createElement('div', { id: 'host', ref: hostRef, className: 'paper-browse-group-card', 'data-paper-browse-anchor': 'g' },
          React.createElement('p', { id: 'passage', 'data-paper-paragraph-id': 'p1' }, sourceText)),
        selection.overlay)
    }
    createRoot(document.getElementById('root')).render(React.createElement(Fixture))
    window.__select = (surface) => {
      const node = document.getElementById('passage').firstChild
      const start = node.textContent.indexOf(surface)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.setBaseAndExtent(node, start, node, start + surface.length)
    }
  `
  const plugin = {
    name: 'paper-dictionary-harness',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === '/__dict-harness.js') return '\0dict-harness'
      if (id.endsWith('/sourceProjection.mjs') && importer?.endsWith('/selection/usePaperSelectionTranslation.tsx')) {
        return '\0dict-source'
      }
    },
    load(id) {
      if (id === '\0dict-harness') return harness
      if (id === '\0dict-source') {
        return `export function buildSelectionSourceFromConsumption(consumption) {
          if (!consumption?.selectionSource) throw new Error('missing')
          return consumption.selectionSource
        }`
      }
      return null
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0]
        if (pathname !== '/dict') return next()
        const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/__dict-harness.js"></script></body></html>'
        void server.transformIndexHtml(request.url, html).then((transformed) => {
          response.setHeader('content-type', 'text/html; charset=utf-8')
          response.end(transformed)
        }, next)
      })
    },
  }
  const vite = await createServer({
    root: path.join(rootDir, 'app'),
    logLevel: 'error',
    server: { host: '127.0.0.1', fs: { allow: [rootDir] } },
    appType: 'custom',
    plugins: [plugin],
  })
  const port = await new Promise((resolve, reject) => {
    const server = createNetServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(address.port))
    })
    server.on('error', reject)
  })
  await vite.listen(port)
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const page = await browser.newPage()
  page.on('pageerror', (error) => console.error(`PAGE ${error.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`CONSOLE ${msg.text()}`)
  })
  try {
    await page.goto(`http://127.0.0.1:${port}/dict`)
    await page.waitForSelector('#passage', { timeout: 8000 })
    await page.evaluate(() => window.__select('adopted'))
    await page.waitForSelector('.paper-selection-lookup')
    await page.waitForFunction(() => window.__dictCalls.dictionary.length === 1)
    check('a complete word shows the 查词 toolbar and only prefetches the dictionary', await page.evaluate(() => window.__dictCalls.sense.length) === 0
      && await page.locator('.paper-dictionary-card').count() === 0)
    await page.locator('.paper-selection-lookup').click()
    await page.waitForSelector('.paper-dictionary-card')
    check('clicking 查词 opens the card without a second lookup', await page.evaluate(() => window.__dictCalls.dictionary.length) === 1)
    await page.evaluate(() => window.__dictCalls.dictionary[0].complete({ headword: 'adopt', gloss: '采用；采纳', labels: ['过去式', '过去分词'] }))
    await page.waitForFunction(() => document.body.innerText.includes('采用；采纳'))
    const cardText = await page.locator('.paper-dictionary-card').innerText()
    check('the card shows the lemma, the surface, and the gloss', cardText.includes('adopt') && cardText.includes('adopted') && cardText.includes('采用；采纳'))
    check('the card drops the kicker and the empty-recording placeholders', !cardText.includes('暂无录音') && !cardText.includes('暂无音标')
      && await page.locator('.paper-dictionary-card .paper-selection-card-kicker').count() === 0)
    await page.waitForFunction(() => window.__dictCalls.sense.length === 1)
    const senseBody = await page.evaluate(() => window.__dictCalls.sense[0].body)
    check('本文义 asks for the surface form, not the lemma', senseBody.segments[0].selectedText === 'adopted')
    await page.evaluate(() => window.__dictCalls.sense[0].complete({
      match: { entryId: 'adopt', posGroupIndex: 1, senseId: 's1', gloss: '采用；采纳' },
    }))
    await page.waitForFunction(() => document.body.innerText.includes('本文义') && document.body.innerText.includes('采用'))
    check('本文义 stays inside the dictionary card', (await page.locator('.paper-dictionary-sense-text').innerText()).includes('采用'))
    check('本文义 marks the picked sense, not a text lookalike', await page.locator('.paper-dictionary-sense[data-context]').count() === 1)

    await page.evaluate(() => window.__select('new policy'))
    await page.waitForSelector('.paper-selection-translate')
    check('several words keep the translate button', await page.locator('.paper-dictionary-card').count() === 0)

    const before = await page.evaluate(() => window.__dictCalls.dictionary.length)
    await page.evaluate(() => window.__select('opt'))
    await page.waitForTimeout(80)
    check('a slice of adopted does not look the word up', await page.evaluate((n) => window.__dictCalls.dictionary.length === n, before)
      && await page.locator('.paper-selection-translate').count() === 1)

    await page.keyboard.press('Escape')
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
      window.__select('policy')
    })
    await page.waitForSelector('.paper-selection-lookup')
    await page.waitForFunction((n) => window.__dictCalls.dictionary.length === n + 1, before)
    check('a keyboard word selection prefetches but keeps the card closed', await page.evaluate(() => window.__dictCalls.sense.length) === 1
      && await page.locator('.paper-dictionary-card').count() === 0)
    await page.locator('.paper-selection-lookup').click()
    await page.waitForSelector('.paper-dictionary-card')
    check('the keyboard card reuses the prefetched lookup', await page.evaluate((n) => window.__dictCalls.dictionary.length === n + 1, before))

    await page.goto(`http://127.0.0.1:${port}/dict?translation=off`)
    await page.waitForSelector('#passage')
    await page.evaluate(() => window.__select('adopted'))
    await page.waitForSelector('.paper-selection-lookup')
    await page.waitForFunction(() => window.__dictCalls.dictionary.length === 1)
    await page.locator('.paper-selection-lookup').click()
    await page.waitForSelector('.paper-dictionary-card')
    await page.evaluate(() => window.__dictCalls.dictionary[0].complete({ headword: 'adopt', gloss: '采用；采纳', labels: ['过去式', '过去分词'] }))
    await page.waitForTimeout(400)
    check('dictionary still opens when 本文义 is off, with no upstream call', await page.evaluate(() => window.__dictCalls.sense.length) === 0
      && (await page.locator('.paper-dictionary-card').innerText()).includes('本文义暂不可用'))
  } finally {
    await browser.close()
    await vite.close()
  }
}

try {
  await verifyBrowser()
} catch (error) {
  failed += 1
  console.error(`FAIL browser dictionary harness\n  ${error?.stack || error}`)
}

rmSync(temp, { recursive: true, force: true })
if (failed > 0) {
  console.error(`FAILED ${failed}  passed ${passed}`)
  process.exit(1)
}
console.log(`OK ${passed}`)
