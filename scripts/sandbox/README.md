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

The manifest names three independent payloads:

* `source.bundle`: real Git objects and exact target/base refs, no checkout
  config, hooks, token, node_modules or untracked production files. Full reachable
  history is included so merge-base/diff-based verifiers work offline.
* `node-deps.tar.gz`: the pinned Linux x64 Node 24.21.0 / pnpm 10.28.1 runtime and
  app/server dependencies. Lockfiles, package manifests, platform and installer
  revision key the cache. Local hooks/workspace configuration conservatively add
  the complete source tree to the key. Tests receive copies of node_modules.
* `render-rootfs.tar.gz` (render only): Ubuntu 24.04 userspace, exact Playwright
  Chromium, LibreOffice, ImageMagick, Poppler, Ghostscript, FFmpeg, fonts, SQLite,
  ZIP tools, and a private PRoot launcher. The resolved image digest, Playwright
  version, renderer recipe and weekly refresh separate incompatible caches.
  `/opt/eqb-system-packages.tsv` records the actual resolved package versions.

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

After placing the manifest's files in one input directory:

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
private HOME/TMP, bounded runtime and its own process group. Its own exit-code
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
