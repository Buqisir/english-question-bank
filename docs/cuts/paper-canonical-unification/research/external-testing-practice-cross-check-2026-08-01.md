# External testing-practice cross-check — 2026-08-01

Status: non-authoritative background only

This note records an external cross-check of testing practices. It is not
repository authority, does not replace the three-layer cadence or any safety
gate, and does not turn `SKIP` into `PASS`. It is separate from both the Ticket
22 measurement snapshot and the evidence that Ticket 23 may use for measured
replanning; it neither supplies Ticket 23 input nor approves a follow-on route.

## Sources and bounded applications

- Mozilla PDF.js exposes per-test coverage and explicit reference-test
  filtering in its [test runner](https://github.com/mozilla/pdf.js/blob/master/test/test.mjs),
  while its [browser-coverage workflow](https://github.com/mozilla/pdf.js/blob/master/.github/workflows/coverage_browser_tests.yml)
  pins a concrete browser job and its triggering surface. Application: keep
  selection auditable at test/artifact granularity and keep browser proof
  explicit; workflow path filters remain hints rather than transitive proof.
- Flutter Engine documents both presubmit and postsubmit coverage and warns
  that [`runIf` selection can miss transitive impact](https://github.com/flutter/engine/blob/main/docs/ci/Engine-pre-submits-and-post-submits.md).
  Application: widen conservatively when a shared header, dependency, producer,
  or authority has consumers beyond edited paths.
- Dropbox describes using Bazel's dependency graph for
  [affected tests and explicitly scoped release tests](https://dropbox.tech/infrastructure/continuous-integration-and-deployment-with-bazel).
  Application: maintain an auditable producer-to-consumer impact map, while
  retaining EQB's full final closure suite.
- Nx derives its [affected set from Git changes and the project dependency
  graph](https://nx.dev/ci/features/affected). Application: use changed files
  as the starting signal, then traverse declared consumers rather than treating
  paths as the complete proof boundary.
- Playwright documents [sharding](https://playwright.dev/docs/test-sharding)
  for independently runnable tests and requires [visual comparisons to use the
  same environment](https://playwright.dev/docs/test-snapshots) as their
  baselines. Application: parallelize only isolated tests and invalidate visual
  reuse when the candidate or pinned rendering environment changes.
- GitHub Actions supports [canceling superseded in-progress runs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
  Application: remove obsolete queue work before adding concurrency.
- Google's [Efficacy Presubmit](https://testing.googleblog.com/2018/09/efficacy-presubmit.html)
  is future-scale prior art for probabilistic test selection, not current EQB
  policy. Its use of large historical datasets, continuous-build fallback, and
  explicit false-negative tradeoffs are prerequisites EQB has not established.
  Deterministic impact mapping must first measure insufficiency, followed by
  separate authority, before any ML-selected testing is considered.
