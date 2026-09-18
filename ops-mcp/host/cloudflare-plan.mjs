export const ZONE_NAME = 'eqbank.cc'
export const HOSTNAME = 'mcp.eqbank.cc'
export const TUNNEL_NAME = 'eqb-ops-mcp'
export const APP_NAME = 'EQB Ops'
export const OWNER_EMAIL = 'bqy2661342736@gmail.com'
export const MIN_CLOUDFLARED_VERSION = '2025.4.0'

export const TUNNEL_TOKEN_PERMISSIONS = Object.freeze({
  directory: Object.freeze({ owner: 'root', group: 'cloudflared', mode: 0o750 }),
  file: Object.freeze({ owner: 'root', group: 'cloudflared', mode: 0o640 }),
})

export const CLOUDFLARE_API_PERMISSIONS = Object.freeze({
  zoneQuery: 'Zone Read',
  accessApps: 'Access: Apps and Policies Write',
  otpReuse: 'Access: Apps and Policies Read (to list identity providers)',
  otpCreate: 'Access: Organizations, Identity Providers, and Groups Write',
  otpStrategy: 'Reuse a Dashboard-created One-time PIN identity provider. Do not create one from this script.',
})

export class PlanError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PlanError'
  }
}

export function validateOAuthRedirectUri(raw) {
  const value = String(raw || '').trim()
  if (!value) {
    throw new PlanError(
      'EQB_OPS_MCP_OAUTH_REDIRECT_URI is required from the ChatGPT UI callback. No Cloudflare writes.',
    )
  }
  if (value.includes('*')) {
    throw new PlanError('OAuth redirect URI must be the exact ChatGPT callback, not a wildcard')
  }
  let url
  try {
    url = new URL(value)
  } catch {
    throw new PlanError('EQB_OPS_MCP_OAUTH_REDIRECT_URI is not a valid URL')
  }
  if (url.protocol !== 'https:') {
    throw new PlanError('OAuth redirect URI must be https')
  }
  if (!url.hostname || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    throw new PlanError('OAuth redirect URI must be the ChatGPT UI callback, not localhost')
  }
  if (!url.pathname || url.pathname === '/') {
    throw new PlanError('OAuth redirect URI must include the ChatGPT callback path')
  }
  return value
}

function selectorKeys(rule) {
  return Object.keys(rule || {}).sort()
}

export function isExactOwnerAllowPolicy(policy, ownerEmail = OWNER_EMAIL) {
  if (!policy || String(policy.decision || '').toLowerCase() !== 'allow') return false
  const include = Array.isArray(policy.include) ? policy.include : []
  const exclude = Array.isArray(policy.exclude) ? policy.exclude : []
  const require = Array.isArray(policy.require) ? policy.require : []
  if (exclude.length > 0 || require.length > 0) return false
  if (include.length !== 1) return false
  const rule = include[0]
  if (selectorKeys(rule).join(',') !== 'email') return false
  const email = rule.email?.email || rule.email
  return String(email || '').toLowerCase() === ownerEmail.toLowerCase()
}

export function unexpectedAccessPolicies(policies, ownerEmail = OWNER_EMAIL) {
  const list = Array.isArray(policies) ? policies : []
  return list.filter((policy) => !isExactOwnerAllowPolicy(policy, ownerEmail))
}

export function assertOwnerOnlyPolicies(policies, ownerEmail = OWNER_EMAIL) {
  const list = Array.isArray(policies) ? policies : []
  const unexpected = unexpectedAccessPolicies(list, ownerEmail)
  if (unexpected.length > 0) {
    const kinds = unexpected.map((policy) => policy.decision || 'unknown').join(', ')
    throw new PlanError(
      `Access app already has unexpected policies (${kinds}); stopping without changes. Final config may only contain the Owner email allow rule.`,
    )
  }
  if (list.length > 1) {
    throw new PlanError('Access app has multiple policies; stopping without changes')
  }
  return list
}

export function requireExistingOtpProvider(idps) {
  const list = Array.isArray(idps) ? idps : []
  const otp = list.find((idp) => String(idp.type || '').toLowerCase() === 'onetimepin')
  if (!otp) {
    throw new PlanError(
      'One-time PIN identity provider is missing. Create it in the Cloudflare Dashboard, then re-run. This script will not create identity providers (needs Access: Organizations, Identity Providers, and Groups Write).',
    )
  }
  return otp
}

export function parseCloudflaredVersion(text) {
  const match = /[Vv]ersion\s+(\d+)\.(\d+)(?:\.(\d+))?/u.exec(String(text || ''))
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3] || 0)]
}

export function cloudflaredVersionAtLeast(text, minimum = MIN_CLOUDFLARED_VERSION) {
  const parsed = parseCloudflaredVersion(text)
  const min = parseCloudflaredVersion(`version ${minimum}`)
  if (!parsed || !min) return false
  for (let index = 0; index < 3; index += 1) {
    if (parsed[index] > min[index]) return true
    if (parsed[index] < min[index]) return false
  }
  return true
}

export function ownerAllowPolicyBody(ownerEmail = OWNER_EMAIL) {
  return {
    name: 'Owner email only',
    decision: 'allow',
    include: [{ email: { email: ownerEmail } }],
    exclude: [],
    require: [],
  }
}

export async function configureEqbOpsCloudflare(env, { cf, writeTunnelToken } = {}) {
  const writes = []
  const redirectUri = validateOAuthRedirectUri(env.EQB_OPS_MCP_OAUTH_REDIRECT_URI)
  const token = String(env.CLOUDFLARE_API_TOKEN || '').trim()
  if (!token) throw new PlanError('Missing CLOUDFLARE_API_TOKEN. Stopped without changing Cloudflare.')
  if (typeof cf !== 'function') {
    throw new PlanError('Cloudflare client is required')
  }

  async function mutate(method, path, body) {
    writes.push({ method, path, body })
    return cf(method, path, body)
  }

  async function read(method, path) {
    return cf(method, path)
  }

  const port = env.EQB_OPS_MCP_PORT || '8790'
  const zones = await read('GET', `/zones?name=${ZONE_NAME}`)
  const zone = Array.isArray(zones) ? zones[0] : null
  if (!zone?.id) throw new PlanError('eqbank.cc zone not found or token cannot read DNS (needs Zone Read)')
  const accountId = zone.account?.id
  if (!accountId) throw new PlanError('Cloudflare account id missing from zone')

  const apps = await read('GET', `/accounts/${accountId}/access/apps`)
  const appList = Array.isArray(apps) ? apps : []
  const existingApp = appList.find((item) => item.name === APP_NAME || item.domain === HOSTNAME)
  if (existingApp?.id) {
    const policies = await read('GET', `/accounts/${accountId}/access/apps/${existingApp.id}/policies`)
    assertOwnerOnlyPolicies(policies)
  }

  const idps = await read('GET', `/accounts/${accountId}/access/identity_providers`)
  const otp = requireExistingOtpProvider(idps)

  const tunnels = await read('GET', `/accounts/${accountId}/cfd_tunnel?is_deleted=false`)
  const tunnelList = Array.isArray(tunnels) ? tunnels : []
  const sharedNames = tunnelList.filter((tunnel) => tunnel.name !== TUNNEL_NAME).map((tunnel) => tunnel.name)
  let tunnel = tunnelList.find((item) => item.name === TUNNEL_NAME)
  if (!tunnel) {
    tunnel = await mutate('POST', `/accounts/${accountId}/cfd_tunnel`, {
      name: TUNNEL_NAME,
      config_src: 'cloudflare',
    })
  }

  await mutate('PUT', `/accounts/${accountId}/cfd_tunnel/${tunnel.id}/configurations`, {
    config: {
      ingress: [
        {
          hostname: HOSTNAME,
          service: `http://127.0.0.1:${port}`,
          originRequest: { noTLSVerify: false },
        },
        { service: 'http_status:404' },
      ],
    },
  })

  const tokenResult = await read('GET', `/accounts/${accountId}/cfd_tunnel/${tunnel.id}/token`)
  const tunnelToken = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token
  if (!tunnelToken) throw new PlanError('tunnel token missing from API')

  const records = await read('GET', `/zones/${zone.id}/dns_records?name=${HOSTNAME}`)
  const existing = (Array.isArray(records) ? records : []).filter((record) => record.name === HOSTNAME)
  const target = `${tunnel.id}.cfargotunnel.com`
  if (existing.length === 0) {
    await mutate('POST', `/zones/${zone.id}/dns_records`, {
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
      throw new PlanError('mcp.eqbank.cc already exists with a different target; refusing to overwrite')
    }
  } else {
    throw new PlanError('mcp.eqbank.cc has multiple DNS records; refusing to change them')
  }

  const oauthConfiguration = {
    enabled: true,
    dynamic_client_registration: {
      enabled: true,
      allow_any_on_localhost: false,
      allow_any_on_loopback: false,
      allowed_uris: [redirectUri],
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
    allowed_idps: [otp.id],
    auto_redirect_to_identity: true,
    oauth_configuration: oauthConfiguration,
    destinations: [{ type: 'public', uri: HOSTNAME }],
  }

  let app = existingApp
  if (!app) {
    app = await mutate('POST', `/accounts/${accountId}/access/apps`, appBody)
  } else {
    app = await mutate('PUT', `/accounts/${accountId}/access/apps/${app.id}`, {
      ...appBody,
      id: app.id,
    })
  }

  const policies = await read('GET', `/accounts/${accountId}/access/apps/${app.id}/policies`)
  const policyList = assertOwnerOnlyPolicies(policies)
  if (policyList.length === 0) {
    await mutate(
      'POST',
      `/accounts/${accountId}/access/apps/${app.id}/policies`,
      ownerAllowPolicyBody(),
    )
  }

  const tokenFile = env.EQB_OPS_MCP_TOKEN_FILE || '/etc/eqb-ops-mcp/tunnel.token'
  if (typeof writeTunnelToken === 'function') {
    writeTunnelToken(tokenFile, tunnelToken)
  }

  return {
    zone: ZONE_NAME,
    hostname: HOSTNAME,
    tunnel: TUNNEL_NAME,
    tunnelId: tunnel.id,
    accessApp: APP_NAME,
    accessAud: app.aud,
    allowedEmail: OWNER_EMAIL,
    redirectUris: [redirectUri],
    sharedTunnelsUntouched: sharedNames,
    tokenFile,
    writes,
    permissions: CLOUDFLARE_API_PERMISSIONS,
  }
}
