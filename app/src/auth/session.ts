// M0-2 auth client: fetchMe / login / logout. Thin wrappers over fetch, matching
// the style of app/src/services/*.ts (apiPath + errorMessageFromResponse).
//
// No credentials config is needed: dev goes through the vite proxy so the
// browser sees API calls as same-origin, and cookies are sent by default for
// same-origin requests. Cross-origin deployment is explicitly unsupported
// (docs/adr/0012-invite-login-auth-design.md decision 6) — M1 deployment must
// keep frontend and API same-origin.
import { apiPath, errorMessageFromResponse as readError } from '../services/httpClient.ts'

export type SessionUser = {
  id: string
  username: string
  role: 'owner' | 'member'
  accountKind?: 'human' | 'import_agent'
}

export type MeResponse =
  | { authRequired: false; user: null }
  | { authRequired: true; user: SessionUser | null }

export async function fetchMe(): Promise<MeResponse> {
  const response = await fetch(apiPath('/api/auth/me'))
  // 401 means forced mode with no valid session — same shape the caller would
  // use to decide "show the login page", so normalize it instead of throwing.
  if (response.status === 401) {
    return { authRequired: true, user: null }
  }
  if (!response.ok) throw new Error(await readError(response, `Failed to check session: ${response.status}`))
  return (await response.json()) as MeResponse
}

export async function login(username: string, password: string): Promise<SessionUser> {
  const response = await fetch(apiPath('/api/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    if (response.status === 401) throw new Error('用户名或密码不正确')
    throw new Error(await readError(response, `登录失败: ${response.status}`))
  }
  const data = (await response.json()) as { user: SessionUser }
  return data.user
}

export async function logout(): Promise<void> {
  const response = await fetch(apiPath('/api/auth/logout'), { method: 'POST' })
  if (!response.ok) throw new Error(await readError(response, `退出失败: ${response.status}`))
}
