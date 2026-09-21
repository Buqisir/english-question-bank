# Paper 选区翻译 V1：Azure Translator 与持久缓存

> 状态：Draft / spec-only，未实现、未部署、未调用真实 Azure。
> Owner 需求与资料核对日期：2026-09-21。
> 仓库核对基线：`main@1c3fa75ee03110ae361d2aa38d1a18182f55410c`。
> 替代已关闭、未合并的 [PR #484](https://github.com/Buqisir/english-question-bank/pull/484)。不重开旧 PR，不继承旧方案的模型、接口或额度决策。
> 本次只新增本 Spec（内含实施顺序和验收）。实现、启用服务、付费调用、合并与部署不由本 Draft 自动启动。

## 1. 目标与已经确认的范围

老师在 Paper 卷面阅读时选中英文，在选区旁看到小操作条；**主动点「翻译」后**，在同一位置的小卡片查看语境中的参考译文。

```text
原生选中文字 → [翻译] → 小卡片「正在翻译…」→ 结果 / 错误及重试
             不调用翻译服务，不预翻整卷
```

这是网站内置的选区工具，不是浏览器扩展、整页翻译、聊天窗口或编辑器。翻译只是选区动作的第一项能力。

- 第一版：PC，英文 → 简体中文；支持单词、短语、半句、完整句、较长多句/多段文本。不是只查单词，也不是无限大小请求。
- 允许区域：Paper 卷面正文、题干、选项、听力卷面文字、七选五、完形、语法填空、写作材料、英文指导语及可选择的表格/分栏文字。
- 排除：导航/按钮等操作 UI、讲评栏、输入框、contenteditable、答案/解析附加层、隐藏听力原文、图片内部文字和其他页面。题干/选项中的可点击文字仍是可读内容，不能仅因具有 button/role 就排除。
- 选中只显示「翻译」；不显示尚未实现的高亮、收藏、生词本或 `…` 占位按钮。代码只留局部 action registry 与 selection snapshot 接口，不建设通用插件平台。
- 查词结果以语境译法为主，不铺陈词典义项、音标、发音、例句或解题。第一版不写生词本、不保存个人高亮、不记录个人查词历史。
- 不改变卷面、答案、讲评聚焦或 Print/PDF。翻译缓存是派生结果，不是 Canonical Paper、PaperAnnotation、Personal Analysis 或经过审核的官方内容。
- **不使用 DeepSeek，不走 completion runner/Agent，不消耗现有 DeepSeek 日额度，不自动回退到任何通用 LLM。**

## 2. 技术结论，以及必须纠正的假设

| 层 | V1 选择 | 边界 |
| --- | --- | --- |
| 选区 | 原生 Selection / Range / Pointer Events | 保留原生选择、复制与键盘操作 |
| 浮层 | React portal + `@floating-ui/react-dom` | 只新增定位依赖，不引入编辑器或完整 UI 框架 |
| 文本与句界 | 现有 Screen Consumption 的只读可见投影；服务端权威句界 | 局部映射，不新增公共 `data-paper-*` 协议 |
| 翻译 | Azure Translator Standard Text Translation，REST `api-version=3.0` | 固定 `en → zh-Hans`，plain text，非 Custom/LLM/预览版 |
| 服务 | 现有 Node ESM router + 原生 fetch + 输入/输出 schema 校验 | 独立 `server/paper-translation/`，不修改 AI transport |
| 缓存 | 页面有界内存 + 服务器有界内存 + SQLite 持久结果 | 只共享已授权的公共题库文本，按完整上下文键复用 |
| 并发 | 进程内 single-flight + 有界上游并发 | 不把同一窗口的并发首次查询重复送 Azure |
| 验证 | Node 行为测试、现有 Playwright、真实 Azure 小样本 | stub 不能证明翻译质量或真实词对齐行为 |

### 2.1 已核实的 API 边界

Azure v3 支持 `includeAlignment=true` 和 `includeSentenceLength=true`。但是官方 Translate 文档将 alignment 标为 **experimental**，它可能缺失、一对多、多对一或不连续；常见固定句也可能没有对齐。英 → 简体中文属于文档支持方向，**支持不等于每次可用，更不等于准确词义保证**。[S1][S2]

本次核对的 v3 请求合同没有独立的 `context` 字段。若发送「前一句＋当前句＋后一句」，三句全部属于 `Text`，都会被翻译并计入字符用量。批量数组里的不同 `Text` 是独立待译项，不能声称它们互为上下文。文档没有保证拼接相邻句一定改善跨句消歧；这是必须实测的产品假设。[S1][S3]

因此撤回前期讨论中的三个过强结论：

1. 不是「有 alignment 就能可靠抽出任意本文义」。局部映射必须保守验证，不可用时显示明确标注的句子/上下文译文。
2. 不是「前后句免费，只翻所选词」。V1 将完整窗口作为一项发送，窗口字符全部计量。
3. 不是「同一篇文章任何选择都只收费一次」。只有**完全相同的翻译窗口与配置**才能共享结果；相邻中心句、跨句范围或版本变化可能产生新键。

Azure F0 定价页列出每月 200 万免费字符；这是服务资源的字符额度，不是大模型 tokens 或用户数。F0 与 S1 是不同档位，不将 F0 额度写成 S1 自动抵扣，也不自动升级付费。当前价格页的 S1 金额随地区/账户动态呈现，本 Spec 不固定承诺每百万美元单价。[S4]

## 3. 接入当前仓库，不重写既有能力

以下路径是接入/验证依据；新模块名为计划，不表示仓库已有实现。

| 已有路径 | 本任务的使用方式 |
| --- | --- |
| `app/src/features/paper-browse/PaperBrowsePage.tsx` | 唯一 Paper host；挂载一套选区 controller 和 portal，保留题组/讲评原状态 |
| `app/src/features/paper-browse/paperBrowseFocusIntent.ts` | 在 `applyPaperSurfaceFocusIntent` 引发 scrollspy、activateGroup、selectLectureQuestion 之前仲裁 |
| `app/src/shared-ui/papersurface/PaperSurface.tsx` | 继续是受控 renderer，不加入 fetch、翻译业务或本地持久化 |
| `shared/papersurface/anchorKeys.mjs` | 复用已有 section/paragraph/sentence/question/option 锚点，不静默扩充冻结协议 |
| `shared/paper-canonical/consumerProjection.mjs` 与既有 surface adapters | 消费现有语义和可见顺序，不重新推断题目结构 |
| `server/paper-canonical/consumerRoutes.mjs` | 复用 `context.loadCanonicalConsumption({paperId, consumerId:'screen'})` 的版本/完整性边界 |
| `server/router/index.mjs`、`server/api.mjs` | 新增窄 route module、服务依赖注入及状态入口，不恢复网站导题 |
| `server/auth/auth.mjs` | 路由层使用现有身份解析与会话校验，不接收客户端 userId |
| `app/package.json` | 当前 React/React DOM 19；已存在 Playwright；尚无 Floating UI |

新增实现建议放在 `app/src/features/paper-browse/selection/`、`shared/paper-selection/`、`server/paper-translation/`；前端 HTTP client 放 `app/src/services/paperTranslation.ts`。可在实现时合并小文件，不要求为了目录形状制造抽象。

新 Spec 不把 ADR-0003 的预生成 curated annotation 改成即时生成注释，也不新增 reading/lecture mode。功能仅为 Paper host 的临时阅读工具；将来保存高亮/生词另定个人数据合同。遵循 `PRODUCT.md`、`CONTEXT.md` 与既有公共/个人边界。

## 4. 渲染与交互合同

### 4.1 两阶段、单实例、无布局改动

第一阶段是仅有「翻译」的小操作条；第二阶段由同一个浮层切换为 loading / result / error 卡片。不打开右栏、不跳页、不覆盖整屏、不挤压卷面。

视觉起点：继承网站 token；操作条自然宽度，卡片约 320px，受视口宽度减 24px 限制；最大高度取 360px 与视口 50% 的较小值。长译文内部滚动，英文自动换行。数字是首轮实现值，允许 Owner 视觉 QA 调整，不是已验收截图。

用 Range 的多行 rects 构造 virtual reference，锚在选择结束附近的可见行；采用 `inline`、`offset`、`flip`、`shift`、`size`，避免简单把跨行包围盒中间当锚点。Portal 位于卷面布局外，使用 fixed 定位策略；多滚动容器、缩放和视口边缘都须测试。[S5][S6][S7]

### 4.2 生命周期

```text
idle → selecting → toolbar → loading → result / error
                     新选择或关闭使旧会话失效
```

- selectionchange/pointermove 不请求翻译。有效选区稳定后显示工具条；空白选区和已排除区域不出现。
- 点击「翻译」使用已保存的不可变快照，不能等 button click 后再读可能已塌缩的选区。
- 再次选择、切卷、源版本变化、卸载、Escape、点外部或 Paper 滚动立即关闭/重置。卡片内部滚动不关闭；resize 可重新定位，锚点移出可见区域则关闭。
- 每次会话有 generation ID；取消旧请求还要丢弃迟到结果，不能仅靠 AbortController。旧译文不得出现在新选区旁。
- 工具条内的 pointer/focus 转移不能误关浮层；保留 Ctrl/Cmd+C 原文复制。不得在整个卷面 pointerdown 上 preventDefault。
- 加载和错误原位呈现；错误说明原因并提供手动重试，无循环自动重试。
- 工具条不抢走阅读焦点；支持键盘形成选择后进入按钮、Enter/Space 执行、Escape 关闭并恢复合理焦点。实现需验证 portal 的 Tab 顺序，不能只有鼠标能到达。
- 结果是非模态可交互区域，不标成 tooltip；状态用简短 live region，不反复朗读整段译文。所有控件有可见焦点，尊重 reduced motion；print 隐藏 overlay。

### 4.3 选区与点题互斥

选择手势必须在 host capture/ref 中记录，在提交 focus intent 前再次仲裁。有效拖选不能产生题组激活、讲评闪动、证据重播或自动滚动；下一次清空选择后的普通点击及键盘激活仍按原逻辑工作。

**双击的第一次 click 是独立风险。** 浏览器可能先触发一次普通 click，之后才生成双击选词；只在 pointerup 检查 getSelection 或只吞第二次 click 不足以保证互斥。

P1 必须用真实页面验证「可选择文字的鼠标 focus intent 暂存、第二次按下/形成选区后取消、单击确认后提交」的有限延迟方案。延迟值与目标浏览器/系统双击节奏一起记录，不能把任意固定 200ms 宣称为跨系统保证。只允许延迟相关鼠标意图，不拖慢键盘或独立操作按钮。若无法同时满足双击无副作用与普通点题可接受响应，保持功能关闭并报告具体冲突；不得自行删掉双击能力或改成所有正文单击不点题。

## 5. 文本来源与上下文：做出一个明确决策

### 5.1 只读来源投影

建立独立的 `PaperSelectionSource` 可见文本投影，输入是既有 Screen Consumption/已选定的兼容消费结果，而不是全页 innerText 或隐藏分析 sidecar。

投影包含：版本摘要、有序的语义流 stream、精确可见文本、文本节点/leaf 对应关系、硬边界。正文连续段落可以属于同一流；独立题干、每个选项、不同题组、指导语、表格单元格和独立分栏分别有边界。不把 A/B/C/D 选项拼成一个故事。

前端通过局部 DOM text-node 映射和已有锚点定位来源位置；服务端用同一只读投影规则重建文本并验证。具体 leaf key 可由现有 nodeId/语义路径生成，不能按 DOM 全局下标持久标识，也不能用 `indexOf(selectedText)` 定位重复单词。

`sourceRevision` 绑定被消费的源版本与投影版本。若现有 payload 没有足够的不可变版本标识，由投影摘要补足，不伪称已有字段。服务端必须验证来源、版本、流、边界、范围和文本完全一致；客户端不能提供任意 context、cache key、provider 或上游 URL。

数字/选项标识等必要可见内容要保留来源映射；排除隐藏答案、老师填入的答案、个人讲评及图像 alt 作为替代正文。完形/语法填空保留原空缺，不用答案补成完整句。若本轮选区跨入禁止区域，不静默抽掉它并翻译剩余部分。

### 5.2 窗口规则 `adjacent-v1`

**默认发送覆盖选区的完整句，前后各加一句（存在且在同一语义流内时）。不提供只送孤立词的隐式捷径，不额外扩展整段或整篇。**

1. 服务端用 `Intl.Segmenter('en', {granularity:'sentence'})` 对权威流文本切句，保存原字符范围。针对缩写、小数、引号和换段设回归样例；ICU/Node 版本影响需绑定 segmentation policy 版本。[S8]
2. 同一句内任意词/短语/完整句，使用固定 `W(i) = 前一句 + 第 i 句 + 后一句`。中心句固定，窗口不随选中了哪个词改变。
3. 连续跨句选择 `i…j` 使用 `W(i,j) = 前一句 + 第 i…j 句 + 后一句`，保留所选内容的完整范围，不重复添加中间上下文。
4. 跨独立语义流的选择按原可见顺序拆成多个 segment，分别取上下文、分别展示结果；不可假称它们互相提供语境。全部 segment 必须覆盖完整合法选区，不能只翻第一项。
5. 单个窗口作为一个 `Text` 发送；多个窗口可以批量发送，但只是节省 HTTP 往返，不减少所提交的字符计量，也不形成跨项上下文。
6. 在文章首尾等边界允许少于三句，返回 `contextCoverage:'boundary-limited'`。缺失内容不编造。超限不是「边界不存在」，不得悄悄丢掉前后句来装作完整上下文。
7. 前端即使使用本机 Segmenter 做预览，也不决定服务端缓存键或计费窗口；服务端重建结果是权威。

初始工程上限：选区合计 8,000 UTF-16 code units、所有窗口去重后合计 12,000 units、至多 32 个语义 segment，JSON body 128 KiB。上限内支持较长文本；超过则明确提示缩小选区，保留原生选择/复制，零上游调用、不静默截断。实施需核对实时 Azure service limits；旧 REST 概览和现行 service-limits 的请求上限存在差异，不能混用为同一个合同。[S3]

### 5.3 坐标与字符计数

EQB 内部范围统一为 **UTF-16、从 0 开始、左闭右开 `[start,end)`**。DOM offset、JSON offset、slice 和缓存投影保持一致。大小写、标点、空白及换行不因缓存命中率而擅自改变；确需规整时必须有版本化的双向 offset 映射。

Azure 的对齐示例使用包含末尾字符的 end index；适配器转换为 EQB 半开范围，不能直接拿原 end 做 JS slice。[S1] 本轮资料不足以证明所有非 BMP 字符情况下的计数单位；P0 要用 emoji/补充字符实测并锁定适配。未证实前含此类字符的结果停用局部切片，显示整段上下文译文，不猜偏移。

应用预算计数与 UI offset 是两个概念。初版可用提交文本的 UTF-16 length 作保守预留；这是上界式内部控制，不冒充 Azure 账单精确计量。空格、标点、前后句与已发送重试都进入预留计算；只配置一个目标语言。成功响应的 `X-metered-usage` 是上游提供的请求计量，可作为独立实测字段记录。[S1] 缺失时保留预留值；内部预算不因响应丢失而退款。若上游计量大于预留，补记差额并停止新增调用检查计数规则，不能静默放宽预算。

## 6. 结果如何映射，不把猜测包装成词义

### 6.1 响应层次

| `resultKind` | 使用条件 | 卡片文案 |
| --- | --- | --- |
| `aligned-fragment` | 词/短语通过保守局部映射校验 | 原文 +「本文参考译法」+ 对应中文，可展开所在句参考 |
| `selected-sentences` | 完整句/句段能可靠定位译文范围 | 所选内容的中文参考译文 |
| `sentence-context` | 无法可靠分离词义，但能定位其完整句 | 「未能可靠分离该词/短语的译文，先显示所在句」 |
| `window-context` | 句级映射也不可靠、或坐标单位未确认 | 「显示包含所选内容的上下文译文」+ 完整窗口译文 |

所有结果都明确是机器参考译文。单词优先短结果，但不能把上下文全句伪装成该词的中文释义；不编造词性、同义词列表或 confidence 分数。

### 6.2 保守映射规则

- 首先验证 Azure 结果数量/语言、文本长度及结构。alignment 和 sentLen 可为空；这不等于翻译 HTTP 失败。
- 解析 alignment 为区间对，验证整数、边界、非反向、无越界及字符边界。保留一对多、多对一、重排信息，不能预设一词一词顺序对齐。
- 局部结果要求选择覆盖完整词边界、选中的实词/词项均有映射、目标区间不与未选英文的词项混用，且最终为一个连贯区间。允许的仅空白/标点间隙需有确定规则与测试；不能用 `min(start)…max(end)` 将不相干中文一起吞入。
- 部分词选择、漏映射、跨边界的多对一、不连续译文或矛盾边均不输出裸「本文义」。回退到包含它的句子/窗口，并标明范围扩大。
- sentLen 不是万能对齐器。验证累计长度与源/目标文本吻合、源切点对应实际句界、数组配对满足已验证合同；不同分句数量、边界不一致或单位不明时不按数组下标硬配。
- 选完整句时优先句级投影；选词时可折叠展示原句供理解。不存在可靠句级映射则返回已有窗口整体，不自动再发一个孤立词请求。
- 不用 HTML span/notranslate 标签强行「保留上下文不翻译」：plain text 是本方案条件，官方对 HTML/阻止翻译方式有 alignment 限制。[S1]

这些检查降低错误映射风险，不证明机器翻译的语义正确。**单词功能是否够好由 P0 的正确率与覆盖率共同决定，不能靠全部降级为句子翻译宣称达标。**

## 7. Azure 调用与对外 API

### 7.1 固定上游合同

```http
POST https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=zh-Hans&textType=plain&includeAlignment=true&includeSentenceLength=true
Content-Type: application/json; charset=UTF-8
Ocp-Apim-Subscription-Key: <server secret only>
Ocp-Apim-Subscription-Region: <when required by the configured resource>
```

```json
[
  {"Text":"The road was closed. They had to address the problem. Work began that afternoon."}
]
```

示例为自写文本，不是真实 Azure 结果。认证与 region 使用实际资源要求，不复制密钥到文档/前端/日志。[S9] endpoint 仅由服务端受控配置选择，拒绝客户端覆盖；默认使用明确的官方域名，禁止跟随到未允许主机的重定向。不引入 Azure SDK、Dictionary、Custom Translator 或自动语言检测调用。

### 7.2 EQB 路由

新增 `GET /api/paper-translation/status` 与 `POST /api/paper-translation/translate`，不复用旧 PR 的 `/api/ai/translate-selection`，不改变 `/api/ai/status` 含义。

状态返回 `enabled`、`canRequestNew`、`reason`、版本和本功能上限；不返回密钥、其他用户记录或 Azure 账户细节。状态读取不调用 Azure。进入 Paper 时随页面加载读取一次状态，不在选区移动时轮询。`canRequestNew:false` 不等于工具完全不可用：cache-only 时仍允许点击查询已有缓存；只有 hard-off 才隐藏动作。

POST 请求形状如下；ID 和摘要是示意占位值，不是现有真实数据：

```json
{
  "schemaVersion":"paper-selection-request-v1",
  "paperId":"paper-example",
  "sourceRevision":"sha256:example-source-revision",
  "segments":[
    {"streamId":"group-example/passage/body","start":33,"end":40,"selectedText":"address"}
  ]
}
```

服务端不信任客户端文字：先鉴权/确认 paper 可访问，再解析 Screen 来源并逐段核对。正则限制 paperId 不足以替代消费完整性检查。新译文和缓存命中都走同一访问控制；不得提供可绕过 paper 授权的「按 hash 取缓存」端点。

响应带 `requestId`、同一 `sourceRevision`、按输入顺序排列的 `results`；每项至少包含 `segmentIndex`、`resultKind`、`selectedText`、`displayText`、`contextCoverage`、`notice` 与 `cacheDisposition`。句子/窗口回退还必须带明确的展示原文范围；不能让前端误以为 displayText 精确对应选词。

持久层存完整窗口结果；V1 对浏览器只返回本次展示所需内容，**不把全局缓存/原始 Azure 响应整体下发**。页面内存按 selection+revision+projectionVersion 复用已展示结果；不同选区的共享窗口复用由服务器负责。这比浏览器再实现一套 alignment 解析更轻，也避免客户端投影与服务端分叉。页面缓存初始限制 128 项或 2 MiB，退出登录、切用户、切卷、版本变化及 hard-off 时清空；不能将其写入 localStorage。只更新结果投影规则时增加 projectionVersion 并用已缓存窗口重新投影，不必重新付费翻译。

多段请求：预检全体输入与额度后才发新的上游调用；返回完整有序的每段成功/失败结果，顶层 `partial:true` 明示部分成功。不得只展示已成功的段落而无缺失提示；手动重试只补失败段，成功窗口走缓存。若预算预检不足，本次不派发任何新窗口，但仍返回合法缓存命中；其余逐项标记预算不足。有至少一项成功时用 200 + `partial:true`，全无可用结果时才用对应 429/503；格式、来源或权限整体失败始终先拒绝，不夹带缓存内容。

| 情况 | HTTP/业务处理 |
| --- | --- |
| 格式错误、空选择、非法 range | 400，零上游调用 |
| 未登录/无权限 | 401/403，先于缓存及 Azure |
| paper 不可访问/不存在 | 沿用现有资源策略，不泄漏其他用户内容 |
| 源版本变化、来源不一致 | 409，要求刷新/重新选择，不自动翻旧文 |
| 超过工程上限 | 413，清楚提示，不部分截断 |
| 单人/全局速率、并发或字符预算不足 | 429 + 可用的 Retry-After/原因；预算不足时已缓存窗口仍可读取 |
| 关闭、缺配置、预算账本不可用 | 503；可安全命中的结果按开关策略读取 |
| 上游错误/格式异常/超时 | 502/504；安全错误文案，不透传密钥或原始响应 |

所有结果响应设置 `Cache-Control: private, no-store`，不让 CDN/代理把会话响应当公共缓存；应用内显式有界缓存不受此否定。纯文本渲染，禁止 dangerous HTML 插入。

## 8. 强缓存与 single-flight

### 8.1 缓存键

服务器根据**实际提交的精确窗口和配置**计算 SHA-256；使用确定性序列化和结构字段，不用容易碰撞的字符串拼接。

```text
key = SHA256(stableJSON({
  accessScope, provider: "azure-translator", apiVersion: "3.0",
  from: "en", to: "zh-Hans", textType: "plain", category: "general",
  providerConfigVersion, providerEpoch,
  sourceProjectionVersion, segmentationVersion, contextPolicy: "adjacent-v1",
  boundaryRoles, sourceText
}))
```

不把 selectedText、具体选区 offset 或 userId 放入可共享窗口结果键；它们属于各自响应投影。公共题库的相同窗口可跨授权用户复用；同词不同语境不能命中。私人资料未来必须使用不同访问域，不因文本相同就共享。

paper/sourceRevision 参与来源验证与引用，但不强制把 paperId 塞入内容寻址键而失去合法跨卷复用。源变化后重新验证并计算窗口，不能按旧 sentenceId 硬命中。Azure 内部模型版本不保证可固定；`providerEpoch` 是应用手动失效策略，不是声称锁定 Azure 模型权重。

### 8.2 持久记录与淘汰

`translation-cache.sqlite` 存 `key`、精确源窗口、完整译文、原始 alignment/sentLen、结构校验后的状态、provider/config/version、createdAt、lastAccessedAt 与 payloadBytes。无 alignment 的合法翻译也缓存，避免每次重查同一无对齐句。

结果库只保存可重新生成的数据，不保存用户 ID、个人查询历史、答案或收藏。它位于稳定可写数据目录，不能在版本化 release 目录或 app/public 内；部署升级不得用空文件覆盖。题库 SQLite、user-data SQLite 和 Canonical Publication 不存翻译结果。

不设置每天/每周自动过期；通过明确版本/epoch 更新、定向失效及容量淘汰管理。初始上限建议 50,000 条或 128 MiB payload（先到者），内存结果上限 10 MiB。SQLite 页/WAL/索引有额外空间，payload 上限不是文件总大小保证；实施要约束 WAL、定量巡检实际大小与有界 LRU 清理，不把全库加载到内存或在请求热路径 VACUUM。

结果库缺失可以重建；损坏先记录并隔离后重建，不修改其他库。上游错误不当成成功缓存；短时熔断错误单独有界保存。不得缓存前端上传的所谓 Azure 结果。

### 8.3 首查合并与取消

流程：身份/来源检查 → 页面/服务内存或 SQLite 结果命中 → in-flight 合并 → 预留额度 → Azure → 校验 → 持久写入 → 各选区独立投影。

同一个 key 在第一个 await 前完成 claim；SQLite 唯一键只防重复写，不能代替请求合并。批量 miss 先 claim 每个新键，已经 in-flight 的只订阅已有 Promise，再将本次拥有的键组成批次。窗口级共享不能共享某个用户专属的选区输出。预留/批次创建失败须释放本次 claim 并让全部订阅者得到有界错误，不能遗留永久 pending Promise。

一个订阅者关闭卡片只取消自己的等待，不能终止仍被其他用户依赖的上游请求。多个 key 合成一个 HTTP 批次时，取消必须检查批次内所有 key 的订阅者，不能因为一个 key 无人等待就 abort 整批。所有订阅者都离开时可取消网络；已发出的请求仍保守计入用量，不能承诺 abort 会撤销收费。上游已经成功时允许缓存窗口，但不重新打开任何卡片。

V1 明确支持单个 EQB Node 服务进程；single-flight 不跨进程/机器。实施启用前确认部署拓扑；未来多实例需要共享协调，不能声称当前 Map 能做到全站唯一调用。

## 9. 费用保护、权限和运行配置

### 9.1 结果缓存与预算账本分开

**可删除缓存不等于可删除用量。** 用独立、小型 `translation-usage.sqlite` 记录本功能预算周期、已预留/已派发字符及尝试状态；它不是个人查词历史，也不是可重建缓存。两个 SQLite 文件不增加常驻服务或 Redis 依赖。

账本事务先预留再发送，网络等待期间不持有数据库事务。发送前确定取消可释放预留；已派发、超时或结果未知保守保留计数。进程崩溃遗留预留按已消耗对待，不能重启清零。幂等 receipt 区分 reserve/dispatch/settle，防重复扣算和超额并发穿透。

预算按应用 UTC 自然月控制，且**不假定这个周期等于 Azure 资源计费/刷新周期**。首次启用必须核对资源档位与已有使用量；建议专用 F0 资源。首次账本初始化是明确启用动作；启用后账本丢失/损坏，禁止新上游调用直到核对恢复。清结果缓存、发布新版、回滚代码不能重置账本。

### 9.2 初始保护值与失败策略

初始建议：每月应用预算 1,800,000 字符预留量；单用户 20 次 API 请求/分钟、突发 5；全局新译文 20,000 预留字符/分钟、token bucket 容量至少 12,000；最多 4 个 Azure HTTP 请求并发、64 个在途窗口，无无限队列。命中缓存不扣字符预算，但仍受基本防滥用速率控制。这些是可配置安全默认值，不是实际性能承诺或 Azure 本身限制。

上游 deadline 初始 10 秒；V1 不自动重试付费请求。429 尊重 Retry-After，网络/5xx 提示手动重试；重试重新检查缓存和预算。401/403 或持续异常触发短期熔断，不能反复刷错误配置。

达到预算时进入 cache-only：已有结果继续读，miss 提示暂不可新增翻译。整个 feature hard-off 时工具条/端点都关闭。不得因预算不足自动改走 DeepSeek、自部署模型、未公开免费 API 或收费 S1。

### 9.3 身份、隐私及配置

- 沿用会话身份；enforced 模式未认证请求先拒绝。现有 bootstrap-open 返回 local 身份不意味着允许公网免费翻译代理：本功能默认关闭；无登录模式只能在显式本地开发配置中使用，部署启用应要求 enforced。
- 路由执行同源/CSRF 防护、Content-Type 与 body 上限，复用现有可信 origin 配置；不新增 auth whitelist、不信任客户端 userId/IP 转发头作为授权。
- 服务端重新计算窗口、拒绝任意文本代理与非法来源；不带隐私答案/个人讲评到 Azure。卡片说明使用 Microsoft Translator 的机器参考译文，产品隐私说明需覆盖实际发送的可见源窗口。[S10]
- Key/region 只在服务器配置；建议 `QUESTION_BANK_PAPER_TRANSLATION_ENABLED`、`AZURE_TRANSLATOR_KEY`、`AZURE_TRANSLATOR_REGION` 及稳定数据路径/预算参数。它们是新配置建议，不声称生产已存在。
- 不记录原文、密钥、译文或个人查询轨迹到日志；只记录 requestId、安全错误码、耗时、预算字符与聚合 cache/fallback 指标。不得趁本轮建设难词热力图/学习分析。
- 缺 key 或预算设施时页面其余功能照常工作，不改变现有 AI 可用性或整站启动规则。

## 10. 实施顺序与停止条件

### P0：先验证 Azure 是否真的适合这个产品

用同一套 100 个代表性案例评估：50 个语境多义词、20 个短语/习语、20 个句子、10 个跨句/结构化选区。选择已有可合法使用的真实 Paper 片段与自写边界文本；不把整套私有题文复制进新报告。每例记录来源版本/选区、参考含义、实际输入窗口、上游字符、alignment/sentLen 是否可用、最终展示类型、人工正确性与耗时。

对同一目标做「所在句」与「完整句＋相邻句」小规模对照，只用于验证上下文收益/退化和计量，不在产品偷偷切策略。包含重复词、否定、指代、phrasal verb、多对一、不连续对齐、固定短句、空缺、Unicode 和无对齐样例。

初始上线目标（不是本 Spec 已取得的成绩）：词/短语可用局部结果覆盖率至少 80%；已输出局部译文的人工语境/映射正确率至少 95%；句段至少 90% 语义可接受；严重错对应、漏段、答案泄露在回归集为 0。延迟分别报告冷/热 p50、p95，不以厂商典型值冒充从 EQB 服务器的测量。

**P0 是默认启用的阻塞条件。** alignment 不稳定、三句方案质量不足或局部结果大量降级时，保持关闭、提交实测差距并调整 Spec；不把显示整句的 fallback 当成完成查词目标，不默默加 LLM。真实 Azure 测试需获得明确的测试凭据/费用授权；本次文档任务不执行。

### P1：选区工具条与点击仲裁

先实现静态工具条与假响应，证明拖选、双击、普通点题、键盘、跨行、滚动、视口避让均符合 §4。这里零 Azure 调用，不等后端完成后才发现交互冲突。若 double-click 仲裁需改变现有点题语义，先报告，不自行扩范围。

### P2：来源投影、完整窗口与区间适配

建立只读投影及双端一致性测试；覆盖当前 Paper 各题型、写作、表格/分栏、来源修订、重复词与空缺。不修改 Canonical 的语义，不把 DOM 当内容权威。用录制/合成响应验证保守 alignment 和句界投影。

### P3：Azure adapter、缓存和预算

新增独立 routes/services、两个隔离 SQLite store、single-flight、schema 校验、速率/deadline/预算/日志策略。先以 provider stub 验证真实 HTTP 边界和真实临时 SQLite，不用纯内存 fake 代替持久化测试；再在授权范围内执行 P0 的真实 API 检查。

### P4：端到端与默认关闭发布候选

连通两阶段浮层、缓存命中、错误/取消/部分成功；带 feature flag，验证禁用时无新增翻译请求且现有 Paper 行为保持。生成 Owner QA 的准确 URL、试卷/账号和初始状态，进行真实页面交互验收。

### P5：实现 PR 的最终门

按实际 changed paths 运行分类器和窄验证；持久化、鉴权和共享 Paper 风险遵循 `AGENTS.md` 的更强门：相关 public-seam/security 检查、最终 verify:all、E2E 及独立 Standards/Spec review。若实际触及 shared renderer，还需受影响的 Screen/Print/PDF 证据；不能以「只加浮层」掩盖共享改动。

测试、审查、合并和生产启用各自必须有真实证据。这个 spec-only PR 不运行实现任务、不部署、不设置 Azure 账户或生产 Secrets。

## 11. 最小验收矩阵

| ID | 必须证明的行为 |
| --- | --- |
| A01 | 只形成选择、移动/取消选择时零 Azure 调用；首版只有翻译动作 |
| A02 | 正向/反向拖选、双击取词不触发点题副作用；普通点击、键盘点题仍有效 |
| A03 | 鼠标点工具条、Tab/Enter、复制不会丢选区或误关；Escape 正常收尾 |
| A04 | 多行、缩放、各视口边缘不溢出；Paper 滚动关闭、卡片内部滚动保留；print 不含浮层 |
| A05 | 所有已列入题型/区域可翻；同一词多次出现时 offset 精确；隐藏/个人/答案文本被排除 |
| A06 | 首尾边界、缩写、跨句/跨段、跨语义流分别按 §5 处理；无编造上下文、无漏段 |
| A07 | 文本/版本/stream/range 篡改失败且零上游调用；Canonical 消费失败不回退原始资产 |
| A08 | 对齐为空、一对多、多对一、不连续、部分词、越界和非 BMP 均按明确规则处理，无硬抽取 |
| A09 | sentLen 错配/缺失不硬配句；扩大展示范围有明确标签，不冒充本文义 |
| A10 | 同中心句不同选词共享一个窗口调用；不同语境/版本/配置按正确键失效 |
| A11 | 30 个同窗口并发 miss 只派发一次；批量重叠窗口正确 claim，不重复写/发 |
| A12 | 一个用户取消不取消其他等待者；迟到结果不覆盖新卡片；所有人取消不抹掉已派发用量 |
| A13 | 进程重启仍命中持久缓存；清结果库、代码升级/回滚不重置预算；账本丢失 fail closed |
| A14 | 预算边界并发不超额；超时/未知结果保守计量；cache-only 命中可读、miss 清楚失败 |
| A15 | 401/403、429、5xx、超时、坏 JSON、磁盘满/只读/锁冲突有界处理，不拖垮整页 |
| A16 | 未授权请求即便知道 cache key 也不能取内容；同源/CSRF/长度/SSRF/XSS 检查通过 |
| A17 | 多段部分失败清楚展示并可重试；限额预检不静默截断或自动拆成无界收费循环 |
| A18 | P0 真实 API 的局部覆盖率/正确率、句段质量和冷/热延迟有证据；未通过不能默认启用 |
| A19 | feature off 无新增翻译行为，现有讲评/组卷/Print/PDF 与其他 AI 额度回归通过 |
| A20 | 源/译文不进敏感日志，无个人查词历史；依赖精确锁定、缓存空间与清理有实测 |

## 12. 本次文档交付与证据边界

本次只读核对 main、关闭的 #484、Paper focus intent、Node router 接入、鉴权与 Screen Consumption 入口、前端依赖及相关产品/ADR 指南；核对官方 API/定位资料。仓库没有因此安装依赖、改变 DB、修改运行代码或增加真实 Azure 用量。

文档可检查项：Markdown/code fence 结构、JSON 示例可解析、决策/验收覆盖、链接与最终 PR diff 仅包含本文件。机器 changed-path 分类器、build/lint、完整 verify、Playwright、独立实现审查及真实翻译评测若未执行必须标 `SKIP`，不可把 Spec 的验收条目写成 PASS。

实施前重查最新 main 漂移和相关目录局部指令。本次未确认生产 Azure 档位、密钥、账单、网络延迟、服务器并发能力或可写路径；这些属于后续明确授权的启用检查，不影响先审阅本 Draft。

## 13. 官方资料（核对于 2026-09-21）

- [S1] [Azure v3 Translate：参数、对齐的 experimental 限制、句界与示例](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/translate)。公开合同和限制，不是 EQB 质量测试。
- [S2] [Azure word alignment](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/how-to/word-alignment)。说明空映射与非连续映射；不同文档的语言集合表述并不完全一致，本方案仅使用双方覆盖的 en→zh-Hans。
- [S3] [Azure Translator service limits](https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits)。计量/实时请求限制；不把每小时吞吐上限当每月免费额度。
- [S4] [Azure Translator pricing](https://azure.microsoft.com/en-us/pricing/details/translator/)。F0 200 万字符/月；S1 需按资源/账户核价。
- [S5] [Floating UI React](https://floating-ui.com/docs/react)。只需定位时可用 react-dom 包；实际依赖版本、React 兼容性与 bundle 增量留在实现 PR 验证并锁定。
- [S6] [Floating UI virtual elements](https://floating-ui.com/docs/virtual-elements)。Range virtual reference。
- [S7] [Floating UI inline](https://floating-ui.com/docs/inline)。多行 reference 定位。
- [S8] [ECMA-402 Intl.Segmenter](https://tc39.es/ecma402/#segmenter-objects)。句界工具，不提供翻译语义保证。
- [S9] [Azure Translator authentication](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/authentication)。密钥/region 与实际资源配置。
- [S10] [Microsoft Translator confidentiality / No Trace](https://www.microsoft.com/en-us/translator/business/notrace/)。服务方处理边界；EQB 自建缓存的留存与授权仍由本产品负责。
