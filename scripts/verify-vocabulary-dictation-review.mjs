import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  createVocabularyDictationRecord,
  createVocabularyDictationTask,
  createVocabularySetFromEntries,
  createVocabularyStudent,
  ensureSharedVocabularyShape,
  ensureUserVocabularyShape,
  getPublicVocabularyShare,
  getPublicVocabularyDictationResource,
  getStudentVocabularyReviewStates,
  getSuggestedVocabularyReview,
  listVocabularySetLibrary,
  replaceVocabularyProgram,
  revokeVocabularyShare,
  restoreVocabularyDictationRecord,
  revokeVocabularyDictationTaskShare,
  shareVocabularyDictationTask,
  shareVocabularySet,
  updateStudentVocabularyWordFlag,
  updateVocabularyDictationRecord,
  voidVocabularyDictationRecord,
} from '../server/vocabulary/vocabularyStore.mjs'

function makeEntry(index) {
  const label = `word${String(index + 1).padStart(2, '0')}`
  return {
    id: `entry-${String(index + 1).padStart(2, '0')}`,
    groupId: 'group-1',
    headword: label,
    phonetic: `/${label}/`,
    partOfSpeech: 'n.',
    sourceMeanings: [`${label} 来源义`],
    teachingSense: `${label} 核心义`,
    pronunciationMode: 'syllables',
    syllables: [label],
    example: {
      english: `We learn ${label}.`,
      chinese: `我们学习 ${label}。`,
      highlight: label,
      reviewStatus: 'approved',
    },
    exampleCandidates: ['a', 'b', 'c'].map((candidateId) => ({
      candidateId,
      version: 'test-examples-v1',
      teachingSense: `${label} 核心义`,
      english: `We learn ${label} in example ${candidateId}.`,
      chinese: `我们在例句 ${candidateId} 中学习 ${label}。`,
      highlight: label,
      reviewStatus: 'approved',
    })),
    visual: {
      key: `visual-${label}`,
      version: 'test-visual-v1',
      path: `/vocabulary-assets/test/${label}.svg`,
      alt: `${label} 教学图`,
    },
    audio: {
      key: `audio-${label}`,
      version: 'eqb-british-teacher-v1',
      path: `/vocabulary-assets/test/${label}.mp3`,
      voice: 'eqb-british-teacher-v1',
    },
    source: {
      stage: 'core',
      day: 1,
      sourceOrder: index + 1,
      printedPage: 1,
      verification: 'page-checked',
    },
  }
}

const root = mkdtempSync(path.join(tmpdir(), 'eqb-vocabulary-dictation-review-'))
const bankDb = new DatabaseSync(path.join(root, 'question-bank.sqlite'))
const userDb = new DatabaseSync(path.join(root, 'user-data.sqlite'))
bankDb.exec('PRAGMA foreign_keys = ON')
userDb.exec('PRAGMA foreign_keys = ON')
ensureSharedVocabularyShape(bankDb)
ensureUserVocabularyShape(userDb)
ensureUserVocabularyShape(userDb)

const entries = Array.from({ length: 61 }, (_, index) => makeEntry(index))
replaceVocabularyProgram(bankDb, {
  id: 'wanwei-round-one-v1',
  version: 'dictation-review-test-v1',
  title: '万唯1600词',
  subtitle: '听写闭环测试',
  sourceTitle: '测试词表',
  sourceEdition: 'v1',
  totalPlannedEntries: 1600,
  groups: [{
    id: 'group-1',
    stage: 'core',
    week: 1,
    group: 1,
    sourceLabel: 'Day 1',
    startOrder: 1,
    endOrder: 61,
  }],
  entries,
})

const dbs = { userDb, bankDb }
const student = createVocabularyStudent(userDb, 'teacher-a', { displayName: '小林' })
const otherStudent = createVocabularyStudent(userDb, 'teacher-a', { displayName: '小周' })
const setA = createVocabularySetFromEntries(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  title: '第一组',
  entryIds: entries.slice(0, 40).map((entry) => entry.id),
})
const setB = createVocabularySetFromEntries(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  title: '第二组',
  entryIds: entries.slice(30).map((entry) => entry.id),
})
createVocabularySetFromEntries(dbs, 'teacher-a', {
  studentId: otherStudent.id,
  programId: 'wanwei-round-one-v1',
  title: '另一名学生的组',
  entryIds: [entries[0].id],
})

const firstSetShare = shareVocabularySet(userDb, 'teacher-a', setA.id)
userDb.exec('DROP TABLE vocabulary_share_history')
ensureUserVocabularyShape(userDb)
assert.equal(
  userDb.prepare('SELECT status FROM vocabulary_share_history WHERE share_id = ?').get(firstSetShare.shareId).status,
  'active',
  '升级必须把已有 Set 分享回填进永久 history',
)
assert.equal(getPublicVocabularyShare(userDb, firstSetShare.shareId).status, 'active')
revokeVocabularyShare(userDb, 'teacher-a', setA.id)
assert.equal(getPublicVocabularyShare(userDb, firstSetShare.shareId).status, 'revoked')
const renewedSetShare = shareVocabularySet(userDb, 'teacher-a', setA.id)
assert.notEqual(renewedSetShare.shareId, firstSetShare.shareId)
assert.equal(getPublicVocabularyShare(userDb, firstSetShare.shareId).status, 'revoked')
assert.equal(getPublicVocabularyDictationResource(userDb, firstSetShare.shareId).status, 'revoked')
const readOnlyUserDb = new DatabaseSync(path.join(root, 'user-data.sqlite'), { readOnly: true })
assert.equal(getPublicVocabularyShare(readOnlyUserDb, renewedSetShare.shareId).status, 'active')
assert.equal(getPublicVocabularyDictationResource(readOnlyUserDb, firstSetShare.shareId).status, 'revoked')
readOnlyUserDb.close()
assert.equal(
  userDb.prepare('SELECT COUNT(*) AS count FROM vocabulary_share_history WHERE set_id = ?').get(setA.id).count,
  2,
)

assert.throws(() => createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id, setB.id],
  title: '超过上限',
  accent: 'american',
}), /1–60/)
assert.throws(() => createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'unsupported-program-v1',
  entryIds: [entries[0].id],
  title: '越界课程',
  accent: 'american',
}), /首版只支持万唯1600词/)

const mergedOrder = [...entries.slice(0, 40), ...entries.slice(40, 60)].map((entry) => entry.id)
const firstTask = createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id, setB.id],
  entryIds: mergedOrder,
  title: '综合听写 1',
  accent: 'american',
})
const secondTask = createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setB.id],
  entryIds: [entries[60].id],
  title: '综合听写 2',
  accent: 'british',
})
assert.equal(firstTask.entryCount, 60)
assert.deepEqual(firstTask.entries.map((entry) => entry.id), mergedOrder)
assert.deepEqual(firstTask.entries[30].sourceSetIds, [setA.id, setB.id])
assert.equal(secondTask.entryCount, 1)

bankDb.prepare("UPDATE vocabulary_entries SET teaching_sense = '后来修改的词义' WHERE id = ?").run(entries[0].id)
assert.equal(firstTask.entries[0].teachingSense, entries[0].teachingSense)

const share = shareVocabularyDictationTask(userDb, 'teacher-a', firstTask.id)
const publicTask = getPublicVocabularyDictationResource(userDb, share.shareId)
assert.equal(publicTask.status, 'active')
assert.equal(publicTask.set.accent, 'american')
assert.equal(publicTask.set.entries.length, 60)
assert.equal(publicTask.set.entries[0].answer, entries[0].headword)
for (const key of ['studentId', 'userId', 'sourceSets', 'record', 'wrongSpelling']) {
  assert.equal(key in publicTask.set, false, `public task leaked ${key}`)
}
assert.throws(() => shareVocabularyDictationTask(userDb, 'teacher-b', firstTask.id), /听写任务不存在/)
revokeVocabularyDictationTaskShare(userDb, 'teacher-a', firstTask.id)
assert.equal(getPublicVocabularyDictationResource(userDb, share.shareId).status, 'revoked')
const renewedShare = shareVocabularyDictationTask(userDb, 'teacher-a', firstTask.id)
assert.notEqual(renewedShare.shareId, share.shareId)
assert.equal(getPublicVocabularyDictationResource(userDb, share.shareId).status, 'revoked')
assert.equal(
  userDb.prepare('SELECT COUNT(*) AS count FROM vocabulary_dictation_task_share_history WHERE task_id = ?').get(firstTask.id).count,
  2,
)

const task = createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id],
  entryIds: entries.slice(0, 3).map((entry) => entry.id),
  title: '三词复测',
  accent: 'british',
})
const targetEntryId = entries[0].id
assert.throws(() => createVocabularyDictationRecord(userDb, 'teacher-a', task.id, {
  mode: 'all',
  status: 'completed',
  dictationDate: '2026-02-30',
  results: [],
}), /听写日期必须是有效的 YYYY-MM-DD/)
const draft = createVocabularyDictationRecord(userDb, 'teacher-a', task.id, {
  mode: 'partial',
  status: 'draft',
  dictationDate: '2026-08-01',
  results: [{ entryId: targetEntryId, result: 'wrong', wrongSpelling: 'wrod01' }],
})
assert.deepEqual(draft.entries.map((entry) => entry.result), ['wrong', 'untested', 'untested'])
assert.deepEqual(getStudentVocabularyReviewStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1'), [])

updateVocabularyDictationRecord(userDb, 'teacher-a', draft.id, { status: 'completed' })
let states = getStudentVocabularyReviewStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states[0].status, 'pending')
assert.equal(states[0].lastWrongSpelling, 'wrod01')

const sameDayWrong = createVocabularyDictationRecord(userDb, 'teacher-a', task.id, {
  mode: 'partial',
  status: 'completed',
  dictationDate: '2026-08-01',
  results: [{ entryId: targetEntryId, result: 'wrong' }],
})
states = getStudentVocabularyReviewStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states[0].wrongDateCount, 1)
assert.equal(states[0].status, 'pending')

createVocabularyDictationRecord(userDb, 'teacher-a', task.id, {
  mode: 'partial',
  status: 'completed',
  dictationDate: '2026-08-02',
  results: [{ entryId: targetEntryId, result: 'wrong' }],
})
states = getStudentVocabularyReviewStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states[0].status, 'stubborn')
assert.equal(states[0].currentConsecutiveWrong, 3)

for (const date of ['2026-08-03', '2026-08-04']) {
  createVocabularyDictationRecord(userDb, 'teacher-a', task.id, {
    mode: 'partial',
    status: 'completed',
    dictationDate: date,
    results: [{ entryId: targetEntryId, result: 'correct' }],
  })
}
states = getStudentVocabularyReviewStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states[0].status, 'improved')
assert.equal(states[0].currentConsecutiveCorrect, 2)
assert.equal(states[0].recentWrongRate, 3 / 5)

createVocabularyDictationRecord(userDb, 'teacher-a', task.id, {
  mode: 'partial',
  status: 'completed',
  dictationDate: '2026-08-05',
  results: [{ entryId: entries[1].id, result: 'wrong' }],
})
for (const [date, result] of [['2026-08-06', 'wrong'], ['2026-08-07', 'correct'], ['2026-08-08', 'correct']]) {
  createVocabularyDictationRecord(userDb, 'teacher-a', task.id, {
    mode: 'partial',
    status: 'completed',
    dictationDate: date,
    results: [{ entryId: entries[1].id, result }],
  })
}

updateVocabularyDictationRecord(userDb, 'teacher-a', sameDayWrong.id, {
  results: [{ entryId: targetEntryId, result: 'correct' }],
})
states = getStudentVocabularyReviewStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states.find((state) => state.id === targetEntryId)?.totalWrong, 2)
voidVocabularyDictationRecord(userDb, 'teacher-a', draft.id)
states = getStudentVocabularyReviewStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states.find((state) => state.id === targetEntryId)?.totalWrong, 1)
restoreVocabularyDictationRecord(userDb, 'teacher-a', draft.id)
states = getStudentVocabularyReviewStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states.find((state) => state.id === targetEntryId)?.totalWrong, 2)

updateStudentVocabularyWordFlag(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1', targetEntryId, {
  pinned: true,
  paused: false,
})
states = getStudentVocabularyReviewStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states[0].id, entries[1].id, '重点关注不得篡改基础错词排行')
assert.equal(
  getSuggestedVocabularyReview(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1', 5)[0]?.id,
  targetEntryId,
  '重点关注必须提升已改善抽查词的推荐顺序',
)
assert.equal(
  getSuggestedVocabularyReview(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1', 20)
    .some((state) => state.id === targetEntryId && state.reason === '老师重点关注'),
  true,
)
updateStudentVocabularyWordFlag(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1', targetEntryId, {
  pinned: true,
  paused: true,
})
assert.equal(
  getSuggestedVocabularyReview(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1', 20)
    .some((state) => state.id === targetEntryId),
  false,
)

const library = listVocabularySetLibrary(userDb, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  page: 1,
  pageSize: 1,
  query: '第一组',
})
assert.equal(library.total, 1)
assert.equal(library.items[0].dictationSummary.recordCount, 9)
assert.equal(listVocabularySetLibrary(userDb, 'teacher-a', {
  studentId: otherStudent.id,
  programId: 'wanwei-round-one-v1',
}).total, 1)

assert.throws(() => createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: otherStudent.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id],
  title: '越权混用',
  accent: 'american',
}), /不属于当前学生/)

const workbenchSource = readFileSync(path.join(import.meta.dirname, '../app/src/features/vocabulary-dictation-workbench/VocabularyDictationWorkbench.tsx'), 'utf8')
assert.equal([...workbenchSource.matchAll(/consumeNumberInputs\(/gu)].length, 3, '题号输入必须由应用按钮和完成动作共同消费')
assert.match(workbenchSource, /wrongNumbers: '',\s+testedNumbers: '',/u, '应用题号后必须清空旧表达式，避免覆盖后续逐题调整')
assert.match(workbenchSource, /window\.addEventListener\('popstate', flushPendingDraft\)/u, '浏览器返回前必须触发草稿保存')
assert.match(workbenchSource, /async function leaveWorkbench\(next: \(\) => void\)/u, '工作区导航必须等待脏草稿保存')

bankDb.close()
userDb.close()
rmSync(root, { recursive: true, force: true })

console.log('PASS: frozen dictation tasks, teacher-confirmed records, review states, sharing, pagination, and student isolation')
