import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  createVocabularyStudent,
  createVocabularySetFromEntries,
  createVocabularyReviewRun,
  decideVocabularyReviewEntry,
  discardVocabularyReviewRun,
  ensureSharedVocabularyShape,
  ensureUserVocabularyShape,
  freezeVocabularySet,
  getCurrentVocabularyReviewRun,
  getPublicVocabularyShare,
  getVocabularyProgress,
  getVocabularyProgram,
  getVocabularySet,
  getVocabularySetForReviewRun,
  listVocabularyStudents,
  listVocabularySets,
  replaceVocabularyProgram,
  renameVocabularySet,
  revokeVocabularyShare,
  shareVocabularySet,
  undoVocabularyReviewDecision,
} from '../server/vocabulary/vocabularyStore.mjs'

const officialOracle = JSON.parse(readFileSync(new URL('../data/vocabulary/official-2022-grade-three-vocabulary-oracle-v1.json', import.meta.url)))
const sourceMap = JSON.parse(readFileSync(new URL('../data/vocabulary/wanwei-round-one-source-map-v1.json', import.meta.url)))
const sourceLedger = JSON.parse(readFileSync(new URL('../data/vocabulary/source-evidence/wanwei-page-review-ledger-v1.json', import.meta.url)))
const learningContent = JSON.parse(readFileSync(new URL('../data/vocabulary/wanwei-learning-content-v1.json', import.meta.url)))
const americanPhonetics = JSON.parse(readFileSync(new URL('../data/vocabulary/wanwei-american-phonetics-v1.json', import.meta.url)))
const audioScript = JSON.parse(readFileSync(new URL('../data/vocabulary/wanwei-audio-script-v1.json', import.meta.url)))
const voiceProfile = JSON.parse(readFileSync(new URL('../data/vocabulary/eqb-british-teacher-v1.json', import.meta.url)))
const audioGoldenSet = JSON.parse(readFileSync(new URL('../data/vocabulary/eqb-british-teacher-golden-words-v1.json', import.meta.url)))
const audioManifestUrl = new URL('../data/vocabulary/wanwei-audio-manifest-v1.json', import.meta.url)
const audioManifest = existsSync(audioManifestUrl) ? JSON.parse(readFileSync(audioManifestUrl)) : null
const britishAudioManifestUrl = new URL('../data/vocabulary/wanwei-british-cori-audio-manifest-v1.json', import.meta.url)
const britishAudioManifestBytes = existsSync(britishAudioManifestUrl) ? readFileSync(britishAudioManifestUrl) : null
const britishAudioManifest = britishAudioManifestBytes ? JSON.parse(britishAudioManifestBytes) : null
const britishAudioReceipt = JSON.parse(readFileSync(new URL('../data/vocabulary/wanwei-british-cori-audio-receipt-v1.json', import.meta.url)))
const britishVoiceProfile = JSON.parse(readFileSync(new URL('../data/vocabulary/eqb-british-cori-high-v1.json', import.meta.url)))
const visualManifest = JSON.parse(readFileSync(new URL('../data/vocabulary/wanwei-visual-manifest-v1.json', import.meta.url)))
const countIpaToken = (value, token) => String(value).split(token).length - 1
assert.equal(officialOracle.count, 1600)
assert.equal(officialOracle.entries.length, 1600)
assert.equal(new Set(officialOracle.entries.map((entry) => entry.matchKey)).size, 1599)
assert.deepEqual(officialOracle.entries.filter((entry) => entry.matchKey === 'miss').map((entry) => entry.label), ['miss', 'Miss'])
assert.equal(officialOracle.entries[0].label, 'a / an')
assert.equal(officialOracle.entries.at(-1).label, 'zoo')

assert.deepEqual(sourceMap.advertisedWordCounts, { core: 477, basic: 764, recognition: 359, total: 1600 })
assert.deepEqual(sourceMap.entryCounts, { core: 476, basic: 766, recognition: 358, total: 1600 })
assert.equal(sourceMap.entries.length, 1600)
assert.equal(sourceMap.groups.length, 60)
assert.equal(new Set(sourceMap.entries.map((entry) => entry.id)).size, 1600)
assert.equal(new Set(sourceMap.entries.map((entry) => entry.sourceOrder)).size, 1600)
assert.deepEqual(
  sourceMap.entries.slice(0, 30).map((entry) => entry.headword),
  [
    'a / an', 'about', 'accept', 'achieve', 'across', 'active', 'advice', 'afford', 'afraid',
    'against', 'agree', 'all', 'allow', 'alone', 'along', 'angry', 'another', 'answer',
    'appear', 'around', 'arrive', 'as', 'ask', 'at', 'attend', 'attention', 'avoid', 'away',
    'back', 'bad',
  ],
)
for (const [index, group] of sourceMap.groups.entries()) {
  assert.equal(group.groupNumber, index + 1)
  assert.ok(group.entryCount > 0)
  assert.equal(group.endOrder - group.startOrder + 1, group.entryCount)
}

assert.equal(sourceLedger.schemaVersion, 'wanwei-page-review-ledger-v1')
assert.equal(sourceLedger.source.pdfSha256, '3d5ab48d5a97131b9844f9195e0f6387eb0a6b4147a8bb867b5f67276b8358c2')
assert.equal(sourceLedger.entries.length, 1600)
assert.equal(sourceLedger.counts.total, 1600)
assert.equal(sourceLedger.counts.approved, 1600)
assert.equal(sourceLedger.counts.blocked, 0)
assert.ok(sourceLedger.evidencePages.length >= 228)
assert.equal(sourceLedger.companionSources[0].pdfSha256, '287cf5218cd443815b94ef44920d5338cbac79fbea4e99d44c8820d62792a875')
assert.equal(sourceLedger.companionSources[0].editionCorrespondence.verdict, 'matched')
for (const binding of Object.values(sourceLedger.contentBindings)) {
  const bytes = readFileSync(new URL(`../${binding.path}`, import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), binding.sha256)
}
assert.equal(new Set(sourceLedger.entries.map((entry) => entry.entryId)).size, 1600)
assert.equal(new Set(sourceLedger.entries.map((entry) => entry.sourceOrder)).size, 1600)
for (const [index, receipt] of sourceLedger.entries.entries()) {
  const source = sourceMap.entries[index]
  assert.equal(receipt.entryId, source.id)
  assert.equal(receipt.headword, source.headword)
  assert.equal(receipt.sourceOrder, index + 1)
  assert.equal(receipt.printedPage, source.printedPage)
  assert.equal(receipt.pdfPage, source.printedPage + 17)
  assert.match(receipt.pageImageSha256, /^[a-f0-9]{64}$/u)
  for (const check of ['identity', 'order', 'page', 'phonetic', 'pos', 'meanings']) {
    assert.equal(receipt.checks[check], true, `Source receipt ${receipt.sourceOrder} ${receipt.headword} failed ${check}`)
  }
  assert.equal(receipt.verdict, 'approved', `Source receipt ${receipt.sourceOrder} ${receipt.headword} is not approved`)
  assert.equal(source.verification, 'page-checked')
}

assert.equal(learningContent.generatedEntryCount, 1570)
assert.equal(learningContent.entries.length, 1570)
assert.deepEqual(learningContent.entries.map((entry) => entry.sourceOrder), Array.from({ length: 1570 }, (_, index) => index + 31))
assert.equal(new Set(learningContent.entries.map((entry) => entry.example.english.trim().toLowerCase())).size, 1570)
for (const entry of learningContent.entries) {
  const source = sourceMap.entries[entry.sourceOrder - 1]
  const receipt = sourceLedger.entries[entry.sourceOrder - 1]
  assert.equal(entry.id, source.id)
  assert.equal(entry.headword, source.headword)
  assert.equal(entry.phonetic, receipt.observedPhonetic)
  assert.equal(entry.partOfSpeech, receipt.observedPartOfSpeech)
  assert.equal(entry.example.reviewStatus, 'approved')
  assert.ok(entry.example.english.includes(entry.example.highlight))
  assert.ok(entry.syllables.length > 0)
}

assert.equal(americanPhonetics.schemaVersion, 'wanwei-american-phonetics-v1')
assert.equal(americanPhonetics.dialect, 'en-US')
assert.equal(americanPhonetics.source.revision, '74790861f652b15e4ac49015a90074ad62a27690')
assert.equal(americanPhonetics.source.sha256, '81917843c7f44ce2b094ac63873c2c7a4cf802040792c455ba3ca406891c3d22')
assert.equal(americanPhonetics.alignmentSource.revision, '43c3570eb3553bdd19fccd2bd0091534889af023')
assert.equal(americanPhonetics.alignmentSource.sha256, '2af6f154a5c363275f052d1f85acedef38ed185ca9745aa4314be77f6b70de67')
assert.equal(americanPhonetics.reviewSources[0].url, 'https://dictionary.cambridge.org/pronunciation/')
assert.equal(americanPhonetics.entries.length, 1600)
assert.equal(new Set(americanPhonetics.entries.map((entry) => entry.entryId)).size, 1600)
assert.equal(new Set(americanPhonetics.entries.map((entry) => entry.sourceOrder)).size, 1600)
for (const [index, entry] of americanPhonetics.entries.entries()) {
  const source = sourceMap.entries[index]
  const receipt = sourceLedger.entries[index]
  assert.equal(entry.entryId, source.id)
  assert.equal(entry.sourceOrder, index + 1)
  assert.equal(entry.headword, source.headword)
  assert.equal(entry.sourcePhonetic, receipt.observedPhonetic)
  assert.match(entry.phonetic, /^\/.+\/$/u)
  assert.ok(['syllables', 'forms'].includes(entry.pronunciationMode))
  assert.ok(Array.isArray(entry.parts) && entry.parts.length > 0)
  for (const part of entry.parts) {
    assert.ok(String(part.spelling).trim())
    assert.match(part.phonetic, /^\/.+\/$/u)
    assert.doesNotMatch(part.phonetic, /(?:əʊ|ɒ|ɛ|\(r\)|ɹ|ɫ|ɝ|ɚ|ːː)/u)
  }
  assert.doesNotMatch(entry.phonetic, /(?:əʊ|ɒ|ɛ|\(r\)|ɹ|ɫ|ɝ|ɚ|ːː)/u)
  assert.ok(countIpaToken(entry.sourcePhonetic, 'iː') <= countIpaToken(entry.phonetic, 'iː'), `Missing iː length: ${entry.sourceOrder} ${entry.headword}`)
  assert.ok(countIpaToken(entry.sourcePhonetic, 'uː') <= countIpaToken(entry.phonetic, 'uː'), `Missing uː length: ${entry.sourceOrder} ${entry.headword}`)
  assert.ok(countIpaToken(entry.sourcePhonetic, 'ɜː') <= countIpaToken(entry.phonetic, 'ɜːr'), `Missing rhotic ɜːr: ${entry.sourceOrder} ${entry.headword}`)
  assert.ok(
    countIpaToken(entry.sourcePhonetic, 'ʌ') <= countIpaToken(entry.phonetic, 'ʌ') + countIpaToken(entry.phonetic, 'ɜːr'),
    `Missing STRUT or stressed rhotic vowel: ${entry.sourceOrder} ${entry.headword}`,
  )
  assert.ok(countIpaToken(entry.sourcePhonetic, 'eə') <= countIpaToken(entry.phonetic, 'er'), `Missing rhotic SQUARE vowel: ${entry.sourceOrder} ${entry.headword}`)
  if (entry.sourcePhonetic.includes('ɒ')) assert.doesNotMatch(entry.phonetic, /[ɑɔ](?!ː)/u, `Unmarked AmE LOT length: ${entry.sourceOrder} ${entry.headword}`)
  if (entry.sourcePhonetic.includes('(r)')) assert.match(entry.phonetic, /r/u)
  for (const variant of entry.phonetic.slice(1, -1).split(';')) {
    assert.ok((variant.match(/ˈ/gu) ?? []).length <= 1, `Multiple primary stresses: ${entry.sourceOrder} ${entry.headword}`)
  }
}
assert.equal(americanPhonetics.entries[1].phonetic, '/əˈbaʊt/')
assert.equal(americanPhonetics.entries[6].phonetic, '/ədˈvaɪs/')
assert.equal(americanPhonetics.entries[17].phonetic, '/ˈænsər/')
assert.deepEqual(americanPhonetics.entries[2].parts, [
  { spelling: 'ac', phonetic: '/ək/' },
  { spelling: 'cept', phonetic: '/ˈsept/' },
])
assert.equal(americanPhonetics.entries[482].phonetic, '/əˈkɔːrdɪŋ tə/')
assert.equal(americanPhonetics.entries[1102].parts[0].phonetic, '/ˈsɜːr/')
assert.deepEqual(americanPhonetics.entries[1311].parts.map((part) => part.spelling), ['choc', 'olate'])
assert.deepEqual(americanPhonetics.entries[1471].parts.map((part) => part.spelling), ['op', 'era'])
assert.equal(americanPhonetics.entries[25].phonetic, '/əˈtenʃən/')
assert.equal(americanPhonetics.entries[55].phonetic, '/ˈseləbreɪt/')
assert.equal(americanPhonetics.entries[167].phonetic, '/ˈhæbɪt/')
assert.equal(americanPhonetics.entries[471].phonetic, '/wɜːrk/')
assert.equal(americanPhonetics.entries[552].phonetic, '/bɜːrd/')
assert.equal(americanPhonetics.entries[1050].phonetic, '/ʃʌt/')
assert.equal(americanPhonetics.entries[1068].phonetic, '/sɑːk/')
assert.equal(americanPhonetics.entries[1078].phonetic, '/sper/')
assert.equal(americanPhonetics.entries[1080].phonetic, '/spiːd/')
assert.equal(americanPhonetics.entries[1102].phonetic, '/ˈsɜːrfɪs/')
assert.equal(americanPhonetics.entries[1114].phonetic, '/tekˈnɑːlədʒi/')
assert.equal(americanPhonetics.entries[1142].phonetic, '/təˈmeɪtoʊ/')
assert.equal(americanPhonetics.entries[1232].phonetic, '/rɔːŋ/')
assert.equal(americanPhonetics.entries[1237].phonetic, '/juː/')
assert.equal(americanPhonetics.entries[876].phonetic, '/ˈmoʊbəl/')
assert.equal(americanPhonetics.entries[817].phonetic, '/ˈkɪtʃən/')
assert.equal(americanPhonetics.entries[1165].phonetic, '/ˈtiː ˌʃɜːrt/')
assert.equal(americanPhonetics.entries[969].phonetic, '/ˈprɑːˌɡres/')
assert.equal(americanPhonetics.entries[1496].phonetic, '/ˈpoʊəm/')
assert.equal(americanPhonetics.entries[1497].phonetic, '/ˈpoʊət/')
assert.equal(americanPhonetics.entries[1576].phonetic, '/ˈjuːnəfɔːrm/')

assert.equal(audioScript.voice, 'eqb-british-teacher-v1')
assert.equal(audioScript.entries.length, 1600)
assert.equal(new Set(audioScript.entries.map((entry) => entry.id)).size, 1600)
for (const [index, entry] of audioScript.entries.entries()) {
  assert.equal(entry.id, sourceMap.entries[index].id)
  assert.equal(entry.headword, sourceMap.entries[index].headword)
  assert.ok(entry.audio.text.trim())
  assert.doesNotMatch(entry.audio.text, /(?:\bpl\.|\bAmE\b|=)/u)
}
assert.equal(audioScript.entries[0].audio.text, 'a, an')
assert.equal(audioScript.entries[819].audio.text, 'knife, knives')

assert.equal(voiceProfile.voiceId, 'eqb-british-teacher-v1')
assert.equal(voiceProfile.accent, 'american')
assert.equal(voiceProfile.identity.kind, 'synthetic')
assert.equal(voiceProfile.identity.imitatesRealPerson, false)
assert.equal(voiceProfile.ownerApproval.status, 'approved')
assert.equal(voiceProfile.runtime.name, 'mlx-audio')
assert.equal(voiceProfile.runtime.version, '0.4.7')
assert.equal(voiceProfile.base.revision, '34ff5318365b59cba9c03ff729f2eee0814caf72')
assert.match(voiceProfile.base.modelSha256, /^[a-f0-9]{64}$/u)
assert.match(voiceProfile.reference.sha256, /^[a-f0-9]{64}$/u)
assert.equal(voiceProfile.reference.durationSeconds, 3.8)
assert.equal(voiceProfile.reference.sourceExcerpt.referenceText, 'Good morning. Today we are learning a few useful words.')
const referenceBytes = readFileSync(new URL(`../${voiceProfile.reference.path}`, import.meta.url))
assert.equal(referenceBytes.length, voiceProfile.reference.bytes)
assert.equal(createHash('sha256').update(referenceBytes).digest('hex'), voiceProfile.reference.sha256)
const sourceReferenceBytes = readFileSync(new URL(`../${voiceProfile.sourceReference.path}`, import.meta.url))
assert.equal(sourceReferenceBytes.length, voiceProfile.sourceReference.bytes)
assert.equal(createHash('sha256').update(sourceReferenceBytes).digest('hex'), voiceProfile.sourceReference.sha256)

assert.equal(audioGoldenSet.voice, 'eqb-british-teacher-v1')
assert.equal(voiceProfile.goldenWordGate.status, 'approved')
assert.equal(voiceProfile.goldenWordGate.formalAssetChecks.verdict, 'passed')
assert.equal(voiceProfile.goldenWordGate.ownerAuditoryReview.status, 'approved')
assert.equal(audioGoldenSet.entries.length, 56)
assert.equal(new Set(audioGoldenSet.entries.map((entry) => entry.entryId)).size, 56)
assert.deepEqual(
  Object.fromEntries(Object.entries(Object.groupBy(audioGoldenSet.entries, (entry) => entry.riskCategory)).map(([key, entries]) => [key, entries.length])),
  { 'ultra-short': 11, 'british-vowel': 14, heteronym: 16, forms: 10, abbreviation: 5 },
)
for (const entry of audioGoldenSet.entries) {
  const source = sourceMap.entries[entry.sourceOrder - 1]
  assert.equal(entry.entryId, source.id)
  assert.equal(entry.headword, source.headword)
  assert.equal(entry.audioText, audioScript.entries[entry.sourceOrder - 1].audio.text)
  assert.ok(entry.phonetic && entry.teachingSense)
}

assert.equal(visualManifest.entries.length, 1600)
assert.equal(new Set(visualManifest.entries.map((entry) => entry.entryId)).size, 1600)
assert.equal(new Set(visualManifest.entries.map((entry) => entry.slug)).size, 1600)
assert.equal(new Set(visualManifest.entries.map((entry) => entry.sha256)).size, 1600)
for (const [index, entry] of visualManifest.entries.entries()) {
  assert.equal(entry.entryId, sourceMap.entries[index].id)
  assert.equal(entry.headword, sourceMap.entries[index].headword)
  assert.match(entry.alt, /[\u3400-\u9fff]/u)
  assert.equal(entry.version, 'koboyo-v1')
  const assetUrl = new URL(`../app/public${entry.path}`, import.meta.url)
  const bytes = readFileSync(assetUrl)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
  const svg = bytes.toString('utf8')
  assert.match(svg, /\bviewBox=/u)
  assert.match(svg, /currentColor/u)
  assert.doesNotMatch(svg, /<image\b[^>]*(?:href|xlink:href)="https?:/iu)
}

const root = mkdtempSync(path.join(tmpdir(), 'eqb-vocabulary-closed-loop-'))
const bankDb = new DatabaseSync(path.join(root, 'question-bank.sqlite'))
const userDb = new DatabaseSync(path.join(root, 'user-data.sqlite'))
bankDb.exec('PRAGMA foreign_keys = ON')
userDb.exec('PRAGMA foreign_keys = ON')
ensureSharedVocabularyShape(bankDb)
ensureUserVocabularyShape(userDb)

const entries = ['catch', 'celebrate', 'courage'].map((headword, index) => ({
  id: `wanwei-${index === 2 ? 'basic' : 'core'}-${String(index + 1).padStart(4, '0')}-${headword}`,
  groupId: index === 2 ? 'wanwei-basic-day-2' : 'wanwei-core-day-1',
  headword,
  phonetic: `/${headword}/`,
  partOfSpeech: index === 2 ? 'n.' : 'v.',
  sourceMeanings: [`${headword} 来源释义`],
  teachingSense: `${headword} 教学释义`,
  pronunciationMode: 'syllables',
  syllables: [headword],
  example: {
    english: `We use ${headword} in class.`,
    chinese: `我们在课堂上使用 ${headword}。`,
    highlight: headword,
    reviewStatus: 'approved',
  },
  visual: {
    key: `visual-${headword}`,
    version: 'koboyo-v1',
    path: `/vocabulary-assets/wanwei-round-one-v1/${headword}.svg`,
    alt: `${headword} 的清晰教学场景`,
  },
  audio: {
    key: `audio-${headword}`,
    version: 'eqb-british-teacher-v1',
    path: `/vocabulary-assets/wanwei-round-one-v1/audio/${headword}.mp3`,
    voice: 'eqb-british-teacher-v1',
  },
  source: {
    stage: index === 2 ? 'basic' : 'core',
    day: index === 2 ? 2 : 1,
    sourceOrder: index + 1,
    printedPage: 1,
    verification: 'page-checked',
  },
}))

replaceVocabularyProgram(bankDb, {
  id: 'wanwei-round-one-v1',
  version: '2026-08-07-v1',
  title: '中考词汇一轮',
  subtitle: '测试词汇课程',
  sourceTitle: '万唯系列中考词汇一轮梳理',
  sourceEdition: '第8版',
  totalPlannedEntries: 1600,
  groups: [
    {
      id: 'wanwei-core-day-1',
      stage: 'core',
      week: 1,
      group: 1,
      sourceLabel: 'Day 1',
      startOrder: 1,
      endOrder: 2,
    },
    {
      id: 'wanwei-basic-day-2',
      stage: 'basic',
      week: 1,
      group: 2,
      sourceLabel: 'Day 2',
      startOrder: 3,
      endOrder: 3,
    },
  ],
  entries,
})

const storedProgram = getVocabularyProgram(bankDb, 'wanwei-round-one-v1')
assert.equal(storedProgram.entries[0].source.title, storedProgram.sourceTitle)
assert.equal(storedProgram.entries[0].source.edition, storedProgram.sourceEdition)

const dbs = { bankDb, userDb }
const [defaultStudentA] = listVocabularyStudents(userDb, 'teacher-a')
const [defaultStudentB] = listVocabularyStudents(userDb, 'teacher-b')
assert.equal(defaultStudentA.displayName, '默认学生')
assert.equal(defaultStudentB.displayName, '默认学生')
const studentA = createVocabularyStudent(userDb, 'teacher-a', { displayName: '小林' })
const studentB = createVocabularyStudent(userDb, 'teacher-a', { displayName: '小周' })
assert.deepEqual(listVocabularyStudents(userDb, 'teacher-a').map((student) => student.displayName).sort(), ['小周', '小林', '默认学生'].sort())
assert.throws(() => createVocabularyStudent(userDb, 'teacher-a', { displayName: ' 小林 ' }), /同名学生/)
assert.throws(() => createVocabularyStudent(userDb, 'teacher-a', { displayName: '小林🙂' }), /Emoji/)
assert.throws(() => createVocabularyReviewRun(dbs, 'teacher-b', {
  studentId: studentA.id,
  programId: 'wanwei-round-one-v1',
  targetUnfamiliarCount: 2,
  mode: 'main',
}), /学生档案不存在/)
let run = createVocabularyReviewRun(dbs, 'teacher-a', {
  studentId: studentA.id,
  programId: 'wanwei-round-one-v1',
  targetUnfamiliarCount: 2,
  mode: 'main',
})
assert.equal(run.cursor, 0)
assert.equal(run.targetUnfamiliarCount, 2)
assert.equal(run.studentId, studentA.id)
assert.equal(getCurrentVocabularyReviewRun(userDb, 'teacher-a', studentA.id, 'wanwei-round-one-v1').id, run.id)
assert.equal(createVocabularyReviewRun(dbs, 'teacher-a', {
  studentId: studentA.id,
  programId: 'wanwei-round-one-v1',
  targetUnfamiliarCount: 3,
  mode: 'main',
}).id, run.id)
assert.equal(userDb.prepare(`
  SELECT COUNT(*) AS count FROM vocabulary_review_runs
  WHERE user_id = ? AND student_id = ? AND program_id = ? AND status <> 'frozen'
`).get('teacher-a', studentA.id, 'wanwei-round-one-v1').count, 1)

run = decideVocabularyReviewEntry(dbs, 'teacher-a', run.id, { entryId: entries[0].id, verdict: 'unfamiliar' })
assert.equal(run.cursor, 1)
assert.equal(run.status, 'active')
run = decideVocabularyReviewEntry(dbs, 'teacher-a', run.id, { entryId: entries[1].id, verdict: 'known' })
assert.equal(run.cursor, 2)

run = undoVocabularyReviewDecision(dbs, 'teacher-a', run.id)
assert.equal(run.cursor, 1)
assert.equal(run.decisions[entries[1].id], undefined)
run = decideVocabularyReviewEntry(dbs, 'teacher-a', run.id, { entryId: entries[1].id, verdict: 'unfamiliar' })
assert.equal(run.status, 'target_reached')

const progress = getVocabularyProgress(userDb, 'teacher-a', studentA.id, 'wanwei-round-one-v1')
assert.deepEqual({ cursor: progress.cursor, lastTarget: progress.lastTarget }, { cursor: 2, lastTarget: 2 })
assert.deepEqual(getVocabularyProgress(userDb, 'teacher-a', studentB.id, 'wanwei-round-one-v1').cursor, 0)
assert.deepEqual(getVocabularyProgress(userDb, 'teacher-b', defaultStudentB.id, 'wanwei-round-one-v1').cursor, 0)

const vocabularySet = freezeVocabularySet(dbs, 'teacher-a', run.id)
assert.equal(vocabularySet.entryCount, 2)
assert.equal(vocabularySet.studentId, studentA.id)
assert.deepEqual(vocabularySet.entries.map((entry) => entry.id), [entries[0].id, entries[1].id])
assert.deepEqual(vocabularySet.entries[0].sourceMeanings, entries[0].sourceMeanings)
assert.equal(getCurrentVocabularyReviewRun(userDb, 'teacher-a', studentA.id, 'wanwei-round-one-v1'), null)

const disposableRun = createVocabularyReviewRun(dbs, 'teacher-a', {
  studentId: studentA.id,
  programId: 'wanwei-round-one-v1',
  targetUnfamiliarCount: 2,
  mode: 'temporary',
  temporaryDay: 1,
})
assert.equal(getCurrentVocabularyReviewRun(userDb, 'teacher-a', studentA.id, 'wanwei-round-one-v1').id, disposableRun.id)
assert.deepEqual(discardVocabularyReviewRun(userDb, 'teacher-a', disposableRun.id), { ok: true })
assert.equal(getCurrentVocabularyReviewRun(userDb, 'teacher-a', studentA.id, 'wanwei-round-one-v1'), null)
const replacementRun = createVocabularyReviewRun(dbs, 'teacher-a', {
  studentId: studentA.id,
  programId: 'wanwei-round-one-v1',
  targetUnfamiliarCount: 2,
  mode: 'temporary',
  temporaryDay: 1,
})
assert.notEqual(replacementRun.id, disposableRun.id)
discardVocabularyReviewRun(userDb, 'teacher-a', replacementRun.id)

const progressBeforeDirectSet = getVocabularyProgress(userDb, 'teacher-a', studentA.id, 'wanwei-round-one-v1')
const reviewRunCountBeforeDirectSet = userDb.prepare('SELECT COUNT(*) AS count FROM vocabulary_review_runs').get().count
const decisionCountBeforeDirectSet = userDb.prepare('SELECT COUNT(*) AS count FROM vocabulary_review_decisions').get().count
const directSet = createVocabularySetFromEntries(dbs, 'teacher-a', {
  studentId: studentA.id,
  programId: 'wanwei-round-one-v1',
  entryIds: [entries[2].id, entries[0].id, entries[2].id],
})
assert.equal(directSet.title, '输入词表 · 2词')
assert.equal(directSet.reviewRunId, null)
assert.equal(directSet.studentId, studentA.id)
assert.deepEqual(directSet.entries.map((entry) => entry.id), [entries[2].id, entries[0].id])
const renamedDirectSet = renameVocabularySet(userDb, 'teacher-a', directSet.id, { title: '小林第1周生词' })
assert.equal(renamedDirectSet.title, '小林第1周生词')
assert.equal(getVocabularySet(userDb, 'teacher-a', directSet.id).title, '小林第1周生词')
assert.throws(() => renameVocabularySet(userDb, 'teacher-a', directSet.id, { title: '' }), /名称不能为空/)
assert.throws(() => renameVocabularySet(userDb, 'teacher-b', directSet.id, { title: '越权改名' }), /生词集不存在/)
assert.deepEqual(getVocabularyProgress(userDb, 'teacher-a', studentA.id, 'wanwei-round-one-v1'), progressBeforeDirectSet)
assert.equal(userDb.prepare('SELECT COUNT(*) AS count FROM vocabulary_review_runs').get().count, reviewRunCountBeforeDirectSet)
assert.equal(userDb.prepare('SELECT COUNT(*) AS count FROM vocabulary_review_decisions').get().count, decisionCountBeforeDirectSet)
assert.throws(() => getVocabularySet(userDb, 'teacher-b', directSet.id), /生词集不存在/)
assert.throws(() => createVocabularySetFromEntries(dbs, 'teacher-a', {
  studentId: studentA.id,
  programId: 'wanwei-round-one-v1',
  entryIds: ['not-in-program'],
}), /不属于当前1600词库/)
assert.throws(() => createVocabularySetFromEntries(dbs, 'teacher-a', {
  studentId: studentA.id,
  programId: 'wanwei-round-one-v1',
  entryIds: [],
}), /1–60/)
assert.deepEqual(listVocabularySets(userDb, 'teacher-a', studentA.id).map((set) => set.id).sort(), [directSet.id, vocabularySet.id].sort())
assert.deepEqual(listVocabularySets(userDb, 'teacher-a', studentB.id), [])

bankDb.prepare("UPDATE vocabulary_entries SET teaching_sense = '后来修改的释义' WHERE id = ?").run(entries[0].id)
assert.equal(getVocabularySet(userDb, 'teacher-a', vocabularySet.id).entries[0].teachingSense, entries[0].teachingSense)
assert.throws(() => getVocabularySet(userDb, 'teacher-b', vocabularySet.id), /生词集不存在/)
assert.equal(getVocabularySetForReviewRun(userDb, 'teacher-a', run.id).id, vocabularySet.id)
assert.throws(() => getVocabularySetForReviewRun(userDb, 'teacher-b', run.id), /已冻结的生词组不存在/)

const share = shareVocabularySet(userDb, 'teacher-a', vocabularySet.id)
assert.match(share.shareId, /^[A-Za-z0-9_-]{32}$/)
const snapshotRow = userDb.prepare(`
  SELECT order_index, snapshot_json FROM vocabulary_set_entries WHERE set_id = ? ORDER BY order_index LIMIT 1
`).get(vocabularySet.id)
const originalSnapshot = JSON.parse(snapshotRow.snapshot_json)
const { sourceMeanings: _legacyMissingMeanings, ...legacySnapshot } = originalSnapshot
userDb.prepare('UPDATE vocabulary_set_entries SET snapshot_json = ? WHERE set_id = ? AND order_index = ?')
  .run(JSON.stringify(legacySnapshot), vocabularySet.id, snapshotRow.order_index)
assert.deepEqual(getVocabularySet(userDb, 'teacher-a', vocabularySet.id).entries[0].sourceMeanings, [entries[0].teachingSense])
userDb.prepare('UPDATE vocabulary_set_entries SET snapshot_json = ? WHERE set_id = ? AND order_index = ?')
  .run(JSON.stringify({ ...originalSnapshot, futureInternalField: 'must-not-leak' }), vocabularySet.id, snapshotRow.order_index)
const publicSet = getPublicVocabularyShare(userDb, share.shareId)
assert.equal(publicSet.status, 'active')
assert.equal(publicSet.set.entries.length, 2)
assert.equal('userId' in publicSet.set, false)
assert.equal('studentId' in publicSet.set, false)
assert.equal('reviewRunId' in publicSet.set, false)
assert.equal('example' in publicSet.set.entries[0], false)
assert.equal('sourceMeanings' in publicSet.set.entries[0], false)
assert.equal('futureInternalField' in publicSet.set.entries[0], false)
userDb.prepare('UPDATE vocabulary_set_entries SET snapshot_json = ? WHERE set_id = ? AND order_index = ?')
  .run('{broken', vocabularySet.id, snapshotRow.order_index)
assert.throws(() => getVocabularySet(userDb, 'teacher-a', vocabularySet.id), /冻结快照已损坏/)
assert.throws(() => shareVocabularySet(userDb, 'teacher-a', vocabularySet.id), /冻结快照已损坏/)
assert.throws(() => getPublicVocabularyShare(userDb, share.shareId), /冻结快照已损坏/)
userDb.prepare('UPDATE vocabulary_set_entries SET snapshot_json = ? WHERE set_id = ? AND order_index = ?')
  .run(JSON.stringify(originalSnapshot), vocabularySet.id, snapshotRow.order_index)

const missingSnapshot = userDb.prepare(`
  SELECT entry_id, order_index, snapshot_json FROM vocabulary_set_entries WHERE set_id = ? ORDER BY order_index DESC LIMIT 1
`).get(vocabularySet.id)
userDb.prepare('DELETE FROM vocabulary_set_entries WHERE set_id = ? AND order_index = ?')
  .run(vocabularySet.id, missingSnapshot.order_index)
assert.throws(() => getVocabularySet(userDb, 'teacher-a', vocabularySet.id), /冻结快照不完整/)
assert.throws(() => shareVocabularySet(userDb, 'teacher-a', vocabularySet.id), /冻结快照不完整/)
userDb.prepare(`
  INSERT INTO vocabulary_set_entries (set_id, entry_id, order_index, snapshot_json) VALUES (?, ?, ?, ?)
`).run(vocabularySet.id, missingSnapshot.entry_id, missingSnapshot.order_index, missingSnapshot.snapshot_json)

revokeVocabularyShare(userDb, 'teacher-a', vocabularySet.id)
assert.equal(getPublicVocabularyShare(userDb, share.shareId).status, 'revoked')
const reshared = shareVocabularySet(userDb, 'teacher-a', vocabularySet.id)
assert.notEqual(reshared.shareId, share.shareId)
assert.equal(getPublicVocabularyShare(userDb, share.shareId).status, 'not_found')
assert.equal(getPublicVocabularyShare(userDb, reshared.shareId).status, 'active')

let continuousDayRun = createVocabularyReviewRun(dbs, 'teacher-a', {
  studentId: studentB.id,
  programId: 'wanwei-round-one-v1',
  targetUnfamiliarCount: 60,
  mode: 'temporary',
  temporaryDay: 1,
})
for (const entry of entries.slice(0, 2)) {
  continuousDayRun = decideVocabularyReviewEntry(dbs, 'teacher-a', continuousDayRun.id, {
    entryId: entry.id,
    verdict: 'known',
  })
}
assert.equal(continuousDayRun.status, 'active')
continuousDayRun = decideVocabularyReviewEntry(dbs, 'teacher-a', continuousDayRun.id, {
  entryId: entries[2].id,
  verdict: 'known',
})
assert.equal(continuousDayRun.status, 'program_exhausted')
discardVocabularyReviewRun(userDb, 'teacher-a', continuousDayRun.id)

let continuousStageRun = createVocabularyReviewRun(dbs, 'teacher-a', {
  studentId: defaultStudentA.id,
  programId: 'wanwei-round-one-v1',
  targetUnfamiliarCount: 60,
  mode: 'temporary',
  temporaryStage: 'core',
})
for (const entry of entries.slice(0, 2)) {
  continuousStageRun = decideVocabularyReviewEntry(dbs, 'teacher-a', continuousStageRun.id, {
    entryId: entry.id,
    verdict: 'known',
  })
}
assert.equal(continuousStageRun.status, 'active')
continuousStageRun = decideVocabularyReviewEntry(dbs, 'teacher-a', continuousStageRun.id, {
  entryId: entries[2].id,
  verdict: 'known',
})
assert.equal(continuousStageRun.status, 'program_exhausted')
discardVocabularyReviewRun(userDb, 'teacher-a', continuousStageRun.id)

let temporaryRun = createVocabularyReviewRun(dbs, 'teacher-a', {
  studentId: studentA.id,
  programId: 'wanwei-round-one-v1',
  targetUnfamiliarCount: 60,
  mode: 'temporary',
  temporaryStage: 'core',
  temporaryDay: 1,
})
for (const entry of entries) {
  temporaryRun = decideVocabularyReviewEntry(dbs, 'teacher-a', temporaryRun.id, {
    entryId: entry.id,
    verdict: 'known',
  })
}
assert.equal(temporaryRun.status, 'program_exhausted')
temporaryRun = undoVocabularyReviewDecision(dbs, 'teacher-a', temporaryRun.id)
assert.equal(temporaryRun.cursor, 2)
assert.equal(temporaryRun.status, 'active')
temporaryRun = decideVocabularyReviewEntry(dbs, 'teacher-a', temporaryRun.id, {
  entryId: entries[2].id,
  verdict: 'unfamiliar',
})
assert.equal(temporaryRun.status, 'program_exhausted')
const exhaustedTemporarySet = freezeVocabularySet(dbs, 'teacher-a', temporaryRun.id)
assert.deepEqual(exhaustedTemporarySet.entries.map((entry) => entry.id), [entries[2].id])
assert.equal(getVocabularyProgress(userDb, 'teacher-a', studentA.id, 'wanwei-round-one-v1').cursor, 2)

bankDb.close()
userDb.close()
rmSync(root, { recursive: true, force: true })

console.log('PASS: 1600 source receipts, reviewed learning content, unique Koboyo visuals, audio script, and isolated persistence contracts')
assert.ok(audioManifest, 'eqb-british-teacher-v1 audio manifest is missing; generate all 1600 formal MP3 assets before QA Ready')
assert.equal(audioManifest.voice, 'eqb-british-teacher-v1')
assert.equal(audioManifest.format, 'audio-24khz-48kbitrate-mono-mp3')
assert.equal(audioManifest.version, 'eqb-british-teacher-v1')
assert.equal(audioManifest.entries.length, 1600)
assert.equal(new Set(audioManifest.entries.map((entry) => entry.entryId)).size, 1600)
assert.equal(new Set(audioManifest.entries.map((entry) => entry.path)).size, 1600)
for (const [index, entry] of audioManifest.entries.entries()) {
  assert.equal(entry.entryId, sourceMap.entries[index].id)
  assert.equal(entry.text, audioScript.entries[index].audio.text)
  assert.equal(entry.voice, 'eqb-british-teacher-v1')
  assert.equal(entry.format, 'audio-24khz-48kbitrate-mono-mp3')
  assert.equal(entry.version, 'eqb-british-teacher-v1')
  assert.equal(entry.codec, 'mp3')
  assert.equal(entry.sampleRate, 24000)
  assert.equal(entry.channels, 1)
  assert.equal(entry.bitrate, 48000)
  assert.ok(entry.durationSeconds >= 0.15 && entry.durationSeconds <= 15)
  assert.ok(entry.peak >= 0.02)
  assert.ok(entry.rms >= 0.002)
  assert.ok(entry.leadingSilenceSeconds >= 0 && entry.leadingSilenceSeconds <= 0.35)
  assert.ok(entry.trailingSilenceSeconds >= 0 && entry.trailingSilenceSeconds <= 0.35)
  const assetUrl = new URL(`../app/public/vocabulary-assets/wanwei-round-one-v1/audio/${entry.version}/${entry.path}`, import.meta.url)
  const bytes = readFileSync(assetUrl)
  assert.equal(bytes.length, entry.bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
  assert.ok(bytes.length >= 128)
  assert.ok(bytes.subarray(0, 3).toString('ascii') === 'ID3' || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
}
for (const goldenEntry of audioGoldenSet.entries) {
  assert.ok(audioManifest.entries.some((entry) => entry.entryId === goldenEntry.entryId))
}
console.log('PASS: 1600 formal Qwen MP3 assets match codec, acoustic, identity, and hash contracts')
assert.ok(britishAudioManifest, 'eqb-british-cori-high-v1 audio manifest is missing')
assert.equal(britishVoiceProfile.voiceId, 'eqb-british-cori-high-v1')
assert.equal(britishVoiceProfile.accent, 'british')
assert.equal(britishVoiceProfile.identity.kind, 'synthetic')
assert.equal(britishVoiceProfile.identity.imitatesRealPerson, false)
assert.equal(britishVoiceProfile.ownerApproval.status, 'approved')
assert.equal(britishVoiceProfile.ownerQa.entryCount, 1600)
assert.deepEqual(britishVoiceProfile.ownerQa.lineageCounts, { 'owner-pass': 1525, 'repair-75': 69, 'repair-6': 4, 'repair-2': 2 })
const britishReferenceBytes = readFileSync(new URL(`../${britishVoiceProfile.reference.path}`, import.meta.url))
assert.equal(britishReferenceBytes.length, britishVoiceProfile.reference.bytes)
assert.equal(createHash('sha256').update(britishReferenceBytes).digest('hex'), britishVoiceProfile.reference.sha256)
assert.equal(britishAudioReceipt.verdict, 'passed')
assert.equal(britishAudioReceipt.entryCount, 1600)
assert.equal(britishAudioReceipt.uniqueEntryIds, 1600)
assert.equal(britishAudioReceipt.uniquePaths, 1600)
assert.equal(britishAudioReceipt.uniqueHashes, 1600)
assert.deepEqual(britishAudioReceipt.lineageCounts, { 'owner-pass': 1525, 'repair-75': 69, 'repair-6': 4, 'repair-2': 2 })
assert.equal(createHash('sha256').update(britishAudioManifestBytes).digest('hex'), britishAudioReceipt.manifestSha256)
assert.equal(britishAudioManifest.voice, 'eqb-british-cori-high-v1')
assert.equal(britishAudioManifest.accent, 'british')
assert.equal(britishAudioManifest.version, 'eqb-british-cori-high-v1')
assert.equal(britishAudioManifest.entries.length, 1600)
assert.equal(new Set(britishAudioManifest.entries.map((entry) => entry.entryId)).size, 1600)
assert.equal(new Set(britishAudioManifest.entries.map((entry) => entry.path)).size, 1600)
assert.equal(new Set(britishAudioManifest.entries.map((entry) => entry.sha256)).size, 1600)
assert.deepEqual(Object.fromEntries(Object.entries(Object.groupBy(britishAudioManifest.entries, (entry) => entry.lineage.stage)).map(([key, entries]) => [key, entries.length])), { 'owner-pass': 1525, 'repair-75': 69, 'repair-6': 4, 'repair-2': 2 })
for (const [index, entry] of britishAudioManifest.entries.entries()) {
  assert.equal(entry.entryId, sourceMap.entries[index].id)
  assert.equal(entry.text, audioScript.entries[index].audio.text)
  assert.equal(entry.path, `${entry.entryId}.mp3`)
  assert.equal(entry.voice, 'eqb-british-cori-high-v1')
  assert.equal(entry.version, 'eqb-british-cori-high-v1')
  assert.equal(entry.format, 'audio-24khz-48kbitrate-mono-mp3')
  assert.equal(entry.codec, 'mp3')
  assert.equal(entry.sampleRate, 24000)
  assert.equal(entry.channels, 1)
  assert.equal(entry.bitrate, 48000)
  assert.ok(entry.durationSeconds >= 0.6 && entry.durationSeconds <= 4.2)
  assert.ok(entry.peak >= 0.02)
  assert.ok(entry.rms >= 0.002)
  assert.ok(entry.leadingSilenceSeconds >= 0.24 && entry.leadingSilenceSeconds <= 0.9)
  assert.ok(entry.trailingSilenceSeconds >= 0.28 && entry.trailingSilenceSeconds <= 0.9)
  assert.ok(['owner-pass', 'repair-75', 'repair-6', 'repair-2'].includes(entry.lineage.stage))
  const assetUrl = new URL(`../app/public/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-cori-high-v1/${entry.path}`, import.meta.url)
  const bytes = readFileSync(assetUrl)
  assert.equal(bytes.length, entry.bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
  assert.ok(bytes.length >= 128)
  assert.ok(bytes.subarray(0, 3).toString('ascii') === 'ID3' || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
}
const britishReady = JSON.parse(readFileSync(new URL('../app/public/vocabulary-assets/wanwei-round-one-v1/audio/eqb-british-cori-high-v1/ready.json', import.meta.url)))
assert.deepEqual({
  version: britishReady.version,
  entryCount: britishReady.entryCount,
  fileNamePattern: britishReady.fileNamePattern,
  manifestSha256: britishReady.manifestSha256,
  ownerQa: britishReady.ownerQa,
}, {
  version: 'eqb-british-cori-high-v1',
  entryCount: 1600,
  fileNamePattern: '{entryId}.mp3',
  manifestSha256: britishAudioReceipt.manifestSha256,
  ownerQa: 'approved',
})
console.log('PASS: Owner-approved 1600-word Cori British assets preserve 1525 + 69 + 4 + 2 QA lineage and readiness contract')
console.log('PASS: Owner completed full American and British auditory review; automatic acoustic checks also passed')
console.log('PASS: vocabulary program, main/temporary review runs, frozen set, user isolation, public share, and revocation contracts')
