import { z } from 'zod'
import { collectOverview } from './overview.mjs'
import { probeHealth } from './health.mjs'
import { LogReadError, searchServiceLogs } from './logs.mjs'
import { clampLogQuery, toolTextResult, withTimeout } from './limits.mjs'

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
})

function wrapTool(name, work) {
  return async (args = {}) => {
    try {
      const result = await withTimeout(() => work(args))
      return toolTextResult(result)
    } catch (error) {
      const payload = {
        tool: name,
        error: error.name === 'LogReadError' || error.name === 'ToolInputError'
          ? error.message
          : error.message,
        kind: error.name || 'Error',
      }
      return toolTextResult(payload, true)
    }
  }
}

export function registerEqbTools(server, { config, fetchImpl } = {}) {
  server.registerTool(
    'server_overview',
    {
      title: 'Server overview',
      description: 'Read-only EQB host overview: commits, service state, disk, collection time.',
      annotations: READ_ONLY,
    },
    wrapTool('server_overview', async () => collectOverview(config)),
  )

  server.registerTool(
    'health_check',
    {
      title: 'Health check',
      description: 'Probe the fixed local EQB health endpoint and return status, latency, and ok only.',
      annotations: READ_ONLY,
    },
    wrapTool('health_check', async () => probeHealth(config.healthUrl, { fetchImpl })),
  )

  server.registerTool(
    'recent_errors',
    {
      title: 'Recent errors',
      description: 'Read recent EQB service error summaries from the dedicated log export.',
      inputSchema: {
        minutes: z.number().int().min(5).max(1440).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: READ_ONLY,
    },
    wrapTool('recent_errors', async (args) => {
      const query = clampLogQuery(args)
      return searchServiceLogs({
        logFile: config.logFile,
        minutes: query.minutes,
        limit: query.limit,
        errorsOnly: true,
      })
    }),
  )

  server.registerTool(
    'search_logs',
    {
      title: 'Search logs',
      description: 'Literal keyword search over the dedicated EQB log export.',
      inputSchema: {
        keyword: z.string().min(1).max(100),
        minutes: z.number().int().min(5).max(1440).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: READ_ONLY,
    },
    wrapTool('search_logs', async (args) => {
      const query = clampLogQuery(args)
      if (!query.keyword) throw new LogReadError('keyword is required')
      return searchServiceLogs({
        logFile: config.logFile,
        minutes: query.minutes,
        limit: query.limit,
        keyword: query.keyword,
        errorsOnly: false,
      })
    }),
  )
}
