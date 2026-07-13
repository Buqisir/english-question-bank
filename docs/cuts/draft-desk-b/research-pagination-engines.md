# 分页引擎选型外部调研（CSS Paged Media / Vivliostyle / paged.js / Puppeteer）

- 日期：2026-07-12
- 用途：刀B parity「路③ 换强引擎」方向拍板的外部知识证据（配 `tech-recon.md` 项目内事实）。
- TL;DR：① 我们原担心的「换引擎丢排版保真」**基本不成立**——试卷真正需要的保真
  （`break-inside:avoid` 题目不被切开、静态页码）浏览器原生 + paged.js 都有；② 唯一
  别处没有、只有 paged.js/Vivliostyle 独有的是**动态** running header（页眉显示当前第几
  大题），而试卷不需要它；③ paged.js 是**架构上唯一从根上解决 parity** 的现成范式
  （预览与出片共享同一次分页），但不是银弹（稳定性/复杂布局/大文档不如 Vivliostyle，
  parity 承诺要锁渲染环境，嵌入式预览有样式泄漏坑）。

## 1. CSS 分页保真特性——谁原生有、谁独有

| 特性 | 浏览器原生 | 只有 paged.js/Vivliostyle 才有？ |
|---|---|---|
| 孤行寡行 `orphans`/`widows` | **Chrome/Safari/Edge 原生有**（Firefox 无，全球 93.6%） | 否 |
| `break-inside/before/after` | 全浏览器原生（最老最广） | 否 |
| 静态页码 `@page` + `counter(page)` / margin box | **Chrome 131+（2024-11）、Safari 18.2 原生有**（Firefox 无） | 否（认知更新：不再专属） |
| 动态 running header `string-set`/`position:running()` | **都不支持**（Chrome 131 仍缺，单独立项 [issue #376420244](https://issues.chromium.org/issues/376420244)） | **是——唯一壁垒** |
| 页面平衡 balance-all | 无浏览器实现 | 规范本身只是弱启发式，无人给标准答案 |

来源：[MDN widows](https://developer.mozilla.org/en-US/docs/Web/CSS/widows)、[caniuse](https://caniuse.com/css-widows-orphans)、
[Chrome print-margins blog](https://developer.chrome.com/blog/print-margins)、
[Vivliostyle 支持表](https://docs.vivliostyle.org/en/reference/supported-css-features/)、
[W3C CSS Fragmentation L3](https://www.w3.org/TR/css-break-3/)。

## 2. 「外部定断点 + 引擎排页内」混合模式成立吗

**成立，是出版业标准范式**（书籍：每章强制新页 + 章内自动流排 + 孤行寡行/页眉照常）。
CSS 规范里强制断点（class A break point）只覆盖它声明的那个位置，孤行寡行（class B）、
页级计数器/margin box 判定完全独立、并存不互斥（[CSS Fragmentation L3 §4.3/4.4](https://www.w3.org/TR/css-break-3/)、
[CSS Paged Media L3](https://www.w3.org/TR/css-page-3/)）。
**程度代价**：强制断点越密集（≈把 JS 预览的每个分页决策都翻译成显式断点），越是把引擎的
排版判断力让渡给我们的 JS 测量——JS 高度/字体度量若与引擎渲染对不上（连字、字体加载时机、
亚像素取整），断点可能落在引擎本不会选的糟糕位置。**风险从「页边界不一致」转移到「断点贴不贴合渲染」**。

## 3. parity 三方案对照

- **(a) Puppeteer/headless Chrome `page.pdf()` 直出**：保真尚可（Chrome 131+ 原生特性变多），
  **但天生无 parity**——直接拿 DOM 走浏览器打印管线，分页由 Chrome 打印引擎独立决定，跟自研
  屏幕预览两套实现，天然分叉（正是现状痛点）。坑：headless 与有界面 Chrome 打印路径不一致
  （[实测博文](https://andre.arko.net/2025/05/25/chrome-headless-print-to-pdf/)）。
- **(b) paged.js**：Chunker 把内容切页 + Polisher 转 `@page`/running/计数器 + Previewer 渲染；
  **同一份改写后 DOM 既做屏幕预览、又直接出 PDF** → 架构上唯一从根消除「两套实现」的方案，
  不是凑两套一致（[How it works](https://pagedjs.org/en/documentation/4-how-paged.js-works/)）。
  覆盖孤行寡行 + running header + 脚注 + TOC + 书签。CLI 出 PDF = [pagedjs-cli](https://github.com/pagedjs/pagedjs-cli)（底层封 Puppeteer）。
  **代价**：① 官方自认规范有含糊处、按己解读实现，parity 承诺前提是「同浏览器同 OS」；
  ② 稳定性/规范覆盖不如 Vivliostyle（复杂 CSS、170页/14MB 大文档性能、脚注编号不全准，
  [issues](https://github.com/pagedjs/pagedjs/issues)）；③ **嵌入式预览已知坑**：`@media print`
  样式全局应用会泄漏污染页面（[issue #219](https://github.com/pagedjs/pagedjs/issues/219) 未修）
  ——**若我们预览是 iframe 隔离则规避**（待项目内确认）。
- **(c) Vivliostyle**：一次性独立重排引擎（自带 CSS 级联实现），保真/规范覆盖三者最强，
  **但与 parity 背道而驰**——它就是「两套独立实现」里的那一套（现状）。

## 4. 对试卷排版，这些特性到底多重要

- **`break-inside:avoid`（题目整块不被切开）= 真正 load-bearing**：一道选择题被切开是可用性/
  完整性问题，远重于孤行寡行（美观度）。LaTeX `exam` 社区的核心诉求也是「题干+选项不被分页切开」。
- **静态页码 = 流程正确性**（考试装订/阅卷依赖页序），权重高于一般文档；门槛低（原生 CSS 计数器即可）。
- **孤行寡行**：对阅读理解正文有意义，但优先级让位于上两者。
- **动态 running header = 锦上添花**，试卷靠题号定位、非刚需——而它恰是唯一「必须靠 paged.js/
  Vivliostyle」的特性。**是否为这一个特性负担引擎复杂度，值得单独掂量（倾向：不需要）。**

## 综合结论（对路③）

1. 「换引擎丢保真」的顾虑**大部分消解**——试卷需要的保真浏览器原生/paged.js 都有，前提是渲染
   路径锁同一够新 Chromium。真正会丢的只有动态 running header 一项，而试卷不需要。
2. paged.js **确实是最贴合「既 parity 又保真」的现成范式**（owner「强轮子」直觉方向正确），
   值得认真做一次原型，但**不是免代价银弹**：稳定性、环境锁定、嵌入式样式泄漏三个坑要项目内验。
3. **新浮现的命门风险（比"重"重要）**：预览在老师浏览器跑、导出在服务端 pagedjs-cli 跑 = 同引擎
   **两次分页**。paged.js 的 parity 承诺要「同浏览器同 OS」，而老师浏览器/OS 五花八门、服务端固定
   Linux headless——两次跑能否收敛成真正「一个真源」，是路③能不能成立的关键，**待项目内调研 + 原型实测**。
