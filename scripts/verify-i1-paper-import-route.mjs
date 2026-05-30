#!/usr/bin/env node

import { readFileSync } from 'node:fs'
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
