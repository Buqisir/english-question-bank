#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import {
  cpSync, existsSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync,
  readdirSync, renameSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { resolveReviewFile } from '../../server/import-review/revisionProjection.mjs'
import { PRODUCT_MANIFEST, productInputDigest } from '../../server/paper-import/frozenProducts.mjs'
import {
  downloadReviewFile, hydrateReviewRevision, hydratedEvidenceBase, listReviewPapers,
  prepareReviewPush, reboundProductManifestBytes, reviewCandidate, uploadReviewBundle,
} from './review.mjs'

const cache = path.join(homedir(), '.cache', 'eqbank')
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const hardFile = ({ role = '', mediaType = '' }) => /^(audio|image)\//u.test(mediaType)
  || role === 'pdf_product'
  || /^(source_manifest|materialization|question_|official_|ocr_source_|content_media|listening_audio_|analyzed_package_)/u.test(role)

function hashFile(file) {
  if (!existsSync(file)) return null
  if (!lstatSync(file).isFile()) throw new Error(`不是普通文件：${file}`)
  return sha256(readFileSync(file))
}

export function checkEnrichmentDiff(directory, baseFiles, allowedOutputs, evidence = []) {
  const base = new Map(baseFiles.map(file => [file.path, file]))
  const changed = []
  for (const file of baseFiles) {
    const hash = hashFile(resolveReviewFile(directory, file.path))
    if (hash === file.sha256) continue
    if (hardFile(file)) throw new Error(`硬门文件哈希变化：${file.path}`)
    if (!hash || !allowedOutputs.includes(file.path)) throw new Error(`未授权的文件变化：${file.path}`)
    changed.push(file.path)
  }
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isDirectory()) continue
    const relative = path.relative(directory, path.join(entry.parentPath, entry.name))
    if (!entry.isFile()) throw new Error(`不是普通文件：${relative}`)
    if (base.has(relative)) continue
    if (!allowedOutputs.includes(relative) && !evidence.includes(relative)) {
      throw new Error(`未授权的新增文件：${relative}`)
    }
    changed.push(relative)
  }
  return changed.sort()
}

function checkPushManifest(base, next, changed, evidence) {
  const files = new Map(next.files.map(file => [file.path, file]))
  for (const original of base.files) {
    const file = files.get(original.path)
    if (!file || file.role !== original.role || file.mediaType !== original.mediaType
      || (file.sha256 !== original.sha256 && !changed.includes(original.path))) {
      throw new Error(`待推清单改动封存文件：${original.path}`)
    }
  }
  for (const file of next.files) {
    if (base.files.some(original => original.path === file.path)) continue
    if (!changed.includes(file.path) || hardFile(file)
      || (evidence.includes(file.path) && !/(?:^|_)evidence$/u.test(file.role))) {
      throw new Error(`待推清单新增非追补文件：${file.path}`)
    }
  }
  if (changed.some(file => !files.has(file))) throw new Error('待推清单缺少追补产物')
  for (const key of ['sourceDigest', 'candidateDigest', 'visibleStructureDigest']) {
    if (base[key] !== next[key]) throw new Error(`待推清单改变 ${key}`)
  }
}

function writeAtomic(file, contents) {
  const temporary = `${file}.${randomUUID()}`
  writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600 })
  renameSync(temporary, file)
}

async function baseline(revision) {
  const directory = path.join(cache, 'revisions', revision.id)
  let invalid
  if (existsSync(directory)) {
    try {
      const saved = hydratedEvidenceBase(directory)
      if (saved?.revision.id === revision.id && saved.revision.bundleDigest === revision.bundleDigest
        && digestJson(saved.revision.manifest) === digestJson(revision.manifest)
        && revision.manifest.files.every(file => hashFile(resolveReviewFile(directory, file.path)) === file.sha256)) return directory
    } catch (error) {
      console.warn(`封存缓存无法验证：${error.message}`)
    }
    invalid = `${directory}.invalid-${randomUUID()}`
    renameSync(directory, invalid)
  }
  try {
    await hydrateReviewRevision(revision, directory)
  } catch (error) {
    if (invalid) renameSync(invalid, directory)
    throw error
  }
  return directory
}

async function enrichPaper(enricher, paper, options, directory) {
  const { paperId } = paper
  if (paper.reviewKind === 'candidate' && paper.hasTeachingAnalyses === false && enricher.needsAnalysis) {
    return { state: 'skip', reason: '无封存教学讲解', baseRev: paper.latestRevisionId }
  }
  const revision = await reviewCandidate(paperId)
  if (!revision) return { state: 'skip', reason: '无已封存 Candidate' }
  const baseRev = revision.id
  try {
    if (!/^rev-[a-z0-9-]+$/iu.test(baseRev)) throw new Error('无效的 Candidate revision ID')
    const baseDir = options.plan ? null : await baseline(revision)
    const workDir = path.join(directory, paperId, baseRev)
    const bundle = path.join(workDir, 'bundle')
    const files = revision.manifest.files
    const ctx = {
      paperId, baseRev, bundle, files,
      async readBase(file) {
        const descriptor = files.find(item => item.path === file)
        if (!descriptor) throw new Error(`封存清单缺少 ${file}`)
        return baseDir ? readJson(resolveReviewFile(baseDir, file)) : JSON.parse(await downloadReviewFile(revision, descriptor))
      },
      writeJson(file, data) {
        const target = resolveReviewFile(bundle, file)
        const contents = `${JSON.stringify(data, null, 2)}\n`
        if (hashFile(target) === sha256(Buffer.from(contents))) return
        mkdirSync(path.dirname(target), { recursive: true })
        writeAtomic(target, contents)
      },
    }
    const baseFiles = [...files]
    if (!options.plan) {
      for (const entry of readdirSync(path.join(baseDir, 'signals'))) {
        const relative = `signals/${entry}`
        baseFiles.push({ path: relative, sha256: hashFile(resolveReviewFile(baseDir, relative)) })
      }
      if (!existsSync(bundle)) {
        mkdirSync(workDir, { recursive: true, mode: 0o700 })
        const staging = path.join(workDir, `.bundle-${randomUUID()}`)
        // Remove only this attempt's staging directory if the copy is interrupted.
        try {
          cpSync(baseDir, staging, { recursive: true, errorOnExist: true, force: false })
          renameSync(staging, bundle)
        } finally { rmSync(staging, { recursive: true, force: true }) }
      }
    }
    const plan = await enricher.plan(ctx)
    if (plan.state === 'skip' || options.plan) return { ...plan, baseRev }
    const sealedProducts = files.some(file => file.path === PRODUCT_MANIFEST) ? await ctx.readBase(PRODUCT_MANIFEST) : null
    const printInputDigest = sealedProducts ? productInputDigest(baseDir, files) : null
    const reboundHash = sealedProducts && sealedProducts.inputDigest !== printInputDigest
      ? sha256(reboundProductManifestBytes(sealedProducts, printInputDigest)) : null
    const result = await enricher.run(ctx, plan)
    const evidence = result.evidence ?? []
    const checkDiff = () => {
      // Resume a prior preparation only if it changed exactly the input digest.
      const outputs = reboundHash && hashFile(resolveReviewFile(bundle, PRODUCT_MANIFEST)) === reboundHash
        ? [...enricher.allowedOutputs, PRODUCT_MANIFEST] : enricher.allowedOutputs
      return checkEnrichmentDiff(bundle, baseFiles, outputs, evidence)
    }
    checkDiff()
    const request = await enricher.agentRequest?.(ctx, result)
    if (request) {
      const requestPath = path.join(workDir, 'agent-request.json')
      const responsePath = path.join(workDir, 'agent-response.json')
      const contents = `${JSON.stringify(request, null, 2)}\n`
      if (!existsSync(requestPath) || readFileSync(requestPath, 'utf8') !== contents) writeAtomic(requestPath, contents)
      if (!existsSync(responsePath)) {
        return { state: 'waiting-agent', reason: `${result.reason}；请求 ${requestPath}`, baseRev }
      }
      await enricher.mergeAgentResponse(ctx, result, request, readJson(responsePath))
    }
    if (!checkDiff().some(file => file !== PRODUCT_MANIFEST)) {
      return { state: 'unchanged', reason: result.reason, baseRev }
    }
    const { manifest, projection } = prepareReviewPush(bundle, { expectedBaseRevisionId: baseRev })
    const changed = checkDiff()
    const rebound = changed.includes(PRODUCT_MANIFEST)
    if (rebound && projection.printInputDigest !== printInputDigest) throw new Error('封存 PDF 的打印输入已变化')
    checkPushManifest(revision.manifest, manifest, changed, evidence)
    const detail = `${result.reason}；硬门哈希一致${rebound ? '；沿用原 PDF，仅更新清单输入摘要' : ''}`
    const prepared = path.join(workDir, 'prepared.json')
    if (!options.push && existsSync(prepared) && readJson(prepared).bundleDigest === manifest.bundleDigest) {
      return { state: 'unchanged', reason: detail, baseRev }
    }
    const pushed = options.push ? await uploadReviewBundle(bundle, manifest, path.join(workDir, 'upload-timeline.jsonl')) : null
    if (!pushed) writeAtomic(prepared, `${JSON.stringify({ bundleDigest: manifest.bundleDigest })}\n`)
    const state = pushed ? `已推 ${pushed.revision.id}` : '可 push'
    return { state: 'ok', reason: `${state}；${changed.join(', ')}；${detail}`, baseRev }
  } catch (error) {
    return { state: 'fail', reason: error.message, baseRev }
  }
}

async function main() {
  const [name, ...args] = process.argv.slice(2)
  const { values: options } = parseArgs({ args, options: {
    paper: { type: 'string', multiple: true }, all: { type: 'boolean' },
    'dry-run': { type: 'boolean' }, push: { type: 'boolean' }, 'no-agent': { type: 'boolean' },
  } })
  options.plan = options['no-agent']
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name ?? '')
    || Boolean(options.paper) === Boolean(options.all) || (options.push && (options.plan || options['dry-run']))) {
    throw new Error('用法：enrich.mjs <enricher> (--paper <id>... | --all) [--dry-run | --push] [--no-agent（仅规划）]')
  }
  const { default: enricher } = await import(`./enrichers/${name}.mjs`)
  const papers = options.all ? (await listReviewPapers()).filter(paper => paper.reviewKind === 'candidate')
    : [...new Set(options.paper)].map(paperId => ({ paperId }))
  const directory = path.join(cache, 'enrich', name)
  const scope = options.all ? 'all' : digestJson(papers.map(({ paperId }) => paperId).sort()).split(':')[1].slice(0, 12)
  const report = `report-${name}-${scope}-${Date.now()}-${process.pid}.md`
  const locks = path.join(cache, 'enrich', 'locks')
  mkdirSync(locks, { recursive: true, mode: 0o700 })
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const lines = ['| 卷 | 状态 | 原因 | 基线 revision |', '| --- | --- | --- | --- |']
  console.log(lines.join('\n'))
  for (const paper of papers) {
    let result
    let lock
    try {
      if (!/^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(paper.paperId)) throw new Error('无效的 paperId')
      lock = path.join(locks, `${paper.paperId}.lock`)
      closeSync(openSync(lock, 'wx', 0o600))
      try {
        try { result = await enrichPaper(enricher, paper, options, directory) }
        catch (error) { result = { state: 'fail', reason: error.message } }
        const baseRev = result.baseRev ?? paper.latestRevisionId ?? ''
        const revisionDir = /^rev-[a-z0-9-]+$/iu.test(baseRev) ? baseRev : 'no-revision'
        const workDir = path.join(directory, paper.paperId, revisionDir)
        mkdirSync(workDir, { recursive: true, mode: 0o700 })
        const file = path.join(workDir, 'result.json')
        writeAtomic(file, `${JSON.stringify({ paperId: paper.paperId, baseRev, state: result.state, reason: result.reason }, null, 2)}\n`)
        // Snapshot this run's row while the per-paper lock still protects the result.
        result = readJson(file)
      } finally { unlinkSync(lock) }
    } catch (error) {
      result = { state: 'fail', reason: error.code === 'EEXIST' && error.path === lock ? '该卷正在追补' : error.message }
    }
    if (result.state === 'fail') process.exitCode = 1
    const fields = [paper.paperId, result.state, result.reason, result.baseRev ?? paper.latestRevisionId ?? '']
      .map(value => String(value).replace(/\s+/gu, ' ').replaceAll('|', '\\|'))
    const row = `| ${fields.join(' | ')} |`
    lines.push(row)
    console.log(row)
  }
  writeAtomic(path.join(directory, report), `${lines.join('\n')}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
