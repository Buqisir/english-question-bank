import { defineRoute } from '../router/index.mjs'
import { createAgentToken, listAgentTokens, revokeAgentToken } from './agentTokens.mjs'
import { agentGroup, groupPreview, listAgentPapers, matchesPaper, paperSummary } from './agentCatalog.mjs'

export function createAgentRoutes() {
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
  const read = (pattern, action) => defineRoute('GET', pattern, input => {
    if (!input.context.agent) { input.context.sendJson(input.response, 401, { error: 'not_authenticated' }); return }
    const papers = listAgentPapers(input.context)
    action(input, papers)
  })
  const notFound = ({ context, response }) => context.sendJson(response, 404, { error: 'not_found' })
  return [
    admin('GET', /^\/api\/admin\/agent-tokens$/, ({ context, response }, db) =>
      context.sendJson(response, 200, { tokens: listAgentTokens(db) })),
    admin('POST', /^\/api\/admin\/agent-tokens$/, async ({ context, request, response }, db) =>
      context.sendJson(response, 201, createAgentToken(db, await context.readJsonBody(request, { maxBytes: 4096 })))),
    admin('POST', /^\/api\/admin\/agent-tokens\/([^/]+)\/revoke$/, (input, db) => {
      if (!revokeAgentToken(db, input.match[1])) return notFound(input)
      input.context.sendJson(input.response, 200, { revoked: true })
    }),
    read(/^\/api\/agent\/v1\/papers$/, ({ context, response, url }, papers) =>
      context.sendJson(response, 200, { papers: papers.filter(paper => matchesPaper(paper, url.searchParams)).map(paperSummary) })),
    read(/^\/api\/agent\/v1\/papers\/([^/]+)$/, (input, papers) => {
      const paper = papers.find(paper => paper.paperId === decodeURIComponent(input.match[1]))
      if (!paper) return notFound(input)
      input.context.sendJson(input.response, 200, { ...paperSummary(paper), groups: paper.groupIds.map(id => agentGroup(paper, id)) })
    }),
    read(/^\/api\/agent\/v1\/groups$/, ({ context, response, url }, papers) => {
      const params = url.searchParams
      const limit = Number(params.get('limit') ?? 50)
      const offset = Number(params.get('offset') ?? 0)
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0) {
        context.sendJson(response, 400, { error: 'limit must be 1–200; offset must be a nonnegative integer' }); return
      }
      const groups = papers.filter(paper => matchesPaper(paper, params)).flatMap(paper => paper.groupIds.map(id => {
        const group = agentGroup(paper, id)
        return { groupId: id, paperId: paper.paperId, paperTitle: paper.title, year: paper.year, type: paper.type,
          section: group.section, questionCount: group.questions.length, preview: groupPreview(group) }
      })).filter(group => !params.has('section') || group.section === params.get('section'))
      context.sendJson(response, 200, { groups: groups.slice(offset, offset + limit), total: groups.length, limit, offset })
    }),
    read(/^\/api\/agent\/v1\/groups\/([^/]+)$/, (input, papers) => {
      const id = decodeURIComponent(input.match[1])
      const paper = papers.find(paper => paper.groupIds.includes(id))
      if (!paper) return notFound(input)
      input.context.sendJson(input.response, 200, { ...agentGroup(paper, id), paperId: paper.paperId,
        paperTitle: paper.title })
    }),
  ]
}
