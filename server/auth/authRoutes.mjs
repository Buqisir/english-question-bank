// M0-2 login/logout/me routes. Kept separate from the auth gate (server/api.mjs
// main handler) per plan.md decision 6 — these are ordinary routes appended to
// serverRoutes; the gate in the main handler already whitelists them so they
// are reachable pre-auth.
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  createSession,
  destroySessionByToken,
  findUserByUsername,
  isRequestSecure,
  readSessionTokenFromRequest,
  rowToUser,
  verifyPassword,
} from './auth.mjs'
import { defineRoute } from '../router/index.mjs'

// sendJson() (server/api.mjs) hardcodes its header set and has no room for
// Set-Cookie without changing its signature for every existing caller (plan.md
// decision 6: "keep sendJson current callers zero-change"). These three routes
// write their own JSON responses instead, echoing sendJson's CORS/content-type
// headers plus Set-Cookie where needed.
function sendAuthJson(response, status, body, { setCookie } = {}) {
  const headers = {
    'access-control-allow-origin': 'http://127.0.0.1:5173',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'x-verify-request-id, x-parse-request-id',
    'content-type': 'application/json; charset=utf-8',
  }
  if (setCookie) headers['set-cookie'] = setCookie
  response.writeHead(status, headers)
  response.end(JSON.stringify(body))
}

export function createAuthRoutes() {
  return [
    defineRoute('POST', /^\/api\/auth\/login$/, async ({ request, response, context }) => {
      const input = await context.readJsonBody(request, { maxBytes: 10_000 })
      const username = String(input?.username || '').trim()
      const password = String(input?.password || '')
      if (!username || !password) {
        sendAuthJson(response, 401, { error: 'invalid_credentials' })
        return
      }

      const db = context.openUserDatabase({ readOnly: false })
      try {
        const userRow = findUserByUsername(db, username)
        // Same 401 body whether the user doesn't exist or the password is
        // wrong — avoids leaking which case it was (plan.md decision 6).
        if (!userRow || userRow.status !== 'active') {
          sendAuthJson(response, 401, { error: 'invalid_credentials' })
          return
        }
        const passwordOk = await verifyPassword(userRow.password_hash, password)
        if (!passwordOk) {
          sendAuthJson(response, 401, { error: 'invalid_credentials' })
          return
        }
        const token = createSession(db, userRow.id)
        const cookie = buildSessionCookie(token, { secure: isRequestSecure(request) })
        sendAuthJson(response, 200, { user: rowToUser(userRow) }, { setCookie: cookie })
      } finally {
        db.close()
      }
    }),

    defineRoute('POST', /^\/api\/auth\/logout$/, ({ request, response, context }) => {
      const token = readSessionTokenFromRequest(request)
      const db = context.openUserDatabase({ readOnly: false })
      try {
        destroySessionByToken(db, token)
      } finally {
        db.close()
      }
      const cookie = buildExpiredSessionCookie({ secure: isRequestSecure(request) })
      sendAuthJson(response, 200, { ok: true }, { setCookie: cookie })
    }),

    defineRoute('GET', /^\/api\/auth\/me$/, ({ request, response, context }) => {
      // The auth gate (server/api.mjs main handler) has already run by the
      // time this route is reached and put a resolved session on
      // context.session when one is valid. In bootstrap-open mode (empty
      // users table) the gate never attaches a session and never 401s —
      // this route is the only place that reports authRequired: false.
      const db = context.openUserDatabase({ readOnly: true })
      let usersExist
      try {
        usersExist = db.prepare('SELECT 1 FROM users LIMIT 1').get() != null
      } finally {
        db.close()
      }

      if (!usersExist) {
        sendAuthJson(response, 200, { authRequired: false, user: null })
        return
      }

      if (context.session) {
        sendAuthJson(response, 200, {
          authRequired: true,
          user: {
            id: context.session.userId,
            username: context.session.username,
            role: context.session.role,
            accountKind: context.session.accountKind || 'human',
          },
        })
        return
      }

      // Reached only if the gate let this request through without a session —
      // that only happens because /api/auth/me is itself whitelisted so the
      // frontend can probe login state. No session means "not authenticated".
      sendAuthJson(response, 401, { error: 'not_authenticated' })
    }),
  ]
}
