# Reading Parse Golden Cases

This directory stores teacher-confirmed reading-parse calibration cases.

Only official Gaokao true-paper questions may be written as golden cases.
Mock exams, 一模/二模/三模, 联考, 调研, 适应性测试, and school exams are review material only.

## Flow

1. Run or reuse a reading-parse eval report.
2. Generate a review candidate file:

```bash
node scripts/review/build-reading-parse-review-candidates.mjs --input reports/reading-parse-eval-<runId>.json
```

3. Fill `teacherDecision` in the candidate JSON:

- `accept`: AI labels are correct.
- `correct_card`: fill `teacherDecision.correctedCardId`.
- `correct_surface`: fill `teacherDecision.correctedSurfaceType`.

4. Validate before writing:

```bash
node scripts/review/confirm-reading-parse-cases.mjs --input reports/reading-parse-review-candidates-<runId>.json --dry-run
```

5. Write confirmed cases:

```bash
node scripts/review/confirm-reading-parse-cases.mjs --input reports/reading-parse-review-candidates-<runId>.json
```

Default output is `golden-reading-parse-cases.jsonl`.

## Regression Check

Compare current saved reading-parse results against golden cases:

```bash
node scripts/review/run-reading-parse-golden-check.mjs
```

After prompt or backend changes, rerun DeepSeek first and then compare:

```bash
node scripts/review/run-reading-parse-golden-check.mjs --rerun
```
