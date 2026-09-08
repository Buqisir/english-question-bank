#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: [path.join(rootDir, 'app')] }))

const vite = await createServer({
  root: path.join(rootDir, 'app'),
  server: { host: '127.0.0.1', port: 0 },
})

let browser
try {
  await vite.listen()
  const origin = vite.resolvedUrls.local[0]
  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const page = await browser.newPage()
  await page.goto(origin)

  const result = await page.evaluate(async () => {
    const fileDownload = await import('/src/services/fileDownload.ts')
    const checks = []
    const pass = (name, condition) => {
      if (!condition) throw new Error(name)
      checks.push(name)
    }

    delete window.showSaveFilePicker
    delete window.showDirectoryPicker
    const unsupported = await fileDownload.prepareFileSaveTarget({
      mode: 'save-as',
      suggestedName: '测试.pdf',
      mimeType: 'application/pdf',
    })
    pass('unsupported save-as falls back to browser download', unsupported?.kind === 'download' && unsupported.fallbackFromSaveAs)

    const writes = []
    let pickerOptions = null
    window.showSaveFilePicker = async (options) => {
      pickerOptions = options
      return {
        createWritable: async () => ({
          write: async (blob) => writes.push(`write:${await blob.text()}`),
          close: async () => writes.push('close'),
        }),
      }
    }
    const fileTarget = await fileDownload.prepareFileSaveTarget({
      mode: 'save-as',
      suggestedName: '英语/试卷?.pdf',
      mimeType: 'application/pdf',
    })
    pass('save-as opens the native file picker with a safe suggested name', fileTarget?.kind === 'file' && pickerOptions?.suggestedName === '英语-试卷-.pdf')
    await fileDownload.saveBlobToTarget(new Blob(['paper']), 'server-name.pdf', fileTarget)
    pass('file target writes the blob and closes the writable stream', writes.join(',') === 'write:paper,close')

    window.showSaveFilePicker = async () => { throw new DOMException('cancelled', 'AbortError') }
    const cancelled = await fileDownload.prepareFileSaveTarget({
      mode: 'save-as',
      suggestedName: '取消.pdf',
      mimeType: 'application/pdf',
    })
    pass('cancelling the native picker cancels the operation', cancelled === null)

    const directoryWrites = []
    window.showDirectoryPicker = async () => ({
      getFileHandle: async (name) => ({
        createWritable: async () => ({
          write: async (blob) => directoryWrites.push(`${name}:${await blob.text()}`),
          close: async () => directoryWrites.push(`${name}:closed`),
        }),
      }),
    })
    const directoryTarget = await fileDownload.prepareFileSaveTarget({
      mode: 'save-as',
      suggestedName: '批量听写',
      mimeType: 'application/pdf',
      multiple: true,
    })
    await fileDownload.saveBlobToTarget(new Blob(['one']), '第一份.pdf', directoryTarget)
    await fileDownload.saveBlobToTarget(new Blob(['two']), '第二/份.pdf', directoryTarget)
    pass('batch save-as writes every server file into one chosen directory', directoryWrites.join(',') === '第一份.pdf:one,第一份.pdf:closed,第二-份.pdf:two,第二-份.pdf:closed')

    const browserDownloads = []
    const revoked = []
    const originalClick = HTMLAnchorElement.prototype.click
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    HTMLAnchorElement.prototype.click = function click() { browserDownloads.push(this.download) }
    URL.createObjectURL = () => 'blob:save-as-test'
    URL.revokeObjectURL = (url) => revoked.push(url)
    try {
      await fileDownload.saveBlobToTarget(new Blob(['fallback']), '普通/下载.pdf', unsupported)
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      HTMLAnchorElement.prototype.click = originalClick
      URL.createObjectURL = originalCreateObjectUrl
      URL.revokeObjectURL = originalRevokeObjectUrl
    }
    pass('fallback keeps the original one-click browser download path', browserDownloads[0] === '普通-下载.pdf' && revoked[0] === 'blob:save-as-test')
    return checks
  })

  for (const check of result) console.log(`PASS ${check}`)

  const sourceContracts = [
    ['个人空间 exposes save-as', 'app/src/features/my-space/MySpacePage.tsx', "downloadArtifact(artifact, 'save-as')"],
    ['草稿卷 exposes save-as', 'app/src/features/draft-paper/DraftPaperWorkbench.tsx', "exportPdf('save-as')"],
    ['生词组 exposes save-as', 'app/src/features/vocabulary-review/VocabularyReviewPage.tsx', "downloadVocabularySheet(option.kind, 'save-as')"],
    ['认词本轮错词 exposes save-as', 'app/src/features/vocabulary-dictation-workbench/VocabularyMeaningRecallPanel.tsx', "downloadRecordMaterial(activeRecord, 'bundle', 'save-as')"],
    ['单词复习 exposes save-as', 'app/src/features/vocabulary-dictation-workbench/VocabularyDictationWorkbench.tsx', "'save-as'"],
    ['卷面导出 accepts save-as', 'app/src/paperAssembly/usePaperExports.ts', "mode: FileSaveMode = 'download'"],
  ]
  for (const [label, file, marker] of sourceContracts) {
    assert.ok(readFileSync(path.join(rootDir, file), 'utf8').includes(marker), `${label}: missing ${marker}`)
    console.log(`PASS ${label}`)
  }

  console.log(`\nfile-save-as verify passed: ${result.length + sourceContracts.length} checks`)
} finally {
  await browser?.close()
  await vite.close()
}
