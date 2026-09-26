function originFromUrl(value) {
  if (!value || typeof value !== 'string') return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function hostOrigin(request) {
  const host = request.headers?.host
  if (!host || typeof host !== 'string') return null
  const forwarded = request.headers?.['x-forwarded-proto']
  const proto = forwarded === 'https' || forwarded === 'http'
    ? forwarded
    : 'http'
  try {
    return new URL(`${proto}://${host}`).origin
  } catch {
    return null
  }
}

export function assertSameOrigin(request, { publicOrigin } = {}) {
  const allowed = new Set()
  const host = hostOrigin(request)
  if (host) allowed.add(host)
  const configured = originFromUrl(publicOrigin)
  if (configured) allowed.add(configured)
  allowed.add('http://127.0.0.1:5173')
  allowed.add('http://localhost:5173')
  allowed.add('http://127.0.0.1:4173')
  allowed.add('http://localhost:4173')

  const origin = originFromUrl(request.headers?.origin)
  const referer = originFromUrl(request.headers?.referer)
  const candidate = origin || referer
  if (!candidate || !allowed.has(candidate)) {
    const error = new Error('Cross-origin translation requests are not allowed')
    error.code = 'TRANSLATION_CSRF'
    error.status = 403
    throw error
  }
}

export function assertJsonContentType(request) {
  const type = String(request.headers?.['content-type'] || '')
  if (!type.toLowerCase().includes('application/json')) {
    const error = new Error('Content-Type must be application/json')
    error.code = 'TRANSLATION_CONTENT_TYPE'
    error.status = 415
    throw error
  }
}
