import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerEqbTools } from './tools.mjs'

export function createEqbMcpServer(deps) {
  const server = new McpServer({
    name: 'eqb-ops',
    version: '1.0.0',
  })
  registerEqbTools(server, deps)
  return server
}
