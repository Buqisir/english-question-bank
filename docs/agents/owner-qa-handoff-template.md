# Owner QA handoff

User-visible work requires real-click verification and the owner's product or
visual acceptance. Before reporting readiness, the current task starts or
reuses the correct services, prepares data and route parameters, opens
the exact page, puts it in the first checklist state, and smoke-checks it for a
blocking runtime error.

Owner QA must be one-click from the Owner's existing Amp session: do not ask the
Owner to log in to a separate app, retrieve a test password, or reconstruct a
test account. For a private Review preview, use a supervised, exact-revision,
Owner-gated read-only route that keeps any local app session server-side and
denies other revisions, OPS and mutations. Do not expose a privileged session,
disable app authentication, or confuse preview access with approval/publication
authorization. Keep the Amp thread private and the portal non-public; verify
the identity boundary at the external ingress before calling a header-gated
route Owner-only: requests from the owning orb to its
portal bypass Amp's external sign-in, so locally supplied `X-Amp-*` headers and
successful local smoke tests cannot establish their trusted provenance. If a
safe login-free preview cannot be proven, leave the route stopped, report
`QA Ready: no` and the specific blocker, and share static review evidence
instead of handing off credentials or a speculative portal URL.

After the final build or verification run, check the exact Review revision's
status and preflight again. If the renderer is stale or preflight asks for a
resubmission, retain that revision as history and do not hand its Screen or PDF
to the Owner as the current QA candidate. Prepare and verify a new revision.

Use this compact handoff:

```text
QA Ready: yes
Worktree: <absolute path>
Branch: <branch>
HEAD: <commit>
Opened: <page and prepared state>
URL: <exact URL>
Checklist:
1. <owner judgment on the changed behavior>
2. <optional second judgment>

请按清单检查。完成后回复“QA 完成”；若失败，请告诉我序号和实际现象。
```

If provisioning fails, report `QA Ready: no`, the failed step, verified facts,
and the shortest recovery action. Opening the page is provisioning, not owner
acceptance.
