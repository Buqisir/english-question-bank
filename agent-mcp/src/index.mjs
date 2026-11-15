import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

function readConfig() {
  const token = process.env.EQB_AGENT_TOKEN?.trim()
  if (!token) throw new Error('请通过 EQB_AGENT_TOKEN 环境变量提供 Agent 口令。')
  let base
  try { base = new URL(process.env.EQB_AGENT_BASE_URL || 'https://eqbank.cc') }
  catch { throw new Error('EQB_AGENT_BASE_URL 必须是有效的站点 URL。') }
  const localHttp = base.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
  if ((!localHttp && base.protocol !== 'https:') || base.username || base.password
    || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('EQB_AGENT_BASE_URL 只接受 HTTPS 站点源地址或本机 HTTP 源地址，不含路径或凭据。')
  }
  return { base: base.origin, token }
}

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
}
const paperFilters = {
  year: z.number().int().positive().optional().describe('试卷年份；省略时不限年份。'),
  type: z.enum(['real', 'mock']).optional().describe('real 为真题，mock 为模拟题。'),
}
const searchFilter = { q: z.string().optional().describe('忽略大小写的子串搜索，空白分隔词须全部命中。') }
const identifier = z.string().min(1).refine(value => value !== '.' && value !== '..', '需要有效的 ID。')
const textResult = (value, isError = false) => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
})

function createServer({ base, token }) {
  const server = new McpServer({ name: 'eqb-agent', version: '1.0.0' })
  // Clients may omit `arguments` for tools whose fields are all optional; the SDK rejects undefined.
  const validateToolInput = server.validateToolInput.bind(server)
  server.validateToolInput = (tool, args, name) => validateToolInput(tool, args ?? {}, name)
  async function get(path, query = {}) {
    const url = new URL(`/api/agent/v1/${path}`, base)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    let response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      return textResult({ error: '题库请求失败或超时，请检查站点地址与网络后重试。' }, true)
    }
    if (!response.ok) {
      const messages = {
        401: 'Agent 口令无效或已撤销，请在管理页新建口令并更新环境变量。',
        404: '未找到已发布的试卷或题组，请重新查询列表。',
        429: '请求过于频繁，请稍后重试。',
      }
      return textResult({
        status: response.status,
        error: messages[response.status] || '题库接口请求失败，请稍后重试。',
      }, true)
    }
    try { return textResult(await response.json()) }
    catch { return textResult({ error: '题库接口未返回有效 JSON，请检查服务状态。' }, true) }
  }
  server.registerTool('list_papers', {
    description: '列出已发布及待审试卷，按年份、类型筛选或搜索卷名/paperId。',
    inputSchema: { ...paperFilters, ...searchFilter },
    annotations,
  }, args => get('papers', args))
  server.registerTool('get_paper', {
    description: '按 paperId 读取一份已发布或待审试卷的全部题组、原文、题目和答案。',
    inputSchema: { paperId: identifier.describe('list_papers 返回的 paperId。') },
    annotations,
  }, ({ paperId }) => get(`papers/${encodeURIComponent(paperId)}`))
  server.registerTool('list_groups', {
    description: '分页列出已发布及待审题组；q 搜索卷名及题组全文，section 用 list_sections 的精确名称。',
    inputSchema: {
      ...paperFilters,
      ...searchFilter,
      section: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional().describe('默认 50，最多 200。'),
      offset: z.number().int().nonnegative().optional().describe('默认 0。'),
    },
    annotations,
  }, args => get('groups', args))
  server.registerTool('list_sections', {
    description: '列出精确分节名称及题组数，可按年份和真题/模拟筛选。',
    inputSchema: paperFilters,
    annotations,
  }, args => get('sections', args))
  server.registerTool('get_group', {
    description: '按 groupId 读取一个已发布或待审题组及其载体、题目、答案与来源试卷。',
    inputSchema: { groupId: identifier.describe('list_groups 或 get_paper 返回的 groupId。') },
    annotations,
  }, ({ groupId }) => get(`groups/${encodeURIComponent(groupId)}`))
  return server
}

try {
  const server = createServer(readConfig())
  await server.connect(new StdioServerTransport())
} catch (error) {
  // Only configuration errors have safe, locally authored messages.
  const message = error.message?.startsWith('EQB_AGENT_') || error.message?.startsWith('请通过 EQB_AGENT_TOKEN')
    ? error.message : 'Agent MCP 启动失败，请检查配置和 Node 版本。'
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}
