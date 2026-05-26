#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let passed = 0

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`${name}${detail ? `\n${detail}` : ''}`)
  }
  passed += 1
  console.log(`ok - ${name}`)
}

function readRepoFile(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function gitLines(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function gitStatusLines() {
  try {
    return execFileSync('git', ['status', '--short', '--untracked-files=all', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

function changedFiles() {
  const statusFiles = gitStatusLines().map((line) => {
    const file = line.slice(3)
    return file.includes(' -> ') ? file.split(' -> ').at(-1) : file
  })
  return [...new Set([...gitLines(['diff', '--name-only', 'github/main...HEAD']), ...gitLines(['diff', '--name-only']), ...statusFiles])]
}

function assertAllowedScope() {
  const allowedPrefixes = [
    'server/paper-import-ai/',
    'server/ai-providers/',
    'app/src/features/paper-import-ai/',
  ]
  const allowed = new Set([
    'app/src/App.tsx',
    'app/src/services/paperImportAi.ts',
    'scripts/README.md',
    'scripts/verify-c7-paper-import-publish.mjs',
    'scripts/verify-ci.mjs',
    'scripts/verify-i1-paper-import-analysis.mjs',
    'scripts/verify-i1-paper-import-route.mjs',
    'scripts/verify-i1-paper-import-splitter.mjs',
    'server/paper-import/publisher.mjs',
  ])
  const files = changedFiles()
  const unexpected = files.filter((file) => !allowed.has(file) && !allowedPrefixes.some((prefix) => file.startsWith(prefix)))
  assert('I1 paper-import-ai route changed files stay in the route whitelist', unexpected.length === 0, unexpected.join('\n'))

  const forbidden = files.filter(
    (file) =>
      file.startsWith('prompts/') ||
      file.startsWith('shared/papersurface/') ||
      file.startsWith('app/src/domain/') ||
      file.startsWith('schemas/') ||
      file.endsWith('Adapter.ts') ||
      file === 'app/src/features/paper-import/PaperImportWorkbench.tsx'
  )
  assert('I1 Step 2 forbidden scopes are untouched', forbidden.length === 0, forbidden.join('\n'))
}

function assertRouteUiContract() {
  const appSource = readRepoFile('app/src/App.tsx')
  const serviceSource = readRepoFile('app/src/services/paperImportAi.ts')
  const pageSource = readRepoFile('app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx')
  const cssSource = readRepoFile('app/src/features/paper-import-ai/paperImportAiWorkbench.css')

  assert('App imports PaperImportAiWorkbench', appSource.includes("features/paper-import-ai/PaperImportAiWorkbench"))
  assert('App recognizes ?view=paper-import-ai', appSource.includes("get('view') === 'paper-import-ai'"))
  assert('App can open paper-import-ai route', appSource.includes("url.searchParams.set('view', 'paper-import-ai')"))
  assert('App renders PaperImportAiWorkbench route', appSource.includes('<PaperImportAiWorkbench onBackToWorkbench={paperImportAiOnBackToWorkbench} />'))
  assert('App keeps C7 paper-import route distinct', appSource.includes("get('view') === 'paper-import'"))

  assert('service calls Step 1 parse endpoint', serviceSource.includes('/api/paper-import-ai/parse'))
  assert('service does not call save endpoint', !serviceSource.includes('/api/paper-import-ai/save'))
  assert('service calls Step 4 publish endpoint', serviceSource.includes('/api/paper-import-ai/publish'))
  assert('service accepts paper DOCX upload', serviceSource.includes("formData.append('files', file, file.name)"))
  assert('service accepts optional answer DOCX upload', serviceSource.includes('answerFile') && serviceSource.includes("formData.append('files', answerFile, answerFile.name)"))

  assert('page labels local paper import route', pageSource.includes('Local-first Paper Import'))
  assert('page states answer comparison purpose', pageSource.includes('官方答案和 AI 判断做对照'))
  assert('page states publish behavior', pageSource.includes('保存为正式试卷资产'))
  assert('page supports optional answer analysis file', pageSource.includes('选择答案解析版') && pageSource.includes('答案来源'))
  assert('page displays reading group preview', pageSource.includes('Reading A-D 预览'))
  assert('page displays skipped panel separately', pageSource.includes('跳过项'))
  assert('page has publish handler but no legacy save handler', pageSource.includes('handlePublish') && !/\/save|handleSave|savePaperImportAi/i.test(pageSource))
  assert('page CSS is distinct from C7 import CSS', cssSource.includes('.pi-ai-shell') && !cssSource.includes('.pi-import-shell'))
}

function assertScriptIndex() {
  const readme = readRepoFile('scripts/README.md')
  assert('verify index lists I1 route verifier', readme.includes('verify-i1-paper-import-route.mjs'))
}

function main() {
  assertAllowedScope()
  assertRouteUiContract()
  assertScriptIndex()
  console.log(`I1 paper-import-ai route verify PASSED: ${passed} checks`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
