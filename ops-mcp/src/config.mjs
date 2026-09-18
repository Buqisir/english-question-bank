import { isAbsolute } from 'node:path'

export const MAX_RESPONSE_BYTES = 64 * 1024
export const TOOL_TIMEOUT_MS = 10_000
export const MIN_LOG_MINUTES = 5
export const MAX_LOG_MINUTES = 1440
export const MIN_LOG_LIMIT = 1
export const MAX_LOG_LIMIT = 200
export const MIN_KEYWORD_CHARS = 1
export const MAX_KEYWORD_CHARS = 100
export const LOG_READ_MAX_BYTES = 8 * 1024 * 1024
export const HEALTH_TIMEOUT_MS = 5_000
export const FIXED_COMMAND_TIMEOUT_MS = 4_000

const SERVICE_NAME = /^[a-zA-Z0-9@._-]+$/u
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

function required(env, name) {
  const value = String(env[name] || '').trim()
  if (!value) throw new ConfigError(`Missing ${name}`)
  return value
}

function optional(env, name, fallback) {
  const value = env[name]
  if (value == null || String(value).trim() === '') return fallback
  return String(value).trim()
}

function integer(env, name, fallback) {
  const raw = optional(env, name, String(fallback))
  if (!/^\d+$/u.test(raw)) throw new ConfigError(`Invalid ${name}`)
  return Number(raw)
}

function absolutePath(env, name, fallback) {
  const value = optional(env, name, fallback)
  if (!isAbsolute(value) || value.includes('\0')) {
    throw new ConfigError(`${name} must be an absolute path`)
  }
  return value
}

function serviceName(env, name, fallback) {
  const value = optional(env, name, fallback)
  if (!SERVICE_NAME.test(value)) throw new ConfigError(`Invalid ${name}`)
  return value
}

function parseHealthUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError('EQB_OPS_MCP_HEALTH_URL is not a valid URL')
  }
  if (url.protocol !== 'http:') throw new ConfigError('Health URL must be http')
  if (url.hostname !== '127.0.0.1') throw new ConfigError('Health URL host must be 127.0.0.1')
  if (url.pathname !== '/api/health') throw new ConfigError('Health URL path must be /api/health')
  if (url.username || url.password || url.search || url.hash) {
    throw new ConfigError('Health URL must not include credentials, query, or hash')
  }
  return url.href
}

function parseListen(raw) {
  if (raw !== '127.0.0.1') throw new ConfigError('MCP must listen on 127.0.0.1')
  return raw
}

export function loadConfig(env = process.env) {
  const authMode = optional(env, 'EQB_OPS_MCP_AUTH_MODE', 'cloudflare')
  if (authMode !== 'cloudflare' && authMode !== 'test') {
    throw new ConfigError('EQB_OPS_MCP_AUTH_MODE must be cloudflare or test')
  }
  if (authMode === 'test' && env.EQB_OPS_MCP_ALLOW_TEST_AUTH !== '1') {
    throw new ConfigError('Test auth is disabled unless EQB_OPS_MCP_ALLOW_TEST_AUTH=1')
  }

  const allowedEmail = required(env, 'EQB_OPS_MCP_ALLOWED_EMAIL').toLowerCase()
  if (!EMAIL.test(allowedEmail)) throw new ConfigError('EQB_OPS_MCP_ALLOWED_EMAIL is invalid')

  const config = {
    authMode,
    listenHost: parseListen(optional(env, 'EQB_OPS_MCP_LISTEN', '127.0.0.1')),
    listenPort: integer(env, 'EQB_OPS_MCP_PORT', 8790),
    publicOrigin: optional(env, 'EQB_OPS_MCP_PUBLIC_ORIGIN', 'https://mcp.eqbank.cc'),
    healthUrl: parseHealthUrl(optional(
      env,
      'EQB_OPS_MCP_HEALTH_URL',
      'http://127.0.0.1:8787/api/health',
    )),
    eqbService: serviceName(env, 'EQB_OPS_MCP_SERVICE', 'eqb'),
    caddyService: serviceName(env, 'EQB_OPS_MCP_CADDY_SERVICE', 'caddy'),
    releaseRoot: absolutePath(env, 'EQB_OPS_MCP_RELEASE_ROOT', '/opt/eqb'),
    checkoutPath: absolutePath(
      env,
      'EQB_OPS_MCP_CHECKOUT',
      '/opt/eqb/english-question-bank',
    ),
    logFile: absolutePath(env, 'EQB_OPS_MCP_LOG_FILE', '/var/lib/eqb-ops/eqb.log'),
    diskPath: absolutePath(env, 'EQB_OPS_MCP_DISK_PATH', '/opt/eqb'),
    allowedEmail,
    teamDomain: optional(env, 'EQB_OPS_MCP_TEAM_DOMAIN', ''),
    audience: optional(env, 'EQB_OPS_MCP_AUD', ''),
    gitBin: absolutePath(env, 'EQB_OPS_MCP_GIT_BIN', '/usr/bin/git'),
    systemctlBin: absolutePath(env, 'EQB_OPS_MCP_SYSTEMCTL_BIN', '/usr/bin/systemctl'),
  }

  if (config.listenPort < 1 || config.listenPort > 65535) {
    throw new ConfigError('EQB_OPS_MCP_PORT is out of range')
  }
  if (authMode === 'cloudflare') {
    if (!config.teamDomain.startsWith('https://') || !config.teamDomain.includes('.cloudflareaccess.com')) {
      throw new ConfigError('EQB_OPS_MCP_TEAM_DOMAIN must be an https://*.cloudflareaccess.com issuer')
    }
    if (config.teamDomain.endsWith('/')) {
      throw new ConfigError('EQB_OPS_MCP_TEAM_DOMAIN must not have a trailing slash')
    }
    if (!/^[a-zA-Z0-9_-]{16,128}$/u.test(config.audience)) {
      throw new ConfigError('EQB_OPS_MCP_AUD is missing or malformed')
    }
  }
  return Object.freeze(config)
}
