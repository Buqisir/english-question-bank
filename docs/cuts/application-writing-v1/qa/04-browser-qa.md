# Ticket 04 real-browser QA

Date: 2026-07-24
Actor: implementation agent
Account: `qa-local-owner` against this worktree's gitignored local SQLite data
Local services: Vite `127.0.0.1:5244`, API `127.0.0.1:8944`

## Real-click results

1. PASS — Opened `paper-960d0f8d`, used the existing `讲评` handle with the application group focused, and observed the full lecture payload.
2. PASS — At 1440×900, the left answer box showed `AI 参考范文` followed by `官方范文`; the right rail showed only the four ReviewCard sections. No highlight-expression or extra AI panel appeared.
3. PASS — Scrolled through the naturally grown answer box and visually confirmed the complete official answer through `Yours,` and `Li Hua`; no clipping, scaling, fixed canvas, or horizontal overflow appeared.
4. PASS — Closed lecture with a real click and confirmed the ordinary blank answer box returned. Reopened lecture, switched to continuation, and confirmed the application model answers unmounted while continuation retained its existing `解析未发布` behavior.
5. PASS — At 1000×800, the lecture used a fixed drawer with a visible backdrop. The ReviewCard remained readable, the model-answer surface remained behind the drawer as designed, and `document.body.scrollWidth <= window.innerWidth` (`992 <= 1000`).

Wide-screen overflow check: `document.body.scrollWidth=1432`, `window.innerWidth=1440`.
Narrow-screen overflow check: `document.body.scrollWidth=992`, `window.innerWidth=1000`.
Narrow drawer check: `position=fixed`, backdrop `display=block`.

## Evidence

- `04-browser-wide.png` — 1440×900, AI answer and official-answer start with the complete ReviewCard.
- `04-browser-wide-official.png` — 1440×900, official answer through closing/signature and continuation boundary.
- `04-browser-narrow.png` — 1000×800, fixed ReviewCard drawer and underlying model-answer surface.

The browser console contained only two duplicate 404 requests for the paper's absent optional `figures/manifest.json`; this paper had the same optional-manifest condition before Ticket 04. No application analysis request, rendering, or interaction error was reported.
