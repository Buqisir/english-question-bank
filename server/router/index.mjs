export function defineRoute(method, pattern, handle) {
  if (typeof method !== 'string' || !method) {
    throw new TypeError('defineRoute method must be a non-empty string')
  }
  if (!(pattern instanceof RegExp)) {
    throw new TypeError('defineRoute pattern must be a RegExp')
  }
  if (typeof handle !== 'function') {
    throw new TypeError('defineRoute handle must be a function')
  }

  return Object.freeze({ method, pattern, handle })
}

export async function runRoutes(routes, { request, response, url, context }) {
  for (const route of routes) {
    if (request.method !== route.method) {
      continue
    }

    const match = url.pathname.match(route.pattern)
    if (!match) {
      continue
    }

    await route.handle({ request, response, url, match, context })
    return true
  }

  return false
}

export function readJsonRouteBody(request, { maxBytes = 1_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    let body = ''
    let bytes = 0

    request.on('data', (chunk) => {
      bytes += chunk.length
      body += chunk
      if (bytes > maxBytes) {
        request.destroy()
        reject(new Error('Request body too large'))
      }
    })

    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })

    request.on('error', reject)
  })
}
