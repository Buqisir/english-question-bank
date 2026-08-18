#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";


const root = process.cwd();
const manifestArgumentIndex = process.argv.indexOf("--manifest");
const manifestRelativePath = manifestArgumentIndex >= 0
  ? process.argv[manifestArgumentIndex + 1]
  : ".scratch/gaokao-google-voice-qwen-ipa-aligned-v17/manifest.json";

if (!manifestRelativePath) {
  throw new Error("--manifest requires a path");
}

const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(root, relativePath), "utf8"),
);

const manifest = readJson(manifestRelativePath);
const referenceManifests = {
  american: readJson(".scratch/gaokao-audio-repair-v2/american-manifest.json"),
  british: readJson(".scratch/gaokao-audio-repair-v2/british-manifest.json"),
};

const references = Object.fromEntries(
  Object.entries(referenceManifests).flatMap(([accent, receipt]) => (
    receipt.entries.map((entry) => [`${entry.entryId}:${accent}`, entry])
  )),
);
const leaks = [];
for (const entry of manifest.entries ?? []) {
  const reference = references[`${entry.entryId}:${entry.accent}`];
  if (!reference) {
    throw new Error(`Missing Google reference metrics: ${entry.entryId} ${entry.accent}`);
  }
  const referenceActiveSeconds = (
    reference.durationSeconds
    - reference.leadingSilenceSeconds
    - reference.trailingSilenceSeconds
  );
  const ratio = entry.activeDurationSeconds / referenceActiveSeconds;
  if (ratio > 1.8) {
    leaks.push({
      headword: entry.headword,
      accent: entry.accent,
      candidateLabel: entry.candidateLabel,
      ratio: Number(ratio.toFixed(2)),
    });
  }
}

if (leaks.length > 0) {
  console.error(`FAIL context leakage: ${leaks.map((entry) => (
    `${entry.headword}:${entry.accent}:${entry.candidateLabel}:${entry.ratio.toFixed(2)}x`
  )).join(", ")}`);
  process.exit(1);
}

console.log(`PASS no context leakage: ${manifest.entries.length} candidates`);
