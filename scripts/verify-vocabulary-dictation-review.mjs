import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { PassThrough } from 'node:stream'
import {
  createVocabularyDictationRecord,
  createVocabularyDictationTask,
  createVocabularyMeaningRecallRecord,
  createVocabularySetFromEntries,
  createVocabularyStudent,
  ensureSharedVocabularyShape,
  ensureUserVocabularyShape,
  getPublicVocabularyListenResource,
  getPublicVocabularyShare,
  getPublicVocabularyDictationResource,
  getStudentVocabularyReviewStates,
  getStudentVocabularyMeaningStates,
  getSuggestedVocabularyReview,
  listVocabularySetLibrary,
  replaceVocabularyProgram,
  revokeVocabularyShare,
  restoreVocabularyDictationRecord,
  restoreVocabularyMeaningRecallRecord,
  revokeVocabularyDictationTaskShare,
  shareVocabularyDictationTask,
  shareVocabularySet,
  updateStudentVocabularyWordFlag,
  updateVocabularyDictationRecord,
  updateVocabularyMeaningRecallRecord,
  voidVocabularyDictationRecord,
  voidVocabularyMeaningRecallRecord,
  buildVocabularyMeaningRecallRecordPrintPayload,
} from '../server/vocabulary/vocabularyStore.mjs'
import { createVocabularyRoutes } from '../server/vocabulary/vocabularyRoutes.mjs'

function readZipEntryNames(zipBytes) {
  const eocdSignature = 0x06054b50
  const centralDirectorySignature = 0x02014b50
  const minimumEocdOffset = Math.max(0, zipBytes.length - 65_557)
  let eocdOffset = -1
  for (let offset = zipBytes.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (zipBytes.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset
      break
    }
  }
  assert.notEqual(eocdOffset, -1, 'ZIP must contain an end-of-central-directory record')
  const entryCount = zipBytes.readUInt16LE(eocdOffset + 10)
  let offset = zipBytes.readUInt32LE(eocdOffset + 16)
  const names = []
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(zipBytes.readUInt32LE(offset), centralDirectorySignature, 'ZIP central-directory entry must be valid')
    const nameLength = zipBytes.readUInt16LE(offset + 28)
    const extraLength = zipBytes.readUInt16LE(offset + 30)
    const commentLength = zipBytes.readUInt16LE(offset + 32)
    names.push(zipBytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'))
    offset += 46 + nameLength + extraLength + commentLength
  }
  return names
}

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
const legacyTaskDb = new DatabaseSync(path.join(root, 'legacy-user-data.sqlite'))
legacyTaskDb.exec(`
  CREATE TABLE vocabulary_dictation_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    program_id TEXT NOT NULL,
    title TEXT NOT NULL,
    accent TEXT NOT NULL CHECK (accent IN ('american', 'british')),
    entry_count INTEGER NOT NULL CHECK (entry_count BETWEEN 1 AND 60),
    created_at TEXT NOT NULL
  );
  INSERT INTO vocabulary_dictation_tasks
    (id, user_id, student_id, program_id, title, accent, entry_count, created_at)
  VALUES
    ('legacy-task', 'teacher-a', 'student-a', 'wanwei-round-one-v1', '旧任务', 'american', 1,
      '2026-08-12T23:50:00.000Z'),
    ('legacy-local-date-task', 'teacher-a', 'student-a', 'wanwei-round-one-v1',
      '2026-08-13 综合听写', 'american', 1, '2026-08-14T06:50:00.000Z');
`)
ensureUserVocabularyShape(legacyTaskDb)
ensureUserVocabularyShape(legacyTaskDb)
assert.equal(
  legacyTaskDb.prepare('SELECT task_date FROM vocabulary_dictation_tasks WHERE id = ?').get('legacy-task').task_date,
  '2026-08-12',
  '旧听写任务升级后必须从原创建日回填任务日期，且升级可重复执行',
)
assert.equal(
  legacyTaskDb.prepare('SELECT task_date FROM vocabulary_dictation_tasks WHERE id = ?').get('legacy-local-date-task').task_date,
  '2026-08-13',
  '旧任务标题已有本地日期时必须优先保留，不能被 UTC 创建日推迟一天',
)
assert.equal(
  legacyTaskDb.prepare('SELECT material_layout FROM vocabulary_dictation_tasks WHERE id = ?').get('legacy-task').material_layout,
  'merged',
  '旧听写任务升级后必须默认使用合并版式',
)
legacyTaskDb.close()
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
const otherSet = createVocabularySetFromEntries(dbs, 'teacher-a', {
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
assert.equal(getPublicVocabularyListenResource(readOnlyUserDb, renewedSetShare.shareId).status, 'active')
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
  taskDate: '2026-08-13',
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
assert.equal(firstTask.taskDate, '2026-08-13')
assert.ok(
  userDb.prepare('PRAGMA table_info(vocabulary_dictation_tasks)').all().some((column) => column.name === 'task_date'),
  '听写任务必须持久化独立任务日期，不能从创建时间反推',
)
assert.deepEqual(firstTask.entries.map((entry) => entry.id), mergedOrder)
assert.deepEqual(firstTask.entries[30].sourceSetIds, [setA.id, setB.id])
assert.equal(secondTask.entryCount, 1)
const atomicSharedTask = createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setB.id],
  entryIds: [entries[60].id],
  taskDate: '2026-08-13',
  title: '原子二维码任务',
  accent: 'british',
  share: true,
})
assert.equal(atomicSharedTask.share?.status, 'active', '要求二维码的任务必须在创建响应中直接带有效分享')
assert.equal(getPublicVocabularyDictationResource(userDb, atomicSharedTask.share.shareId).status, 'active')
const taskCountBeforeShareFailure = userDb.prepare('SELECT COUNT(*) AS count FROM vocabulary_dictation_tasks').get().count
userDb.exec(`
  CREATE TRIGGER verify_atomic_task_share_failure
  BEFORE INSERT ON vocabulary_dictation_task_shares
  BEGIN
    SELECT RAISE(ABORT, 'forced atomic task share failure');
  END;
`)
assert.throws(() => createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setB.id],
  entryIds: [entries[60].id],
  taskDate: '2026-08-13',
  title: '不得留下的孤儿任务',
  accent: 'british',
  share: true,
}), /forced atomic task share failure/)
userDb.exec('DROP TRIGGER verify_atomic_task_share_failure')
assert.equal(
  userDb.prepare('SELECT COUNT(*) AS count FROM vocabulary_dictation_tasks').get().count,
  taskCountBeforeShareFailure,
  '二维码创建失败时必须回滚整份任务，不能留下无二维码孤儿',
)
const sourceFreeTask = createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  entryIds: [entries[60].id],
  taskDate: '2026-08-13',
  title: '无生词组来源任务',
  accent: 'british',
})
bankDb.prepare("UPDATE vocabulary_entries SET teaching_sense = '来源任务创建后修改的词义' WHERE id = ?").run(entries[60].id)
const combinedFromTaskSnapshot = createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceTaskIds: [sourceFreeTask.id],
  entryIds: [entries[60].id],
  taskDate: '2026-08-13',
  title: '从任务快照合并',
  accent: 'british',
  share: true,
})
assert.equal(combinedFromTaskSnapshot.sourceSets.length, 0)
assert.equal(combinedFromTaskSnapshot.entries[0].teachingSense, entries[60].teachingSense)
assert.equal(combinedFromTaskSnapshot.share?.status, 'active')
assert.throws(() => createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceTaskIds: [sourceFreeTask.id],
  entryIds: [entries[59].id],
  taskDate: '2026-08-13',
  title: '越过来源任务词条',
  accent: 'british',
}), /只能使用所选听写任务中的词/)
assert.throws(() => createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceTaskIds: [sourceFreeTask.id],
  sourceSetIds: [setA.id],
  entryIds: [entries[0].id],
  taskDate: '2026-08-13',
  title: '组合来源也不得越过任务快照',
  accent: 'british',
}), /只能使用所选听写任务中的词/)
const otherStudentTask = createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: otherStudent.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [otherSet.id],
  entryIds: [entries[0].id],
  taskDate: '2026-08-13',
  title: '其他学生的任务',
  accent: 'british',
})
assert.throws(() => createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceTaskIds: [otherStudentTask.id],
  entryIds: [entries[0].id],
  taskDate: '2026-08-13',
  title: '越权合并其他学生任务',
  accent: 'british',
}), /不属于当前学生/)

const meaningRecord = createVocabularyMeaningRecallRecord({ userDb }, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id, setB.id],
  entryIds: [entries[0].id, entries[1].id, entries[60].id],
  orderMode: 'source',
  title: '多词组词义抽查',
  recallDate: '2026-08-21',
})
updateVocabularyMeaningRecallRecord(userDb, 'teacher-a', meaningRecord.id, {
  status: 'completed',
  recallDate: '2026-08-21',
  results: [
    { entryId: entries[0].id, result: 'wrong' },
    { entryId: entries[1].id, result: 'correct' },
    { entryId: entries[60].id, result: 'wrong' },
  ],
})
const meaningPrint = buildVocabularyMeaningRecallRecordPrintPayload(userDb, 'teacher-a', meaningRecord.id)
assert.equal(meaningPrint.vocabularySet.title, '多词组词义抽查-本轮错词')
assert.deepEqual(meaningPrint.vocabularySet.entries.map((entry) => entry.id), [entries[0].id, entries[60].id], '多词组认词必须只形成一条记录，并严格导出本轮全部错词')
assert.equal(meaningPrint.vocabularySet.share, null, '记录导出不得创建二维码语义')
updateVocabularyMeaningRecallRecord(userDb, 'teacher-a', meaningRecord.id, {
  status: 'completed',
  recallDate: '2026-08-21',
  results: [
    { entryId: entries[0].id, result: 'correct' },
    { entryId: entries[1].id, result: 'wrong' },
    { entryId: entries[60].id, result: 'wrong' },
  ],
})
assert.deepEqual(
  buildVocabularyMeaningRecallRecordPrintPayload(userDb, 'teacher-a', meaningRecord.id).vocabularySet.entries.map((entry) => entry.id),
  [entries[1].id, entries[60].id],
  '修改本轮判定后重新导出必须反映最新保存结果',
)
const meaningState = getStudentVocabularyMeaningStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
  .find((state) => state.id === entries[60].id)
assert.equal(meaningState?.currentCorrectDateCount, 0, '旧听写正确结果不得再作为认词恢复证据')

const draftMeaningRecord = createVocabularyMeaningRecallRecord({ userDb }, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id],
  entryIds: [entries[3].id],
  title: '草稿不可导出',
  recallDate: '2026-08-21',
})
assert.throws(
  () => buildVocabularyMeaningRecallRecordPrintPayload(userDb, 'teacher-a', draftMeaningRecord.id),
  (error) => error?.status === 409 && error?.code === 'vocabulary_meaning_recall_record_not_exportable',
)
const zeroWrongRecord = createVocabularyMeaningRecallRecord({ userDb }, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id],
  entryIds: [entries[4].id],
  title: '零错不可导出',
  recallDate: '2026-08-21',
})
updateVocabularyMeaningRecallRecord(userDb, 'teacher-a', zeroWrongRecord.id, {
  status: 'completed',
  results: [{ entryId: entries[4].id, result: 'correct' }],
})
assert.throws(
  () => buildVocabularyMeaningRecallRecordPrintPayload(userDb, 'teacher-a', zeroWrongRecord.id),
  (error) => error?.status === 409 && error?.code === 'vocabulary_meaning_recall_record_no_wrong_entries',
)
voidVocabularyMeaningRecallRecord(userDb, 'teacher-a', meaningRecord.id)
assert.throws(
  () => buildVocabularyMeaningRecallRecordPrintPayload(userDb, 'teacher-a', meaningRecord.id),
  (error) => error?.status === 409 && error?.code === 'vocabulary_meaning_recall_record_not_exportable',
)
bankDb.prepare('UPDATE vocabulary_entries SET teaching_sense = ? WHERE id = ?').run(entries[60].teachingSense, entries[60].id)
assert.throws(() => createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setB.id],
  entryIds: [entries[60].id],
  taskDate: '2026-02-30',
  title: '非法任务日期',
  accent: 'british',
}), /听写日期必须是有效的 YYYY-MM-DD/)

bankDb.prepare("UPDATE vocabulary_entries SET teaching_sense = '后来修改的词义' WHERE id = ?").run(entries[0].id)
assert.equal(firstTask.entries[0].teachingSense, entries[0].teachingSense)

const share = shareVocabularyDictationTask(userDb, 'teacher-a', firstTask.id)
const publicTask = getPublicVocabularyDictationResource(userDb, share.shareId)
const publicListenTask = getPublicVocabularyListenResource(userDb, share.shareId)
assert.equal(publicTask.status, 'active')
assert.equal(publicTask.set.accent, 'american')
assert.equal(publicTask.set.entries.length, 60)
assert.equal(publicTask.set.entries[0].answer, entries[0].headword)
for (const key of ['studentId', 'userId', 'sourceSets', 'record', 'wrongSpelling']) {
  assert.equal(key in publicTask.set, false, `public task leaked ${key}`)
}
assert.equal(publicListenTask.status, 'active')
assert.equal(publicListenTask.set.accent, 'american')
assert.equal(publicListenTask.set.entries.length, 60)
assert.equal(publicListenTask.set.entries[0].teachingSense, entries[0].teachingSense)
assert.equal(publicListenTask.set.entries[0].visual.path, entries[0].visual.path)
assert.equal(publicListenTask.set.entries[0].audio.path, entries[0].audio.path)
for (const key of ['studentId', 'userId', 'sourceSets', 'record', 'wrongSpelling']) {
  assert.equal(key in publicListenTask.set, false, `public listening task leaked ${key}`)
}
assert.throws(() => shareVocabularyDictationTask(userDb, 'teacher-b', firstTask.id), /听写任务不存在/)
revokeVocabularyDictationTaskShare(userDb, 'teacher-a', firstTask.id)
assert.equal(getPublicVocabularyDictationResource(userDb, share.shareId).status, 'revoked')
assert.equal(getPublicVocabularyListenResource(userDb, share.shareId).status, 'revoked')
const renewedShare = shareVocabularyDictationTask(userDb, 'teacher-a', firstTask.id)
assert.notEqual(renewedShare.shareId, share.shareId)
assert.equal(getPublicVocabularyDictationResource(userDb, share.shareId).status, 'revoked')
assert.equal(getPublicVocabularyListenResource(userDb, share.shareId).status, 'revoked')
assert.equal(getPublicVocabularyListenResource(userDb, 'missing-share-id').status, 'not_found')
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

updateStudentVocabularyWordFlag(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1', targetEntryId, {
  pinned: false,
  paused: false,
})
createVocabularyDictationRecord(userDb, 'teacher-a', firstTask.id, {
  mode: 'all',
  status: 'completed',
  dictationDate: '2026-08-20',
  results: firstTask.entries.map((entry) => ({ entryId: entry.id, result: 'wrong' })),
})
createVocabularyDictationRecord(userDb, 'teacher-a', secondTask.id, {
  mode: 'all',
  status: 'completed',
  dictationDate: '2026-08-20',
  results: secondTask.entries.map((entry) => ({ entryId: entry.id, result: 'wrong' })),
})
assert.throws(() => createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: otherStudent.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id],
  title: '越权混用',
  accent: 'american',
}), /不属于当前学生/)

const workbenchSource = readFileSync(path.join(import.meta.dirname, '../app/src/features/vocabulary-dictation-workbench/VocabularyDictationWorkbench.tsx'), 'utf8')
assert.match(workbenchSource, /async function leaveWorkbench\(next: \(\) => void\)/u, '工作区导航必须等待脏草稿保存')
assert.doesNotMatch(workbenchSource, /openGrader|completeGrading|记录纸笔听写|>批改</u, '听写批改器及其所有入口必须退役')
const createdTaskResultStart = workbenchSource.indexOf('{createdTasks.length > 0 && (')
const setWorkspaceStart = workbenchSource.indexOf("{tab === 'sets' && (")
assert.ok(
  createdTaskResultStart > 0 && createdTaskResultStart < setWorkspaceStart,
  '复听写任务生成结果必须在当前工作区原地可见，不能只藏在生词组页',
)
assert.doesNotMatch(workbenchSource, /QRCodeSVG|qrcode\.react/u, '工作台不得显示屏幕二维码')
assert.match(
  workbenchSource,
  /downloadTaskMaterial\(task, 'cards'\)[\s\S]{0,240}单词卡（含二维码）/u,
  '已生成任务必须提供右下角带二维码的单词卡',
)
assert.match(
  workbenchSource,
  /downloadTaskMaterial\(task, 'dictation'\)[\s\S]{0,240}听写纸（含二维码）/u,
  '已生成任务必须提供右上角带二维码的听写纸',
)
assert.match(workbenchSource, /function renderTaskDownloadOptions[\s\S]{0,2400}单词卡（含二维码）[\s\S]{0,900}听写纸（含二维码）[\s\S]{0,900}教师答案[\s\S]{0,900}衡水体练字纸[\s\S]{0,900}下载全套（4份）/u, '四类资料与四份全套下载必须收进同一个下载资料菜单')
assert.doesNotMatch(workbenchSource, /圈词与拼写|word-search/u, '工作台不得保留圈词与拼写入口或材料类型')
assert.match(workbenchSource, /已选 \{selectedReviewWords\.length\} 词[\s\S]{0,600}开始认词复习[\s\S]{0,600}生成听写[\s\S]{0,600}取消/u, '待复习选择栏必须以认词为主动作、听写为次动作')
assert.doesNotMatch(workbenchSource, /订正纸|带二维码听写纸|二维码任务/u, '工作台不得保留旧术语或重复入口')
assert.doesNotMatch(workbenchSource, /selectedGroupReviewWords|createVocabularySetErrorTasks/u, '词组页不得继续提供累计待复习词资料导出')
const tabNavigationSource = workbenchSource.slice(
  workbenchSource.indexOf('<nav className="dictation-workbench-tabs"'),
  workbenchSource.indexOf('{(message || error)'),
)
assert.match(tabNavigationSource, /词组[\s\S]{0,500}认词[\s\S]{0,500}听写[\s\S]{0,500}待复习[\s\S]{0,500}记录/u, '工作区导航必须明确待复习职责')
assert.match(workbenchSource, /const reviewWords = meaningStates\.filter/u, '待复习池必须只由认词状态构成')
assert.match(workbenchSource, /全部 \{reviewWords[\s\S]{0,900}常错 \{reviewWords/u, '待复习页只保留全部和常错筛选')
const waitingReviewSource = workbenchSource.slice(
  workbenchSource.indexOf("{tab === 'review' && ("),
  workbenchSource.indexOf('</main>'),
)
assert.doesNotMatch(waitingReviewSource, /pendingStates|mergeReviewWords|听写还需|听写错/u, '待复习页不得显示或消费听写掌握度')
assert.match(workbenchSource, /认词记录[\s\S]{0,500}历史听写/u, '记录页必须默认区分认词记录和只读历史听写')
assert.match(workbenchSource, /下载本轮错词[\s\S]{0,3000}下载全套（4份）/u, '完成认词记录必须提供本轮错词四件套下载')
assert.match(workbenchSource, /dictation-history-details[\s\S]{0,1000}wrongSpelling/u, '历史听写必须只读展示旧结果和错误拼写')
assert.match(workbenchSource, /groupTasksByDate\(selectedTasks\)/u, '多选任务必须按任务日期分别处理')
assert.match(workbenchSource, /const dateKey = task\.taskDate/u, '任务日期分组必须使用冻结的任务日期，不能从创建时间反推')
assert.match(workbenchSource, /taskDate: group\.dateKey/u, '按日期合并生成的复听写必须保留所选任务日期')
assert.match(workbenchSource, /splitEvery\(dedupeTaskEntries\(group\.tasks\), 60\)/u, '单日任务必须合并去重并按 60 词拆分')
const dateExportSource = workbenchSource.slice(
  workbenchSource.indexOf('async function exportSelectedTasksByDate'),
  workbenchSource.indexOf('function updateTaskShare'),
)
assert.match(dateExportSource, /share: true/u, '按日期导出必须原子创建任务和二维码')
assert.doesNotMatch(dateExportSource, /shareVocabularyDictationTask/u, '按日期导出不得拆成任务创建与分享两次请求')
assert.match(dateExportSource, /sourceTaskIds: group\.tasks\.map/u, '按日期导出必须直接复用所选任务的冻结快照，不能依赖来源生词组')
assert.doesNotMatch(dateExportSource, /缺少来源生词组/u, '没有来源生词组的合法冻结任务也必须可合并导出')
assert.match(dateExportSource, /downloadVocabularyDictationTaskPdf\(task\.id, 'dictation'(?:, target)?\)/u, '按日期导出必须下载复听写纸')
assert.match(workbenchSource, /全选当天[\s\S]{0,6000}自动带二维码[\s\S]{0,1200}合并导出听写纸/u, '听写列表必须提供日期全选和明确的二维码导出说明')
assert.match(workbenchSource, /aria-pressed=\{accent === 'american'\}[\s\S]{0,300}aria-pressed=\{accent === 'british'\}/u, '导出口音必须向辅助技术暴露选中状态')
const workbenchCss = readFileSync(path.join(import.meta.dirname, '../app/src/features/vocabulary-dictation-workbench/vocabularyDictationWorkbench.css'), 'utf8')
assert.match(workbenchCss, /dictation-task-selection-panel button:focus-visible[\s\S]{0,160}outline: 2px solid #2c6e56/u, '新增任务操作必须有可见的墨绿键盘焦点')
assert.match(workbenchCss, /Overrides the shared button radius/u, '分段按钮覆盖共享圆角时必须显式说明 cascade 原因')
const createReviewTaskSource = workbenchSource.slice(
  workbenchSource.indexOf('async function createTaskFromReviewEntries'),
  workbenchSource.indexOf('function openHandwritingSelector'),
)
assert.match(createReviewTaskSource, /setSelectedReviewIds\(\[\]\)/u, '生成复听写任务后必须清空旧选择')
assert.match(createReviewTaskSource, /setSuggestion\(\[\]\)/u, '生成复听写任务后必须收起旧建议')
const createSetTaskSource = workbenchSource.slice(
  workbenchSource.indexOf('async function createTasks'),
  workbenchSource.indexOf('function updateTaskShare'),
)
assert.match(createSetTaskSource, /setSelectedSets\(\[\]\)/u, '生成合并听写后也必须收起旧生词组选择面板')

const vocabularyServiceSource = readFileSync(path.join(import.meta.dirname, '../app/src/services/vocabulary.ts'), 'utf8')
const vocabularyRoutesSource = readFileSync(path.join(import.meta.dirname, '../server/vocabulary/vocabularyRoutes.mjs'), 'utf8')
const vocabularyStoreSource = readFileSync(path.join(import.meta.dirname, '../server/vocabulary/vocabularyStore.mjs'), 'utf8')
const vocabularyReviewSource = readFileSync(path.join(import.meta.dirname, '../app/src/features/vocabulary-review/VocabularyReviewPage.tsx'), 'utf8')
const vocabularyReviewCss = readFileSync(path.join(import.meta.dirname, '../app/src/features/vocabulary-review/vocabularyReviewPage.css'), 'utf8')
const extensionSpec = readFileSync(path.join(import.meta.dirname, '../docs/cuts/wanwei-vocabulary-closed-loop/dictation-review-extension.md'), 'utf8')
const devScriptSource = readFileSync(path.join(import.meta.dirname, 'dev.sh'), 'utf8')
assert.match(devScriptSource, /APP_PORT="\$\{PORT:-5173\}"/u, '本地开发必须冻结前端端口供打印渲染复用')
assert.match(devScriptSource, /PUBLIC_ORIGIN="\$\{QUESTION_BANK_PUBLIC_ORIGIN:-http:\/\/127\.0\.0\.1:\$\{APP_PORT\}\}"/u, '本地打印渲染必须默认指向同一个前端服务')
assert.match(devScriptSource, /QUESTION_BANK_PUBLIC_ORIGIN="\$PUBLIC_ORIGIN"\s+node/u, 'API 子进程必须收到本地打印页面地址')
assert.match(vocabularyReviewSource, /printRequest\.kind === 'dictation' && pageIndex === 0 && shareId[\s\S]{0,500}vocabulary-dictation-print-qr/u, '复听写纸二维码必须只在首页右上区域')
assert.match(vocabularyReviewSource, /printShareKind === 'dictation'[\s\S]{0,300}\/vocabulary\/dictation\/\$\{shareId\}[\s\S]{0,180}\/vocabulary\/listen\/\$\{shareId\}/u, '任务单词卡必须进入带图片的公开听音页，复听写纸继续进入自动听写页')
assert.match(vocabularyReviewSource, /扫码听音频/u, '单词卡右下角必须统一使用“扫码听音频”语义')
assert.match(vocabularyRoutesSource, /hasQr = payload\.vocabularySet\.share\?\.status === 'active' && \['cards', 'dictation'\]\.includes\(kind\)[\s\S]{0,400}expectedQrCount: hasQr \? 1 : 0/u, '任务单词卡和复听写纸各一个二维码，教师答案不得带二维码')
assert.match(vocabularyServiceSource, /downloadVocabularyDictationTaskMaterialsZip[\s\S]{0,500}dictation-task-materials\.zip/u, '客户端必须提供认证ZIP资料下载')
assert.doesNotMatch(vocabularyRoutesSource, /dictation-tasks\\\/from-set-errors/u, '服务端不得保留累计错词转听写任务入口')
assert.match(vocabularyRoutesSource, /dictation-task-materials\\\.zip[\s\S]{0,1800}studentIds\.size !== 1/u, 'ZIP接口必须拒绝跨学生任务组合')
assert.match(vocabularyStoreSource, /material_layout TEXT NOT NULL DEFAULT 'merged'/u, '旧任务必须幂等升级为合并版式')
assert.match(vocabularyStoreSource, /invalid_vocabulary_material_layout/u, '显式非法资料版式必须被服务端拒绝')
assert.match(vocabularyRoutesSource, /clientDisconnected[\s\S]{0,500}archive\.abort\(\)[\s\S]{0,1500}break renderMaterials/u, '客户端取消 ZIP 后必须中止归档并停止后续 PDF 渲染')
assert.match(vocabularyRoutesSource, /vocabulary_dictation_grading_retired/g, '听写批改写接口必须明确返回统一退役码')
assert.match(vocabularyRoutesSource, /vocabulary_word_search_retired/g, '旧圈词资料请求必须明确返回退役码')
for (const [label, source] of [
  ['客户端打印 DTO', vocabularyServiceSource],
  ['服务端打印路由', vocabularyRoutesSource],
  ['服务端打印投影', vocabularyStoreSource],
  ['打印页面', vocabularyReviewSource],
  ['打印样式', vocabularyReviewCss],
  ['扩展规范', extensionSpec],
]) {
  assert.doesNotMatch(source, /correctionByEntryId|vocabulary-correction-|订正纸|'correction'/u, `${label}必须完整移除订正纸能力`)
}

restoreVocabularyMeaningRecallRecord(userDb, 'teacher-a', meaningRecord.id)
const linkedMeaningTask = createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id, setB.id],
  entryIds: [entries[1].id, entries[60].id],
  meaningRecallRecordId: meaningRecord.id,
  taskDate: '2026-08-21',
  title: '多词组词义抽查错词听写',
  accent: 'american',
  share: true,
})
assert.equal(linkedMeaningTask.share?.status, 'active')
assert.equal(
  buildVocabularyMeaningRecallRecordPrintPayload(userDb, 'teacher-a', meaningRecord.id, { accent: 'american' }).vocabularySet.share?.shareId,
  linkedMeaningTask.share.shareId,
  '本轮错词导出必须复用词序与口音完全一致的已生成听写二维码',
)
assert.equal(
  buildVocabularyMeaningRecallRecordPrintPayload(userDb, 'teacher-a', meaningRecord.id, { accent: 'british' }).vocabularySet.share,
  null,
  '不同口音的错词资料不得误用已生成的二维码',
)
const routeRenderCalls = []
let routeBody = {}
const routeContext = {
  resolveDataUserId: () => 'teacher-a',
  openUserDatabase: ({ readOnly } = {}) => new DatabaseSync(path.join(root, 'user-data.sqlite'), { readOnly: Boolean(readOnly) }),
  readJsonBody: async () => routeBody,
  renderVocabularySetPdf: async (input) => {
    routeRenderCalls.push(input)
    return { pdfBytes: Buffer.from('%PDF-1.4\n%%EOF\n') }
  },
  sendJson(response, status, body) {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(Buffer.from(JSON.stringify(body)))
  },
}
const vocabularyRoutes = createVocabularyRoutes()
function makeRouteResponse() {
  const response = new PassThrough()
  response.statusCode = 0
  response.responseHeaders = {}
  response.bodyChunks = []
  response.on('data', (chunk) => response.bodyChunks.push(Buffer.from(chunk)))
  response.writeHead = (status, headers = {}) => {
    response.statusCode = status
    response.responseHeaders = headers
    return response
  }
  return response
}
async function invokeVocabularyRoute(method, rawUrl, body = {}, response = makeRouteResponse()) {
  routeBody = body
  const url = new URL(rawUrl, 'http://localhost')
  const route = vocabularyRoutes.find((candidate) => candidate.method === method && candidate.pattern.test(url.pathname))
  assert.ok(route, `缺少路由 ${method} ${url.pathname}`)
  const match = url.pathname.match(route.pattern)
  const ended = new Promise((resolve) => response.once('end', resolve))
  await route.handle({
    request: { method, url: rawUrl, headers: { 'content-type': 'application/json', cookie: '' } },
    response,
    url,
    match,
    context: routeContext,
  })
  await ended
  return response
}

const taskCountBeforeRecordDownloads = userDb.prepare('SELECT COUNT(*) AS count FROM vocabulary_dictation_tasks').get().count
for (const [kind, handwritingMode] of [
  ['cards', 'standard'],
  ['dictation', 'standard'],
  ['answer', 'standard'],
  ['handwriting', 'standard'],
  ['handwriting', 'single'],
]) {
  const response = await invokeVocabularyRoute(
    'POST',
    `/api/vocabulary/meaning-recall-records/${meaningRecord.id}/material.pdf?kind=${kind}`,
    { accent: 'american', handwritingMode },
  )
  assert.equal(response.statusCode, 200)
  assert.equal(response.responseHeaders['content-type'], 'application/pdf')
  assert.match(decodeURIComponent(response.responseHeaders['x-file-name']), /多词组词义抽查-本轮错词/u)
}
assert.equal(routeRenderCalls.length, 5)
assert.deepEqual(
  routeRenderCalls.map((call) => call.expectedQrCount),
  [1, 1, 0, 0, 0],
  '已生成错词听写后，本轮错词单词卡和听写纸必须各带一个二维码',
)
assert.equal(routeRenderCalls.at(-1).expectedPageCount, 1, '每词写1遍必须使用独立分页规则')

routeRenderCalls.length = 0
const zipResponse = await invokeVocabularyRoute(
  'POST',
  `/api/vocabulary/meaning-recall-records/${meaningRecord.id}/materials.zip`,
  { accent: 'american' },
)
assert.equal(zipResponse.statusCode, 200)
assert.equal(zipResponse.responseHeaders['content-type'], 'application/zip')
assert.deepEqual(routeRenderCalls.map((call) => call.kind), ['cards', 'dictation', 'answer', 'handwriting'])
assert.deepEqual(routeRenderCalls.map((call) => call.expectedQrCount), [1, 1, 0, 0])
const zipEntries = readZipEntryNames(Buffer.concat(zipResponse.bodyChunks))
assert.equal(zipEntries.length, 4)
assert.match(zipEntries[0], /多词组词义抽查-本轮错词-2词-美式\.pdf$/u)
assert.match(zipEntries[1], /听写纸/u)
assert.match(zipEntries[2], /教师答案/u)
assert.match(zipEntries[3], /衡水体练字纸/u)
assert.equal(zipEntries.some((name) => /圈词/u.test(name)), false)
assert.equal(userDb.prepare('SELECT COUNT(*) AS count FROM vocabulary_dictation_tasks').get().count, taskCountBeforeRecordDownloads, '下载必须复用已生成的二维码听写任务，不得重复创建')

for (const [method, url] of [
  ['POST', `/api/vocabulary/dictation-tasks/${task.id}/records`],
  ['PATCH', `/api/vocabulary/dictation-records/${draft.id}`],
  ['POST', `/api/vocabulary/dictation-records/${draft.id}/void`],
  ['POST', `/api/vocabulary/dictation-records/${draft.id}/restore`],
]) {
  const response = await invokeVocabularyRoute(method, url)
  assert.equal(response.statusCode, 410)
  assert.equal(JSON.parse(Buffer.concat(response.bodyChunks).toString()).error, 'vocabulary_dictation_grading_retired')
}
const retiredWordSearch = await invokeVocabularyRoute('POST', `/api/vocabulary/sets/${setA.id}/pdf?accent=american&kind=word-search`)
assert.equal(retiredWordSearch.statusCode, 410)
assert.equal(JSON.parse(Buffer.concat(retiredWordSearch.bodyChunks).toString()).error, 'vocabulary_word_search_retired')

bankDb.close()
userDb.close()
rmSync(root, { recursive: true, force: true })

console.log('PASS: recognition-only review, frozen-record four-piece exports, retired grading writes, sharing, pagination, and student isolation')
