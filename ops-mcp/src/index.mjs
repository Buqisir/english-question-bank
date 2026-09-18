import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { loadConfig } from './config.mjs'
import { AuthError, createAccessVerifier } from './auth.mjs'
import { createEqbMcpServer } from './mcp.mjs'

const MCP_PATH = '/mcp'

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

function requestHost(req) {
  return String(req.headers.host || '').split(':')[0]
}

function originAllowed(req, config) {
  const origin = req.headers.origin
  if (!origin) return true
  if (origin === config.publicOrigin) return true
  if (origin === `http://${config.listenHost}:${config.listenPort}`) return true
  if (origin === `http://127.0.0.1:${config.listenPort}`) return true
  if (origin === `http://localhost:${config.listenPort}`) return true
  return false
}

function hostAllowed(req, config) {
  const host = requestHost(req)
  if (host === '127.0.0.1' || host === 'localhost') return true
  try {
    return host === new URL(config.publicOrigin).hostname
  } catch {
    return false
  }
}

export function createOpsHttpServer({ config, verifyAccess, fetchImpl }) {
  const transports = new Map()

  async function attachTransport() {
    const server = createEqbMcpServer({ config, fetchImpl })
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sessionId) => {
        transports.set(sessionId, { transport, server })
      },
      onsessionclosed: (sessionId) => {
        transports.delete(sessionId)
      },
    })
    await server.connect(transport)
    return { transport, server }
  }

  const httpServer = http.createServer(async (req, res) => {
    try {
      if (!hostAllowed(req, config)) {
        sendJson(res, 403, { error: 'forbidden_host' })
        return
      }
      if (!originAllowed(req, config)) {
        sendJson(res, 403, { error: 'forbidden_origin' })
        return
      }
      const url = new URL(req.url || '/', `http://${config.listenHost}:${config.listenPort}`)
      if (url.pathname !== MCP_PATH) {
        sendJson(res, 404, { error: 'not_found' })
        return
      }
      try {
        await verifyAccess(req.headers)
      } catch (error) {
        const status = error instanceof AuthError ? error.status : 401
        sendJson(res, status, { error: error.code || 'unauthorized', message: error.message })
        return
      }

      const sessionId = req.headers['mcp-session-id']
      if (sessionId && transports.has(sessionId)) {
        await transports.get(sessionId).transport.handleRequest(req, res)
        return
      }
      if (sessionId) {
        sendJson(res, 404, { error: 'unknown_session' })
        return
      }
      const session = await attachTransport()
      await session.transport.handleRequest(req, res)
    } catch (error) {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' })
      else res.end()
    }
  })

  return httpServer
}

export function createProductionServer(env = process.env) {
  const config = loadConfig(env)
  const verifyAccess = createAccessVerifier({
    teamDomain: config.teamDomain,
    audience: config.audience,
    allowedEmail: config.allowedEmail,
  })
  return createOpsHttpServer({ config, verifyAccess })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig()
  const server = createProductionServer()
  server.listen(config.listenPort, config.listenHost, () => {
    process.stdout.write(`eqb-ops-mcp listening on ${config.listenHost}:${config.listenPort}${MCP_PATH}\n`)
  })
}
