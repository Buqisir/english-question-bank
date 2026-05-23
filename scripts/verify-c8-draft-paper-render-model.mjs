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
const draftRoutes = read('server/draft-paper/draftPaperRoutes.mjs')
const draftStore = read('server/draft-paper/draftPaperStore.mjs')
const printRendererDiff = execFileSync('git', ['diff', baselineRef(), '--', 'server/print-renderer.mjs'], {
  cwd: rootDir,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})

assert('print-renderer body untouched', printRendererDiff.trim() === '')
assert('draft render calls buildPrintHtml', /buildPrintHtml\(\s*\{[\s\S]{0,260}questionNumberStart/.test(draftStore))
assert('draft render uses student version only', /versionType:\s*'student'/.test(draftStore))
assert('draft render uses exam print style', /printStyle:\s*'exam'/.test(draftStore))
assert('draft render starts numbering at 1', /questionNumberStart:\s*1/.test(draftStore))
assert('draft render emits section_header blocks', /type:\s*'section_header'/.test(draftStore))
assert('draft render emits page_break blocks', /type:\s*'page_break'/.test(draftStore))
assert('draft render emits question_group blocks', /type:\s*'question_group'/.test(draftStore))
assert('draft render never emits leading page break before first group', /index > 0 && item\.pageBreakBefore/.test(draftStore))
assert('draft page break suggestions skip the first group', /index > 0 && reason && !item\.pageBreakBefore/.test(draftStore))
assert('section heading helper uses Chinese numbering', draftStore.includes('cnSectionNumber'))
assert('section headings are based on group type transitions', /const groupType = item\.questionGroup\?\.groupType[\s\S]{0,240}previousType/.test(draftStore))
assert('non-contiguous same type can create new later heading by transition logic', /previousType = groupType/.test(draftStore))
assert('footer is injected outside print renderer body', draftStore.includes('addDraftFooterCss'))
assert('footer contains title and page counter', /counter\(page\)/.test(draftStore))
assert('draft PDF endpoint uses buildDraftPrintHtml', /const html = buildDraftPrintHtml\(draftPaper\)/.test(draftStore) && draftRoutes.includes('exportDraftPaperPdf'))
assert('empty export uses Chinese reason', draftStore.includes('请先添加题组') || draftRoutes.includes('请先添加题组'))

const workbench = read('app/src/features/draft-paper/DraftPaperWorkbench.tsx')
const outline = read('app/src/features/draft-paper/DraftPaperOutline.tsx')
const workbenchCss = read('app/src/features/draft-paper/DraftPaperWorkbench.css')
const previewHtml = read('app/src/features/draft-paper/draftPaperPreviewHtml.ts')
assert('preview uses iframe srcDoc from A4 preview HTML', /<iframe[\s\S]{0,120}srcDoc=\{previewHtml\}/.test(workbench))
assert('preview HTML generation lives outside workbench', workbench.includes("from './draftPaperPreviewHtml'") && !/function buildA4PreviewHtml/.test(workbench))
assert('preview injects screen-only A4 dimensions', previewHtml.includes('buildA4PreviewHtml') && previewHtml.includes('width: 210mm') && previewHtml.includes('padding: 20mm 18mm'))
assert('preview builds paginated long-scroll A4 pages', previewHtml.includes('paginateA4Preview') && previewHtml.includes('preview-page') && previewHtml.includes("'第 ' + pageNumber + ' 页'"))
assert('preview iframe does not add a second mat color', previewHtml.includes('html {\n    background: transparent') && previewHtml.includes('body {\n    background: transparent') && workbenchCss.includes('.draft-a4-sheet iframe {\n  background: transparent'))
assert('preview outer desk keeps subtle paper mat', workbenchCss.includes('linear-gradient(180deg, #fbfaf6 0%, #f3efe7 100%)'))
assert('preview iframe is tall enough to show a full A4 page', workbenchCss.includes('height: 1188px'))
assert('browser print writes same printHtml', /document\.write\(draftPaper\.printHtml\)/.test(workbench))
assert('A4 preview has no edit callbacks inside iframe', !/iframe[\s\S]{0,200}onClick/.test(workbench))
assert('outline extraction lives in its own component', workbench.includes("from './DraftPaperOutline'") && workbench.includes('<DraftPaperOutline'))
assert('outline component shows source metadata outside preview', outline.includes('compactSource(item)'))
assert('outline component hides page-break control for first group', outline.includes('const canPageBreakBefore = index > 0'))
assert('outline component only shows page-break marker when page break is allowed', /canPageBreakBefore && item\.pageBreakBefore && <div className="draft-break-marker">分页<\/div>/.test(outline))
assert('workbench no longer owns outline rendering details', !workbench.includes('compactSource(item)') && !workbench.includes('draft-outline-panel'))
assert('workbench exposes PDF download', workbench.includes('下载 PDF'))
assert('workbench exposes browser print', workbench.includes('浏览器打印'))
assert('workbench has no answer export label', !workbench.includes('答案版'))
assert('workbench has no explanation export label', !workbench.includes('解析版'))

if (failed > 0) {
  console.error(`\nC8 draft paper render model verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC8 draft paper render model verify passed: ${passed} passed, 0 failed`)
