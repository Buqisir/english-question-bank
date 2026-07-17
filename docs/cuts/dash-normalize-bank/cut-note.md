# dash-normalize-bank cut note（small-medium 数据刀，主代理直做 + CR-lite）

2026-07-17。出处：dash-optionbank-gate 挂账第 1 条（owner 圈定
「继续全库破折号批修」）。范围：全库 33 卷 asset（latest/ 下
paper-asset.json + analyses/*.json，排除 raw/listening/figures 原料）
+ 本地 DB（passages.material_text / questions.stem / options.content）。

## 关键事实（与预想不同的两条）

1. **「英文 em-dash 全带空格」规律在全库不成立**：2026-i 之外扫出
   116 个唯一无空格位点（含复刻件源头就写错的字符——回源 raw docx
   对证实锤：`fur—coat—wearing` 等源卷本身如此，非导入损伤；按标准
   v2「源卷邋遢产品不复刻」归一之）。
2. 判定升级为**三类判法**（116 位点逐个人判，主代理语言学裁决）：
   - **H 复合词连字符** 13 组：fur-coat-wearing / full-body / off-set /
     Cattle-raising / naturally-grown / 14-year-olds / two-parent /
     ice-free / fast-flowing / cure-all / decision-making / high-level
     （em-dash → 「-」）
   - **R 区间** 4 组：1756–1823 / Monday–Saturday / 10:00–17:45 /
     £12–£96（en-dash **不加空格**，排印惯例，标准 §7 未覆盖此类，
     按金样卷精神裁）
   - **D 从句破折**（默认类，~100 位点含成对插入语、半空格变体
     `(草坪) —and`、NBSP 邻接、挖空标记邻接 `—__61__`、串尾悬挂
     `recommend —"`）→「 – 」
   中文讲评语境全角「—/——」一律保留（机器规则：任一侧 CJK 即不动）。

## 实施

工具 `scripts/normalize-dashes.mjs`（幂等；`--db-only` 供生产；
`--dry-run` 报数）。本地已应用：asset 65+10 文件、DB 109+10 行。

## 验证（全部实跑）

- 残留扫描：asset + DB 非中文邻接 em-dash/`--` **双双归零**；重跑
  dry-run 零变化（幂等铁证）。
- quote/targetText includes() 契约：改动前后断链数**恒等 2240**
  （该数为检查器天真的既有噪声——写作/完形引用不指向阅读正文；
  本刀零新增断链）。
- `verify-r2-trap-audit` 重算：45/1 与改动前**逐项一致**（scan-findings
  byte-for-byte 复算过——机审对破折号不敏感实证）；唯一 FAIL 仍为
  本机 versions/ 陈账（CI 恒绿，见 dash-optionbank-gate 挂账 2）。
- `verify:all` 83 PASS / 1 FAIL（同上唯一陈账），与改动前基线一致。

## 生产同步

代码/asset 随 git 部署；DB 在生产跑
`node scripts/normalize-dashes.mjs --db-only`（先备份）。
