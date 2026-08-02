# Review depth

Review strength follows the changed behavior, not ticket count or document
ceremony.

- Small, local, reversible work gets a concise self-review of the diff and its
  affected checks.
- Normal ticketed work reviews Standards and Spec in the implementation task.
- Actual high-risk shared behavior gets one independent Standards/Spec review
  against a fixed implementation base before release.
- User-visible behavior gets real-click browser QA and Owner QA on the exact
  affected page.

Only a defect that can make the change wrong, unsafe, outside scope, or
unshippable is a Must Fix. Wording synchronization, historical prose, optional
polish, and unrelated improvements do not create review or repair tasks.
After a fix, check the finding, the fix diff, and direct regressions; do not
restart a full review without a new high-risk change.
