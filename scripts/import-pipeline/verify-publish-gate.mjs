/**
 * verify-publish-gate.mjs <paperId>
 *
 * End-to-end publish-gate check WITHOUT writing DB: build the package, then run
 * validatePaperImportPackage (the publish-time consistency gate that 02-publish's
 * --publish path runs inside publishPaperImportPackage). Prints {ok, blocking}.
 *
 * This is the gate that earlier verify-zj-package.mjs did NOT cover.
 *
 * Usage: node verify-publish-gate.mjs paper-zj-2020-jan
 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPaperImportAiPackageFiles } from '../../server/paper-import-ai/packageBuilder.mjs'
import { validatePaperImportPackage } from '../../server/paper-import/validator.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const paperId = process.argv[2]
if (!paperId) { console.error('usage: verify-publish-gate.mjs <paperId>'); process.exit(2) }

const dir = path.join(__dirname, 'papers', paperId)
const groups = JSON.parse(readFileSync(path.join(dir, 'groups.json'), 'utf8'))
const { paper, readingGroups, seven, cloze, grammar, application, continuation } = groups
const load = (key) => {
  const p = path.join(dir, `analysis-${key}.json`)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
}
const letters = ['a', 'b', 'c', 'd']
const analysesByGroupId = {}
readingGroups.forEach((g, i) => { const a = load(`reading-${letters[i]}`); if (a) analysesByGroupId[g.groupId] = a })

// 加载真 DOCX buffer(模拟真发布: packageBuilder 据此算 sha + 生成 docx file)
const config = JSON.parse(readFileSync(path.join(dir, 'config.json'), 'utf8'))
const sourceDocx = existsSync(config.docxPath)
  ? { fileName: path.basename(config.docxPath), contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: readFileSync(config.docxPath) }
  : null
// 复现 02-publish L52-55: 用 docx sha256 填 paper.sourceHash(否则 import-meta sha='pending' 不符 schema)
if (sourceDocx) paper.sourceHash = createHash('sha256').update(sourceDocx.buffer).digest('hex')

const files = buildPaperImportAiPackageFiles({
  parseResult: { paper, readingGroups },
  analysesByGroupId,
  sevenChoicesGroup: seven, sevenChoicesAnalysis: load('seven'),
  clozeGroup: cloze, clozeAnalysis: load('cloze'),
  grammarFillGroup: grammar, grammarFillAnalysis: load('grammar'),
  applicationGroup: application, continuationGroup: continuation,
  sourceDocx,
})

// docx 作为 files[0] 由 packageBuilder 输出(docxPath 存在则非 null),sha 门实跑并通过;
// filter(Boolean) 仅防御性去 null(sourceDocx 缺失时)。等价 publisher.mjs 的 validatePaperImportPackage(files)。
const v = validatePaperImportPackage(files.filter(Boolean))
const blockArr = v.blockingIssues || v.blocking || []
const out = {
  paperId,
  ok: v.ok,
  vKeys: Object.keys(v),
  blockingCount: blockArr.length,
  blocking: blockArr.map((i) => `${i.code || i.id || '?'}: ${i.message || ''}`).slice(0, 10),
  normalizationGroups: v.normalizationGroups,
}
console.log(JSON.stringify(out, null, 2))
