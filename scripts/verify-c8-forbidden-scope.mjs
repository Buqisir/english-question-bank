#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

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

console.log('C8 verify: forbidden scope')

const changedFiles = [
  ...git(['diff', '--name-only', baselineRef()]).split('\n').filter(Boolean),
  ...git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean),
]
const forbiddenPrefixes = [
  'app/src/shared-ui/papersurface/',
  'shared/papersurface/',
  'app/src/features/reading-analysis/',
  'app/src/features/paper-intelligence/',
  'app/public/reports/',
  'app/public/paper-assets/',
]

for (const prefix of forbiddenPrefixes) {
  assert(`forbidden prefix untouched: ${prefix}`, !changedFiles.some((file) => file.startsWith(prefix)))
}

assert('no imported fixture changes', !changedFiles.some((file) => /app\/public\/.*\.(json|docx|pdf)$/.test(file)))
assert('print renderer file untouched', !changedFiles.includes('server/print-renderer.mjs'))
assert('no My Space route files', !changedFiles.some((file) => file.includes('my-space') || file.includes('user-space')))

const allChangedText = changedFiles
  .filter((file) => !/\.(png|jpg|jpeg|gif|pdf|docx|sqlite)$/.test(file))
  .map((file) => {
    try {
      return readFileSync(path.join(rootDir, file), 'utf8')
    } catch {
      return ''
    }
  })
  .join('\n')
const appAndServerText = changedFiles
  .filter((file) => /^(app\/src|server\/api\.mjs|data\/sql)/.test(file))
  .map((file) => readFileSync(path.join(rootDir, file), 'utf8'))
  .join('\n')

assert('no personal-space view implementation', !allChangedText.includes(`view=${'my'}-space`))
assert('no user-space route implementation', !allChangedText.includes(`/${'user'}-space`))
const personalSpacePattern = new RegExp(`保存到个人空间|加入个人空间|${'My'} Space|${'my'} space`, 'i')
const answerVersionPattern = new RegExp(`${'答案'}版|${'解析'}版`)
const draftUiText = readFileSync(path.join(rootDir, 'app/src/features/draft-paper/DraftPaperWorkbench.tsx'), 'utf8')
assert('no save-to-personal-space label', !personalSpacePattern.test(appAndServerText))
assert('no answer-version export in C8 PR A', !answerVersionPattern.test(draftUiText))

const allowedPrefixes = [
  'app/src/App.tsx',
  'app/src/concierge/',
  'app/src/data/sampleQuestionGroups.ts',
  'app/src/domain/questionBank.ts',
  'app/src/features/draft-paper/',
  'app/src/paperAssembly/basketPersistence.ts',
  'app/src/paperAssembly/usePaperDraft.ts',
  'app/src/services/draftPapers.ts',
  'app/src/services/questionGroups.ts',
  'data/sql/schema.sql',
  'server/api.mjs',
  'scripts/verify-basket-persistence.mjs',
  'scripts/verify-concierge-desk.mjs',
  'scripts/verify-paper-draft.mjs',
  'scripts/verify-c8-',
  'scripts/smoke-c8-',
]

for (const file of changedFiles) {
  assert(
    `changed file is expected C8 PR A scope: ${file}`,
    allowedPrefixes.some((prefix) => file.startsWith(prefix) || file === prefix),
  )
}

if (failed > 0) {
  console.error(`\nC8 forbidden scope verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC8 forbidden scope verify passed: ${passed} passed, 0 failed`)
