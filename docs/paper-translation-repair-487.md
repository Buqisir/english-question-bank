# Paper selection translation: repair #487

Candidate based on `f360b6220c72e3a29e7b2f32742bf9262e654fe5`, for the existing
`feat/paper-selection-translation-486` branch. No PR, main update, deployment,
production configuration change, or paid translation is part of this repair.

## Changed behavior

- New selections replace loading/result/error cards. Outside clicks, source
  changes, paper changes and unmount invalidate the snapshot and its subscriber.
- Successful segments are cached individually. Failed segments remain visible;
  retry sends only missing segments and restores their original display order.
- Adjacent paragraph leaves can bridge the canonical newline. Arbitrary gaps
  and private/editable regions cannot be silently skipped.
- Runtime ledger opening requires an existing, nonempty, structurally valid
  SQLite ledger. Missing/corrupt/schema-less ledgers fail closed to cache-only.
- Full adjacent context is retained. The existing actual-request token preflight
  rejects oversized requests instead of silently clipping the nearest context.
  `selection-prompt-v3` invalidates old prompt-policy cache entries.
- HTTP disconnects cancel the subscriber without treating normal body completion
  as a disconnect. Shared live subscribers remain unaffected; a new subscriber
  waits for cleanup instead of joining an already cancelled flight. An abandoned
  queued flight may still take the existing bounded queue timeout to clean up.

The Flash selected-text user message, unique body stream IDs and TPM window
repair from the parent commit are retained. This does not establish model-quality
results or change model/provider, feature enablement or budget amounts.

## Ledger initialization and recovery

Set `QUESTION_BANK_PAPER_TRANSLATION_DATA_DIR` to the approved stable data
directory, outside versioned releases. Existing intact ledgers keep their receipt
schema and balances; this patch does not rewrite or migrate their records.

For an explicitly authorized, genuinely FIRST installation with no earlier
translation spending, initialize the ledger once, as the intended service user:

```sh
node scripts/initialize-paper-translation-ledger.mjs --new /absolute/stable/data/translation-usage.sqlite
```

The command exclusively creates a new file, refuses to overwrite any existing
file, and does not change keys, feature flags or budgets. A failed initialization
file is left for inspection rather than silently replaced.

**A previously enabled deployment with a lost ledger is NOT a new installation.**
Keep paid translation disabled and restore/reconcile the original accounting from
a verified backup under a separately authorized recovery operation. Do not use
this command to reset spending. Do not delete a damaged file merely to make the
initializer succeed. The runtime never initializes or repairs accounting on a
translation request. Restart after a reviewed recovery so the runtime can reopen
the repaired ledger. Deleting the result cache is independent of accounting.

## Regression entry points

```sh
node scripts/verify-paper-translation-repair.mjs
node scripts/verify-paper-translation-cache.mjs
node scripts/verify-paper-translation-routes.mjs
node scripts/verify-paper-selection-browser.mjs
```

The cache verifier imports the repair verifier. The existing browser verifier
also mounts the real selection hook, overlay, DOM mapper and page cache via
`paper-selection-controller-checks.mjs`; only source loading and HTTP responses
are fixture-controlled in that added harness. Existing browser focus/print
checks remain in place. Cache/route fixtures now explicitly initialize temporary
ledgers rather than relying on production runtime auto-creation.

## Sandbox evidence and limits (2026-09-21)

PASS: 16 focused backend assertions with Node 22.16.0, temporary SQLite and real
Node HTTP connections. These exercise the actual ledger, prompt builder,
single-flight, scheduler, HTTP route, router and CSRF code. The route uses an
injected runtime fixture; the unused translate-service import was stubbed in the
partial sandbox checkout. This is not full translate-service integration.

PASS: 16 focused browser assertions using real Chromium and the actual hook,
overlay, DOM mapper, service client and page cache. Canonical source projection
and HTTP responses are fixtures; responses intentionally arrive after abort to
exercise stale-result guards. Sandbox execution used the available React 18
compatibility runtime, TypeScript transpilation and a fixed-position Floating UI
stub, with offline document injection. No package files were changed for this.

SKIP: repository-locked React 19/Vite build, full TypeScript checking, real Floating
UI geometry, full canonical paper screen/print/PDF and full repository verifier,
natural GitHub Actions and independent Standards/Spec review. The sandbox could
not clone/install the complete dependency graph. The added Vite harness wiring
and existing cache/route suites were source-checked but not executed as complete
repository commands here. These limitations must not be reported as PASS.

SKIP: live Qwen-MT calls, paid-quality/latency evaluation, production mutation or
restart. The candidate is not a claim of completed production acceptance. Run the
repository's required final gates in its normal environment before merging or
deploying it.
