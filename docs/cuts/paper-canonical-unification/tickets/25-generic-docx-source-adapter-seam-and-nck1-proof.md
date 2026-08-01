# 25 — Generic DOCX source-adapter seam and NCK1 proof

Status: ready
Blocked by: Ticket 24 committed fail-closed result and owner exact manifest-digest approval
Next on PASS: independent review
Terminal: no
Model: gpt-5.6-terra
Effort: max
Independent review model: gpt-5.6-sol
Independent review effort: medium
Parallel lane: serial shared seam; no lane may start before its review PASS

## What to build

建立真实 DOCX → immutable Source Capture 通用 seam，并使 `paper-2025-i` zero-write compile ready。该票独占所有 shared compiler、adapter registry、schema 和 authority-version writes；它不迁移或发布这张纸。

## Approved membership

- `paper-2025-i`

## Measured/costed capacity

- B67/F80.
- One paper.
- B is the exact Ticket 22 frozen-latest inspection baseline.
- F is only the deterministic floor after adding the digest-verified raw DOCX under the current formula; it is not a complete source-envelope estimate.
- Measure actual documents, bytes, units, diagnostics and risk. Stop if a new shared seam appears or measured work cannot fit one fresh context with review/fix reserve.

## Fail-closed boundary

- Missing source, digest drift, unproved Profile, answer conflict, or a new diagnostic shape remains blocked.
- Do not treat Ticket 24's observed 199 units as a universal estimate.
- No Ticket 26 work or parallel lane begins before the independent review passes.

## Superseded-ticket mapping

Old Ticket 30 / cluster F; shared replacement for Old Tickets 25–31.

## Acceptance criteria

- [ ] The generic DOCX seam is source-bound, versioned, deterministic, and fails closed without fallback to a legacy projection.
- [ ] `paper-2025-i` reaches ready through the public zero-write compiler with exact source, Profile, official-answer, family, and inactive-slot proof.
- [ ] Actual B/F successor measurements and zero-mutation evidence are recorded.
- [ ] Required narrow checks, final full suite, and independent Standards/Spec review pass.

## Result

Commit:
Verify:
Notes:
