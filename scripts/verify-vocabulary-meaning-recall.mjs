import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  createVocabularyDictationRecord,
  createVocabularyDictationTask,
  createVocabularyMeaningRecallRecord,
  createVocabularySetFromEntries,
  createVocabularyStudent,
  ensureSharedVocabularyShape,
  ensureUserVocabularyShape,
  getStudentVocabularyMeaningStates,
  getSuggestedVocabularyMeaningRecall,
  getVocabularyDictationTask,
  getVocabularyMeaningRecallRecord,
  listVocabularySetLibrary,
  listVocabularyMeaningRecallRecords,
  replaceVocabularyProgram,
  restoreVocabularyMeaningRecallRecord,
  updateStudentVocabularyWordFlag,
  updateVocabularyMeaningRecallRecord,
  voidVocabularyMeaningRecallRecord,
} from '../server/vocabulary/vocabularyStore.mjs'

function makeEntry(index) {
  const headword = `recall${String(index + 1).padStart(2, '0')}`
  return {
    id: `recall-entry-${String(index + 1).padStart(2, '0')}`,
    groupId: 'group-1',
    headword,
    phonetic: `/${headword}/`,
    partOfSpeech: 'n.',
    sourceMeanings: [`${headword} 来源义`],
    teachingSense: `${headword} 核心义`,
    pronunciationMode: 'syllables',
    syllables: [headword],
    example: {
      english: `We remember ${headword}.`,
      chinese: `我们记得 ${headword}。`,
      highlight: headword,
      reviewStatus: 'approved',
    },
    exampleCandidates: ['a', 'b', 'c'].map((candidateId) => ({
      candidateId,
      version: 'meaning-recall-test-v1',
      teachingSense: `${headword} 核心义`,
      english: `We remember ${headword} in ${candidateId}.`,
      chinese: `我们在 ${candidateId} 中记得 ${headword}。`,
      highlight: headword,
      reviewStatus: 'approved',
    })),
    visual: {
      key: `visual-${headword}`,
      version: 'meaning-recall-test-v1',
      path: `/vocabulary-assets/test/${headword}.svg`,
      alt: `${headword} 教学图`,
    },
    audio: {
      key: `audio-${headword}`,
      version: 'eqb-british-teacher-v1',
      path: `/vocabulary-assets/test/${headword}.mp3`,
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

const root = mkdtempSync(path.join(tmpdir(), 'eqb-vocabulary-meaning-recall-'))
const bankDb = new DatabaseSync(path.join(root, 'question-bank.sqlite'))
const userDb = new DatabaseSync(path.join(root, 'user-data.sqlite'))
bankDb.exec('PRAGMA foreign_keys = ON')
userDb.exec('PRAGMA foreign_keys = ON')
ensureSharedVocabularyShape(bankDb)
ensureUserVocabularyShape(userDb)
ensureUserVocabularyShape(userDb)

const entries = Array.from({ length: 10 }, (_, index) => makeEntry(index))
replaceVocabularyProgram(bankDb, {
  id: 'wanwei-round-one-v1',
  version: 'meaning-recall-test-v1',
  title: '万唯1600词',
  subtitle: '词义抽查测试',
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
    endOrder: entries.length,
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
  entryIds: entries.slice(0, 6).map((entry) => entry.id),
})
const setB = createVocabularySetFromEntries(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  title: '第二组',
  entryIds: entries.slice(4, 10).map((entry) => entry.id),
})
const otherSet = createVocabularySetFromEntries(dbs, 'teacher-a', {
  studentId: otherStudent.id,
  programId: 'wanwei-round-one-v1',
  title: '另一名学生',
  entryIds: [entries[0].id],
})

assert.throws(() => createVocabularyMeaningRecallRecord(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id, otherSet.id],
}), /不属于当前学生/)
assert.throws(() => createVocabularyMeaningRecallRecord(dbs, 'teacher-b', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id],
}), /学生档案不存在/)

const subsetDraft = createVocabularyMeaningRecallRecord(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id, setB.id],
  entryIds: [entries[0].id],
  orderMode: 'source',
  recallDate: '2026-08-09',
  status: 'completed',
  results: [{ entryId: entries[0].id, result: 'correct' }],
})
assert.deepEqual(subsetDraft.sourceSets.map((source) => source.setId), [setA.id], '只保留实际贡献词条的来源组')
const subsetLibrary = listVocabularySetLibrary(userDb, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  pageSize: 20,
})
assert.equal(subsetLibrary.items.find((item) => item.id === setA.id).dictationSummary.meaningRecall.latestDate, '2026-08-09')
assert.equal(subsetLibrary.items.find((item) => item.id === setB.id).dictationSummary.meaningRecall.latestDate, null, '未贡献词条的组不得被计为已抽查')

const draft = createVocabularyMeaningRecallRecord(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id, setB.id],
  entryIds: [...entries].reverse().map((entry) => entry.id),
  orderMode: 'source',
  recallDate: '2026-08-10',
})
assert.equal(draft.status, 'draft')
assert.equal(draft.entryCount, 10)
assert.deepEqual(draft.entries.map((entry) => entry.id), entries.map((entry) => entry.id))
assert.deepEqual(draft.entries[4].sourceSetIds, [setA.id, setB.id])
assert.equal(draft.entries.every((entry) => entry.result === 'untested'), true)
assert.throws(() => updateVocabularyMeaningRecallRecord(userDb, 'teacher-a', draft.id, {
  status: 'completed',
}), /至少要抽查一个词/)

const firstWrong = updateVocabularyMeaningRecallRecord(userDb, 'teacher-a', draft.id, {
  status: 'completed',
  results: [{ entryId: entries[0].id, result: 'wrong' }],
})
assert.equal(firstWrong.status, 'completed')
let states = getStudentVocabularyMeaningStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states.find((state) => state.id === entries[0].id).status, 'pending')

createVocabularyMeaningRecallRecord(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id],
  entryIds: [entries[0].id],
  orderMode: 'source',
  recallDate: '2026-08-10',
  status: 'completed',
  results: [{ entryId: entries[0].id, result: 'wrong' }],
})
states = getStudentVocabularyMeaningStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states.find((state) => state.id === entries[0].id).status, 'pending')
assert.equal(states.find((state) => state.id === entries[0].id).currentWrongDateCount, 1)

const repeatedRecord = createVocabularyMeaningRecallRecord(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id],
  entryIds: [entries[0].id, entries[1].id],
  orderMode: 'source',
  recallDate: '2026-08-11',
  status: 'completed',
  results: [
    { entryId: entries[0].id, result: 'wrong' },
    { entryId: entries[1].id, result: 'wrong' },
  ],
})
states = getStudentVocabularyMeaningStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states.find((state) => state.id === entries[0].id).status, 'repeated')
assert.equal(states.find((state) => state.id === entries[1].id).status, 'pending')

const recoveryTask = createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id],
  entryIds: [entries[0].id, entries[1].id, entries[2].id],
  title: '恢复检测',
  accent: 'american',
})
createVocabularyDictationRecord(userDb, 'teacher-a', recoveryTask.id, {
  mode: 'all',
  status: 'completed',
  dictationDate: '2026-08-12',
  results: [
    { entryId: entries[0].id, result: 'correct' },
    { entryId: entries[1].id, result: 'wrong' },
    { entryId: entries[2].id, result: 'wrong' },
  ],
})
states = getStudentVocabularyMeaningStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states.find((state) => state.id === entries[0].id).status, 'repeated')
assert.equal(states.find((state) => state.id === entries[1].id).status, 'pending', '听写错误不能制造或加重词义错误')
assert.equal(states.some((state) => state.id === entries[2].id), false, '只有听写错误不能制造待认义')

createVocabularyDictationRecord(userDb, 'teacher-a', recoveryTask.id, {
  mode: 'partial',
  status: 'completed',
  dictationDate: '2026-08-13',
  results: [
    { entryId: entries[0].id, result: 'correct' },
    { entryId: entries[1].id, result: 'untested' },
    { entryId: entries[2].id, result: 'untested' },
  ],
})
states = getStudentVocabularyMeaningStates(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1')
assert.equal(states.find((state) => state.id === entries[0].id).status, 'improved', '跨两日完整听写正确应恢复认义')

voidVocabularyMeaningRecallRecord(userDb, 'teacher-a', repeatedRecord.id)
assert.equal(getVocabularyMeaningRecallRecord(userDb, 'teacher-a', repeatedRecord.id).status, 'void')
restoreVocabularyMeaningRecallRecord(userDb, 'teacher-a', repeatedRecord.id)
assert.equal(getVocabularyMeaningRecallRecord(userDb, 'teacher-a', repeatedRecord.id).status, 'completed')

const linkedTask = createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  meaningRecallRecordId: repeatedRecord.id,
  entryIds: [entries[1].id],
  title: '词义抽查复习任务',
  accent: 'british',
})
assert.equal(linkedTask.meaningRecallSource.recordId, repeatedRecord.id)
const frozenSense = linkedTask.entries[0].teachingSense
updateVocabularyMeaningRecallRecord(userDb, 'teacher-a', repeatedRecord.id, {
  results: [{ entryId: entries[1].id, result: 'correct' }],
})
assert.equal(getVocabularyDictationTask(userDb, 'teacher-a', linkedTask.id).entries[0].teachingSense, frozenSense)
voidVocabularyMeaningRecallRecord(userDb, 'teacher-a', repeatedRecord.id)
assert.equal(getVocabularyDictationTask(userDb, 'teacher-a', linkedTask.id).meaningRecallSource.recordId, repeatedRecord.id)
const unfinishedRecall = createVocabularyMeaningRecallRecord(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  sourceSetIds: [setA.id],
  entryIds: [entries[3].id],
  orderMode: 'source',
  recallDate: '2026-08-14',
})
assert.throws(() => createVocabularyDictationTask(dbs, 'teacher-a', {
  studentId: student.id,
  programId: 'wanwei-round-one-v1',
  meaningRecallRecordId: unfinishedRecall.id,
  title: '草稿不允许生成',
  accent: 'american',
}), /只能从已完成/)

updateStudentVocabularyWordFlag(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1', entries[1].id, {
  pinned: true,
  paused: false,
})
updateStudentVocabularyWordFlag(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1', entries[0].id, {
  pinned: false,
  paused: true,
})
const suggestion = getSuggestedVocabularyMeaningRecall(userDb, 'teacher-a', student.id, 'wanwei-round-one-v1', 5)
assert.equal(suggestion[0].id, entries[1].id, '重点关注应提升推荐顺序')
assert.equal(suggestion.some((entry) => entry.id === entries[0].id), false, '暂停词不得进入推荐')
assert.equal(suggestion.length, 5)
assert.equal(listVocabularyMeaningRecallRecords(userDb, 'teacher-a', student.id).length, 5)

const panelSource = readFileSync(new URL('../app/src/features/vocabulary-dictation-workbench/VocabularyMeaningRecallPanel.tsx', import.meta.url), 'utf8')
assert.match(panelSource, /savePendingRef\.current/u, '词义保存队列必须暴露同步的待保存标记')
assert.match(panelSource, /addEventListener\('beforeunload', warnBeforeUnload\)/u, '浏览器刷新或关页时必须阻止丢失待保存的词义结果')

bankDb.close()
userDb.close()
rmSync(root, { recursive: true, force: true })
console.log('PASS: frozen meaning recall records, cross-day recovery, suggestions, task linkage, and student isolation')
