#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const checkedAt = process.argv.find((argument) => argument.startsWith("--checked-at="))?.split("=")[1];
const refreshSources = process.argv.includes("--refresh-sources");
if (refreshSources && !checkedAt) {
  throw new Error("--refresh-sources requires --checked-at=YYYY-MM-DD.");
}
const manifestPath = resolve(repoRoot, "data/vocabulary/gaokao-frequency-koboyo-adapted-pilot-v1.json");
const boardPath = resolve(
  repoRoot,
  "docs/cuts/gaokao-vocabulary-3000/evidence/koboyo-adapted-pilot-board-v1.html",
);
const assetDirectory = resolve(
  repoRoot,
  "app/public/vocabulary-assets/gaokao-frequency-v1/visuals/koboyo-adapted-v1",
);

const definitions = [
  {
    entryId: "gaokao-frequency-0209-however",
    headword: "however",
    teachingSense: "然而",
    baseEntryId: "wanwei-core-0115-either",
    slug: "person-between-contrasting-directions",
    modificationSummary: "保留思考人物，在人物两侧增加方向相反的短箭头，把二选一改成前后转折。",
    alt: "一个思考的人处在相反方向之间，表示“然而”的转折关系。",
    overlay: `<path d="M3 67h20m-20 0 9-8M3 67l9 8M103 99H83m20 0-9-8m9 8-9 8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    entryId: "gaokao-frequency-0747-beyond",
    headword: "beyond",
    teachingSense: "超出",
    baseEntryId: "wanwei-core-0015-along",
    slug: "roadmap-crossing-boundary",
    modificationSummary: "保留人物与路线图，在图板中增加一条边界和越过边界的箭头。",
    alt: "人物指着一条越过边界的路线，表示“超出”。",
    overlay: `<path d="M187 61v79M157 102h65m0 0-12-10m12 10-12 10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    entryId: "gaokao-frequency-0828-although",
    headword: "although",
    teachingSense: "虽",
    baseEntryId: "wanwei-basic-0795-hurry",
    slug: "person-hurrying-from-rain-to-sun",
    modificationSummary: "保留赶路人物，左上增加雨云，右上增加晴朗目标，形成让步对照。",
    alt: "人物冒雨仍向晴朗一侧赶路，表示“虽……却……”。",
    overlay: `<path d="M7 49c2-9 9-14 17-14 5-8 17-8 22-1 9-3 18 4 18 13 0 8-7 15-16 15H18C9 62 3 56 4 48M18 70l-5 9m22-9-5 9m22-9-5 9M136 24a10 10 0 1 0 0-20 10 10 0 0 0 0 20m0-24v-1m0 30v4m-15-19h-5m40 0h-5m-25-11-4-4m28 28 4 4m-28 0-4 4m28-28 4-4" fill="none" stroke="currentColor" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    entryId: "gaokao-frequency-0970-throughout",
    headword: "throughout",
    teachingSense: "遍及",
    baseEntryId: "wanwei-core-0149-follow",
    slug: "person-following-complete-trail",
    modificationSummary: "保留行走人物，把尾随痕迹改成从画面一端连续到另一端的节点路径。",
    alt: "人物沿着从头到尾连续的节点路线前行，表示“遍及、贯穿始终”。",
    overlay: `<path d="M101 185c30-7 57-20 82-39 11-8 20-17 29-28M212 118l-4 15m4-15-15 3" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M114 181a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm28-11a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm27-15a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm24-17a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/>`,
  },
  {
    entryId: "gaokao-frequency-1164-unless",
    headword: "unless",
    teachingSense: "除非",
    baseEntryId: "wanwei-core-0013-allow",
    slug: "person-opening-gate-with-key-condition",
    modificationSummary: "保留开门人物，在门闩上增加锁与钥匙孔，强调只有条件满足才开放。",
    alt: "人物用钥匙条件打开上锁的门，表示“除非”。",
    overlay: `<path d="M54 85c0-9 6-16 15-16s15 7 15 16m-18 0h7v18h-21V85h14m-4 8h4" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    entryId: "gaokao-frequency-1266-otherwise",
    headword: "otherwise",
    teachingSense: "否则；以别的方式",
    baseEntryId: "wanwei-core-0063-choose",
    slug: "person-weighing-alternate-route",
    modificationSummary: "保留衡量两项的人物，在天平下方增加分岔路径，强调替代方案。",
    alt: "人物衡量两个选项并面对替代分支，表示“否则、以别的方式”。",
    overlay: `<path d="M100 171v24m0 0-27 18m27-18 27 18m-27-18v19" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    entryId: "gaokao-frequency-1502-despite",
    headword: "despite",
    teachingSense: "尽管",
    baseEntryId: "wanwei-core-0098-difficult",
    slug: "person-pushing-boulder-despite-resistance",
    modificationSummary: "保留推巨石上坡的人物，在巨石之后增加继续前进的目标箭头。",
    alt: "人物顶着巨大阻力仍把巨石向前推，表示“尽管”。",
    overlay: `<path d="M213 33h33m0 0-12-10m12 10-12 10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    entryId: "gaokao-frequency-1538-indeed",
    headword: "indeed",
    teachingSense: "确实",
    baseEntryId: "wanwei-basic-0982-really",
    slug: "person-confirming-verified-document",
    modificationSummary: "保留拿着已勾选文件的人物，在确认结果周围增加强调线。",
    alt: "人物拿着已验证文件再次确认，表示“确实”。",
    overlay: `<path d="M145 57l12-8m-9 21 15-1m-18 13 12 8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>`,
  },
  {
    entryId: "gaokao-frequency-1694-somehow",
    headword: "somehow",
    teachingSense: "以某种方式",
    baseEntryId: "wanwei-basic-0841-lost",
    slug: "person-finding-exit-from-map",
    modificationSummary: "保留查看地图的人物，在右上增加出口旗和从地图通向出口的路线。",
    alt: "人物查看地图后沿曲折路线找到出口，表示“以某种方式”。",
    overlay: `<path d="M142 175c17-14 28-30 33-48 5-17 8-33 9-51m0 0v-30m1 3 23 9-23 10" fill="none" stroke="currentColor" stroke-width="3.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M147 171a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm17-20a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm12-24a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/>`,
  },
  {
    entryId: "gaokao-frequency-1779-merely",
    headword: "merely",
    teachingSense: "仅仅",
    baseEntryId: "wanwei-core-0140-few",
    slug: "person-with-one-limited-task",
    modificationSummary: "保留轻松人物和唯一任务卡，用括号收紧视觉范围，强调仅此一项。",
    alt: "人物面前只有一项被限定的任务，表示“仅仅”。",
    overlay: `<path d="M55 168c-10 6-15 15-15 26m15 17c-10-5-15-14-15-25M166 168c10 6 15 15 15 26m-15 17c10-5 15-14 15-25" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>`,
  },
  {
    entryId: "gaokao-frequency-1823-regardless",
    headword: "regardless",
    teachingSense: "不管",
    baseEntryId: "wanwei-core-0069-come",
    slug: "person-walking-past-opposing-signs",
    modificationSummary: "保留向前走的人物，在人物两侧增加互不相同的干扰箭头，人物不改变方向。",
    alt: "人物经过两侧不同方向的干扰仍继续前行，表示“不管”。",
    overlay: `<path d="M7 55h34m-34 0 10-9M7 55l10 9M121 88H89m32 0-10-9m10 9-10 9" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    entryId: "gaokao-frequency-2646-nevertheless",
    headword: "nevertheless",
    teachingSense: "尽管如此",
    baseEntryId: "wanwei-core-0066-climb",
    slug: "person-climbing-wall-toward-goal",
    modificationSummary: "保留攀墙人物，在墙顶增加继续前进的方向与目标点。",
    alt: "人物翻过障碍后仍继续朝目标前进，表示“尽管如此”。",
    overlay: `<path d="M112 33h40m0 0-12-10m12 10-12 10" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M153 28a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"/>`,
  },
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalizedTextSha256 = (bytes) => sha256(Buffer.from(bytes).toString("utf8").trimEnd());
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const [wanweiManifest, sourceContent, gapAudit, referenceManifest] = await Promise.all([
  readJson(resolve(repoRoot, "data/vocabulary/wanwei-visual-manifest-v1.json")),
  readJson(resolve(repoRoot, "data/vocabulary/gaokao-frequency-source-content-v1.json")),
  readJson(resolve(repoRoot, "data/vocabulary/gaokao-frequency-original-svg-gap-audit-v1.json")),
  readJson(resolve(repoRoot, "data/vocabulary/gaokao-frequency-svg-style-reference-v1.json")),
]);
const baseByEntryId = new Map(wanweiManifest.entries.map((entry) => [entry.entryId, entry]));
const sourceByEntryId = new Map(sourceContent.entries.map((entry) => [entry.entryId, entry]));
const gapByHeadword = new Map(gapAudit.entries.map((entry) => [entry.headword, entry]));
let previousManifest = null;
try {
  previousManifest = await readJson(manifestPath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const previousReceiptByBaseEntryId = new Map(
  (previousManifest?.entries ?? []).map((entry) => [entry.provenance.baseEntryId, entry.provenance.sourceReceipt]),
);

await mkdir(assetDirectory, { recursive: true });
const entries = [];
for (const [index, definition] of definitions.entries()) {
  const base = baseByEntryId.get(definition.baseEntryId);
  const source = sourceByEntryId.get(definition.entryId);
  const gap = gapByHeadword.get(definition.headword);
  if (!base || !source || !gap) throw new Error(`Missing source data for ${definition.entryId}.`);
  const baseFilePath = resolve(repoRoot, `app/public${base.path}`);
  const baseBytes = await readFile(baseFilePath);
  if (sha256(baseBytes) !== base.sha256) throw new Error(`Base hash mismatch: ${base.entryId}`);
  const officialPageUrl = `https://koboyo.com/icons/${base.slug}`;
  const officialSvgUrl = `https://koboyo.com/icons/svg/${base.slug}.svg`;
  let sourceReceipt = previousReceiptByBaseEntryId.get(base.entryId) ?? null;
  if (refreshSources) {
    const [pageResponse, svgResponse] = await Promise.all([
      fetch(officialPageUrl, { redirect: "follow" }),
      fetch(officialSvgUrl, { redirect: "follow" }),
    ]);
    const remoteBytes = Buffer.from(await svgResponse.arrayBuffer());
    sourceReceipt = {
      checkedAt,
      officialPageStatus: pageResponse.status,
      officialSvgStatus: svgResponse.status,
      remoteSha256: svgResponse.ok ? sha256(remoteBytes) : null,
      remoteNormalizedSha256: svgResponse.ok ? normalizedTextSha256(remoteBytes) : null,
      localNormalizedSha256: normalizedTextSha256(baseBytes),
      contentMatchAfterTrailingWhitespaceNormalization:
        svgResponse.ok && normalizedTextSha256(remoteBytes) === normalizedTextSha256(baseBytes),
    };
  }
  if (!sourceReceipt) {
    throw new Error(`Missing official source receipt for ${base.entryId}; run with --refresh-sources --checked-at=YYYY-MM-DD.`);
  }
  let svg = baseBytes.toString("utf8");
  svg = svg.replace(/aria-label="[^"]*"/, `aria-label="${definition.slug.replaceAll("-", " ")}"`);
  svg = svg.replace("</svg>", `${definition.overlay}</svg>`);
  const fileName = `${definition.entryId}--${definition.slug}.svg`;
  const outputPath = resolve(assetDirectory, fileName);
  await writeFile(outputPath, svg);
  const outputBytes = Buffer.from(svg);
  const publicPath = `/vocabulary-assets/gaokao-frequency-v1/visuals/koboyo-adapted-v1/${fileName}`;
  entries.push({
    order: index + 1,
    entryId: definition.entryId,
    headword: definition.headword,
    frequencyRank: source.frequencyRank,
    partOfSpeech: source.partOfSpeech,
    sourceMeanings: source.sourceMeanings,
    teachingSense: definition.teachingSense,
    visualKey: `${definition.entryId}-koboyo-adapted-v1`,
    slug: definition.slug,
    width: base.width,
    height: base.height,
    path: publicPath,
    alt: definition.alt,
    sha256: sha256(outputBytes),
    version: "koboyo-adapted-portrait-v1",
    assetStatus: "pilot_owner_qa",
    modificationSummary: definition.modificationSummary,
    provenance: {
      type: "koboyo-adapted",
      independentOriginal: false,
      baseEntryId: base.entryId,
      baseHeadword: base.headword,
      baseSlug: base.slug,
      basePath: base.path,
      baseSha256: base.sha256,
      officialPageUrl,
      officialSvgUrl,
      licenseUrl: referenceManifest.sourcePolicy.licenseUrl,
      licenseCheckedAt: referenceManifest.sourcePolicy.licenseReceipt.checkedAt,
      sourceReceipt,
    },
    gapEvidence: {
      checkedAt: gap.checkedAt,
      assessment: gap.assessment,
      rationale: gap.rationale,
    },
  });
}

const manifest = {
  schemaVersion: "gaokao-frequency-koboyo-adapted-pilot-v1",
  version: "koboyo-adapted-portrait-v1",
  generatedAt: "2026-08-11",
  status: "pilot_owner_qa",
  integrationPolicy: "Adapted assets remain outside the formal visual manifest until Owner QA passes.",
  licensingNote: "Koboyo's official license allows modification and embedding in a larger product; these files must not be redistributed as an icon library.",
  licenseReceipt: referenceManifest.sourcePolicy.licenseReceipt,
  entries,
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const cards = entries.map((entry) => `
  <article>
    <div class="images">
      <div><img src="../../../../app/public${escapeHtml(entry.provenance.basePath)}" alt=""><span>母版</span></div>
      <div><img src="../../../../app/public${escapeHtml(entry.path)}" alt="${escapeHtml(entry.alt)}"><span>改编</span></div>
    </div>
    <p class="index">${String(entry.order).padStart(2, "0")} · ${escapeHtml(entry.provenance.baseEntryId)}</p>
    <h2>${escapeHtml(entry.headword)}</h2>
    <p class="sense">${escapeHtml(entry.partOfSpeech)} ${escapeHtml(entry.teachingSense)}</p>
    <p>${escapeHtml(entry.modificationSummary)}</p>
  </article>`).join("");
const board = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Koboyo 人物改编试产 v1</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:#f3eee4;color:#181714}*{box-sizing:border-box}body{margin:0;padding:46px}header,main,footer{max-width:1400px;margin:auto}header{margin-bottom:36px}.eyebrow{margin:0 0 10px;color:#8e482d;font-size:12px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}h1{max-width:980px;margin:0 0 18px;font-size:58px;line-height:1;letter-spacing:-.045em}header p:last-child{max-width:900px;color:#625d54;line-height:1.7}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}article{padding:20px;border:1px solid #c9c0b2;border-radius:20px;background:#fffdf8}.images{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}.images div{position:relative;display:grid;place-items:center;min-height:185px;border-radius:14px;background:#f8f3e9}.images img{width:170px;height:170px;object-fit:contain}.images span{position:absolute;right:8px;bottom:8px;padding:3px 7px;border-radius:999px;background:#181714;color:white;font-size:10px}.index{margin:0 0 4px;color:#9b5034;font:700 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}h2{margin:0;font-size:29px;letter-spacing:-.03em}.sense{margin:3px 0 12px;font-weight:750}article>p:last-child{margin:0;color:#645e55;font-size:13px;line-height:1.6}footer{margin-top:34px;padding-top:20px;border-top:1px solid #c9c0b2;color:#6b655c;font-size:13px;line-height:1.65}@media(max-width:900px){body{padding:24px}main{grid-template-columns:1fr}.images img{width:145px;height:145px}}
</style></head><body><header><p class="eyebrow">EQBank · Koboyo adapted portrait pilot v1</p><h1>保留 Koboyo 的人，再只改语义道具</h1><p>左侧是原始 Koboyo 母版，右侧是改编稿。改编稿明确标记为 Koboyo adapted，不声称独立原创；每张保存母版 Entry、官方页面、原始哈希、修改说明和新哈希。</p></header><main>${cards}</main><footer>授权回执：${escapeHtml(manifest.licenseReceipt.checkedAt)} · ${escapeHtml(manifest.licenseReceipt.url)} · 当前仅作 Owner QA，未进入正式视觉 manifest。</footer></body></html>`;

await Promise.all([
  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile(boardPath, board),
]);
console.log(`Wrote ${entries.length} Koboyo-adapted SVGs to ${assetDirectory}`);
console.log(`Wrote ${manifestPath}`);
console.log(`Wrote ${boardPath}`);
