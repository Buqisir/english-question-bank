# Owner QA Handoff Template

This is the single canonical format for handing any user-visible work to owner
QA. It applies to throwaway prototypes, production implementation, post-fix
re-QA, responsive checks, real-data acceptance, and the handoff after an
independent review passes.

The current task owns QA provisioning. Before reporting `QA Ready: yes`, it
must:

1. verify the exact worktree, branch, reviewed HEAD, and policy-compliant
   worktree state;
2. start or reuse the correct local services from that worktree;
3. prepare the required fixture or real data, login state, and route
   parameters;
4. use an available browser capability to open every independent page or route
   the owner must inspect;
5. put each page into the first checklist item's business and interaction
   state, such as the target paper, lecture mode, prototype route, drawer, or
   panel;
6. confirm that the page loaded and has no obvious runtime error that blocks
   QA.

The owner is not responsible for starting or restarting services, finding the
URL or test data, choosing the worktree, restoring prototype state, assembling
route parameters, or opening another top-level task merely to begin QA.

For multiple independent pages or routes, open each one and list each exact
URL. For responsive states of one page, open the exact page once and give the
owner the shortest viewport-switch instruction.

Opening and smoke-checking the page is provisioning, not owner acceptance.
Only the owner may give the visual or product QA verdict.

When provisioning succeeds, use this handoff and end the final message with
the exact sentence shown:

```text
QA Ready: yes
Worktree: <absolute path>
Branch: <branch>
HEAD: <exact reviewed commit>
Spec: <exact path | not applicable>
Ticket: <exact path | not applicable>
Fixed point: <commit | not applicable>
Opened: <page or pages and prepared business state>
URL: <exact URL or one URL per independent page>
Initial state: <state prepared for checklist item 1>
Checklist:
1. <owner visual or product judgment>
2. <owner visual or product judgment>

请按清单检查。完成后回复“QA 完成”；若失败，请告诉我对应序号和实际现象。
```

This handoff is the canonical owner-QA exit. Do not wrap it in
`Next：等待人工 QA`, do not ask the owner to copy a prompt, and do not ask the
owner to open another top-level task merely to begin QA.

If provisioning fails because of login, missing data, service failure, port
conflict, or unavailable browser capability:

- report `QA Ready: no`;
- name the exact failed step, verified facts, and shortest recovery action;
- do not claim to be waiting for owner QA;
- remain in the current task when recovery is possible there, or return the
  existing canonical blocker/next-task exit only when owner action or a real
  implementation boundary requires it.

After the owner replies:

- on `QA 完成`, record the result, perform the required closeout, and return the
  next canonical instruction or `DONE`;
- on failure, record the checklist number, observed behavior, and reproduction
  state, then decide whether the current task may fix it or a fresh
  `$implement` task is required.

The task must not create the next top-level task or turn the follow-up into a
subagent.
