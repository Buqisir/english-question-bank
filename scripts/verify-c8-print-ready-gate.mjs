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
assert('paper-asset groups bypass DB-only option rows', /const paperAssetMatch = findPaperAssetGroup\(groupId\)[\s\S]{0,120}getPaperAssetPrintReady/.test(server))
assert('search derives print-ready field canAddToDraftPaper', server.includes('canAddToDraftPaper: printReady.ok'))
assert('search derives draftPaperButtonState', server.includes('draftPaperButtonState'))
assert('search derives currentDraftPaperId', server.includes('currentDraftPaperId: draftContext.currentDraftPaperId'))
assert('search derives printUnavailableReason', server.includes('printUnavailableReason: printReady.ok ? null : printReady.reason'))
assert('add group reuses print-ready gate before insert', /const ready = isGroupPrintReady\(db,\s*groupId\)/.test(server))
assert('disabled state comes from print-ready failure', /if \(!printReady\.ok\) return 'disabled'/.test(server))
assert('paper-asset detail feeds draft preview', server.includes('applyPaperAssetToQuestionGroupDetail'))
assert('paper-asset detail maps options into print detail', server.includes('buildQuestionDetailsFromPaperAsset') && server.includes('option?.text'))

const decisions = read('docs/cuts/C8-draft-paper-composer/decisions.md')
const serverHeuristic = server.slice(server.indexOf('function buildPageBreakSuggestions'))
assert('heuristic checks reading/seven choices 600 words', /reading[\s\S]{0,120}seven_choices[\s\S]{0,240}600/.test(serverHeuristic))
assert('heuristic checks more than 4 questions and option count over 16', /questions\.length > 4[\s\S]{0,120}optionCount > 16/.test(serverHeuristic))
assert('heuristic checks estimated block over 70 percent after previous estimate', /estimate > 700[\s\S]{0,160}previousEstimate/.test(serverHeuristic))
assert('decisions define same 600-word rule', decisions.includes('over 600 English words'))
assert('decisions define same option-count rule', decisions.includes('more than 4 questions') && decisions.includes('16'))
assert('decisions define same 70 percent rule', decisions.includes('70% of one A4 page'))

if (failed > 0) {
  console.error(`\nC8 print-ready gate verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC8 print-ready gate verify passed: ${passed} passed, 0 failed`)
