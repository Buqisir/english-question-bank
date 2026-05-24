# Verify Workflow Install Note

Date: 2026-05-24
Status: Installed.

## Current State

The stable CI workflow template exists at:

```text
docs/ci/verify-workflow-template.yml
```

It has been copied to:

```text
.github/workflows/verify.yml
```

## Install When Ready

When a token with `workflow` scope is available, copy the template exactly:

```bash
mkdir -p .github/workflows
cp docs/ci/verify-workflow-template.yml .github/workflows/verify.yml
```

Then run:

```bash
pnpm --dir app install --frozen-lockfile
npm ci --prefix server
git diff --check
node scripts/verify-architecture-housekeeping.mjs
npm run verify:all --prefix app
```

After opening the PR, confirm GitHub Actions actually starts on the PR before
merging the workflow installation slice.

## Guardrail

Do not install a partial or renamed workflow. The expected path is exactly:

```text
.github/workflows/verify.yml
```
