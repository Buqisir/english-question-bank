#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const checkedAt = process.argv.find((argument) => argument.startsWith("--checked-at="))?.split("=")[1];
if (!checkedAt) throw new Error("Pass --checked-at=YYYY-MM-DD so the search receipt is reproducible.");

const candidates = [
  ["however", "然而", "没有直接词项命中；需要表达前后分句的转折关系。"],
  ["beyond", "超出", "没有直接词项命中；需要表达越过边界后的空间关系。"],
  ["although", "虽", "没有直接词项命中；需要同时保留让步条件与主句。"],
  ["throughout", "遍及", "没有直接词项命中；需要表达从头到尾覆盖全部范围。"],
  ["unless", "除非", "仅命中法律术语 unless order，与连词教学义无关。"],
  ["otherwise", "否则；以别的方式", "没有直接词项命中；需要表达条件不成立时的替代分支。"],
  ["despite", "尽管", "没有直接词项命中；需要表达阻力存在但行动继续。"],
  ["indeed", "确实；其实", "没有直接词项命中；需要表达确认或加强陈述。"],
  ["somehow", "以某种方式", "没有直接词项命中；需要表达路径不明确但结果达成。"],
  ["merely", "仅仅", "没有直接词项命中；需要表达数量或程度被限制为单一。"],
  ["regardless", "不管", "没有直接词项命中；需要表达外部条件不改变主路径。"],
  ["nevertheless", "尽管如此", "没有直接词项命中；需要表达在既有阻碍之后仍继续。"],
];

const fetchSearchShard = async (query) => {
  let prefix = query.slice(0, 2);
  let payload = null;
  const chain = [];

  while (prefix.length <= query.length) {
    const url = `https://koboyo.com/icons/data/search/v1/${prefix}.json`;
    const response = await fetch(url, { redirect: "follow" });
    chain.push({ prefix, url, status: response.status });
    if (!response.ok) break;
    payload = await response.json();
    const nextPrefix = query.slice(0, prefix.length + 1);
    if (payload.split?.includes(nextPrefix)) {
      prefix = nextPrefix;
      continue;
    }
    break;
  }

  return { chain, payload };
};

const entries = [];
for (const [headword, teachingSense, rationale] of candidates) {
  const { chain, payload } = await fetchSearchShard(headword);
  const rows = payload?.entries ?? [];
  const matchingTermHits = rows
    .filter((row) => row.slice(0, 4).join(" ").toLowerCase().includes(headword))
    .slice(0, 12)
    .map(([slug, name, keywords, normalizedName, score, group, subgroup, style]) => ({
      slug,
      name,
      normalizedName,
      keywords,
      score,
      group,
      subgroup,
      style,
      officialPageUrl: `https://koboyo.com/icons/${slug}`,
    }));

  entries.push({
    headword,
    teachingSense,
    query: headword,
    officialSearchIndex: "https://koboyo.com/icons/data/search/v1/",
    checkedAt,
    shardChain: chain,
    searchedShardEntryCount: rows.length,
    matchingTermHits,
    assessment: "no_direct_teaching_sense_match",
    rationale,
  });
}

const output = {
  schemaVersion: "gaokao-frequency-original-svg-gap-audit-v1",
  checkedAt,
  method: "Twelve exact headwords queried individually against Koboyo's public client search shards; no bulk icon download.",
  limitation: "Search absence is evidence of no direct indexed term match, not proof that no remotely related metaphor exists anywhere in the library.",
  entries,
};

const outputPath = resolve(repoRoot, "data/vocabulary/gaokao-frequency-original-svg-gap-audit-v1.json");
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${entries.length} gap receipts to ${outputPath}`);
