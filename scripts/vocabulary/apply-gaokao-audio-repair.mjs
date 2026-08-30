#!/usr/bin/env node

import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const scratch = path.join(root, ".scratch/gaokao-audio-repair-v1");
const backup = path.join(scratch, "backup");

const accents = [
  {
    name: "american",
    repairManifest: path.join(scratch, "american-manifest.json"),
    fullManifest: path.join(root, "data/vocabulary/gaokao-frequency-full-american-audio-manifest-v1.json"),
    repairAudio: path.join(scratch, "american/google-neural2-us-c-v1"),
    publicAudio: path.join(root, "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-us-c-v1"),
  },
  {
    name: "british",
    repairManifest: path.join(scratch, "british-manifest.json"),
    fullManifest: path.join(root, "data/vocabulary/gaokao-frequency-full-british-audio-manifest-v1.json"),
    repairAudio: path.join(scratch, "british/google-neural2-gb-d-v1"),
    publicAudio: path.join(root, "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-gb-d-v1"),
  },
];

const sha256 = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const writeJsonAtomic = async (file, value) => {
  const temporary = `${file}.repair-tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
};

const prepared = [];
for (const accent of accents) {
  const repair = await readJson(accent.repairManifest);
  const full = await readJson(accent.fullManifest);
  const byId = new Map(repair.entries.map((entry) => [entry.entryId, entry]));
  if (byId.size !== repair.entries.length) throw new Error(`${accent.name}: duplicate repair entry`);
  if (!full.entries.every((entry) => !byId.has(entry.entryId) || entry.headword === byId.get(entry.entryId).headword)) {
    throw new Error(`${accent.name}: entry identity mismatch`);
  }
  for (const entry of repair.entries) {
    const source = path.join(accent.repairAudio, entry.path);
    if ((await stat(source)).size !== entry.bytes || (await sha256(source)) !== entry.sha256) {
      throw new Error(`${accent.name}: generated asset mismatch for ${entry.entryId}`);
    }
    await stat(path.join(accent.publicAudio, entry.path));
  }
  const merged = {
    ...full,
    status: "generated_pending_owner_reqa",
    entries: full.entries.map((entry) => byId.get(entry.entryId) ?? entry),
  };
  prepared.push({ accent, repair, merged });
}

await rm(backup, { recursive: true, force: true });
for (const { accent, repair } of prepared) {
  const audioBackup = path.join(backup, accent.name, "audio");
  await mkdir(audioBackup, { recursive: true });
  await copyFile(accent.fullManifest, path.join(backup, accent.name, "manifest.json"));
  for (const entry of repair.entries) {
    await copyFile(path.join(accent.publicAudio, entry.path), path.join(audioBackup, entry.path));
  }
}

const replaced = [];
try {
  for (const { accent, repair } of prepared) {
    for (const entry of repair.entries) {
      const target = path.join(accent.publicAudio, entry.path);
      const temporary = `${target}.repair-tmp`;
      await copyFile(path.join(accent.repairAudio, entry.path), temporary);
      await rename(temporary, target);
      replaced.push({ accent, entry });
    }
    await writeJsonAtomic(accent.fullManifest, prepared.find((item) => item.accent === accent).merged);
  }
} catch (error) {
  for (const { accent, entry } of replaced.reverse()) {
    await copyFile(path.join(backup, accent.name, "audio", entry.path), path.join(accent.publicAudio, entry.path));
  }
  for (const { accent } of prepared) {
    await copyFile(path.join(backup, accent.name, "manifest.json"), accent.fullManifest);
  }
  throw error;
}

const planPath = path.join(root, "data/vocabulary/gaokao-frequency-full-audio-repair-plan-v1.json");
const plan = await readJson(planPath);
await writeJsonAtomic(planPath, {
  ...plan,
  status: "generated_pending_owner_reqa",
  appliedAt: "2026-08-16",
  backupPath: ".scratch/gaokao-audio-repair-v1/backup",
});

console.log(JSON.stringify({ replaced: replaced.length, american: prepared[0].repair.entries.length, british: prepared[1].repair.entries.length }, null, 2));
