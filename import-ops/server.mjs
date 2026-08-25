#!/usr/bin/env node
/**
 * 导题后台 — owner-only local read surface.
 * Does not write papers/, does not publish, does not run pull-run-push.
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  format2ComparisonFile,
  format2QaArtifactFile,
  homeLists,
  listOpsPapers,
  probePaper,
  qaLinks,
  shipPrompt,
} from './lib/probe.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(process.env.EQB_ROOT || path.join(here, '..'))
const appOrigin = process.env.EQB_APP_ORIGIN || 'http://127.0.0.1:5173'
const host = '127.0.0.1'
const port = Number(process.env.IMPORT_OPS_PORT || 8790)
const publicDir = path.join(here, 'public')

function send(response, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  response.writeHead(status, {
    'cache-control': 'no-store',
    ...headers,
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

function sendJson(response, status, body) {
  send(response, status, body, { 'content-type': 'application/json; charset=utf-8' })
}

function sendBytes(response, status, body, headers = {}) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': body.byteLength,
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  response.end(body)
}

function notFound(response) {
  sendJson(response, 404, { error: 'not_found' })
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`)
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'read_only' })
    return
  }

  if (url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true, role: 'import-ops', write: false, repoRoot })
    return
  }

  if (url.pathname === '/api/papers') {
    const papers = listOpsPapers(repoRoot).map((paper) => ({
      paperId: paper.paperId,
      paperName: paper.paperName,
      status: paper.status,
      statusLabel: paper.statusLabel,
      mtimeMs: paper.mtimeMs,
      blockedCode: paper.blocked?.code || null,
    }))
    sendJson(response, 200, { papers, lists: homeLists(papers) })
    return
  }

  const format2Comparison = url.pathname.match(/^\/papers\/([^/]+)\/format2-comparison$/)
  if (format2Comparison) {
    const paperId = decodeURIComponent(format2Comparison[1])
    const comparisonFile = format2ComparisonFile({ repoRoot, paperId })
    if (!comparisonFile) {
      notFound(response)
      return
    }
    sendBytes(response, 200, readFileSync(comparisonFile), {
      'content-type': 'text/html; charset=utf-8',
    })
    return
  }

  const format2QaArtifact = url.pathname.match(
    /^\/papers\/([^/]+)\/format2-qa\/([A-Za-z0-9._-]+)$/,
  )
  if (format2QaArtifact) {
    const paperId = decodeURIComponent(format2QaArtifact[1])
    const artifact = format2QaArtifactFile({
      repoRoot,
      paperId,
      artifactName: format2QaArtifact[2],
    })
    if (!artifact) {
      notFound(response)
      return
    }
    sendBytes(response, 200, artifact.bytes, {
      'content-type': artifact.mediaType,
    })
    return
  }

  const detail = url.pathname.match(/^\/api\/papers\/([^/]+)$/)
  if (detail) {
    const paperId = decodeURIComponent(detail[1])
    const papersRoot = path.join(repoRoot, 'scripts/import-pipeline/papers', paperId)
    const latestDir = path.join(repoRoot, 'app/public/paper-assets', paperId, 'latest')
    if (!existsSync(papersRoot) && !existsSync(latestDir)) {
      notFound(response)
      return
    }
    const paper = probePaper({ repoRoot, paperId })
    const prompt = shipPrompt(paper)
    sendJson(response, 200, {
      paper,
      qa: qaLinks(paper, appOrigin),
      shipSay: prompt.say,
      shipKind: prompt.kind,
    })
    return
  }

  const fileName = url.pathname === '/' ? 'index.html' : path.basename(url.pathname)
  const filePath = path.join(publicDir, fileName)
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    notFound(response)
    return
  }
  const type = fileName.endsWith('.js')
    ? 'text/javascript; charset=utf-8'
    : fileName.endsWith('.css')
      ? 'text/css; charset=utf-8'
      : 'text/html; charset=utf-8'
  send(response, 200, readFileSync(filePath, 'utf8'), { 'content-type': type })
})

server.listen(port, host, () => {
  console.log(`导题后台 (read-only) http://${host}:${port}`)
  console.log(`repo ${repoRoot}`)
  console.log('no publish, no pull-run-push, no production')
})
