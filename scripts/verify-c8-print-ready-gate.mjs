#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

console.log('C8 verify: print-ready gate')

const server = read('server/api.mjs')
const draftStore = read('server/draft-paper/draftPaperStore.mjs')

assert('server exports shared isGroupPrintReady gate', /export function isGroupPrintReady\(db,\s*groupId\)/.test(server))
assert('print-ready group type allowlist exists', server.includes('PRINT_READY_GROUP_TYPES'))
for (const type of ['reading', 'cloze', 'seven_choices', 'grammar_cloze', 'writing', 'continuation']) {
  assert(`print-ready allows ${type}`, new RegExp(`'${type}'`).test(server))
}
assert('print-ready explicitly rejects listening', /group\.group_type === 'listening'/.test(server))
assert('print-ready validates unsupported types', /PRINT_READY_GROUP_TYPES\.has/.test(server))
assert('print-ready validates missing questions', server.includes('题组没有小题'))
assert('print-ready validates empty stems', server.includes('存在空题干'))
assert('print-ready validates objective options', server.includes('存在空选项'))
assert('print-ready validates writing material', /group\.group_type === 'writing'[\s\S]{0,220}缺少材料/.test(server))
assert('print-ready validates continuation material', /group\.group_type === 'continuation'[\s\S]{0,220}缺少材料/.test(server))
assert('print-ready validates paper-asset dangling questionIds', server.includes('paper-asset 引用了不存在的小题'))
assert('print-ready validates paper-asset source groups', server.includes('getPaperAssetPrintReady'))
// list-groups-perf (docs/cuts/list-groups-perf/plan.md): the paper-asset-bypass
// check moved into the shared computePrintReadyJudgment (used by both the
// single-row isGroupPrintReady and the batch getPrintReadyByGroupId), so it no
// longer sits directly under the findPaperAssetGroup(groupId) call site.
assert('isGroupPrintReady looks up a paper-asset match', /const paperAssetMatch = findPaperAssetGroup\(groupId\)/.test(server))
assert('paper-asset groups bypass DB-only option rows', /if \(paperAssetMatch\) return getPaperAssetPrintReady/.test(server))
assert('search derives print-ready field canAddToDraftPaper', server.includes('canAddToDraftPaper: printReady.ok'))
assert('search derives draftPaperButtonState', server.includes('draftPaperButtonState'))
assert('search derives currentDraftPaperId', server.includes('currentDraftPaperId: draftContext.currentDraftPaperId'))
assert('search derives printUnavailableReason', server.includes('printUnavailableReason: printReady.ok ? null : printReady.reason'))
// M0-1 user-data split: addGroupToDraftPaper now receives { userDb, bankDb } — the
// print-ready check still runs against the shared bank connection, just renamed.
assert('add group reuses print-ready gate before insert', /const ready = isGroupPrintReady\(bankDb,\s*groupId\)/.test(draftStore))
assert('disabled state comes from print-ready failure', /if \(!printReady\.ok\) return 'disabled'/.test(server))
assert('paper-asset detail feeds draft preview', server.includes('applyPaperAssetToQuestionGroupDetail'))
assert('paper-asset detail maps options into print detail', server.includes('buildQuestionDetailsFromPaperAsset') && server.includes('option?.text'))

// print-form (docs/cuts/print-form/plan.md Must Do 2, owner 必答题拍板
// 2026-07-12 "魔法数字整套删除"): the word-count heuristic this block used to
// pin down (buildPageBreakSuggestions/estimateEnglishWords — 600/700/1000
// magic numbers) is retired outright, replaced by a real pagination-derived
// judgment (derivePageBreakSuggestions/evaluatePageBreakAcrossPages — see
// scripts/verify-print-form.mjs for that contract's own behavioral coverage).
// Assert the retirement is real and clean, not just renamed.
assert('word-count heuristic function is gone', !draftStore.includes('function buildPageBreakSuggestions'))
assert('word-count estimator helper is gone', !draftStore.includes('function estimateEnglishWords'))
assert('no residual magic-number heuristic thresholds (600/700/1000 words) in draftPaperStore.mjs', !/materialWords > 600|estimate > 700|previousEstimate \+ estimate > 1000/.test(draftStore))
assert('real pagination-derived suggestion judgment is present instead', draftStore.includes('function evaluatePageBreakAcrossPages') && draftStore.includes('function derivePageBreakSuggestions'))

if (failed > 0) {
  console.error(`\nC8 print-ready gate verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC8 print-ready gate verify passed: ${passed} passed, 0 failed`)
