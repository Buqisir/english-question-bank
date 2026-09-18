#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  CLOUDFLARE_API_PERMISSIONS,
  TUNNEL_TOKEN_PERMISSIONS,
  configureEqbOpsCloudflare,
} from './cloudflare-plan.mjs'

const API = 'https://api.cloudflare.com/client/v4'

function writeTunnelToken(tokenFile, tunnelToken) {
  mkdirSync(path.dirname(tokenFile), { recursive: true, mode: TUNNEL_TOKEN_PERMISSIONS.directory.mode })
  writeFileSync(tokenFile, `${tunnelToken}\n`, { mode: TUNNEL_TOKEN_PERMISSIONS.file.mode })
  const chown = spawnSync('chown', [
    `${TUNNEL_TOKEN_PERMISSIONS.directory.owner}:${TUNNEL_TOKEN_PERMISSIONS.file.group}`,
    path.dirname(tokenFile),
    tokenFile,
  ], { encoding: 'utf8' })
  if (chown.status !== 0) {
    console.error(`wrote ${tokenFile} mode 0640; chown root:cloudflared failed (run as root on the host)`)
  }
}

function createCf(token) {
  return async function cf(method, apiPath, body) {
    const response = await fetch(`${API}${apiPath}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await response.json()
    if (!json.success) {
      const messages = (json.errors || []).map((error) => error.message).join('; ')
      throw new Error(`${method} ${apiPath} failed: ${messages || response.status}`)
    }
    return json.result
  }
}

export async function main(env = process.env) {
  const result = await configureEqbOpsCloudflare(env, {
    cf: createCf(String(env.CLOUDFLARE_API_TOKEN || '')),
    writeTunnelToken,
  })
  console.log(JSON.stringify({
    zone: result.zone,
    hostname: result.hostname,
    tunnel: result.tunnel,
    tunnelId: result.tunnelId,
    accessApp: result.accessApp,
    accessAud: result.accessAud,
    teamDomainHint: 'set EQB_OPS_MCP_TEAM_DOMAIN to https://<team>.cloudflareaccess.com',
    allowedEmail: result.allowedEmail,
    redirectUris: result.redirectUris,
    sharedTunnelsUntouched: result.sharedTunnelsUntouched,
    tokenFile: result.tokenFile,
    apiPermissions: CLOUDFLARE_API_PERMISSIONS,
  }, null, 2))
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(2)
  })
}
