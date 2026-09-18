#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Creates only mcp.eqbank.cc DNS, an independent tunnel, and an Access app
// limited to the Owner email. Does not edit existing eqbank.cc records.

const API = 'https://api.cloudflare.com/client/v4'
const ZONE_NAME = 'eqbank.cc'
const HOSTNAME = 'mcp.eqbank.cc'
const TUNNEL_NAME = 'eqb-ops-mcp'
const APP_NAME = 'EQB Ops'
const OWNER_EMAIL = 'bqy2661342736@gmail.com'
const MCP_PORT = process.env.EQB_OPS_MCP_PORT || '8790'

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) {
    console.error(`Missing ${name}. Stopped without changing Cloudflare.`)
    process.exit(2)
  }
  return value
}

const token = requiredEnv('CLOUDFLARE_API_TOKEN')

async function cf(method, path, body) {
  const response = await fetch(`${API}${path}`, {
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
    throw new Error(`${method} ${path} failed: ${messages || response.status}`)
  }
  return json.result
}

const zones = await cf('GET', `/zones?name=${ZONE_NAME}`)
const zone = Array.isArray(zones) ? zones[0] : null
if (!zone?.id) throw new Error('eqbank.cc zone not found or token cannot read DNS')
const accountId = zone.account?.id
if (!accountId) throw new Error('Cloudflare account id missing from zone')

const tunnels = await cf('GET', `/accounts/${accountId}/cfd_tunnel?is_deleted=false`)
const list = Array.isArray(tunnels) ? tunnels : []
const sharedNames = list.filter((tunnel) => tunnel.name !== TUNNEL_NAME).map((tunnel) => tunnel.name)
console.log(`existing_tunnels=${list.map((tunnel) => tunnel.name).join(',') || '(none)'}`)
if (sharedNames.length) {
  console.log(`shared_tunnels_left_untouched=${sharedNames.join(',')}`)
}

let tunnel = list.find((item) => item.name === TUNNEL_NAME)
if (!tunnel) {
  tunnel = await cf('POST', `/accounts/${accountId}/cfd_tunnel`, {
    name: TUNNEL_NAME,
    config_src: 'cloudflare',
  })
}

await cf('PUT', `/accounts/${accountId}/cfd_tunnel/${tunnel.id}/configurations`, {
  config: {
    ingress: [
      {
        hostname: HOSTNAME,
        service: `http://127.0.0.1:${MCP_PORT}`,
        originRequest: { noTLSVerify: false },
      },
      { service: 'http_status:404' },
    ],
  },
})

const tokenResult = await cf('GET', `/accounts/${accountId}/cfd_tunnel/${tunnel.id}/token`)
const tunnelToken = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token
if (!tunnelToken) throw new Error('tunnel token missing from API')

const records = await cf('GET', `/zones/${zone.id}/dns_records?name=${HOSTNAME}`)
const existing = (Array.isArray(records) ? records : []).filter((record) => record.name === HOSTNAME)
const target = `${tunnel.id}.cfargotunnel.com`
if (existing.length === 0) {
  await cf('POST', `/zones/${zone.id}/dns_records`, {
    type: 'CNAME',
    name: HOSTNAME,
    content: target,
    proxied: true,
    ttl: 1,
    comment: 'EQB Ops MCP independent tunnel',
  })
} else if (existing.length === 1) {
  const record = existing[0]
  if (record.type !== 'CNAME' || record.content !== target) {
    throw new Error('mcp.eqbank.cc already exists with a different target; refusing to overwrite')
  }
} else {
  throw new Error('mcp.eqbank.cc has multiple DNS records; refusing to change them')
}

const apps = await cf('GET', `/accounts/${accountId}/access/apps`)
const appList = Array.isArray(apps) ? apps : []
if (appList.some((app) => app.domain === 'eqbank.cc' || app.domain === 'www.eqbank.cc')) {
  console.log('existing_main_site_access_apps_left_untouched')
}
let app = appList.find((item) => item.name === APP_NAME || item.domain === HOSTNAME)
const oauthConfiguration = {
  enabled: true,
  dynamic_client_registration: {
    enabled: true,
    allow_any_on_localhost: false,
    allow_any_on_loopback: false,
    allowed_uris: String(process.env.EQB_OPS_MCP_OAUTH_REDIRECT_URI || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  },
  grant: {
    access_token_lifetime: '15m',
    session_duration: '336h',
  },
}
const appBody = {
  name: APP_NAME,
  domain: HOSTNAME,
  type: 'self_hosted',
  session_duration: '24h',
  allowed_idps: [],
  auto_redirect_to_identity: false,
  oauth_configuration: oauthConfiguration,
  destinations: [{ type: 'public', uri: HOSTNAME }],
}
if (!app) {
  app = await cf('POST', `/accounts/${accountId}/access/apps`, appBody)
} else {
  app = await cf('PUT', `/accounts/${accountId}/access/apps/${app.id}`, {
    ...app,
    ...appBody,
    id: app.id,
  })
}

const policies = await cf('GET', `/accounts/${accountId}/access/apps/${app.id}/policies`)
const policyList = Array.isArray(policies) ? policies : []
const desiredInclude = [{ email: { email: OWNER_EMAIL } }]
const already = policyList.find((policy) => JSON.stringify(policy.include) === JSON.stringify(desiredInclude))
if (!already) {
  await cf('POST', `/accounts/${accountId}/access/apps/${app.id}/policies`, {
    name: 'Owner email only',
    decision: 'allow',
    include: desiredInclude,
  })
}

const idps = await cf('GET', `/accounts/${accountId}/access/identity_providers`)
const idpList = Array.isArray(idps) ? idps : []
let otp = idpList.find((idp) => idp.type === 'onetimepin')
if (!otp) {
  otp = await cf('POST', `/accounts/${accountId}/access/identity_providers`, {
    type: 'onetimepin',
    name: 'One-time PIN',
    config: {},
  })
}
await cf('PUT', `/accounts/${accountId}/access/apps/${app.id}`, {
  ...app,
  allowed_idps: [otp.id],
  auto_redirect_to_identity: true,
  oauth_configuration: oauthConfiguration,
})

const tokenFile = process.env.EQB_OPS_MCP_TOKEN_FILE || '/etc/eqb-ops-mcp/tunnel.token'
try {
  mkdirSync(path.dirname(tokenFile), { recursive: true, mode: 0o750 })
  writeFileSync(tokenFile, `${tunnelToken}\n`, { mode: 0o600 })
} catch {
  console.error(`tunnel token retrieved but not written; place it on the host at ${tokenFile} without pasting it into chat`)
}

console.log(JSON.stringify({
  zone: ZONE_NAME,
  hostname: HOSTNAME,
  tunnel: TUNNEL_NAME,
  tunnelId: tunnel.id,
  accessApp: APP_NAME,
  accessAud: app.aud,
  teamDomainHint: 'set EQB_OPS_MCP_TEAM_DOMAIN to https://<team>.cloudflareaccess.com',
  allowedEmail: OWNER_EMAIL,
  redirectUris: oauthConfiguration.dynamic_client_registration.allowed_uris,
  sharedTunnelsUntouched: sharedNames,
  tokenFile,
}, null, 2))
