# Private sandbox bridge v2

This is opt-in development tooling on `sandbox-sync/source-bridge`, not a CI
check, deployment route, background service or automatic mirror. The owner does
not upload repositories, disclose tokens or make the repository public.

## Request, build, download, restore, run

The assistant reads the desired PR/main SHA through the authorized GitHub
connector, pins its base SHA, and updates only
`.github/sandbox-source-request.json` on the bridge branch. Keep exactly:

```json
{"schemaVersion":2,"targetSha":"<40 lowercase hex>","baseSha":"<40 lowercase hex>","profile":"render","requestId":"unique-bounded-id"}
```

Use `profile: node` when browser/PDF tools are unnecessary. Never derive the
source from `HEAD^`, force-push the bridge branch, or copy old complete files over
new main. A request is one ordinary commit. Reuse a completed, unexpired matching
run before issuing another request; change requestId only when a new run is needed.
The branch has no deploy keys or production environment. `contents: read`, no
persisted checkout credentials, no repository Secrets, and fixed opt-in paths.
The existing `verify.yml`, required checks and branch protections are untouched.

Resolve the resulting `Sandbox Source Bridge` run through GitHub. Require the
correct repository, push event, branch, workflow, exact bridge SHA, completed
successful latest attempt and exact request contents. Download the small
`sandbox-manifest-<run>-<attempt>` artifact first using
`download_workflow_artifact`; the connector materializes it in the sandbox.
Never print its temporary signed download URL. Verify each outer ZIP digest
against GitHub's authenticated artifact metadata before extracting it. Artifact
names alone are not authority; do not trust a manifest from an unrelated run.

The manifest names independent payloads:

* `source.bundle`: real Git objects and exact target/base refs, no checkout
  config, hooks, token, node_modules or untracked production files. Full reachable
  history is included so merge-base/diff-based verifiers work offline.
* `node-deps.tar.gz`: the pinned Linux x64 Node 24.21.0 / pnpm 10.28.1 runtime and
  app/server dependencies. Lockfiles, package manifests, platform and installer
  revision key the cache. Local hooks/workspace configuration conservatively add
  the complete source tree to the key. Tests receive copies of node_modules.
* `render-rootfs.tar.gz` (render only): Ubuntu 24.04 userspace, exact Playwright
  Chromium, LibreOffice, ImageMagick, Poppler, Ghostscript, FFmpeg, fonts, SQLite,
  ZIP tools. The resolved image digest, Playwright
  version, renderer recipe and weekly refresh separate incompatible caches.
  `/opt/eqb-system-packages.tsv` records the actual resolved package versions.
* `launcher.tar.gz` (render only): PRoot v5.4.1 compiled from immutable upstream
  commit `d4b49e2243dee34e41c13dfeca6a3d07e9cf0f00`, its ELF loader and libraries.
  It replaces the rootfs distribution's old launcher, which was experimentally
  shown to miss statx path translation. The small layer can be fixed without
  rebuilding or redownloading the large renderer. The builder tests a bound-path
  stat operation; receiver smoke also tests Node module/file resolution.

Only download layers not already present with matching size and SHA-256; keep
verified archives in a local cache. Source artifacts expire after one day;
reusable runtime/render artifacts after three. GitHub caches are best-effort,
not permanent storage. A new chat may have a fresh sandbox; the assistant repeats
this retrieval itself. No user upload is required, but this is not an always-on
mount. Artifact upload avoids double compression, and tar preserves modes/links.

Renderer transport uses 256 MiB numbered chunks (up to four), below the
connector's 512 MiB limit. Each chunk and the reassembled archive have independent
SHA-256 checks. Source/node layers fail at the builder above 480 MiB rather than
producing an undownloadable artifact. A missing/corrupt chunk never becomes a
partially restored environment. Download only missing pieces; reuse the verified
whole archive when present.

## Automatic receiver: no hand-built file list

Fetch run metadata and artifact metadata using the authorized GitHub connector;
save the run object as `run.json` and the `{"artifacts": [...]}` object as
`artifacts.json`. These are trusted API responses, not a request to the Owner
for copied files or credentials. Verify the small manifest ZIP against its
GitHub artifact digest before extracting the tooling and `manifest.json`.

```sh
python3 transport.py needed inputs --run run.json --artifacts artifacts.json \
  --target <verified-target-sha> --base <verified-base-sha> \
  --bridge <verified-bridge-sha> --cache /mnt/data/eqb-archive-cache > download-plan.json
```

`required` contains only missing artifacts and their exact connector download
arguments. `reused` and `downloadBytes` explain the transfer before any download.
A complete local renderer avoids all three large chunk downloads. Run identity,
repository, event, branch, workflow, attempt, expiration and artifact provenance
are checked; missing or ambiguous metadata fails closed. Re-fetch the latest run
before reuse: a saved snapshot is evidence of that read, not a permanent claim
about the latest attempt.

For each required entry, call `download_workflow_artifact` with the generated
arguments, then use the actual mounted ZIP path returned by that call:

```sh
python3 transport.py ingest inputs --plan download-plan.json \
  --artifact-id <requested-id> --archive <actual-mounted-zip> \
  --cache /mnt/data/eqb-archive-cache
```

Ingest checks the outer ZIP digest and size, allows only its one expected regular
member, then checks the inner payload digest and size. Traversal, symlinks, extra
entries, stale plans and different existing files are rejected. Valid archives
are cached by content digest. Copies, not writable hardlinks, keep changes to
an input file from corrupting that archive cache. No signed URL or token is
written into the plan; the receiver never makes its own authenticated HTTP calls.
This is resumable on-demand retrieval, not a background service or persistent mount.

After the receiver has staged the manifest's files in one input directory:

```sh
python3 transport.py assemble inputs
python3 bridge.py restore --manifest inputs/manifest.json --inputs inputs \
  --target <verified-target-sha> --bridge <verified-bridge-sha> --run-id <verified-run> --attempt <verified-attempt> --base <verified-base-sha> \
  --destination /mnt/data/eqb-task --cache /mnt/data/eqb-layer-cache
python3 bridge.py run --state /mnt/data/eqb-task.bridge.json --engine native \
  --timeout 300 -- pnpm -C app build
python3 bridge.py run --state /mnt/data/eqb-task.bridge.json --engine render \
  --timeout 300 -- node /opt/eqb-tooling/smoke.mjs
python3 bridge.py run --state /mnt/data/eqb-task.bridge.json --engine render \
  --timeout 600 -- node scripts/verify-draft-pagination-renderer.mjs
```

Use bridge.py/transport.py/smoke.mjs from the same verified manifest artifact. The restore
operation rejects wrong provenance, hashes, architecture and unsafe archives,
refuses existing destinations, restores a real Git checkout, and creates an
external `.bridge.json` state file. Do not edit that state to manufacture a tested
SHA. Local uncommitted work is supported and recorded with status/diff digest;
a new committed HEAD needs a fresh explicitly-bound state.

The render engine uses user-space PRoot rather than root installation, Docker,
mount privileges, or host library overwrites in ChatGPT. The host must permit
PRoot's ptrace operation; failure is BLOCKED, not a pass or a silent system-Chrome
fallback. It runs only the bundled browser with its corresponding Playwright.
Native mode reuses the host OS only for Node/non-render checks and records the
host; it is not Ubuntu CI parity. The renderer userland shares the host kernel,
so it also is not a VM or a claim of bit-identical hosted rendering.

PRoot is NOT a security boundary for untrusted code. Run only owner-authorized
repository work inside the existing ChatGPT isolation; never bind production,
SSH directories or host credentials. The command gets a minimal environment,
private HOME/TMP, bounded runtime and its own process group. Daily pack execution
inside this receiver defaults to `VERIFY_CONCURRENCY=1`; an explicit `--jobs`
argument can select another count. This serializes checks, not their assertions,
and does not change hosted CI. Every command reports cgroup memory limits,
current usage, CPU quota and before/after OOM-kill counters. These counters cover
the entire sandbox, so an increment is evidence of resource pressure during the
command, not independent proof that a specific process was killed. Missing
cgroup data stays unknown. A resource warning never converts a failure to PASS.
Its own exit-code
receipt prevents a lingering child or PRoot's last-child status from masking
failure. On completion/timeout only that group is terminated; no global pkill.

## Evidence and limits

`smoke.mjs` exercises actual clicks, screenshots, PDF extraction/rasterization,
DOCX conversion, audio encoding, SQLite transactions and the native argon2 addon;
version strings alone do not establish support. Its synthetic output is local
under `.scratch/`. Keep command logs, exact head/base/diff, exit code, platform,
versions, SKIPs and failure details. Transport/build success is NOT a product
PASS. A successful smoke does not replace real repository verifiers, the Full
suite, visual review, or the natural required GitHub Actions `verify`/`e2e` pair.
No production DB, R2 content, listening model cache or off-repo fixture is supplied.
Those remain explicit limitations, never fabricated passes.

Bridge contract tests are `python3 -m unittest discover -s scripts/sandbox -v`.
They are run by the bridge workflow only; they do not expand the daily registry.
Changes to this workflow require high-risk review before merging into main.
No main merge is necessary to use the already owner-authorized tooling branch.

## Verified sandbox evidence (2026-09-19)

The render profile from bridge commit `e8b223b6da80cc77b98c0e79ecbf335e3a6446d1`
(run `35373365486`, attempt 1) was actually restored in ChatGPT on Linux x86_64
with host glibc 2.41. Its exact source/base was
`95881993c1eb7781878f66557134223938679c6b`. The 11 capability probes passed,
including bundled Chromium 148.0.7778.96 click/screenshot/PDF, LibreOffice
24.2.7.2 DOCX conversion, ImageMagick 6.9.12-98, Poppler, Ghostscript, FFmpeg,
SQLite 3.45.1 and the native argon2 addon. The product source remained clean.
This establishes receiver execution, not only successful Actions packaging.

The automatic receiver was also exercised against those real artifacts: a
complete local input set requested zero bytes; with only the launcher absent it
selected just artifact `10559585863` (1,438,016 ZIP bytes), checked and ingested it,
and then requested zero bytes. Unit tests additionally exercise bad provenance,
corruption and archive attacks. Product/Full results must still be reported
separately on the exact tested candidate; source transport never supplies merge
or deployment authority.
