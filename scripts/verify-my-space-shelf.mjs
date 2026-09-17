#!/usr/bin/env node
/**
 * Personal Space display and behavior backstop. Visual assertions follow the
 * approved directory rail + grouped file-list composition; safety assertions
 * preserve the existing data, download, and irreversible-delete contracts.
 */

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

console.log('my-space-shelf verify: directory/list/menu display and behavior contract')

const css = read('app/src/features/my-space/MySpacePage.css')
const tsx = read('app/src/features/my-space/MySpacePage.tsx')
const unexpectedHex = css.match(/#[0-9a-fA-F]{3,8}\b/g) || []

assert('MySpacePage.css has zero hardcoded palette hex', unexpectedHex.length === 0, unexpectedHex.join(', '))
assert('MySpacePage.tsx does not use window.confirm', !tsx.includes('window.confirm'))
assert(
  'named permanent delete uses a custom alert dialog and preserves original-draft wording',
  tsx.includes('role="alertdialog"') && tsx.includes('删除草稿卷 PDF') && tsx.includes('此操作不可恢复。原草稿不受影响。'),
)
assert('delete dialog retains cancel and explicit PDF deletion actions', tsx.includes('取消') && tsx.includes('删除 PDF'))
assert('missing original draft still explains that its PDF remains downloadable', tsx.includes('原草稿卷已删除，PDF 仍可下载'))

assert('approved workspace renders a bounded folder rail and flexible main list', tsx.includes('my-space-workspace') && tsx.includes('my-space-rail') && tsx.includes('my-space-file-list'))
assert('file rows replace the obsolete card grid and fake thumbnails', tsx.includes('my-space-file-row') && !tsx.includes('my-space-grid') && !tsx.includes('my-space-card-thumb'))
assert('folder rail includes real all-files and folder counts', tsx.includes('全部文件') && tsx.includes('folder.artifactCount'))
assert('no global total is fabricated beside the all-files rail entry', !/全部文件<\/span>[\s\S]{0,120}artifacts\.length/.test(tsx))
assert('artifacts remain grouped into newest-first month sections', tsx.includes('my-space-month-group') && tsx.includes('b.localeCompare(a)'))
assert('row metadata preserves folder, page count, date, and student label', tsx.includes('folderNames.get') && tsx.includes('artifact.pageCount || 1') && tsx.includes('dateLabel') && tsx.includes('artifact.sourceDraftStudentLabel'))

assert('download and original draft remain visible row actions', tsx.includes('<Download size={16}') && tsx.includes('打开原草稿'))
assert('save-as remains connected to the existing download path', tsx.includes("downloadArtifact(artifact, 'save-as')"))
assert('ellipsis menu exposes exactly save-as and delete as menu item buttons', (tsx.match(/<button[^>]*[\s\S]{0,160}?role="menuitem"/g) || []).length === 2 && tsx.includes('另存为…') && tsx.includes('删除文件'))
assert('row and menu FluidHoverList instances disable gap clicks', (tsx.match(/gapClick=\{false\}/g) || []).length >= 3)
assert('menu is portalled and supports initial focus, Escape, and arrow keys', tsx.includes('createPortal(') && tsx.includes("event.key === 'Escape'") && tsx.includes("event.key === 'ArrowDown'") && tsx.includes("[role=\"menuitem\"]')?.focus("))
assert('menu placement guards viewport edges and bottom rows', tsx.includes('window.innerHeight') && tsx.includes('window.innerWidth'))
assert('folder switches dismiss an open file menu', /selectFolder[\s\S]{0,120}activeFileMenuCloser/.test(tsx))

assert('load token stale-response guard remains intact', tsx.includes('loadTokenRef.current !== token'))
assert('folder filtering still calls fetchMySpace with the selected folder', tsx.includes('fetchMySpace(folderId)'))
assert('download picker is prepared before the artifact becomes busy', tsx.indexOf('prepareFileSaveTarget') < tsx.indexOf('setBusyId(artifact.id)'))
assert('delete still reloads the current folder after the API succeeds', tsx.includes('await deleteMySpaceArtifact(artifact.id)') && tsx.includes('await load(selectedFolderId)'))

const forbiddenFutureControls = ['未分类', '新建文件夹', '预览 PDF', '重命名', '移动到', '复制为新草稿', '下一页', '搜索文件名']
const renderedFutureControls = forbiddenFutureControls.filter((label) => tsx.includes(`>${label}<`) || tsx.includes(`>${label}…<`))
assert('future-only controls are not rendered as placeholders', renderedFutureControls.length === 0, renderedFutureControls.join(', '))

if (failed > 0) {
  console.error(`\nmy-space-shelf verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nmy-space-shelf verify passed: ${passed} passed, 0 failed`)
