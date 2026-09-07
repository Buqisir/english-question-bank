export function defineRoute(method, pattern, handle, options = {}) {
  if (typeof method !== 'string' || !method) {
    throw new TypeError('defineRoute method must be a non-empty string')
  }
  if (!(pattern instanceof RegExp)) {
    throw new TypeError('defineRoute pattern must be a RegExp')
  }
  if (typeof handle !== 'function') {
    throw new TypeError('defineRoute handle must be a function')
  }

  return Object.freeze({ method, pattern, handle, ownerOnly: Boolean(options.ownerOnly) })
}

// Generic pre-handle hook (docs/cuts/m0-3-role-gate/plan.md 1a, PM revision
// 2026-07-03): router/index.mjs stays a pure dispatch skeleton with no baked-in
// policy — `beforeHandle` is an optional caller-supplied callback, run after a
// route match and before `handle` (and before the request body is read, so a
// short-circuit never pays body-parse cost or lets the request trigger side
// effects). If it returns truthy, the request is considered already handled and
// `runRoutes` returns true without calling `handle`. The one caller (api.mjs)
// uses this hook for the owner/member route gate; router/index.mjs itself has no
// opinion on what `beforeHandle` checks.
export async function runRoutes(routes, { request, response, url, context }, { beforeHandle } = {}) {
  for (const route of routes) {
    if (request.method !== route.method) {
      continue
    }

    const match = url.pathname.match(route.pattern)
    if (!match) {
      continue
    }

    if (beforeHandle && (await beforeHandle(route, { request, response, url, match, context }))) {
      return true
    }

    await route.handle({ request, response, url, match, context })
    return true
  }

  return false
}

export function readJsonRouteBody(request, { maxBytes = 1_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0

    request.on('data', (chunk) => {
      bytes += chunk.length
      chunks.push(chunk)
      if (bytes > maxBytes) {
        request.destroy()
        reject(new Error('Request body too large'))
      }
    })

    request.on('end', () => {
      try {
        const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })

    request.on('error', reject)
  })
}
