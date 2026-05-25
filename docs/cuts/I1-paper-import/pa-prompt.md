# PA Prompt — I1 paper-import

Cut: `I1-paper-import` — DOCX → Section Splitter → External API → Preview → Save.
Review type: PA (before DEV).
Output: `docs/cuts/I1-paper-import/pa.md`.

## Assignment

Act as PA only. Do not implement. Do not patch files.

Review whether this cut is ready for DEV. Find direction, boundary,
data-contract, verification, and rework risks before any code is written.
Use `docs/agents/pa-persona.md` output sections (Verdict, Product Principle,
Exact UX / Architecture Model, Must Fix Before DEV, Should Watch, Allowed
Files, Forbidden Files, Static Verify Requirements, Browser QA Matrix,
DEV Readiness, Open PO Decisions).

## Must Read

- `docs/cuts/I1-paper-import/plan.md` (the DEV execution contract)
- `docs/cuts/_templates/README.md` (cut artifact naming — note `plan.md`
  replaces legacy `goal.md`)
- The current reading-parse prompt file (find it under `prompts/` or
  `server/`; it is the prompt currently used to analyze 阅读理解 sections
  through `server/api.mjs`)
- `prompts/seven-choices-analysis-v1.md`
- `server/api.mjs` (or current owner of the question-bank-steward and
  reading-parse routes — confirm which provider/SDK setup is already in use)

## Background

Skim only if not already loaded.

- `AGENTS.md` (especially "Collaboration Workflow" and "UI Collaboration"
  sections; medium-cut flow applies)
- `docs/steering/cut-workflow-protocol.md`
- `docs/steering/product-scope-discipline.md`
- `docs/agents/pa-persona.md`
- `docs/agents/review-levels.md`

## Review Focus

PM specifically wants PA to decide or pressure-test these five items.
Treat them as the spine of the report:

1. **DOCX parsing location: server vs frontend.**
   The plan leaves this for PA. Compare server-side parsing (Node +
   `mammoth` or similar) vs. frontend parsing (`mammoth.browser.js`).
   Pick one. Justification must cover: where the DOCX bytes live during
   analysis (upload vs in-memory), how Step 3's external API call accesses
   section text, how Step 4's save endpoint receives the final JSON, and
   how testability differs.

2. **Reading-parse prompt reuse fit.**
   Inspect the reading-parse prompt currently used by the project. Decide
   whether it can accept a raw 阅读理解 section text extracted by the
   splitter as-is, or whether the splitter must normalize question stems,
   passage boundaries, or numbering first. If normalization is required,
   list the exact shape the prompt expects.

3. **Save endpoint contract: paper-assets layout.**
   Confirm the existing on-disk layout under `public/paper-assets/` that
   PaperSurface consumes (file names, directory shape, paperId scheme,
   group ID scheme). The save endpoint in Step 4 must write into this
   layout byte-compatibly. Flag any divergence between the plan's wording
   and the real layout.

4. **External provider secrets path.**
   The plan says "reuse the existing env/config mechanism used by
   question-bank-steward and reading-parse." Confirm that path actually
   exists for both `deepseek-pro` and `gpt-5.5`. If a new env var or
   provider client is required, list it as Must Fix and specify which file
   must own it.

5. **Scope creep risk into C7 (teacher-self-service).**
   The plan locks V0 audience to the owner only. Pressure-test: is any
   Must-Do item in `plan.md` doing work that only makes sense for teacher
   self-service (multi-user, progress UI, error toasts, retries, upload
   metadata, paper history)? If yes, flag as Must Fix and propose removal.

## Escalation Signals

If the report cannot be written reliably, reply in chat only with one
line — do not write a partial PA report:

- `ESCALATION: CONTEXT INSUFFICIENT — <what is missing>`
- `ESCALATION: BRANCH CONFLICT — <pwd / branch mismatch>`
- `ESCALATION: SPEC CONTRADICTS — <which two specs disagree>`
- `ESCALATION: SCOPE UNCLEAR — <what the plan does not answer>`

## Output

Write the full PA report to:

```text
docs/cuts/I1-paper-import/pa.md
```

Worktree check before writing:

- Target repo root: `/Users/huangxuewei/Projects/english-question-bank`
- Target branch: `main`
- Target absolute report path:
  `/Users/huangxuewei/Projects/english-question-bank/docs/cuts/I1-paper-import/pa.md`
- Before writing, confirm `pwd`, `git rev-parse --show-toplevel`, and
  current branch match the target. If not, stop with
  `ESCALATION: BRANCH CONFLICT` instead of writing in a side worktree.
- After writing, confirm the absolute report path and `git status --short`
  entry for the new file.

Use `docs/agents/pa-persona.md` Required Output sections.

If PA opens or changes decisions, update `plan.md` follow-up section by
stating the required text patch explicitly in the PA report. Do not edit
`plan.md` directly; PM applies follow-up decisions.

## Chat Reply Format

After writing the repo file, reply in chat with only:

- Report path
- Absolute report path
- Git branch
- Git status entry for report file
- Verdict (one of: `APPROVE FOR DEV`, `APPROVE WITH MUST FIX`,
  `DEV NOT READY`, `REJECT / RESCOPE`)
- Must Fix count
- Open PO Decisions count

If blocked, use one `ESCALATION:` line instead.
