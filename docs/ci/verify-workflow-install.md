# Verify workflow

The installed workflow at `.github/workflows/verify.yml` is the only current
CI authority. The former copy-and-install template was retired after it drifted
from the live workflow and could overwrite required browser, PDF, and E2E setup.

Change that file directly, run `node scripts/verify-architecture-housekeeping.mjs`,
and confirm the resulting GitHub Actions run. Historical cut notes may still
describe the original installation; they are evidence, not instructions.
