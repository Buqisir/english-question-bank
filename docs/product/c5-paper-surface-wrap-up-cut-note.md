# C5 PaperSurface Wrap-up Cut Note

Cut: C5 PaperSurface paragraph structure and Structure Brace
Status: accepted; PO QA passed
PR / branch: PR #54, #60, #62, #63, #64 merged to `main`

Completed:
- C5a made confirmed `passageStructure` the official PaperSurface paragraph source.
- Paragraph ids are locked to confirmed ids such as `A-P1`; the official path must not silently fall back to auto segmentation.
- C5b added Structure Brace / `结构钩` as a quiet orientation marker for passage body and paragraph targets.
- Structure rows live inside the open passage detail panel. They do not appear on the collapsed main rail.
- Structure Brace now lives in the white `.ps-page` left padding.
- Display rule is locked: `>=1360px` shows the brace; `<=1359px` hides the brace while structure rows still scroll the paper.
- C5c extracted PaperSurface host interaction state into a reducer module.
- C5d locked the C5b PO QA contract and tightened DEV completion report format.

Bugs / blockers found:
- 100% browser zoom exposed states that static geometry analysis missed.
- The original rail/detail design could show an expanded rail with missing or hidden detail.
- The first brace placement in the gray matte or tight desktop band was vulnerable to rail coverage.
- Long DEV reports made review slower because the real changed files, verify results, and QA state were buried.

Pitfalls / wrong assumptions:
- Static verify is not browser QA for PaperSurface interaction work.
- "The data exists" is not a reason to show diagnostics on the A4 paper surface.
- A visually clever brace is worse than a quiet, reliable orientation marker.
- Tight desktop should not be solved with z-index. If the rail covers the paper padding, hide the brace or redesign the rail.
- Long reports create false confidence. Short report contracts are better for CR and PO review.

Good decisions:
- Cut AI difficulty / load bars from PaperSurface and keep the page focused on reading orientation.
- Treat PaperSurface as the paper-first teacher surface, not an AI dashboard.
- Move paragraph concepts into import/data structure first, then render from confirmed anchors.
- Let evidence line and Structure Brace coexist because they serve different teacher tasks.
- Record hard product rules in docs and verify scripts after PO QA, instead of relying on chat memory.

Watch / next:
- Do not reopen `1280px` brace visibility unless the rail layout changes or teacher testing proves a real need.
- Keep future PaperSurface features tied to the immediate teacher task: reading, locating, explaining, or selecting.
- Candidate next product branch: a separate "按 AI 难度找题" workflow, not inside the A4 paper page.
- Candidate next engineering branch: stronger browser QA harness for PaperSurface interaction regressions.
- Before the next medium or large UI cut, use mockups / images early so rejected spatial ideas fail before DEV.
