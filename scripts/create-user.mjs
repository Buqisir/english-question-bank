#!/usr/bin/env node
// M0-2 owner CLI: create-account / reset-password / enable-disable, invite-model
// login has no self-service signup or recovery flow (roadmap decision #4), so this
// is the entire operational surface for account management. Single script, three
// modes selected by flags. Reuses server/auth/auth.mjs's ensure/hash/session helpers
// (single source of truth for the schema, per plan.md decision 8 — do not
// re-declare the users/sessions schema here) and server/api.mjs's openUserDatabase
// (same connection/ensure logic the running server uses).
//
// Style follows scripts/migrate-user-data-split.mjs: header comment cites the
// authorizing plan/ADR, fail() sets exitCode instead of throwing raw, steps are
// printed, and the DB connection is closed in try/finally.
//
// Usage:
//   node scripts/create-user.mjs --username W [--role owner|member] [--password P]
//     Creates a new active user. If --password is omitted, a random password is
//     generated with crypto.randomBytes(9).toString('base64url') and printed once
//     (never written to disk).
//   node scripts/create-user.mjs --reset-password --username W [--password P]
//     Resets an existing user's password and deletes all of their sessions
//     (there is no recovery flow — this command IS the recovery flow, run by the
//     owner on the server). Password omitted -> same random-generate-and-print.
//   node scripts/create-user.mjs --disable --username W
//   node scripts/create-user.mjs --enable --username W
//     Toggle account status. Disabling takes effect immediately because the auth
//     gate's session lookup joins on users.status = 'active'.
//
// docs/cuts/m0-2-invite-login/plan.md decision 8 / docs/adr/0012-invite-login-auth-design.md
import { randomBytes } from 'node:crypto'
import {
  createUser,
  deleteSessionsForUser,
  findUserByUsername,
  hashPassword,
  setUserPasswordHash,
  setUserStatus,
} from '../server/auth/auth.mjs'
import { openUserDatabase } from '../server/api.mjs'

function fail(message) {
  console.error(`\n[create-user] FAILED: ${message}`)
  process.exitCode = 1
}

function parseArgs(argv) {
  const args = { role: 'member' }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    switch (token) {
      case '--username':
        args.username = argv[++i]
        break
      case '--password':
        args.password = argv[++i]
        break
      case '--role':
        args.role = argv[++i]
        break
      case '--reset-password':
        args.mode = 'reset-password'
        break
      case '--disable':
        args.mode = 'disable'
        break
      case '--enable':
        args.mode = 'enable'
        break
      default:
        fail(`unknown argument: ${token}`)
        return null
    }
  }
  return args
}

function generatePassword() {
  return randomBytes(9).toString('base64url')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args) return
  if (process.exitCode) return

  if (!args.username || !args.username.trim()) {
    fail('--username is required')
    return
  }
  if (args.mode && !['reset-password', 'disable', 'enable'].includes(args.mode)) {
    fail(`unknown mode: ${args.mode}`)
    return
  }
  if (!args.mode && args.role && !['owner', 'member'].includes(args.role)) {
    fail(`invalid --role: ${args.role} (expected owner or member)`)
    return
  }

  const db = openUserDatabase({ readOnly: false })
  try {
    if (args.mode === 'disable' || args.mode === 'enable') {
      const user = findUserByUsername(db, args.username)
      if (!user) {
        fail(`no such user: ${args.username}`)
        return
      }
      const nextStatus = args.mode === 'disable' ? 'disabled' : 'active'
      setUserStatus(db, user.id, nextStatus)
      if (nextStatus === 'disabled') {
        deleteSessionsForUser(db, user.id)
      }
      console.log(`Step: ${args.username} is now ${nextStatus}.`)
      return
    }

    if (args.mode === 'reset-password') {
      const user = findUserByUsername(db, args.username)
      if (!user) {
        fail(`no such user: ${args.username}`)
        return
      }
      const password = args.password || generatePassword()
      const passwordHash = await hashPassword(password)
      setUserPasswordHash(db, user.id, passwordHash)
      deleteSessionsForUser(db, user.id)
      console.log(`Step: password reset for ${args.username}. All existing sessions were revoked.`)
      if (!args.password) {
        console.log(`Generated password (shown once, not stored anywhere): ${password}`)
      }
      return
    }

    // Default mode: create a new user.
    const password = args.password || generatePassword()
    const passwordHash = await hashPassword(password)
    const user = createUser(db, { username: args.username, passwordHash, role: args.role })
    console.log(`Step: created user "${user.username}" (role: ${user.role}, id: ${user.id}).`)
    if (!args.password) {
      console.log(`Generated password (shown once, not stored anywhere): ${password}`)
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  } finally {
    db.close()
  }
}

main()
