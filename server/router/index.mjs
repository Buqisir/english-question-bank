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

// M0-3 owner/member role gate (docs/cuts/m0-3-role-gate/plan.md 1a). Checked after a
// route match and before `handle` runs (and before the request body is read), so a
// 403 never pays body-parse cost and never gives member requests a chance to trigger
// side effects.
//
// Uses a POSITIVE check (`authMode === 'enforced'`) rather than `!== 'open'` on
// purpose (PA MF-3): any future authMode value, or a context that forgot to set
// authMode at all, must fail OPEN here (no gate) rather than accidentally 403-ing
// bootstrap-open mode. The authMode contract (api.mjs applyAuthGate / context
// assembly) is responsible for making sure authMode is always one of the two known
// strings in every reachable branch — this function only trusts what it's given.
function isOwnerGateBlocked(route, context) {
  if (!route.ownerOnly) return false
  if (context?.authMode !== 'enforced') return false
  return context?.session?.role !== 'owner'
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

    if (isOwnerGateBlocked(route, context)) {
      context.sendJson(response, 403, { error: 'forbidden' })
      return true
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
