# Owner QA handoff

User-visible work requires real-click verification and the owner's product or
visual acceptance. Before reporting readiness, the current task starts or
reuses the correct services, prepares data/login and route parameters, opens
the exact page, puts it in the first checklist state, and smoke-checks it for a
blocking runtime error.

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
