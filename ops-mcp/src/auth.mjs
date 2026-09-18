import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from 'jose'

export class AuthError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.status = 401
  }
}

function headerValue(headers, name) {
  if (!headers) return ''
  if (typeof headers.get === 'function') return String(headers.get(name) || '')
  const direct = headers[name] || headers[name.toLowerCase()]
  if (Array.isArray(direct)) return String(direct[0] || '')
  return String(direct || '')
}

export function readAccessToken(headers) {
  const assertion = headerValue(headers, 'cf-access-jwt-assertion').trim()
  if (assertion) return assertion
  const authorization = headerValue(headers, 'authorization').trim()
  const match = /^Bearer\s+(\S+)/u.exec(authorization)
  return match ? match[1] : ''
}

export function createAccessVerifier(options) {
  const {
    teamDomain,
    audience,
    allowedEmail,
    jwks,
    jwksUrl,
    clockTolerance = 0,
  } = options
  if (!teamDomain || !audience || !allowedEmail) {
    throw new Error('Access verifier requires teamDomain, audience, and allowedEmail')
  }
  const keySet = jwks
    ? createLocalJWKSet(jwks)
    : createRemoteJWKSet(new URL(jwksUrl || `${teamDomain}/cdn-cgi/access/certs`))
  const expectedEmail = allowedEmail.toLowerCase()

  return async function verifyAccessHeaders(headers) {
    const token = readAccessToken(headers)
    if (!token) throw new AuthError('missing_token', 'Missing Cloudflare Access assertion')
    let payload
    try {
      ;({ payload } = await jwtVerify(token, keySet, {
        issuer: teamDomain,
        audience,
        clockTolerance,
      }))
    } catch (error) {
      throw new AuthError('invalid_token', `Access JWT rejected: ${error.message}`)
    }
    const email = String(payload.email || '').trim().toLowerCase()
    if (!email) throw new AuthError('missing_email', 'Access JWT has no email')
    if (email !== expectedEmail) {
      throw new AuthError('email_not_allowed', 'Access identity is not allowed')
    }
    return { email, payload }
  }
}
