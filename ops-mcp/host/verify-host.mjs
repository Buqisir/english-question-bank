import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLOUDFLARE_API_PERMISSIONS,
  OWNER_EMAIL,
  TUNNEL_TOKEN_PERMISSIONS,
  assertOwnerOnlyPolicies,
  cloudflaredVersionAtLeast,
  configureEqbOpsCloudflare,
  parseCloudflaredVersion,
  validateOAuthRedirectUri,
} from './cloudflare-plan.mjs'

const hostDir = path.dirname(fileURLToPath(import.meta.url))
const CALLBACK = 'https://chatgpt.com/connector/oauth/callback'

function sh(args, extra = {}) {
  return spawnSync('sh', args, {
    encoding: 'utf8',
    cwd: hostDir,
    ...extra,
  })
}

function runScript(file, extra = {}) {
  return sh(['-n', path.join(hostDir, file)], extra)
}

function sourceCheck(snippet, extra = {}) {
  return sh(['-c', `. ./host-checks.sh\n${snippet}`], extra)
}

function recordingCf(routes) {
  const calls = []
  async function cf(method, apiPath, body) {
    calls.push({ method, path: apiPath, body })
    const route = routes.find((entry) => entry.method === method && entry.test(apiPath))
    if (!route) throw new Error(`unexpected ${method} ${apiPath}`)
    return route.result
  }
  return { cf, calls, writes: () => calls.filter((call) => call.method !== 'GET') }
}

const ownerPolicy = {
  decision: 'allow',
  include: [{ email: { email: OWNER_EMAIL } }],
  exclude: [],
  require: [],
}

export async function runHostVerify(assert, throws, throwsAsync, temp) {
  for (const file of [
    'install-eqb-ops-mcp.sh',
    'export-eqb-logs.sh',
    'rollback-eqb-ops-mcp.sh',
    'host-checks.sh',
  ]) {
    const syntax = runScript(file)
    assert(`sh -n ${file}`, syntax.status === 0, syntax.stderr)
  }

  const install = readFileSync(path.join(hostDir, 'install-eqb-ops-mcp.sh'), 'utf8')
  assert(
    'install script does not loop production Caddy/eqb.service into the guard',
    !install.includes('for forbidden in') && !install.includes('/etc/caddy/Caddyfile \\\n'),
  )
  const allowed = sourceCheck('assert_install_destination /etc/systemd/system/eqb-ops-mcp.service && echo ok')
  assert('install destination for MCP unit is allowed', allowed.status === 0 && allowed.stdout.includes('ok'))
  const blocked = sourceCheck('if assert_install_destination /etc/caddy/Caddyfile; then echo bad; else echo blocked; fi')
  assert('Caddyfile remains a blocked destination', blocked.stdout.includes('blocked'))
  const blockedUnit = sourceCheck('if assert_install_destination /etc/systemd/system/eqb.service; then echo bad; else echo blocked; fi')
  assert('eqb.service remains a blocked destination', blockedUnit.stdout.includes('blocked'))

  const newBinary = path.join(temp, 'cloudflared-new')
  writeFileSync(newBinary, '#!/bin/sh\necho "cloudflared version 2025.4.0 (built 2025-04-01)"\n')
  chmodSync(newBinary, 0o755)
  const oldBinary = path.join(temp, 'cloudflared-old')
  writeFileSync(oldBinary, '#!/bin/sh\necho "cloudflared version 2024.12.2 (built 2024-12-02)"\n')
  chmodSync(oldBinary, 0o755)

  const checkOnly = sh([path.join(hostDir, 'install-eqb-ops-mcp.sh'), temp], {
    env: {
      ...process.env,
      EQB_OPS_MCP_INSTALL_CHECK_ONLY: '1',
      EQB_OPS_MCP_CLOUDFLARED_BIN: newBinary,
    },
  })
  assert(
    'install script does not unconditionally exit when destinations are MCP paths',
    checkOnly.status === 0 && checkOnly.stdout.includes('install checks passed'),
    checkOnly.stderr || checkOnly.stdout,
  )

  const missing = sh([path.join(hostDir, 'install-eqb-ops-mcp.sh'), temp], {
    env: {
      ...process.env,
      EQB_OPS_MCP_INSTALL_CHECK_ONLY: '1',
      EQB_OPS_MCP_CLOUDFLARED_BIN: path.join(temp, 'no-such-cloudflared'),
    },
  })
  assert('cloudflared missing stops install', missing.status !== 0 && /not found/i.test(missing.stderr))

  const tooOld = sh([path.join(hostDir, 'install-eqb-ops-mcp.sh'), temp], {
    env: {
      ...process.env,
      EQB_OPS_MCP_INSTALL_CHECK_ONLY: '1',
      EQB_OPS_MCP_CLOUDFLARED_BIN: oldBinary,
    },
  })
  assert('cloudflared older than 2025.4.0 stops install', tooOld.status !== 0 && /too old/i.test(tooOld.stderr))

  assert('parse 2025.4.0', parseCloudflaredVersion('cloudflared version 2025.4.0')?.join('.') === '2025.4.0')
  assert('2025.4.0 meets minimum', cloudflaredVersionAtLeast('cloudflared version 2025.4.0'))
  assert('2024.12.2 is below minimum', cloudflaredVersionAtLeast('cloudflared version 2024.12.2') === false)

  assert('token dir mode is 0750', TUNNEL_TOKEN_PERMISSIONS.directory.mode === 0o750)
  assert('token file mode is 0640', TUNNEL_TOKEN_PERMISSIONS.file.mode === 0o640)
  assert('token group is cloudflared', TUNNEL_TOKEN_PERMISSIONS.file.group === 'cloudflared')
  assert('install creates /etc/eqb-ops-mcp as root:cloudflared 0750', /install -d -o root -g cloudflared -m 0750 "\$CONF_DIR"/.test(install))
  assert('install chmod tunnel.token 0640', install.includes('chmod 0640') && install.includes('root:cloudflared'))
  const unit = readFileSync(path.join(hostDir, 'cloudflared-eqb-ops.service'), 'utf8')
  assert('tunnel unit runs as cloudflared', /User=cloudflared/.test(unit) && unit.includes('/etc/eqb-ops-mcp/tunnel.token'))

  const tokenDir = path.join(temp, 'eqb-ops-mcp')
  const tokenFile = path.join(tokenDir, 'tunnel.token')
  mkdirSync(tokenDir, { mode: 0o750 })
  writeFileSync(tokenFile, 'token\n', { mode: 0o640 })
  const tokenStat = statSync(tokenFile)
  const dirStat = statSync(tokenDir)
  assert('token file mode 0640', (tokenStat.mode & 0o777) === 0o640)
  assert('token directory mode 0750', (dirStat.mode & 0o777) === 0o750)

  throws('missing ChatGPT callback is rejected', () => validateOAuthRedirectUri(''), /ChatGPT UI callback/)
  throws('wildcard callback is rejected', () => validateOAuthRedirectUri('https://chatgpt.com/*'), /exact ChatGPT callback/)

  const noCallbackCalls = []
  await throwsAsync(
    'missing callback performs zero Cloudflare calls',
    () => configureEqbOpsCloudflare({ CLOUDFLARE_API_TOKEN: 'secret' }, {
      cf: async (method, apiPath) => {
        noCallbackCalls.push({ method, path: apiPath })
        throw new Error('Cloudflare should not be called')
      },
    }),
    /EQB_OPS_MCP_OAUTH_REDIRECT_URI/,
  )
  assert('callback missing means zero Cloudflare writes', noCallbackCalls.length === 0)

  const extra = recordingCf([
    { method: 'GET', test: (value) => value.startsWith('/zones?'), result: [{ id: 'zone', account: { id: 'acct' } }] },
    {
      method: 'GET',
      test: (value) => value.includes('/access/apps') && !value.includes('/policies'),
      result: [{ id: 'app1', name: 'EQB Ops', domain: 'mcp.eqbank.cc' }],
    },
    {
      method: 'GET',
      test: (value) => value.includes('/policies'),
      result: [
        ownerPolicy,
        { decision: 'allow', include: [{ everyone: {} }] },
      ],
    },
  ])
  await throwsAsync(
    'extra Access allow policy fail-closes',
    () => configureEqbOpsCloudflare({
      EQB_OPS_MCP_OAUTH_REDIRECT_URI: CALLBACK,
      CLOUDFLARE_API_TOKEN: 'secret',
    }, { cf: extra.cf }),
    /unexpected policies/,
  )
  assert('extra Access policies cause zero Cloudflare writes', extra.writes().length === 0)

  const bypass = recordingCf([
    { method: 'GET', test: (value) => value.startsWith('/zones?'), result: [{ id: 'zone', account: { id: 'acct' } }] },
    {
      method: 'GET',
      test: (value) => value.includes('/access/apps') && !value.includes('/policies'),
      result: [{ id: 'app1', name: 'EQB Ops', domain: 'mcp.eqbank.cc' }],
    },
    {
      method: 'GET',
      test: (value) => value.includes('/policies'),
      result: [{ decision: 'bypass', include: [{ email: { email: OWNER_EMAIL } }] }],
    },
  ])
  await throwsAsync(
    'Bypass policy fail-closes',
    () => configureEqbOpsCloudflare({
      EQB_OPS_MCP_OAUTH_REDIRECT_URI: CALLBACK,
      CLOUDFLARE_API_TOKEN: 'secret',
    }, { cf: bypass.cf }),
    /unexpected policies/,
  )
  assert('Bypass policy causes zero Cloudflare writes', bypass.writes().length === 0)

  const serviceAuth = recordingCf([
    { method: 'GET', test: (value) => value.startsWith('/zones?'), result: [{ id: 'zone', account: { id: 'acct' } }] },
    {
      method: 'GET',
      test: (value) => value.includes('/access/apps') && !value.includes('/policies'),
      result: [{ id: 'app1', name: 'EQB Ops', domain: 'mcp.eqbank.cc' }],
    },
    {
      method: 'GET',
      test: (value) => value.includes('/policies'),
      result: [{ decision: 'non_identity', include: [{ service_token: { token_id: 'tok' } }] }],
    },
  ])
  await throwsAsync(
    'Service Auth policy fail-closes',
    () => configureEqbOpsCloudflare({
      EQB_OPS_MCP_OAUTH_REDIRECT_URI: CALLBACK,
      CLOUDFLARE_API_TOKEN: 'secret',
    }, { cf: serviceAuth.cf }),
    /unexpected policies/,
  )
  assert('Service Auth policy causes zero Cloudflare writes', serviceAuth.writes().length === 0)

  throws(
    'email-domain allow is not owner-only',
    () => assertOwnerOnlyPolicies([{ decision: 'allow', include: [{ email_domain: { domain: 'gmail.com' } }] }]),
    /unexpected policies/,
  )

  const logDir = path.join(temp, 'log-export')
  mkdirSync(logDir, { recursive: true })
  const journal = path.join(temp, 'fake-journalctl')
  writeFileSync(journal, '#!/bin/sh\necho "2026-09-18T12:00:00+00:00 host eqb[1]: ERROR exported"\n')
  chmodSync(journal, 0o755)
  const exportRun = sh([path.join(hostDir, 'export-eqb-logs.sh')], {
    env: {
      ...process.env,
      EQB_OPS_LOG_DIR: logDir,
      EQB_OPS_LOG_OUT: path.join(logDir, 'eqb.log'),
      EQB_OPS_JOURNALCTL: journal,
    },
  })
  assert('log export succeeds with atomic mv', exportRun.status === 0, exportRun.stderr)
  assert('exported log exists', existsSync(path.join(logDir, 'eqb.log')))
  assert('temp export files are gone', !existsSync(path.join(logDir, 'eqb.log.tmp')) && !existsSync(path.join(logDir, 'eqb.log.raw')))
  const exportSource = readFileSync(path.join(hostDir, 'export-eqb-logs.sh'), 'utf8')
  assert('log export uses same-directory mv', exportSource.includes('/bin/mv -f "$TMP" "$OUT"'))
  assert('log export does not tail onto $OUT', !/tail -c .* >"\$OUT"/u.test(exportSource))

  assert(
    'OTP create permission is documented as Organizations/IdP write',
    CLOUDFLARE_API_PERMISSIONS.otpCreate.includes('Identity Providers, and Groups Write'),
  )
  assert(
    'Zone query permission is Zone Read',
    CLOUDFLARE_API_PERMISSIONS.zoneQuery === 'Zone Read',
  )
  assert(
    'OTP is reused from the Dashboard',
    /Reuse a Dashboard-created One-time PIN/u.test(CLOUDFLARE_API_PERMISSIONS.otpStrategy),
  )
}
