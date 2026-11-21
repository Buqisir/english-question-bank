import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { defineRoute, readJsonRouteBody } from '../router/index.mjs'
import { createAgentToken, draftsPath, listAgentTokens, reportsPath, revokeAgentToken } from './agentTokens.mjs'
import { insertAgentReport, listAdminAgentReports, listAgentReports, putAgentDraft, readAgentDraft } from './agentSubmissions.mjs'
import { agentGroup, agentPaperDetail, groupPreview, groupText, listAgentPapers, matchesPaper, matchesQuery, paperSummary, readAgentSource } from './agentCatalog.mjs'
import { agentAnswerSource, agentMedia } from './agentSources.mjs'

export function agentDeploymentMeta(releaseDir = path.resolve(import.meta.dirname, '../..')) {
  const result = { deployedSha: null, deployedAt: null, apiVersion: 'v1' }
  try {
    const active = path.resolve(releaseDir, '../../current')
    const release = JSON.parse(readFileSync(path.join(releaseDir, '.eqb-release.json'), 'utf8'))
    if (release.schemaVersion !== 'eqb-release-v1' || !/^[a-f0-9]{40}$/.test(release.sha)) return result
    result.deployedSha = release.sha
    const link = lstatSync(active)
    if (link.isSymbolicLink() && realpathSync(active) === realpathSync(releaseDir)) {
      result.deployedAt = link.mtime.toISOString()
    }
  } catch { /* Local and inactive releases may have no activation metadata. */ }
  return result
}

function findPaper(papers, encodedId) {
  try {
    return loadPaper(papers, decodeURIComponent(encodedId))
  } catch (error) {
    if (error instanceof URIError) return null
    throw error
  }
}

function loadPaper(papers, paperId) {
  const paper = papers.find(paper => paper.paperId === paperId)
  return paper?.load ? paper.load() : paper
}

const bounded = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const record = value => value && typeof value === 'object' && !Array.isArray(value)
const maxSubmissionBytes = 32 * 1024

function sendReportPage({ context, response, url }, list) {
  const limit = Number(url.searchParams.get('limit') ?? 50)
  const offset = Number(url.searchParams.get('offset') ?? 0)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0) {
    return context.sendJson(response, 400, { error: 'limit must be 1–200; offset must be a nonnegative integer' })
  }
  const rows = list(limit + 1, offset)
  context.sendJson(response, 200, { reports: rows.slice(0, limit), limit, offset,
    nextOffset: rows.length > limit ? offset + limit : null })
}

function containsQuestion(paper, questionId) {
  return paper && Object.hasOwn(paper.asset.content.questions, questionId) && paper.groupIds.some(groupId =>
    paper.asset.content.groups[groupId]?.questionIds?.includes(questionId))
}

export function createAgentRoutes({ getReviewStore } = {}) {
  const admin = (method, pattern, action) => defineRoute(method, pattern, async input => {
    const { context, response } = input
    // Unlike existing bootstrap-open tools, token administration always needs a
    // real human Owner session.
    if (context.session?.role !== 'owner' || context.session.accountKind === 'import_agent') {
      context.sendJson(response, 403, { error: 'forbidden' }); return
    }
    response.setHeader('Cache-Control', 'no-store')
    const db = context.openUserDatabase({ readOnly: method === 'GET' })
    try { await action(input, db) }
    catch (error) { context.sendJson(response, error.status || 400, { error: error.status ? error.message : '口令操作失败，请重试。' }) }
    finally { db.close() }
  }, { ownerOnly: true })
  const authorized = (pattern, action, method = 'GET') => defineRoute(method, pattern, input => {
    if (!input.context.agent) { input.context.sendJson(input.response, 401, { error: 'not_authenticated' }); return }
    return action(input)
  })
  const catalog = context => listAgentPapers(context, getReviewStore?.())
  const read = (pattern, action) => authorized(pattern, input => action(input, catalog(input.context)))
  const submission = (method, pattern, action) => authorized(pattern, async input => {
    const { context, request, response } = input
    let body
    if (method !== 'GET') {
      if (Number(request.headers['content-length']) > maxSubmissionBytes) {
        return context.sendJson(response, 413, { error: 'body_too_large' })
      }
      try { body = await readJsonRouteBody(request, { maxBytes: maxSubmissionBytes, requireBody: method === 'PUT' }) }
      catch { return context.sendJson(response, 400, { error: 'invalid_body' }) }
    }
    const db = context.openUserDatabase({ readOnly: method === 'GET' })
    try { return action(input, db, context.agent.tokenId, body) }
    finally { db.close() }
  }, method)
  const notFound = ({ context, response }) => context.sendJson(response, 404, { error: 'not_found' })
  const invalid = ({ context, response }) => context.sendJson(response, 400, { error: 'invalid_fields' })
  const draft = (method, action) => submission(method, draftsPath, (input, db, tokenId, body) => {
    let paperId, questionId
    try { [paperId, questionId] = input.match.slice(1).map(decodeURIComponent) }
    catch { return notFound(input) }
    if (!bounded(paperId, 256) || !bounded(questionId, 256) || (method === 'PUT' && !record(body))) return invalid(input)
    const result = action(input, db, tokenId, paperId, questionId, body)
    if (!result) return notFound(input)
    input.context.sendJson(input.response, 200, result)
  })
  return [
    admin('GET', /^\/api\/admin\/agent-tokens$/, ({ context, response }, db) =>
      context.sendJson(response, 200, { tokens: listAgentTokens(db) })),
    admin('POST', /^\/api\/admin\/agent-tokens$/, async ({ context, request, response }, db) =>
      context.sendJson(response, 201, createAgentToken(db, await context.readJsonBody(request, { maxBytes: 4096 })))),
    admin('POST', /^\/api\/admin\/agent-tokens\/([^/]+)\/revoke$/, (input, db) => {
      if (!revokeAgentToken(db, input.match[1])) return notFound(input)
      input.context.sendJson(input.response, 200, { revoked: true })
    }),
    admin('GET', /^\/api\/admin\/agent-reports$/, (input, db) =>
      sendReportPage(input, (limit, offset) => listAdminAgentReports(db, limit, offset))),
    submission('POST', reportsPath, (input, db, tokenId, body) => {
      if (!record(body)) return invalid(input)
      const { paperId, questionId = null, groupId = null, kind, note, evidence } = body
      if ((questionId === null) === (groupId === null) || !bounded(questionId ?? groupId, 256)
        || !bounded(paperId, 256) || !bounded(kind, 80) || !bounded(note, 2000)
        || !bounded(evidence, 4000)) return invalid(input)
      const paper = loadPaper(catalog(input.context), paperId)
      if (!(questionId === null ? paper?.groupIds.includes(groupId) : containsQuestion(paper, questionId))) return notFound(input)
      const report = insertAgentReport(db, tokenId, { paperId, questionId, groupId, kind, note, evidence })
      input.context.sendJson(input.response, 201, report)
    }),
    submission('GET', reportsPath, (input, db, tokenId) =>
      sendReportPage(input, (limit, offset) => listAgentReports(db, tokenId, limit, offset))),
    draft('GET', (_input, db, tokenId, paperId, questionId) => readAgentDraft(db, tokenId, paperId, questionId)),
    draft('PUT', (input, db, tokenId, paperId, questionId, body) => {
      const paper = loadPaper(catalog(input.context), paperId)
      return containsQuestion(paper, questionId) && putAgentDraft(db, tokenId, paperId, questionId, body)
    }),
    read(/^\/api\/agent\/v1\/papers$/, ({ context, response, url }, papers) =>
      context.sendJson(response, 200, { papers: papers.filter(paper => matchesPaper(paper, url.searchParams)
        && matchesQuery(`${paper.title} ${paper.paperId}`, url.searchParams.get('q') || '')).map(paperSummary) })),
    read(/^\/api\/agent\/v1\/papers\/([^/]+)$/, (input, papers) => {
      const paper = findPaper(papers, input.match[1])
      if (!paper) return notFound(input)
      input.context.sendJson(input.response, 200, agentPaperDetail(paper))
    }),
    read(/^\/api\/agent\/v1\/papers\/([^/]+)\/answer-source$/, (input, papers) => {
      const paper = findPaper(papers, input.match[1])
      if (!paper) return notFound(input)
      input.context.sendJson(input.response, 200, agentAnswerSource(readAgentSource(paper)))
    }),
    read(/^\/api\/agent\/v1\/media\/([^/]+)\/([^/]+)$/, (input, papers) => {
      const paper = findPaper(papers, input.match[1])
      if (!paper) return notFound(input)
      let mediaId
      try { mediaId = decodeURIComponent(input.match[2]) } catch { return notFound(input) }
      const media = agentMedia(readAgentSource(paper), mediaId, paper)
      if (!media) return notFound(input)
      const { request, response } = input
      response.setHeader('ETag', media.etag)
      if (request.headers['if-none-match'] === media.etag) {
        response.writeHead(304).end()
        return
      }
      response.writeHead(200, {
        'Content-Type': media.mimeType,
        'Content-Length': media.bytes.length,
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'X-Content-Type-Options': 'nosniff',
      }).end(media.bytes)
    }),
    read(/^\/api\/agent\/v1\/export$/, async ({ context, response, url }, papers) => {
      const since = url.searchParams.get('since')
      const cutoff = since ? Date.parse(since) : -Infinity
      if (since && (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/u.test(since)
        || !Number.isFinite(cutoff))) {
        return context.sendJson(response, 400, { error: 'since must be an ISO 8601 timestamp' })
      }
      function* lines() {
        for (const paper of papers) {
          if (Date.parse(paper.updatedAt) <= cutoff || (paper.load && !paper.load())) continue
          const detail = agentPaperDetail(paper)
          yield `${JSON.stringify({ ...detail, etag: digestJson(detail), updatedAt: paper.updatedAt })}\n`
        }
      }
      response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      try { await pipeline(Readable.from(lines()), response) }
      catch (error) { if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw error }
    }),
    authorized(/^\/api\/agent\/v1\/meta$/, ({ context, response, url }) => {
      const meta = agentDeploymentMeta()
      context.sendJson(response, 200, url.searchParams.get('include') === 'scope' ? { ...meta, scope: context.agent.scope } : meta)
    }),
    read(/^\/api\/agent\/v1\/groups$/, ({ context, response, url }, papers) => {
      const params = url.searchParams
      const limit = Number(params.get('limit') ?? 50)
      const offset = Number(params.get('offset') ?? 0)
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0) {
        context.sendJson(response, 400, { error: 'limit must be 1–200; offset must be a nonnegative integer' }); return
      }
      const groups = papers.filter(paper => matchesPaper(paper, params)).flatMap(paper => {
        if (paper.load && !paper.load()) return []
        return paper.groupIds.map(id => agentGroup(paper, id))
          .filter(group => matchesQuery(`${paper.title} ${groupText(group)}`, params.get('q') || '')).map(group => {
          const id = group.groupId
          return { groupId: id, paperId: paper.paperId, paperTitle: paper.title, year: paper.year, type: paper.type,
            section: group.section, questionCount: group.questions.length, preview: groupPreview(group) }
        })
      }).filter(group => !params.has('section') || group.section === params.get('section'))
      context.sendJson(response, 200, { groups: groups.slice(offset, offset + limit), total: groups.length, limit, offset })
    }),
    read(/^\/api\/agent\/v1\/groups\/([^/]+)$/, (input, papers) => {
      const id = decodeURIComponent(input.match[1])
      let paper = papers.find(paper => paper.groupIds?.includes(id))
      if (!paper) {
        const revisionIds = new Set(getReviewStore?.().agentRevisionIdsForGroup(id) || [])
        paper = papers.find(paper => revisionIds.has(paper.revisionId))
      }
      if (!paper) return notFound(input)
      if (paper.load && !paper.load()) return notFound(input)
      input.context.sendJson(input.response, 200, { ...agentGroup(paper, id, readAgentSource(paper)), paperId: paper.paperId,
        paperTitle: paper.title })
    }),
    read(/^\/api\/agent\/v1\/sections$/, ({ context, response, url }, papers) => {
      const counts = new Map()
      for (const paper of papers.filter(paper => matchesPaper(paper, url.searchParams))) {
        if (paper.load && !paper.load()) continue
        for (const id of paper.groupIds) {
          const { section } = agentGroup(paper, id)
          counts.set(section, (counts.get(section) || 0) + 1)
        }
      }
      context.sendJson(response, 200, { sections: [...counts].map(([section, count]) => ({ section, count })) })
    }),
  ]
}
