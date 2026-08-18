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
  throw new Error("--refresh-sources requires --checked-at=YYYY-MM-DD so the receipt stays reproducible.");
}

const referencePath = resolve(repoRoot, "data/vocabulary/gaokao-frequency-svg-style-reference-v1.json");
const boardPath = resolve(
  repoRoot,
  "docs/cuts/gaokao-vocabulary-3000/evidence/koboyo-svg-reference-board-v1.html",
);
const wanweiManifestPath = resolve(repoRoot, "data/vocabulary/wanwei-visual-manifest-v1.json");
const gaokaoManifestPath = resolve(repoRoot, "data/vocabulary/gaokao-frequency-golden-visual-manifest-v1.json");

const selections = [
  ["wanwei-basic-0848-man--pl--men-", "people", "成年男性", "用站姿、肩线和手持物形成成年男性轮廓，不靠夸张五官。"],
  ["wanwei-basic-1224-woman--pl--women-", "people", "成年女性", "人物共用同一头身语法，发型与动作只提供必要角色线索。"],
  ["wanwei-recognition-1288-boy", "people", "男孩", "头身比更大、肢体更短，配合读书动作表达儿童身份。"],
  ["wanwei-basic-0745-girl", "people", "女孩（边界样本）", "王冠不能成为女孩的默认编码；只观察儿童比例，不继承刻板道具。", "boundary"],
  ["wanwei-basic-0529-baby", "people", "婴儿", "大头、小身体和圆弧外轮廓在小尺寸下仍可辨认。"],
  ["wanwei-basic-0605-child--pl--children-", "people", "儿童动作", "用拍手动作和轻微不对称增加手绘感与生命力。"],
  ["wanwei-basic-0754-grandfather--grandpa-", "people", "年长男性（边界样本）", "本图细节偏密；原创只学年龄线索，不继承写实皱纹密度。", "boundary"],
  ["wanwei-basic-0755-grandmother--grandma-", "people", "年长女性", "挥手动作先表达亲切，再用轮廓提供年龄与性别线索。"],
  ["wanwei-recognition-1599-youth", "people", "青年", "现代配件和放松姿态比写实面部更能快速建立角色。"],
  ["wanwei-core-0302-person", "people", "中性人物", "中性人物依靠完整人体轮廓和视线方向成立。"],
  ["wanwei-basic-1227-worker", "people", "工人", "职业通过安全帽、工装等一至两个强识别物建立。"],
  ["wanwei-basic-0945-pilot", "people", "飞行员", "制服轮廓作为职业锚点，减少无关背景。"],
  ["wanwei-basic-1025-scientist", "people", "科学家", "人物加一个实验情境物即可表达职业，不必画满实验室。"],
  ["wanwei-basic-1112-teacher", "people", "教师", "正面人物采用卡通比例和清晰手势，保证教学语境可读。"],
  ["wanwei-basic-1096-student", "people", "学生", "学习动作与随身物比校服细节更稳健。"],
  ["wanwei-basic-0796-husband", "people", "双人关系", "两人共享基线和情境道具，关系先于个体细节。"],

  ["wanwei-basic-0516-apple", "objects", "有机物体", "先保留苹果与枝叶的整体剪影，再补最少内部结构。"],
  ["wanwei-basic-0569-bowl", "objects", "食物与容器", "容器轮廓包住内容物，层级关系一眼可见。"],
  ["wanwei-basic-0584-camera", "objects", "机械物体", "用镜头、机身和快门三个识别块建立相机。"],
  ["wanwei-basic-0565-book", "objects", "书本文具", "开合状态用两种大轮廓表达，避免依赖文字。"],
  ["wanwei-basic-1015-rope", "objects", "柔性物体", "连续曲线和重叠关系表达盘绕，不画材质纹理。"],
  ["wanwei-basic-0850-map", "objects", "折叽物体", "折线外形加少量路线信息即可表达地图。"],
  ["wanwei-recognition-1317-clock", "objects", "圆形器物", "圆形表盘与指针是不可删减的识别特征。"],
  ["gaokao-frequency-2006-metal", "objects", "科学器物", "磁铁用极简工业轮廓和吸附关系表达材质概念。"],
  ["wanwei-core-0439-train", "objects", "交通工具", "车头、车厢和轨道形成水平主轴，细节服从轮廓。"],
  ["wanwei-recognition-1300-cat", "objects", "动物", "耳朵、尾巴和身体曲线构成动物识别三件套。"],

  ["wanwei-basic-0606-china", "scenes", "地标场景（边界样本）", "可学习层次，但不能用单一地标替代所有国家或时代概念。", "boundary"],
  ["wanwei-basic-0660-desert", "scenes", "自然场景", "太阳、仙人掌、沙丘三个线索足以构成沙漠。"],
  ["wanwei-basic-1009-river", "scenes", "流动场景", "用方向一致的曲线建立水流，岸线只作边界。"],
  ["gaokao-frequency-2070-concentrate", "scenes", "室内学习", "人物是主角，书桌与书架只保留支持专注含义的部分。"],
  ["gaokao-frequency-1194-neighbourhood", "scenes", "社区街景", "重复房屋形成节奏，通过尺度差避免机械复制感。"],
  ["gaokao-frequency-0564-species", "scenes", "生态场景", "前景动物与背景通道共同表达生态关系。"],

  ["wanwei-core-0003-accept", "actions", "交接动作", "双手与物体构成动作中心，人物身体只保留必要部分。"],
  ["wanwei-basic-0808-jog", "actions", "跑动", "前后摆动的四肢和倾斜重心制造方向与速度。"],
  ["wanwei-basic-0633-cook", "actions", "操作器具", "人物、器具、结果物按动作链排列。"],
  ["wanwei-core-0064-clean", "actions", "室内劳动", "用夸张但清楚的手臂方向连接人物与工具。"],
  ["wanwei-basic-0931-party", "actions", "群体活动", "用三至五个人物形成群组，不逐一刻画五官。"],
  ["wanwei-core-0130-explain", "actions", "讲解", "指向手势把讲解者、图表和听者连成阅读顺序。"],
  ["wanwei-core-0010-against", "actions", "对抗", "相反方向的身体倾斜与一条共享绳索直接表达对抗。"],
  ["gaokao-frequency-0819-responsibility", "actions", "负重", "通过大物体与吃力姿态把抽象责任转为可感知动作。"],

  ["gaokao-frequency-1094-complex", "abstract", "复杂与简单", "并置两个相反结构，以空间对比表达抽象差异。"],
  ["gaokao-frequency-1232-progress", "abstract", "进展", "单一上升方向与递进节点构成明确趋势。"],
  ["gaokao-frequency-0593-opportunity", "abstract", "机会", "墙与门形成封闭/开放对比，人物不是必需。"],
  ["gaokao-frequency-1081-concept", "abstract", "概念", "一个公认符号加少量手绘不规则即可承担抽象词。"],
  ["wanwei-core-0073-compare", "abstract", "比较", "两个并列对象加中间观察者形成比较结构。"],
  ["wanwei-core-0309-plan", "abstract", "计划", "路线、节点和目的地把时间性动作转为空间图。"],
  ["wanwei-core-0032-because", "abstract", "因果", "连续倒下的骨牌把原因和结果放在同一方向上。"],
  ["wanwei-core-0115-either", "abstract", "二选一", "人物置于左右两个等权选项之间，保持视觉平衡。"],
].map(([entryId, category, sampleLabel, styleLesson, referenceRole = "core"], index) => ({
  order: index + 1,
  entryId,
  category,
  referenceRole,
  sampleLabel,
  styleLesson,
}));

const styleContract = {
  id: "eqb-hand-drawn-monochrome-v1",
  scope: "An independently authored EQBank subset informed by high-level Koboyo visual grammar; not a claim that all Koboyo icons share one style.",
  canvas: {
    viewBox: "0 0 256 256",
    safeArea: "20-28 units",
    targetPreviewSizes: [64, 96, 128, 256],
  },
  color: {
    allowed: ["currentColor", "none"],
    rule: "Monochrome only; meaning must survive without literal colors.",
  },
  geometry: {
    allowedElements: ["svg", "g", "path"],
    pathCountTarget: "1-3; maximum 4 with a semantic justification",
    strokeAllowed: false,
    visualOutlineThickness: "5-7 units for primary contours; 3-5 units for internal detail",
    fillRule: "Use filled currentColor paths and negative space; do not rely on SVG stroke rendering.",
    handDrawnRule: "Prefer slightly asymmetric curves and spacing, but never add random wobble that harms recognition.",
  },
  composition: {
    primarySubjectShare: "62%-82% of the drawable area",
    supportingClustersMaximum: 3,
    textAllowed: false,
    rule: "One teaching meaning, one visual verb, and no decorative background.",
  },
  people: {
    rule: "Build identity from pose, proportion, role props, and context before facial detail.",
    genderRule: "Use modest silhouette/context cues; avoid sexualized or stereotyped exaggeration.",
    interactionRule: "Shared object, gaze, or baseline must make the relationship readable before individual detail.",
  },
  objects: {
    rule: "Recognizable outer silhouette first; add only the internal details that disambiguate the object.",
  },
  scenes: {
    rule: "Use one primary subject plus two or three contextual cues; depth comes from overlap and scale, not texture.",
  },
  abstract: {
    rule: "Encode relation spatially with paths, boundaries, branches, repetition, contrast, or cause-and-effect; never depend on words or letters.",
  },
  accessibility: {
    rule: "Every asset requires a Chinese alt that states the visible scene and the teaching meaning.",
  },
  originality: {
    rule: "Do not copy, trace, remix, or mechanically transform any Koboyo path geometry. Learn only high-level composition and rendering grammar.",
  },
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalizeSvgText = (bytes) => Buffer.from(bytes).toString("utf8").trimEnd();
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const [wanweiManifest, gaokaoManifest] = await Promise.all([
  readJson(wanweiManifestPath),
  readJson(gaokaoManifestPath),
]);
const assetByEntryId = new Map(
  [...wanweiManifest.entries, ...gaokaoManifest.entries].map((entry) => [entry.entryId, entry]),
);

let previous = null;
try {
  previous = await readJson(referencePath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const previousByEntryId = new Map((previous?.entries ?? []).map((entry) => [entry.entryId, entry]));

const entries = [];
for (const selection of selections) {
  const asset = assetByEntryId.get(selection.entryId);
  if (!asset) throw new Error(`Missing source manifest entry: ${selection.entryId}`);

  const localFile = resolve(repoRoot, `app/public${asset.path}`);
  const localBytes = await readFile(localFile);
  const localSha256 = sha256(localBytes);
  if (localSha256 !== asset.sha256) {
    throw new Error(`Local hash mismatch for ${selection.entryId}: ${localSha256} !== ${asset.sha256}`);
  }

  const officialPageUrl = `https://koboyo.com/icons/${asset.slug}`;
  const officialSvgUrl = `https://koboyo.com/icons/svg/${asset.slug}.svg`;
  let sourceReceipt = previousByEntryId.get(selection.entryId)?.sourceReceipt ?? null;

  if (refreshSources) {
    const [pageResponse, svgResponse] = await Promise.all([
      fetch(officialPageUrl, { redirect: "follow" }),
      fetch(officialSvgUrl, { redirect: "follow" }),
    ]);
    const remoteBytes = Buffer.from(await svgResponse.arrayBuffer());
    const remoteSha256 = svgResponse.ok ? sha256(remoteBytes) : null;
    const localNormalizedSha256 = sha256(normalizeSvgText(localBytes));
    const remoteNormalizedSha256 = svgResponse.ok ? sha256(normalizeSvgText(remoteBytes)) : null;
    sourceReceipt = {
      checkedAt,
      officialPageUrl,
      officialPageStatus: pageResponse.status,
      officialSvgUrl,
      officialSvgStatus: svgResponse.status,
      remoteSha256,
      bytesMatchLocal: svgResponse.ok && remoteSha256 === localSha256,
      localNormalizedSha256,
      remoteNormalizedSha256,
      contentMatchAfterTrailingWhitespaceNormalization:
        svgResponse.ok && remoteNormalizedSha256 === localNormalizedSha256,
      licenseUrl: "https://koboyo.com/icons/license",
    };
  }

  if (!sourceReceipt) {
    throw new Error(`No source receipt for ${selection.entryId}; run with --refresh-sources --checked-at=YYYY-MM-DD.`);
  }

  entries.push({
    ...selection,
    headword: asset.headword,
    slug: asset.slug,
    width: asset.width,
    height: asset.height,
    path: asset.path,
    alt: asset.alt,
    sha256: localSha256,
    sourceReceipt,
  });
}

const categoryLabels = {
  people: "人物形态",
  objects: "物体",
  scenes: "场景",
  actions: "动作",
  abstract: "抽象关系",
};

let licenseReceipt = previous?.sourcePolicy?.licenseReceipt ?? null;
if (refreshSources) {
  const licenseResponse = await fetch("https://koboyo.com/icons/license", { redirect: "follow" });
  const licenseBytes = Buffer.from(await licenseResponse.arrayBuffer());
  licenseReceipt = {
    checkedAt,
    url: "https://koboyo.com/icons/license",
    status: licenseResponse.status,
    sha256: licenseResponse.ok ? sha256(licenseBytes) : null,
  };
}
if (!licenseReceipt) {
  throw new Error("No Koboyo license receipt; run with --refresh-sources --checked-at=YYYY-MM-DD.");
}

const manifest = {
  schemaVersion: "gaokao-frequency-svg-style-reference-v1",
  version: "koboyo-reference-2026-08-11",
  sourcePolicy: {
    selection: "Forty-eight representative icons selected one by one; this is not a bulk mirror.",
    licenseUrl: "https://koboyo.com/icons/license",
    licenseReceipt,
    usageBoundary: "Reference and supporting educational product content only; never redistribute as an icon library.",
  },
  styleContract,
  entries,
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const sections = Object.entries(categoryLabels).map(([category, label]) => {
  const cards = entries.filter((entry) => entry.category === category).map((entry) => `
    <article class="card ${entry.referenceRole === "boundary" ? "boundary" : ""}">
      <div class="number">${String(entry.order).padStart(2, "0")}</div>
      <div class="image-wrap"><img src="../../../../app/public${escapeHtml(entry.path)}" alt="${escapeHtml(entry.alt)}"></div>
      <div class="meta">
        <p class="sample">${escapeHtml(entry.sampleLabel)}${entry.referenceRole === "boundary" ? " <em>不要照搬</em>" : ""}</p>
        <p class="word">${escapeHtml(entry.headword)} <span>/${escapeHtml(entry.slug)}/</span></p>
        <p class="lesson">${escapeHtml(entry.styleLesson)}</p>
        <a href="${escapeHtml(entry.sourceReceipt.officialPageUrl)}">Koboyo source</a>
      </div>
    </article>`).join("");
  return `<section><div class="section-heading"><h2>${label}</h2><span>${entries.filter((entry) => entry.category === category).length} 张</span></div><div class="grid">${cards}</div></section>`;
}).join("\n");

const board = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Koboyo SVG 代表图板 v1</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", sans-serif; background: #f4f0e7; color: #161616; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 48px; }
    header { max-width: 1100px; margin: 0 auto 52px; }
    .eyebrow { margin: 0 0 10px; color: #7d3f25; font-size: 13px; font-weight: 750; letter-spacing: .16em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(34px, 5vw, 64px); line-height: 1.02; letter-spacing: -.04em; }
    header > p { max-width: 850px; margin: 20px 0 0; color: #5b5851; font-size: 17px; line-height: 1.7; }
    .contract { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 28px; }
    .contract div { padding: 14px 16px; border: 1px solid #c9c1b3; border-radius: 14px; background: rgba(255,255,255,.45); }
    .contract b { display: block; margin-bottom: 5px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
    .contract span { color: #5b5851; font-size: 13px; line-height: 1.45; }
    section { max-width: 1400px; margin: 0 auto 54px; }
    .section-heading { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 12px; border-bottom: 2px solid #161616; }
    h2 { margin: 0; font-size: 27px; letter-spacing: -.02em; }
    .section-heading span { color: #7d3f25; font-size: 13px; font-weight: 700; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
    .card { position: relative; min-height: 372px; padding: 18px; border: 1px solid #c9c1b3; border-radius: 18px; background: #fffdf8; overflow: hidden; }
    .card.boundary { border-color: #b86b4b; background: #fff8f2; }
    .number { position: absolute; top: 14px; right: 16px; color: #a59d90; font: 700 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .image-wrap { display: grid; place-items: center; height: 170px; padding: 8px 18px 12px; }
    img { width: 150px; height: 150px; object-fit: contain; filter: contrast(1.05); }
    .sample { margin: 0 0 3px; font-size: 16px; font-weight: 760; }
    .sample em { margin-left: 4px; color: #a2482e; font-size: 11px; font-style: normal; letter-spacing: .04em; }
    .word { margin: 0 0 10px; font-size: 13px; font-weight: 680; }
    .word span { color: #8a8479; font-weight: 500; }
    .lesson { min-height: 62px; margin: 0 0 12px; color: #5b5851; font-size: 13px; line-height: 1.55; }
    a { color: #7d3f25; font-size: 12px; font-weight: 700; text-underline-offset: 3px; }
    footer { max-width: 1400px; margin: 0 auto; padding: 24px 0 12px; border-top: 1px solid #c9c1b3; color: #6e685f; font-size: 13px; line-height: 1.6; }
    @media (max-width: 900px) { body { padding: 24px; } .grid, .contract { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  </style>
</head>
<body>
  <header>
    <p class="eyebrow">EQBank visual study · v1</p>
    <h1>48 张代表图，提取一个可持续的原创 SVG 子风格</h1>
    <p>这些样本覆盖人物、物体、场景、动作和抽象关系。它们用于学习高层视觉语法，不用于复制、描摹或机械变换任何 Koboyo 路径。Koboyo 本身包含多种表现形态；下方规则是题库自己的统一收敛。</p>
    <div class="contract">
      <div><b>Canvas</b><span>256 × 256；20–28px 安全区；64px 仍可读</span></div>
      <div><b>Rendering</b><span>currentColor 填充 path；负形留白；不使用 stroke</span></div>
      <div><b>Composition</b><span>一个教学义、一个视觉动词、最多三个辅助组</span></div>
      <div><b>Originality</b><span>不复制、不描摹、不变形参考 path，只学构图与表达语法</span></div>
    </div>
  </header>
  ${sections}
  <footer>来源：逐张 Koboyo 官方页面与官方 SVG；来源 URL、抓取日期、远端/本地 SHA-256 和授权页均记录在 gaokao-frequency-svg-style-reference-v1.json。此图板不是 Koboyo 图库镜像。</footer>
</body>
</html>`;

await mkdir(dirname(referencePath), { recursive: true });
await mkdir(dirname(boardPath), { recursive: true });
await Promise.all([
  writeFile(referencePath, `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile(boardPath, board),
]);

console.log(`Wrote ${entries.length} references to ${referencePath}`);
console.log(`Wrote reference board to ${boardPath}`);
