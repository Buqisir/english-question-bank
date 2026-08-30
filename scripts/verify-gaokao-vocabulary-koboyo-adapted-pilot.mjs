#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const manifestPath = resolve(repoRoot, "data/vocabulary/gaokao-frequency-koboyo-adapted-pilot-v1.json");
const reportPath = resolve(
  repoRoot,
  "docs/cuts/gaokao-vocabulary-3000/evidence/koboyo-adapted-pilot-qa-v1.json",
);
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const extractPathData = (svg) => [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((match) => match[1]);

const [manifest, wanweiManifest, sourceContent, gaps, spec] = await Promise.all([
  readJson(manifestPath),
  readJson(resolve(repoRoot, "data/vocabulary/wanwei-visual-manifest-v1.json")),
  readJson(resolve(repoRoot, "data/vocabulary/gaokao-frequency-source-content-v1.json")),
  readJson(resolve(repoRoot, "data/vocabulary/gaokao-frequency-original-svg-gap-audit-v1.json")),
  readFile(resolve(repoRoot, "docs/cuts/gaokao-vocabulary-3000/spec.md"), "utf8"),
]);
const baseByEntryId = new Map(wanweiManifest.entries.map((entry) => [entry.entryId, entry]));
const sourceByEntryId = new Map(sourceContent.entries.map((entry) => [entry.entryId, entry]));
const gapByHeadword = new Map(gaps.entries.map((entry) => [entry.headword, entry]));

assert(manifest.schemaVersion === "gaokao-frequency-koboyo-adapted-pilot-v1", "Unexpected adapted manifest schema.");
assert(manifest.status === "pilot_owner_qa", "Adapted assets must remain outside the formal manifest before Owner QA.");
assert(manifest.entries.length === 12, `Expected 12 adapted assets, found ${manifest.entries.length}.`);
assert(new Set(manifest.entries.map((entry) => entry.entryId)).size === 12, "Target entries must be unique.");
assert(new Set(manifest.entries.map((entry) => entry.provenance.baseEntryId)).size === 12, "Each pilot asset needs its own Koboyo base.");
assert(new Set(manifest.entries.map((entry) => entry.sha256)).size === 12, "Adapted output hashes must be unique.");
assert(spec.includes("koboyo-adapted") && spec.includes("不得声称独立原创"), "Spec does not record the adapted-not-original route.");

const results = [];
for (const entry of manifest.entries) {
  const provenance = entry.provenance;
  assert(provenance.type === "koboyo-adapted" && provenance.independentOriginal === false, `Incorrect provenance: ${entry.entryId}`);
  const base = baseByEntryId.get(provenance.baseEntryId);
  const source = sourceByEntryId.get(entry.entryId);
  const gap = gapByHeadword.get(entry.headword);
  assert(base?.sha256 === provenance.baseSha256, `Base manifest mismatch: ${entry.entryId}`);
  assert(source?.headword === entry.headword, `Target source identity mismatch: ${entry.entryId}`);
  assert(gap?.assessment === "no_direct_teaching_sense_match", `Missing search gap receipt: ${entry.entryId}`);
  assert(provenance.sourceReceipt?.officialPageStatus === 200, `Official base page unavailable: ${entry.entryId}`);
  assert(provenance.sourceReceipt?.officialSvgStatus === 200, `Official base SVG unavailable: ${entry.entryId}`);
  assert(provenance.sourceReceipt?.contentMatchAfterTrailingWhitespaceNormalization === true, `Local base differs from official SVG: ${entry.entryId}`);

  const baseFilePath = resolve(repoRoot, `app/public${base.path}`);
  const adaptedFilePath = resolve(repoRoot, `app/public${entry.path}`);
  const [baseBytes, adaptedBytes] = await Promise.all([readFile(baseFilePath), readFile(adaptedFilePath)]);
  assert(sha256(baseBytes) === base.sha256, `Base bytes changed: ${entry.entryId}`);
  assert(sha256(adaptedBytes) === entry.sha256, `Adapted hash mismatch: ${entry.entryId}`);
  assert(entry.sha256 !== base.sha256, `Adapted output is byte-identical to base: ${entry.entryId}`);
  const baseSvg = baseBytes.toString("utf8");
  const adaptedSvg = adaptedBytes.toString("utf8");
  const xml = spawnSync("xmllint", ["--noout", adaptedFilePath], { encoding: "utf8" });
  assert(xml.status === 0, `Invalid adapted XML: ${entry.entryId}`);
  const basePaths = extractPathData(baseSvg);
  const adaptedPaths = extractPathData(adaptedSvg);
  assert(basePaths.length > 0, `Base has no path data: ${entry.entryId}`);
  assert(basePaths.every((pathData) => adaptedPaths.includes(pathData)), `Adapted file does not preserve its declared base path: ${entry.entryId}`);
  assert(adaptedPaths.length > basePaths.length, `Adapted file adds no semantic vector overlay: ${entry.entryId}`);
  assert(!/<(?:script|foreignObject|image|text|use|style|filter|pattern|linearGradient|radialGradient)\b/i.test(adaptedSvg), `Disallowed element: ${entry.entryId}`);
  const withoutNamespace = adaptedSvg.replace('xmlns="http://www.w3.org/2000/svg"', "");
  assert(!/\b(?:href|src)=|url\(|data:|https?:/i.test(withoutNamespace), `External or embedded resource: ${entry.entryId}`);
  assert(!/#[0-9a-f]{3,8}\b|\brgb\(|\bhsl\(/i.test(adaptedSvg), `Fixed color found: ${entry.entryId}`);
  assert(entry.alt.length >= 12, `Missing usable Chinese alt: ${entry.entryId}`);
  assert(entry.modificationSummary.length >= 18, `Missing modification receipt: ${entry.entryId}`);

  results.push({
    entryId: entry.entryId,
    headword: entry.headword,
    baseEntryId: base.entryId,
    baseSha256: base.sha256,
    adaptedSha256: entry.sha256,
    basePathCount: basePaths.length,
    adaptedPathCount: adaptedPaths.length,
    officialSourceMatch: "pass",
    xmlAndSafety: "pass",
    adaptationReceipt: "pass",
  });
}

const report = {
  schemaVersion: "koboyo-adapted-pilot-qa-v1",
  checkedAt: "2026-08-11",
  status: "pass-technical-owner-qa-pending",
  scope: {
    adaptedAssetCount: manifest.entries.length,
    uniqueBaseCount: new Set(manifest.entries.map((entry) => entry.provenance.baseEntryId)).size,
  },
  checks: {
    officialBaseReceipts: "12/12 pass",
    declaredBasePathsPreserved: "12/12 pass",
    semanticOverlayAdded: "12/12 pass",
    xmlAndSvgSafety: "12/12 pass",
    targetSourceBinding: "12/12 pass",
    searchGapReceipt: "12/12 pass",
    independentOriginalClaim: "none; all assets explicitly koboyo-adapted",
    formalManifestIntegration: "not-run",
    ownerVisualQa: "pending",
  },
  entries: results,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log("PASS: 12/12 Koboyo-adapted assets have official base receipts, preserved base paths, and new semantic overlays.");
console.log(`Wrote ${reportPath}`);
