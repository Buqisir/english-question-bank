#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
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

function git(args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function baselineRef() {
  try {
    git(['rev-parse', '--verify', 'github/main'])
    return 'github/main'
  } catch {
    return 'main'
  }
}

console.log('C8 verify: draft paper contracts')

const schema = read('data/sql/schema.sql')
assert('draft_papers table exists', /CREATE TABLE IF NOT EXISTS draft_papers/.test(schema))
assert('draft_paper_items table exists', /CREATE TABLE IF NOT EXISTS draft_paper_items/.test(schema))
assert('draft paper has current_marker', /current_marker INTEGER NOT NULL DEFAULT 0/.test(schema))
assert('draft item stores group id', /group_id TEXT NOT NULL REFERENCES question_groups\(id\)/.test(schema))
assert('draft item stores page_break_before', /page_break_before INTEGER NOT NULL DEFAULT 0/.test(schema))
assert('draft item prevents duplicate group in one draft', /UNIQUE\(draft_paper_id,\s*group_id\)/.test(schema))

const server = read('server/api.mjs')
assert('server creates draft_papers table', server.includes('CREATE TABLE IF NOT EXISTS draft_papers'))
assert('server creates draft_paper_items table', server.includes('CREATE TABLE IF NOT EXISTS draft_paper_items'))
assert('server exposes current draft route', server.includes('/api/draft-papers/current'))
assert('server exposes draft migration route', server.includes('/api/draft-papers/migrate-assembly-basket'))
assert('server exposes draft PDF route', server.includes('/print-pdf'))
assert('server updates draft title', /UPDATE draft_papers SET title = \?/.test(server))
assert('server updates item order_index', /UPDATE draft_paper_items\s+SET order_index = \?/.test(server))
assert('server updates page_break_before', /page_break_before = \?/.test(server))

const domain = read('app/src/domain/questionBank.ts')
assert('QuestionGroupCard has canAddToDraftPaper', /canAddToDraftPaper:\s*boolean/.test(domain))
assert('QuestionGroupCard has draftPaperButtonState', /draftPaperButtonState:\s*'add'\s*\|\s*'in_current_draft'\s*\|\s*'disabled'/.test(domain))
assert('QuestionGroupCard has currentDraftPaperId', /currentDraftPaperId:\s*string\s*\|\s*null/.test(domain))
assert('QuestionGroupCard has printUnavailableReason', /printUnavailableReason:\s*string\s*\|\s*null/.test(domain))
assert('DraftPaper type exists', /export type DraftPaper = DraftPaperSummary/.test(domain))

const service = read('app/src/services/draftPapers.ts')
assert('draft service can fetch current draft', service.includes('fetchCurrentDraftPaper'))
assert('draft service can add group to current draft', service.includes('addGroupToCurrentDraftPaper'))
assert('draft service can migrate assembly basket', service.includes('migrateAssemblyBasketToDraftPaper'))
assert('draft service can download PDF', service.includes('downloadDraftPaperPdf'))

const app = read('app/src/App.tsx')
assert('App has draft-paper route state', app.includes("view') === 'draft-paper'"))
assert('App renders DraftPaperWorkbench', app.includes('<DraftPaperWorkbench'))
assert('App add-to-draft uses server service', app.includes('addGroupToCurrentDraftPaperRequest'))
const addGroupsFn = app.slice(app.indexOf('async function addGroupsToBasket'), app.indexOf('function addToBasket'))
assert(
  'App add does not auto-open draft after successful add',
  !/await refreshQuestionGroups\(\)[\s\S]{0,120}openDraftPaperWorkbench/.test(addGroupsFn),
)
assert('App opens draft for already-added group', /draftPaperButtonState === 'in_current_draft'[\s\S]{0,180}openDraftPaperWorkbench/.test(app))

const card = read('app/src/concierge/ConciergeGroupCard.tsx')
assert('Concierge card shows joined draft label', card.includes('已在草稿卷中'))
assert('Concierge card shows add draft label', card.includes('加入草稿卷'))
assert('Concierge card disables only disabled state', /disabled=\{draftState === 'disabled'\}/.test(card))

const basket = read('app/src/paperAssembly/basketPersistence.ts')
assert('legacy basket key remains readable for migration', basket.includes("ASSEMBLY_BASKET_STORAGE_KEY = 'assembly-basket-v1'"))
assert('legacy basket save is no-op', /export function saveAssemblyBasket\(items: BasketItem\[\]\): void \{\s*void items\s*\}/.test(basket))
assert('legacy basket write path removed', !basket.includes('localStorage.setItem'))

const changed = [
  ...git(['diff', '--name-only', baselineRef()]).split('\n').filter(Boolean),
  ...git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean),
]
assert('DraftPaperWorkbench TSX added', changed.includes('app/src/features/draft-paper/DraftPaperWorkbench.tsx'))
assert('DraftPaperWorkbench CSS added', changed.includes('app/src/features/draft-paper/DraftPaperWorkbench.css'))

if (failed > 0) {
  console.error(`\nC8 draft paper contracts verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC8 draft paper contracts verify passed: ${passed} passed, 0 failed`)
