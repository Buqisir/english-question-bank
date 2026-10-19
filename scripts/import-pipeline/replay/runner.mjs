#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyDeclarations, compare, validateDeclarations } from './compare.mjs'
import { coverage, digest, frozenPath, readJson, verifyCorpus } from './corpus.mjs'
import { entryPath, resolveRef, snapshot } from './snapshot.mjs'

const root = path.resolve(import.meta.dirname, '../../..')

function locateReferenceDiffs(differences, directory, paper) {
  if (!differences.length) return
  const confirmation = readJson(frozenPath(directory, paper.inputs.confirmation))
  const evidence = readJson(frozenPath(directory, paper.inputs.evidence))
  for (const diff of differences) {
    for (const context of Object.values(diff.context)) {
      const locator = context.source?.locator || context.labelSource?.locator || context.locator
      if (!locator?.region) continue
      const page = confirmation.documents.find((document) => document.documentId === locator.documentId)
        ?.pages.find((page) => page.page === locator.page)
      const observations = new Map((evidence.documents.find((document) => document.documentId === locator.documentId)
        ?.pages.find((page) => page.page === locator.page)?.observations || []).map((entry) => [entry.observationId, entry]))
      const region = locator.region
      // Geometric candidates, not a claim that an ambiguous bounding union has one owner.
      context.sourceItemCandidates = (page?.orderedItems || []).filter((item) => item.observationIds.some((id) => {
        const box = observations.get(id)?.region
        return box && box.x < region.x + region.width && box.x + box.width > region.x
          && box.y < region.y + region.height && box.y + box.height > region.y
      })).map((item) => ({ documentId: locator.documentId, page: locator.page, itemId: item.itemId }))
    }
  }
}

export function run(options) {
  const started = performance.now()
  const report = { schemaVersion: 'eqb-replay-report-v1', ok: false, jobs: 1, records: [], errors: [] }
  const temp = mkdtempSync('/tmp/eqb-replay-')
  let peakWorkerRssBytes = 0
  try {
    if (Number(options.jobs || 1) !== 1) throw new Error('Replay only supports --jobs 1')
    if (!options.corpus || !options.baseline || !options.candidate) throw new Error('Need --corpus, --baseline and --candidate')
    const channels = (options.channels || 'R,T').split(',')
    if (!channels.length || new Set(channels).size !== channels.length || channels.some((channel) => !['R', 'T'].includes(channel))) {
      throw new Error('Channels must be R, T or R,T')
    }
    const directory = path.resolve(options.corpus)
    const manifest = verifyCorpus(directory)
    report.corpusDigest = manifest.corpusDigest
    report.coverage = coverage(manifest)
    report.channels = channels
    const declarations = options.expected ? validateDeclarations(readJson(options.expected)) : []
    const used = new Set()
    const repo = options.repo || root
    const baselineSha = resolveRef(repo, options.baseline)
    const candidateSha = resolveRef(repo, options.candidate)
    report.baseline = snapshot(repo, baselineSha, path.join(temp, 'baseline'))
    report.candidate = snapshot(repo, candidateSha, path.join(temp, 'candidate'), options['candidate-worktree'])
    for (const paper of manifest.papers) {
      for (const channel of channels) {
        const record = { paperId: paper.paperId, channel }
        report.records.push(record)
        if (!paper.channels[channel].available) {
          Object.assign(record, { status: 'MISSING', missing: paper.channels[channel].missing })
          continue
        }
        const results = []
        const metrics = {}
        for (const version of ['baseline', 'candidate']) {
          const output = path.join(temp, `${version}-output.json`)
          const child = spawnSync(process.execPath, [
            path.join(import.meta.dirname, 'worker.mjs'), path.join(temp, version, entryPath),
            directory, paper.paperId, channel, output,
          ], { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 120_000,
            env: { ...process.env, OMP_THREAD_LIMIT: '1' } })
          if (child.status !== 0 || child.error) {
            results.push(null)
            metrics[version] = { error: child.error?.message || (child.stderr || child.stdout || `signal=${child.signal}`).slice(0, 4000) }
            continue
          }
          try {
            const result = readJson(output)
            if (!Object.hasOwn(result, 'value') || result.value === null
              || !Number.isFinite(result.peakRssBytes) || !Number.isFinite(result.elapsedMs)) {
              throw new Error('Invalid replay worker output')
            }
            peakWorkerRssBytes = Math.max(peakWorkerRssBytes, result.peakRssBytes)
            metrics[version] = { elapsedMs: result.elapsedMs, peakRssBytes: result.peakRssBytes }
            results.push(result.value)
          } catch (error) {
            results.push(null)
            metrics[version] = { error: error.message }
          }
        }
        record.metrics = metrics
        if (results.some((result) => result === null)) {
          record.status = 'ERROR'
          continue
        }
        try {
          const [before, after] = results
          record.baselineOutputDigest = digest(before)
          record.candidateOutputDigest = digest(after)
          const differences = compare(before, after)
          if (channel === 'R') locateReferenceDiffs(differences, directory, paper)
          record.differences = applyDeclarations(paper.paperId, channel, differences, declarations, used)
          record.status = record.differences.some((diff) => diff.status === 'UNEXPECTED') ? 'UNEXPECTED'
            : record.differences.length ? 'EXPECTED' : 'PASS'
        } catch (error) {
          record.status = 'ERROR'
          record.error = error.stack || String(error)
        }
      }
    }
    // Detect concurrent edits to frozen files as well as edits present before execution.
    verifyCorpus(directory)
    report.unusedDeclarations = declarations.filter((_, index) => !used.has(index))
    if (report.unusedDeclarations.length) report.errors.push('Expected change did not occur (or did not match exactly)')
    report.executedCoverage = Object.fromEntries(channels.map((channel) => [channel, {
      baseline: report.records.filter((record) => record.channel === channel && record.metrics?.baseline && !record.metrics.baseline.error).length,
      candidate: report.records.filter((record) => record.channel === channel && record.metrics?.candidate && !record.metrics.candidate.error).length,
      required: report.coverage[channel],
    }]))
    for (const [channel, counts] of Object.entries(report.executedCoverage)) {
      if (counts.baseline !== counts.required || counts.candidate !== counts.required) report.errors.push(`${channel}: replay coverage decreased`)
    }
    report.ok = !report.errors.length && report.records.every((record) => ['PASS', 'EXPECTED', 'MISSING'].includes(record.status))
  } catch (error) {
    report.errors.push(error.stack || String(error))
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
  const deterministic = { ...report, records: report.records.map(({ metrics: _metrics, ...record }) => record) }
  report.deterministicDigest = digest(deterministic)
  report.metrics = { elapsedMs: performance.now() - started, peakWorkerRssBytes,
    peakRunnerRssBytes: process.resourceUsage().maxRSS * 1024 }
  report.counts = report.records.reduce((counts, record) => {
    counts[record.status] = (counts[record.status] || 0) + 1
    return counts
  }, {})
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {}
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index]
    const allowed = ['corpus', 'baseline', 'candidate', 'expected', 'report', 'channels', 'jobs', 'repo', 'candidate-worktree']
    if (!key.startsWith('--') || !allowed.includes(key.slice(2)) || !process.argv[index + 1]) {
      console.error(`Unknown/missing option: ${key}`)
      process.exit(1)
    }
    options[key.slice(2)] = process.argv[index + 1]
  }
  if (!options.report) {
    console.error('Need --report <output.json>')
    process.exit(1)
  }
  const report = run(options)
  writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`${report.ok ? '通过' : '失败'}：${JSON.stringify(report.counts)}；语料 ${report.corpusDigest || '校验失败'}；`
    + `用时 ${(report.metrics.elapsedMs / 1000).toFixed(2)} 秒；子进程峰值 ${(report.metrics.peakWorkerRssBytes / 1024 / 1024).toFixed(1)} MiB。`)
  if (report.baseline && report.candidate) console.log(`baseline=${report.baseline.sha} candidate=${report.candidate.sha}`)
  if (report.coverage) console.log(`覆盖：${report.coverage.papers} 套；R ${report.coverage.R}；T ${report.coverage.T}；`
    + `皆有 ${report.coverage.both}；皆缺 ${report.coverage.neither}。`)
  console.log(`报告：${path.resolve(options.report)}`)
  if (report.errors.length) console.error(report.errors.join('\n'))
  process.exitCode = report.ok ? 0 : 1
}
