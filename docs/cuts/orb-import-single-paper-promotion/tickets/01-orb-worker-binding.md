# 01 — Project Orb worker binding

Status: planned
Spec: `../spec.md`

## Deliver

- Persist reservation, webhook event, Amp thread, submission digest, claim, and
  handoff paper identity.
- Replace Mac runner creation with private project Orb create/resume.
- Use `event.id` and reserve/create/bind/append ordering.
- Bind lease operations and initialization/handoff receipts to `AMP_THREAD_ID`.
- Keep Project Secret configuration documented but disabled.

## Gate

Focused source-intake, webhook duplicate/concurrency/crash-window, auth, lease,
download digest, init, needs-owner, and handoff verifiers pass.
