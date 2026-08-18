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

const manifestPath = resolve(
  repoRoot,
  "data/vocabulary/gaokao-frequency-sentence-scene-pilot-v1.json",
);
const prototypePath = resolve(
  repoRoot,
  "docs/cuts/gaokao-vocabulary-3000/evidence/sentence-scene-pilot-prototype-v1.html",
);
const ownerQaPath = resolve(
  repoRoot,
  "data/vocabulary/gaokao-frequency-sentence-scene-pilot-owner-qa-v1.json",
);
const licenseUrl = "https://koboyo.com/icons/license";

const definitions = [
  {
    entryId: "gaokao-frequency-0209-however",
    headword: "however",
    teachingSense: "然而",
    sourceEntryId: "wanwei-basic-0731-force",
    sentence: {
      english: "The storm was strong; however, she kept walking.",
      chinese: "暴风雨很猛烈，然而她仍继续前行。",
      highlight: "however",
    },
    sceneQuery: {
      subject: "a person with an umbrella",
      action: "keeps walking",
      object: "a strong storm",
      condition: "the storm continues but does not stop the action",
    },
    bindingRationale: "原图同时呈现强烈阻碍和继续前行，例句中的 however 负责连接这两个相反事实。",
    alt: "一个人在暴风雨中撑伞继续前行",
  },
  {
    entryId: "gaokao-frequency-0828-although",
    headword: "although",
    teachingSense: "虽",
    sourceEntryId: "wanwei-basic-1199-wet",
    sentence: {
      english: "Although her umbrella was broken, she kept walking in the rain.",
      chinese: "虽然她的伞坏了，但她仍在雨中继续前行。",
      highlight: "Although",
    },
    sceneQuery: {
      subject: "a person in the rain",
      action: "keeps walking",
      object: "a broken umbrella",
      condition: "the umbrella is broken",
    },
    bindingRationale: "原图准确呈现让步从句中的坏伞和主句中的继续行动，不需要额外编故事。",
    alt: "一个人拿着坏掉的雨伞站在雨中",
  },
  {
    entryId: "gaokao-frequency-0970-throughout",
    headword: "throughout",
    teachingSense: "遍及",
    sourceEntryId: "wanwei-basic-1235-year",
    sentence: {
      english: "The museum stays open throughout the year.",
      chinese: "这家博物馆全年开放。",
      highlight: "throughout",
    },
    sceneQuery: {
      subject: "a museum schedule",
      action: "remains open",
      object: "the complete year",
      condition: "all months are covered",
    },
    bindingRationale: "原图把一年中的月份作为完整范围呈现，例句把这个范围绑定到开放状态。",
    alt: "一张展示全年月份的年历",
  },
  {
    entryId: "gaokao-frequency-1164-unless",
    headword: "unless",
    teachingSense: "除非",
    sourceEntryId: "wanwei-core-0013-allow",
    sentence: {
      english: "You cannot enter unless someone opens the gate.",
      chinese: "除非有人打开大门，否则你不能进去。",
      highlight: "unless",
    },
    sceneQuery: {
      subject: "a person at a gate",
      action: "opens the gate",
      object: "entry through the gate",
      condition: "entry becomes possible only when the gate opens",
    },
    bindingRationale: "原图呈现进入所需的可见条件；unless 在完整句中说明只有该条件成立才能进入。",
    alt: "一个人正在打开木门让人通过",
  },
  {
    entryId: "gaokao-frequency-1502-despite",
    headword: "despite",
    teachingSense: "尽管",
    sourceEntryId: "wanwei-core-0098-difficult",
    sentence: {
      english: "Despite the huge rock, he kept pushing it uphill.",
      chinese: "尽管岩石巨大，他仍继续把它往坡上推。",
      highlight: "Despite",
    },
    sceneQuery: {
      subject: "a person on a slope",
      action: "keeps pushing uphill",
      object: "a huge rock",
      condition: "the obstacle is visibly difficult",
    },
    bindingRationale: "巨石是可见阻力，继续推是主动作；图句组合直接体现 despite 的让步关系。",
    alt: "一个人在斜坡上费力推动巨石",
  },
  {
    entryId: "gaokao-frequency-1538-indeed",
    headword: "indeed",
    teachingSense: "确实",
    sourceEntryId: "wanwei-basic-0982-really",
    sentence: {
      english: "After checking the answer, she found it was indeed correct.",
      chinese: "核对答案后，她发现它确实是正确的。",
      highlight: "indeed",
    },
    sceneQuery: {
      subject: "a person holding a checked document",
      action: "confirms the result",
      object: "a correct answer",
      condition: "the answer has been checked",
    },
    bindingRationale: "原图中的勾选文件提供已经核验的证据，indeed 在句中加强确认结果。",
    alt: "一个人举着带勾选标记的文件确认结果",
  },
  {
    entryId: "gaokao-frequency-1694-somehow",
    headword: "somehow",
    teachingSense: "以某种方式",
    sourceEntryId: "wanwei-core-0144-find",
    sentence: {
      english: "After hours of thinking, he somehow found the answer.",
      chinese: "思考了几个小时后，他不知怎么找到了答案。",
      highlight: "somehow",
    },
    sceneQuery: {
      subject: "a person thinking",
      action: "finds an answer",
      object: "a new idea",
      condition: "the method is not explained",
    },
    bindingRationale: "原图清楚呈现最终找到答案；句子保留过程不明这一点，让 somehow 的作用成立。",
    alt: "一个人想到办法并举手示意找到了答案",
  },
  {
    entryId: "gaokao-frequency-2646-nevertheless",
    headword: "nevertheless",
    teachingSense: "尽管如此",
    sourceEntryId: "wanwei-core-0066-climb",
    sentence: {
      english: "The wall was high; nevertheless, he kept climbing.",
      chinese: "墙很高，尽管如此，他仍继续攀爬。",
      highlight: "nevertheless",
    },
    sceneQuery: {
      subject: "a climber",
      action: "keeps climbing",
      object: "a high wall",
      condition: "the wall remains an obstacle",
    },
    bindingRationale: "原图同时呈现高墙和持续攀爬，完整句用 nevertheless 明确逆势继续的关系。",
    alt: "一个人面对高墙仍继续向上攀爬",
  },
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalizedTextSha256 = (bytes) => sha256(Buffer.from(bytes).toString("utf8").trimEnd());
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const [wanweiManifest, sourceContent] = await Promise.all([
  readJson(resolve(repoRoot, "data/vocabulary/wanwei-visual-manifest-v1.json")),
  readJson(resolve(repoRoot, "data/vocabulary/gaokao-frequency-source-content-v1.json")),
]);
const sourceVisualByEntryId = new Map(wanweiManifest.entries.map((entry) => [entry.entryId, entry]));
const sourceWordByEntryId = new Map(sourceContent.entries.map((entry) => [entry.entryId, entry]));

let previousManifest = null;
try {
  previousManifest = await readJson(manifestPath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let ownerQaReceipt = null;
try {
  ownerQaReceipt = await readJson(ownerQaPath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (ownerQaReceipt) {
  if (
    ownerQaReceipt.pilotVersion !== "sentence-scene-pilot-v1" ||
    ownerQaReceipt.reviewUnit !== "image_plus_exact_sentence_plus_highlight" ||
    ownerQaReceipt.integrationAuthorized !== false ||
    !Array.isArray(ownerQaReceipt.entries)
  ) {
    throw new Error("Invalid Owner QA receipt metadata.");
  }
  const definitionByEntryId = new Map(definitions.map((definition) => [definition.entryId, definition]));
  const seenEntryIds = new Set();
  for (const receiptEntry of ownerQaReceipt.entries) {
    const definition = definitionByEntryId.get(receiptEntry.entryId);
    if (
      !definition ||
      definition.headword !== receiptEntry.headword ||
      !["pass", "borderline", "fail"].includes(receiptEntry.verdict) ||
      seenEntryIds.has(receiptEntry.entryId)
    ) {
      throw new Error(`Invalid Owner QA entry ${receiptEntry.entryId ?? "unknown"}.`);
    }
    seenEntryIds.add(receiptEntry.entryId);
  }
  const passedCount = ownerQaReceipt.entries.filter((entry) => entry.verdict === "pass").length;
  if (
    ownerQaReceipt.reviewedCount !== ownerQaReceipt.entries.length ||
    ownerQaReceipt.passedCount !== passedCount ||
    ownerQaReceipt.decision !== "all_pass" ||
    ownerQaReceipt.entries.length !== definitions.length ||
    passedCount !== definitions.length
  ) {
    throw new Error("Owner QA receipt does not describe a complete all-pass pilot.");
  }
}
const ownerVerdictByEntryId = new Map(
  (ownerQaReceipt?.entries ?? []).map((entry) => [entry.entryId, entry.verdict]),
);
const ownerQaAllPassed =
  ownerQaReceipt !== null && definitions.every(({ entryId }) => ownerVerdictByEntryId.get(entryId) === "pass");
const previousReceiptBySourceEntryId = new Map(
  (previousManifest?.entries ?? []).map((entry) => [entry.asset.sourceEntryId, entry.asset.sourceReceipt]),
);
let licenseReceipt = previousManifest?.licenseReceipt ?? null;

if (refreshSources) {
  const licenseResponse = await fetch(licenseUrl, { redirect: "follow" });
  licenseReceipt = {
    url: licenseUrl,
    checkedAt,
    status: licenseResponse.status,
  };
}
if (!licenseReceipt) {
  throw new Error("Missing license receipt; run with --refresh-sources --checked-at=YYYY-MM-DD.");
}

const entries = [];
const htmlEntries = [];
for (const [index, definition] of definitions.entries()) {
  const sourceVisual = sourceVisualByEntryId.get(definition.sourceEntryId);
  const sourceWord = sourceWordByEntryId.get(definition.entryId);
  if (!sourceVisual || !sourceWord) {
    throw new Error(`Missing source data for ${definition.entryId}.`);
  }

  const localFilePath = resolve(repoRoot, `app/public${sourceVisual.path}`);
  const localBytes = await readFile(localFilePath);
  const localSha256 = sha256(localBytes);
  if (localSha256 !== sourceVisual.sha256) {
    throw new Error(`Local visual hash mismatch for ${sourceVisual.entryId}.`);
  }

  const officialPageUrl = `https://koboyo.com/icons/${sourceVisual.slug}`;
  const officialSvgUrl = `https://koboyo.com/icons/svg/${sourceVisual.slug}.svg`;
  let sourceReceipt = previousReceiptBySourceEntryId.get(sourceVisual.entryId) ?? null;
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
      localNormalizedSha256: normalizedTextSha256(localBytes),
      contentMatchAfterTrailingWhitespaceNormalization:
        svgResponse.ok && normalizedTextSha256(remoteBytes) === normalizedTextSha256(localBytes),
    };
  }
  if (!sourceReceipt) {
    throw new Error(`Missing source receipt for ${sourceVisual.entryId}.`);
  }
  if (
    sourceReceipt.officialPageStatus !== 200 ||
    sourceReceipt.officialSvgStatus !== 200 ||
    sourceReceipt.contentMatchAfterTrailingWhitespaceNormalization !== true
  ) {
    throw new Error(`Official source verification failed for ${sourceVisual.entryId}.`);
  }

  const visualSentenceId = `${definition.entryId}-pilot-a`;
  const visualSentenceTextSha256 = sha256(Buffer.from(definition.sentence.english, "utf8"));
  const ownerVerdict = ownerVerdictByEntryId.get(definition.entryId) ?? null;
  const entry = {
    order: index + 1,
    entryId: definition.entryId,
    headword: definition.headword,
    frequencyRank: sourceWord.frequencyRank,
    partOfSpeech: sourceWord.partOfSpeech,
    sourceMeanings: sourceWord.sourceMeanings,
    visualMode: "sentence-scene",
    teachingSense: definition.teachingSense,
    visualSentenceId,
    visualSentenceTextSha256,
    sentenceStatus: ownerVerdict === "pass" ? "owner_approved" : "draft_owner_qa",
    sentence: {
      candidateId: "pilot-a",
      ...definition.sentence,
    },
    sceneQuery: definition.sceneQuery,
    bindingRationale: definition.bindingRationale,
    displayContract: "image_and_exact_sentence_with_target_highlight",
    asset: {
      sourceEntryId: sourceVisual.entryId,
      sourceHeadword: sourceVisual.headword,
      slug: sourceVisual.slug,
      width: sourceVisual.width,
      height: sourceVisual.height,
      path: sourceVisual.path,
      sha256: sourceVisual.sha256,
      version: sourceVisual.version,
      alt: definition.alt,
      provenanceType: "koboyo-original-reuse",
      officialPageUrl,
      officialSvgUrl,
      licenseUrl,
      sourceReceipt,
    },
    qa: {
      status: ownerVerdict === "pass" ? "owner_qa_passed" : "pilot_owner_qa",
      reviewUnit: "image_plus_exact_sentence_plus_highlight",
      verdict: ownerVerdict,
      integratedIntoProduct: false,
    },
  };
  entries.push(entry);
  htmlEntries.push({
    ...entry,
    asset: {
      ...entry.asset,
      embeddedSvgDataUrl: `data:image/svg+xml;base64,${localBytes.toString("base64")}`,
    },
  });
}

const manifest = {
  schemaVersion: 1,
  version: "sentence-scene-pilot-v1",
  status: ownerQaAllPassed ? "owner_qa_passed" : "pilot_owner_qa",
  question: "抽象词与确切例句和未改 Koboyo 原图共同出现时，是否比裸图更容易理解且不牵强？",
  generatedAt: checkedAt ?? previousManifest?.generatedAt ?? null,
  integrationPolicy: "prototype_only_not_integrated",
  sentencePolicy: ownerQaAllPassed
    ? "owner_approved_for_pilot_binding_not_integrated"
    : "drafts_require_owner_approval_before_any_production_binding",
  assetPolicy: "reuse_verified_unchanged_koboyo_originals_only",
  ownerQaReceipt,
  licenseReceipt,
  entries,
};

const embeddedData = JSON.stringify(htmlEntries).replaceAll("<", "\\u003c");
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:," />
  <title>抽象词句义图试产 QA</title>
  <style>
    :root { color-scheme: light; --ink:#20201d; --muted:#6d6a63; --line:#ddd8ce; --paper:#fffdf8; --wash:#f4f0e7; --accent:#b65332; --good:#2f704f; --warn:#94611d; --bad:#9e3f3f; }
    * { box-sizing:border-box; }
    body { margin:0; background:#eee9df; color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif; }
    button { font:inherit; }
    .shell { width:min(920px,calc(100% - 28px)); margin:24px auto 40px; }
    .intro,.stage,.state-panel,.walkthrough { background:var(--paper); border:1px solid var(--line); border-radius:14px; box-shadow:0 10px 28px rgba(67,54,31,.07); }
    .intro { padding:22px 24px; }
    .eyebrow { margin:0 0 8px; color:var(--accent); font-size:13px; font-weight:750; letter-spacing:.08em; }
    h1 { margin:0; font-family:Georgia,"Songti SC",serif; font-size:clamp(28px,5vw,42px); font-weight:650; }
    .question { margin:12px 0 0; color:var(--muted); line-height:1.7; }
    .toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:14px 0; }
    .toolbar .spacer { flex:1; }
    .button { min-height:42px; padding:9px 14px; border:1px solid var(--line); border-radius:9px; background:var(--paper); color:var(--ink); cursor:pointer; }
    .button:hover { border-color:#aaa397; }
    .button[aria-pressed="true"],.button.primary { background:var(--ink); border-color:var(--ink); color:white; }
    .button.good { color:var(--good); }.button.warn { color:var(--warn); }.button.bad { color:var(--bad); }
    .button.good[aria-pressed="true"] { background:var(--good); border-color:var(--good); color:white; }
    .button.warn[aria-pressed="true"] { background:var(--warn); border-color:var(--warn); color:white; }
    .button.bad[aria-pressed="true"] { background:var(--bad); border-color:var(--bad); color:white; }
    .stage { min-height:570px; padding:24px; display:grid; grid-template-rows:auto 1fr auto; }
    .word-row { display:flex; align-items:baseline; justify-content:space-between; gap:16px; }
    .word { margin:0; font-family:Georgia,serif; font-size:38px; }
    .sense { color:var(--muted); font-size:16px; }
    .binding { display:grid; grid-template-columns:minmax(260px,42%) 1fr; align-items:center; gap:34px; margin:22px 0; }
    .visual-wrap { min-height:330px; display:grid; place-items:center; border-radius:12px; background:var(--wash); padding:24px; }
    .visual-wrap img { max-width:100%; max-height:300px; object-fit:contain; }
    .visual-hidden { text-align:center; color:var(--bad); line-height:1.7; padding:22px; }
    .sentence-wrap { padding:8px 4px; }
    .sentence { margin:0; font-family:Georgia,"Songti SC",serif; font-size:clamp(25px,4vw,35px); line-height:1.42; }
    mark { color:var(--accent); background:transparent; font-weight:750; }
    .translation { margin:18px 0 0; color:var(--muted); font-size:17px; line-height:1.65; }
    .image-only-note,.sentence-only-note { margin-top:16px; color:var(--muted); font-size:14px; }
    .contract { border-top:1px solid var(--line); padding-top:16px; color:var(--muted); font-size:14px; line-height:1.7; }
    .state-panel { margin-top:14px; padding:18px 20px; }
    .state-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
    .state-item { min-width:0; }
    .state-label { display:block; color:var(--muted); font-size:12px; margin-bottom:4px; }
    .state-value { display:block; font-size:14px; overflow-wrap:anywhere; }
    .dots { display:flex; gap:7px; margin-top:16px; }
    .dot { width:28px; height:7px; border:0; border-radius:99px; background:#d8d2c7; cursor:pointer; }
    .dot.current { background:var(--ink); }.dot.done { background:var(--good); }
    .walkthrough { margin-top:14px; padding:20px; }
    .walkthrough h2 { margin:0 0 8px; font-size:18px; }
    .walkthrough p { margin:0 0 14px; color:var(--muted); line-height:1.65; }
    .scenario-row { display:flex; flex-wrap:wrap; gap:9px; }
    details { margin-top:15px; border-top:1px solid var(--line); padding-top:14px; }
    summary { cursor:pointer; font-weight:650; }
    .details-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:14px; color:var(--muted); line-height:1.65; font-size:14px; }
    .details-grid strong { color:var(--ink); }
    .toast { min-height:24px; margin-top:10px; color:var(--good); font-size:14px; }
    @media (max-width:700px) {
      .shell { width:min(100% - 18px,920px); margin-top:10px; }
      .intro,.stage,.state-panel,.walkthrough { border-radius:10px; }
      .intro,.stage { padding:18px; }
      .binding { grid-template-columns:1fr; gap:20px; }
      .visual-wrap { min-height:260px; }.visual-wrap img { max-height:240px; }
      .state-grid,.details-grid { grid-template-columns:1fr 1fr; }
      .toolbar .spacer { display:none; width:100%; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="intro">
      <p class="eyebrow">${ownerQaAllPassed ? "PROTOTYPE · OWNER QA 8/8 合格 · 未接入正式产品" : "PROTOTYPE · 不接入正式产品"}</p>
      <h1>抽象词句义图试产 QA</h1>
      <p class="question">${ownerQaAllPassed ? "本轮结论：8/8 Owner QA 合格。这里保留逐词查看、裸图对照和错句保护演练；试产仍未接入正式产品。" : "要验证的问题：抽象词与确切例句和未改 Koboyo 原图共同出现时，是否比裸图更容易理解且不牵强？每次只看一个词；先看组合，再切到裸图做对照。"}</p>
    </section>

    <div class="toolbar" aria-label="查看方式与导航">
      <button class="button" data-action="previous">← 上一个</button>
      <button class="button" data-view="bound">图＋原句</button>
      <button class="button" data-view="image">只看裸图</button>
      <button class="button" data-view="sentence">只看句子</button>
      <span class="spacer"></span>
      <button class="button" data-action="next">下一个 →</button>
    </div>

    <section class="stage" aria-live="polite">
      <div class="word-row">
        <h2 class="word" id="word"></h2>
        <span class="sense" id="sense"></span>
      </div>
      <div class="binding">
        <div class="visual-wrap" id="visual"></div>
        <div class="sentence-wrap" id="sentence"></div>
      </div>
      <div class="contract" id="contract"></div>
    </section>

    <div class="toolbar" aria-label="当前词 QA 结论">
      <span>这一组图句：</span>
      <button class="button good" data-verdict="pass">合格</button>
      <button class="button warn" data-verdict="borderline">勉强</button>
      <button class="button bad" data-verdict="fail">不合格</button>
      <button class="button" data-verdict="clear">清空判断</button>
      <span class="spacer"></span>
      <button class="button" data-action="copy">复制 QA 结果</button>
    </div>

    <section class="state-panel">
      <div class="state-grid">
        <div class="state-item"><span class="state-label">当前进度</span><span class="state-value" id="progress"></span></div>
        <div class="state-item"><span class="state-label">查看状态</span><span class="state-value" id="view-state"></span></div>
        <div class="state-item"><span class="state-label">句图绑定</span><span class="state-value" id="binding-state"></span></div>
        <div class="state-item"><span class="state-label">已完成判断</span><span class="state-value" id="decision-count"></span></div>
      </div>
      <div class="dots" id="dots" aria-label="词条进度"></div>
      <details>
        <summary>查看场景查询与来源 receipt</summary>
        <div class="details-grid" id="details"></div>
      </details>
      <div class="toast" id="toast"></div>
    </section>

    <section class="walkthrough">
      <h2>三个固定演练</h2>
      <p>这些按钮只改变内存中的试验状态：标准组合用于正式 QA；裸图对照验证它是不是本来就无法独立表达；错句保护验证句子 ID 不一致时图片会被强制隐藏。</p>
      <div class="scenario-row">
        <button class="button primary" data-scenario="bound">① 标准图句组合</button>
        <button class="button" data-scenario="image">② 裸图对照</button>
        <button class="button" data-scenario="mismatch">③ 模拟错句绑定</button>
        <button class="button" data-action="restore">恢复正确绑定</button>
      </div>
    </section>
  </main>

  <script>
    const entries = ${embeddedData};

    const initialState = () => ({
      index: 0,
      view: "bound",
      presentedSentenceId: entries[0].visualSentenceId,
      decisions: Object.fromEntries(entries.flatMap((entry) => entry.qa.verdict ? [[entry.entryId, entry.qa.verdict]] : [])),
    });
    const moveTo = (state, index) => {
      const safeIndex = (index + entries.length) % entries.length;
      return { ...state, index: safeIndex, view: "bound", presentedSentenceId: entries[safeIndex].visualSentenceId };
    };
    const reduce = (state, action) => {
      if (action.type === "next") return moveTo(state, state.index + 1);
      if (action.type === "previous") return moveTo(state, state.index - 1);
      if (action.type === "jump") return moveTo(state, action.index);
      if (action.type === "set-view") return { ...state, view: action.view };
      if (action.type === "mismatch") return { ...state, view: "bound", presentedSentenceId: "mismatched-sentence-id" };
      if (action.type === "restore") return { ...state, presentedSentenceId: entries[state.index].visualSentenceId };
      if (action.type === "verdict") {
        const decisions = { ...state.decisions };
        if (action.verdict === "clear") delete decisions[entries[state.index].entryId];
        else decisions[entries[state.index].entryId] = action.verdict;
        return { ...state, decisions };
      }
      return state;
    };
    const derive = (state) => {
      const entry = entries[state.index];
      const sentenceMatches = state.presentedSentenceId === entry.visualSentenceId;
      return {
        entry,
        sentenceMatches,
        showImage: state.view !== "sentence" && sentenceMatches,
        showSentence: state.view !== "image",
        currentVerdict: state.decisions[entry.entryId] ?? null,
      };
    };

    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\\"": "&quot;", "'": "&#039;" })[character]);
    const highlightSentence = (sentence, highlight) => {
      const start = sentence.indexOf(highlight);
      if (start < 0) return escapeHtml(sentence);
      return escapeHtml(sentence.slice(0, start)) + "<mark>" + escapeHtml(highlight) + "</mark>" + escapeHtml(sentence.slice(start + highlight.length));
    };
    const viewLabels = { bound: "图＋确切原句", image: "只看裸图", sentence: "只看句子" };
    const verdictLabels = { pass: "合格", borderline: "勉强", fail: "不合格" };
    let state = initialState();

    const render = () => {
      const derived = derive(state);
      const { entry } = derived;
      document.getElementById("word").textContent = entry.headword;
      document.getElementById("sense").textContent = entry.partOfSpeech + " · " + entry.teachingSense;
      document.getElementById("progress").textContent = (state.index + 1) + " / " + entries.length;
      document.getElementById("view-state").textContent = viewLabels[state.view];
      document.getElementById("binding-state").textContent = derived.sentenceMatches ? "同句，可显示图片" : "句 ID 不一致，图片已隐藏";
      document.getElementById("decision-count").textContent = Object.keys(state.decisions).length + " / " + entries.length;

      const visual = document.getElementById("visual");
      visual.innerHTML = derived.showImage
        ? '<img src="' + entry.asset.embeddedSvgDataUrl + '" alt="' + escapeHtml(entry.asset.alt) + '" />'
        : '<div class="visual-hidden"><strong>图片未显示</strong><br />' + (derived.sentenceMatches ? "当前处于只看句子模式。" : "绑定句 ID 与视觉记录不一致，按合同失败关闭。") + '</div>';

      const sentence = document.getElementById("sentence");
      sentence.innerHTML = derived.showSentence
        ? '<p class="sentence">' + highlightSentence(entry.sentence.english, entry.sentence.highlight) + '</p><p class="translation">' + escapeHtml(entry.sentence.chinese) + '</p>'
        : '<p class="image-only-note">裸图对照：这里故意拿掉例句。抽象词不要求裸图本身被猜中。</p>';

      document.getElementById("contract").innerHTML = '<strong>绑定理由：</strong>' + escapeHtml(entry.bindingRationale) + '<br /><strong>显示合同：</strong>只有 visualSentenceId 与当前句一致时，原图才能与完整原句和目标词高亮共同出现。';
      document.getElementById("details").innerHTML =
        '<div><strong>场景查询</strong><br />主体：' + escapeHtml(entry.sceneQuery.subject) + '<br />动作：' + escapeHtml(entry.sceneQuery.action) + '<br />对象：' + escapeHtml(entry.sceneQuery.object) + '<br />条件：' + escapeHtml(entry.sceneQuery.condition) + '</div>' +
        '<div><strong>原图来源</strong><br />复用：' + escapeHtml(entry.asset.sourceEntryId) + '<br />哈希：' + escapeHtml(entry.asset.sha256) + '<br /><a href="' + escapeHtml(entry.asset.officialPageUrl) + '" target="_blank" rel="noreferrer">Koboyo 官方页面</a><br />当前状态：' + (entry.qa.status === "owner_qa_passed" ? "Owner QA 已通过；未接入产品" : "未接入产品，等待 Owner QA") + '</div>';

      document.querySelectorAll("[data-view]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === state.view)));
      document.querySelectorAll("[data-verdict]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.verdict === derived.currentVerdict)));
      document.getElementById("dots").innerHTML = entries.map((candidate, index) => '<button class="dot ' + (index === state.index ? "current" : "") + (state.decisions[candidate.entryId] ? " done" : "") + '" data-jump="' + index + '" aria-label="第 ' + (index + 1) + ' 个词"></button>').join("");
      document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => dispatch({ type: "jump", index: Number(button.dataset.jump) })));
    };

    const dispatch = (action) => { state = reduce(state, action); render(); };
    const copyText = async (value) => {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
          return;
        } catch {}
      }
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    };
    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => dispatch({ type: "set-view", view: button.dataset.view })));
    document.querySelectorAll("[data-verdict]").forEach((button) => button.addEventListener("click", () => dispatch({ type: "verdict", verdict: button.dataset.verdict })));
    document.querySelector('[data-action="next"]').addEventListener("click", () => dispatch({ type: "next" }));
    document.querySelector('[data-action="previous"]').addEventListener("click", () => dispatch({ type: "previous" }));
    document.querySelector('[data-action="restore"]').addEventListener("click", () => dispatch({ type: "restore" }));
    document.querySelector('[data-scenario="bound"]').addEventListener("click", () => { dispatch({ type: "restore" }); dispatch({ type: "set-view", view: "bound" }); });
    document.querySelector('[data-scenario="image"]').addEventListener("click", () => { dispatch({ type: "restore" }); dispatch({ type: "set-view", view: "image" }); });
    document.querySelector('[data-scenario="mismatch"]').addEventListener("click", () => dispatch({ type: "mismatch" }));
    document.querySelector('[data-action="copy"]').addEventListener("click", async () => {
      const payload = JSON.stringify({ version: "sentence-scene-pilot-v1", decisions: state.decisions }, null, 2);
      await copyText(payload);
      document.getElementById("toast").textContent = "QA 结果已复制；刷新页面会清空本轮状态。";
    });
    render();
  </script>
</body>
</html>
`;

await mkdir(dirname(prototypePath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(prototypePath, html);

console.log(JSON.stringify({
  manifestPath,
  prototypePath,
  entries: entries.length,
  verifiedSources: entries.filter((entry) => entry.asset.sourceReceipt.contentMatchAfterTrailingWhitespaceNormalization).length,
}, null, 2));
