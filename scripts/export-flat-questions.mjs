#!/usr/bin/env node
/**
 * export-flat-questions.mjs — 把题库拍平成一份通用的、可被外部消费的扁平 JSON 契约。
 *
 * 设计原则（与项目"题库是可复用内容源"的定位一致）：
 *   - 这是一个 **通用导出契约**，不绑定任何单一消费者（学生打卡只是第一个消费者）。
 *   - **只读**：只消费已发布的 paper-assets，不改任何现有数据 / 契约 / schema。
 *   - 第一版只导出 **语法填空 (grammarFill)**（题库这边最成熟、考点最全的题型）。
 *
 * 单位 = **题组（整篇语法填空）**，内嵌每个空的 blanks[]：
 *   - 符合真实考试形态（一篇 10 空一起做，不会单独出一个空）。
 *   - 每个空带 facetKey（考点）+ labelZh + 答案 + 解析 → 消费者可按考点筛 / 做学情画像。
 *   - 题组级 facetKeys[] = 这篇覆盖的考点集合，便于"本周练某语法点"筛篇。
 *
 * 稳定 ID（消费者用来记"已出题 / 判重"）：
 *   - group.id / blank.questionId 内容寻址、稳定；source.sourceFileSha256 可判题源重叠。
 *
 * 用法：
 *   node scripts/export-flat-questions.mjs            # 写到 exports/question-bank-flat.json
 *   node scripts/export-flat-questions.mjs --out path.json
 *   node scripts/export-flat-questions.mjs --stdout   # 打印到 stdout
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FACET_FRAMEWORKS } from '../app/src/features/paper-intelligence/grammarFillFacetRegistry.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const ASSETS_DIR = path.join(rootDir, 'app/public/paper-assets')

const SCHEMA_VERSION = 'qbank-flat-export-v1'

function readJsonSafe(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Resolve the directory that actually holds a paper's files, tolerant to the
 * two real layouts in the repo:
 *   - <paper>/versions/v<N>/   (canonical; take the highest N)
 *   - <paper>/latest/          (some assets)
 *   - <paper>/                 (files directly at root)
 * Returns the dir that contains paper-asset.json, or null.
 */
function resolvePaperDir(paperRoot) {
  const candidates = []
  const latest = path.join(paperRoot, 'latest')
  if (existsSync(latest) && statSync(latest).isDirectory()) candidates.push(latest)
  const versionsDir = path.join(paperRoot, 'versions')
  if (existsSync(versionsDir) && statSync(versionsDir).isDirectory()) {
    const versions = readdirSync(versionsDir)
      .filter((v) => /^v\d+$/.test(v))
      .sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))
    if (versions[0]) candidates.push(path.join(versionsDir, versions[0]))
  }
  candidates.push(paperRoot)
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'paper-asset.json'))) return dir
  }
  return null
}

function buildFlatExport(assetsDir = ASSETS_DIR) {
  const skipped = []
  const groupsOut = []

  if (!existsSync(assetsDir)) {
    return { groups: [], skipped: [{ paperId: '(none)', reason: 'no paper-assets dir' }] }
  }

  const paperIds = readdirSync(assetsDir).filter((name) =>
    statSync(path.join(assetsDir, name)).isDirectory(),
  )

  for (const paperId of paperIds) {
    const dir = resolvePaperDir(path.join(assetsDir, paperId))
    if (!dir) {
      skipped.push({ paperId, reason: 'no paper-asset.json' })
      continue
    }
    const asset = readJsonSafe(path.join(dir, 'paper-asset.json'))
    const meta = readJsonSafe(path.join(dir, 'import-meta.json')) ?? {}
    const answerKey = readJsonSafe(path.join(dir, 'answer-key.json')) ?? {}
    const gfAnalysis = readJsonSafe(
      path.join(dir, 'analyses', 'grammar-fill-analysis-v1.json'),
    )

    const content = asset?.content
    if (!content?.groups) {
      skipped.push({ paperId, reason: 'no content.groups' })
      continue
    }

    const answers = answerKey.answers ?? {}
    const metaGroups = meta.groups ?? {}
    const paperMeta = meta.paper ?? asset.paper ?? {}
    const source = {
      year: paperMeta.year ?? null,
      region: paperMeta.region ?? null,
      paperName: paperMeta.paperName ?? null,
      sourceType: paperMeta.sourceType ?? null,
      sourceFileSha256: meta.sourceFileSha256 ?? null,
    }

    const gfGroupIds = Object.keys(content.groups).filter(
      (gid) => content.groups[gid]?.groupType === 'grammarFill',
    )
    if (gfGroupIds.length === 0) {
      skipped.push({ paperId, reason: 'no grammarFill group' })
      continue
    }

    for (const groupId of gfGroupIds) {
      const group = content.groups[groupId]
      const metaGroup = metaGroups[groupId] ?? {}
      const passageText = (group.passage?.paragraphs ?? [])
        .map((p) => p.text ?? '')
        .join('\n')
        .trim()

      const blanks = []
      const facetKeySet = new Set()
      for (const qid of group.questionIds ?? []) {
        const q = content.questions?.[qid] ?? {}
        const ana = gfAnalysis?.blanks?.[qid] ?? null
        const facetKey = ana?.facetKey ?? null
        if (facetKey) facetKeySet.add(facetKey)
        const blank = {
          questionId: qid,
          blankNo: q.questionNo ?? ana?.blankNo ?? null,
          blankType: ana?.blankType ?? null,
          hint: ana?.hint ?? null,
          answer: answers[qid]?.answer ?? null,
          facetKey,
          facetLabel: facetKey ? (FACET_FRAMEWORKS[facetKey]?.labelZh ?? null) : null,
          role: ana?.role ?? null,
          path: ana?.path ?? null,
          analysis: ana
            ? {
                reason: ana.reason ?? null,
                evidence: ana.evidence ?? [],
                teachingNote: ana.teachingNote ?? null,
              }
            : null,
        }
        blanks.push(blank)
      }

      groupsOut.push({
        id: groupId,
        paperId,
        type: 'grammarFill',
        source,
        difficulty: metaGroup.difficulty ?? null,
        summary: metaGroup.summary ?? null,
        passageText,
        blanks,
        facetKeys: [...facetKeySet],
        hasAnalysis: facetKeySet.size > 0,
        blankCount: blanks.length,
      })
    }
  }

  return { groups: groupsOut, skipped }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2)
  const toStdout = argv.includes('--stdout')
  const outIdx = argv.indexOf('--out')
  const outPath =
    outIdx !== -1 && argv[outIdx + 1]
      ? path.resolve(argv[outIdx + 1])
      : path.join(rootDir, 'exports', 'question-bank-flat.json')

  const { groups, skipped } = buildFlatExport()
  const blankCount = groups.reduce((n, g) => n + g.blankCount, 0)
  const analyzedGroups = groups.filter((g) => g.hasAnalysis).length

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedFrom: 'english-question-bank',
    exportedAt: new Date().toISOString(),
    type: 'grammarFill',
    stats: {
      groupCount: groups.length,
      analyzedGroupCount: analyzedGroups,
      blankCount,
    },
    groups,
  }

  if (toStdout) {
    process.stdout.write(JSON.stringify(payload, null, 2))
    return
  }

  mkdirSync(path.dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8')

  console.log(`✓ 导出 ${groups.length} 个语法填空题组 / ${blankCount} 个空（其中 ${analyzedGroups} 组带解析）`)
  console.log(`  → ${path.relative(rootDir, outPath)}`)
  if (skipped.length) {
    console.log(`  跳过 ${skipped.length} 套卷：`)
    for (const s of skipped) console.log(`    - ${s.paperId}: ${s.reason}`)
  }
}

export { buildFlatExport, SCHEMA_VERSION }

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
