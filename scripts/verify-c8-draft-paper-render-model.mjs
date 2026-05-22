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

function baselineRef() {
  try {
    execFileSync('git', ['rev-parse', '--verify', 'github/main'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return 'github/main'
  } catch {
    return 'main'
  }
}

console.log('C8 verify: draft paper render model')

const server = read('server/api.mjs')
const printRendererDiff = execFileSync('git', ['diff', baselineRef(), '--', 'server/print-renderer.mjs'], {
  cwd: rootDir,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})

assert('print-renderer body untouched', printRendererDiff.trim() === '')
assert('draft render calls buildPrintHtml', /buildPrintHtml\(\s*\{[\s\S]{0,260}questionNumberStart/.test(server))
assert('draft render uses student version only', /versionType:\s*'student'/.test(server))
assert('draft render uses exam print style', /printStyle:\s*'exam'/.test(server))
assert('draft render starts numbering at 1', /questionNumberStart:\s*1/.test(server))
assert('draft render emits section_header blocks', /type:\s*'section_header'/.test(server))
assert('draft render emits page_break blocks', /type:\s*'page_break'/.test(server))
assert('draft render emits question_group blocks', /type:\s*'question_group'/.test(server))
assert('draft render never emits leading page break before first group', /index > 0 && item\.pageBreakBefore/.test(server))
assert('draft page break suggestions skip the first group', /index > 0 && reason && !item\.pageBreakBefore/.test(server))
assert('section heading helper uses Chinese numbering', server.includes('cnSectionNumber'))
assert('section headings are based on group type transitions', /const groupType = item\.questionGroup\?\.groupType[\s\S]{0,240}previousType/.test(server))
assert('non-contiguous same type can create new later heading by transition logic', /previousType = groupType/.test(server))
assert('footer is injected outside print renderer body', server.includes('addDraftFooterCss'))
assert('footer contains title and page counter', /counter\(page\)/.test(server))
assert('draft PDF endpoint uses buildDraftPrintHtml', /const html = buildDraftPrintHtml\(draftPaper\)/.test(server))
assert('empty export uses Chinese reason', server.includes('请先添加题组'))

const workbench = read('app/src/features/draft-paper/DraftPaperWorkbench.tsx')
assert('preview uses iframe srcDoc from A4 preview HTML', /<iframe[\s\S]{0,120}srcDoc=\{previewHtml\}/.test(workbench))
assert('preview injects screen-only A4 dimensions', workbench.includes('buildA4PreviewHtml') && workbench.includes('width: 210mm') && workbench.includes('padding: 20mm 18mm'))
assert('browser print writes same printHtml', /document\.write\(draftPaper\.printHtml\)/.test(workbench))
assert('A4 preview has no edit callbacks inside iframe', !/iframe[\s\S]{0,200}onClick/.test(workbench))
assert('outline shows source metadata outside preview', workbench.includes('compactSource(item)'))
assert('outline hides page-break control for first group', workbench.includes('const canPageBreakBefore = index > 0'))
assert('outline only shows page-break marker when page break is allowed', /canPageBreakBefore && item\.pageBreakBefore && <div className="draft-break-marker">分页<\/div>/.test(workbench))
assert('workbench exposes PDF download', workbench.includes('下载 PDF'))
assert('workbench exposes browser print', workbench.includes('浏览器打印'))
assert('workbench has no answer export label', !workbench.includes('答案版'))
assert('workbench has no explanation export label', !workbench.includes('解析版'))

if (failed > 0) {
  console.error(`\nC8 draft paper render model verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC8 draft paper render model verify passed: ${passed} passed, 0 failed`)
