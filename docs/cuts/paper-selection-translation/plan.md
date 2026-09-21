# Paper 选区工具条：实施与验收计划

> 状态：Draft / 未开始实施。
> 需求与技术权威：[spec.md](spec.md)。核对基线：`1c3fa75ee03110ae361d2aa38d1a18182f55410c`。
> 本 PR 只增加本文件和 spec；不安装依赖、不修改运行时代码、不调用付费模型、不部署。
> 以下步骤是 Owner 后续明确启动实施时的计划，不是自动派发、自动合并或部署授权。

## 1. 总体方案

```text
PaperBrowsePage（唯一 host）
  ├─ 原来的 PaperSurface / 写作等卷面内容：保持原渲染职责
  └─ PaperSelectionController
       ├─ 原生 Selection / Range + host 手势仲裁
       ├─ 局部文本/上下文快照
       ├─ SelectionToolbar（第一版只有「翻译」）
       └─ TranslationPopover（Floating UI 定位 + React portal）
              ↓ 仅用户点击后
       POST /api/ai/translate-selection
              ↓ 鉴权 / 来源权限 / 输入限制 / 速率限制
       selectionTranslationService
              ↓ 同一 completion runner 与每日额度入口
       DeepSeek deepseek-flash / thinking disabled / JSON
```

前端只计划新增 `@floating-ui/react-dom` 这一项直接运行时依赖；服务端依赖、数据库和基础设施不扩张。上下文提取、取消、限流和输入/输出检查需要代码，但不因此建立通用 Agent 或插件平台。

## 2. 实施前核对

从实施时最新 `origin/main` 建立独立 task branch/worktree，读当时的 AGENTS、目录局部约束及本 spec，检查这些基线是否已变化：

- PaperBrowsePage 的题组 DOM、写作卷面、lecture focus 与 scrollspy 调用顺序。
- `applyPaperSurfaceFocusIntent` 的副作用；其它直接激活题组的点击路径是否绕开它。
- PaperSurface 的真实 HTML：题干/选项可能是可点击内容，不能整体排除 button。Canonical 阅读表格/分栏与写作未必都有句子锚点。
- 同一个 completion runner 的实例、额度计数注入和现有 key fallback；不要改用导题专用 `callDeepSeekJson` 绕过网站额度控制。
- `deepseek-flash` 的模型名兼容、服务端可配置性、输出解析和超时处理。翻译显式指定模型，不改全站默认值。
- 现有 router 的身份/同源/错误处理入口及前端 HTTP client 的同源寻址与凭证处理，复用实际 exports，不假造新的平行网络层。

禁止用生产 DB、R2、真实学生数据或公网写入做开发测试。只读取源代码不构成运行验证；只加载文档不构成模型质量验证。

## 3. 依次实施的工作包

### P1 — 先证明选区与点题不冲突

**目标：**先做真实 Paper 上的前端垂直切片，暂时没有模型请求。

- 建立 Paper host 可读区注册/识别，覆盖正文、题干、选项、写作、表格；导航和讲评栏不注册。使用局部 wrapper/ref 或现有锚点，不改公共 anchor protocol。
- 实现单一 `usePaperSelection`，保存原生 range、文本、手势状态和 generation；selectionchange 只负责状态，不发翻译。
- 在 host 的 capture / focus-intent 入口仲裁。同一选择手势的点击必须在 activateGroup、suppressScrollspyClear、selectLectureQuestion 之前被截住。
- 接入最小工具条和同位置的静态译文 fixture；Floating UI 安装并记录确切 lockfile 版本、React peer compatibility、构建增量，不报告未经实测的 kB 数字。
- 保留原生复制；验证新一次普通单击、键盘点题、清除旧选区、卡片内交互和滚动关闭。

**双击专项：**真实 mouse double-click 会先产生第一次 click。必须以空讲评初始状态以及已有另一题焦点两种情况观察：是否先触发错误聚焦/滚动再弹工具条。尝试只对可选文本的点题 intent 使用短暂 pending/取消仲裁，明确普通点击的时延代价；题号/空位等明确控件不要无故延迟。浏览器系统双击间隔不能想当然视为一个统一常数。先拿真实 Chromium/Firefox/WebKit 证据再锁定实现；未解决时记录为阻塞项，不把「只拦第二次 click」当成互斥验收通过，也不未经确认删掉正常点题能力。

**P1 出口：**真实鼠标拖选与双击的行为证据、零翻译请求、点题回归，以及可供 Owner 检查的小工具条/卡片样式。先解决这里，再扩展后端；不建独立大原型项目。

### P2 — 上下文与局部快照

**目标：**得到准确、有界、可区分出处的翻译输入。

- 能精确对齐的 passage 使用已有 TextMap/Consumption 可见投影；其它来源用局部只读 DOM text-node 映射。
- Intl.Segmenter 分句；选区覆盖的所有句子 + 前一句 + 后一句。保留重复词的实际位置，而不是在字符串中取第一次匹配。
- 无前句/后句时留空；同 Passage 跨段仍可取相邻句。选项的所属题干放入独立 supportingContext，不混入另一选项或题组。表格单元格/分栏按阅读来源区分。
- 跨多个语义来源时生成有序 segments；跨出卷面、经过控件/讲评栏的选区不静默拼接或过滤。
- 实施 spec 的字符/片段/body 保护；选中文本不截断，缺失上下文有可见 limited 状态。
- 保存可用锚点和文本引用信息作为会话快照，但不新增 PaperAnnotation、Source Span、Canonical 字段或 DB 表。

**P2 出口：**纯函数/DOM fixtures 能证明 selected text 与原生选区一致，上下文正确，并覆盖所有已承诺的卷面文字来源。不能只通过普通阅读段落而遗漏写作和选项。

### P3 — 有边界的翻译服务

**目标：**网站内的一个固定英译中 API，不是公共免费通用模型代理。

- 新 translation route/service/prompt；按现有 router pattern 注册。应用层请求按 spec，仅允许有界 text/context，不接受 messages、model、key、URL 或 userId。
- 在解析/付费前落实身份、Paper/题组归属、同源、body byte limit、字段白名单和限流；错误映射在真实 HTTP seam 上测试。
- 从现有服务器配置注入 key 和唯一 completion runner。翻译模型常量为 `deepseek-flash`，直接通过服务器端受限调用参数传递；不要经过会回退到旧默认值的 normalize 路径。
- completion runner 只做 additive 的每次调用选项：AbortSignal、总 deadline、retryCount。未传时旧调用行为保持不变；翻译传 retryCount=0、thinkingMode=false。signal 要覆盖 fetch 及 response body，abort 不重试。
- 沿用每日限额的同一计数入口和 `AI_DAILY_LIMIT_EXCEEDED` 429；身份级短期限流与全进程并发槽在服务层进入/退出，finally 必须释放。
- 单次 JSON 结果经已有 Ajv 严格校验；拒绝空内容、超长、额外字段、截断和无效 kind。固定 prompt 保留空白题号，不补答案、不执行原文指令。
- 用合成文本和 fake provider 跑所有自动测试；真实模型小样本 smoke 与质量 QA 单独标记，不把 CI 绑到付费账号或网络。

**P3 出口：**API 合同、权限/额度/取消/错误测试通过，旧 completion callers 的 transport/额度回归通过。没有 key 的环境也能完成 fake-provider tests，并返回真实的 503 配置状态。

### P4 — 串联 UI、请求和短期缓存

**目标：**从选择到结果的完整体验，不增加数据沉淀。

- 点击按钮才调用 translation client；卡片内切换 loading/result/error，结果纯文本展示。
- 保存 selection snapshot 后再转移按钮焦点；点击按钮和复制译文不能误触发新查询或关闭事件。
- generation/requestId 检查与浏览器 abort 一起防止陈旧结果；切卷、关闭、退出和卸载都清理。
- 页面内有界 cache：64 entries / 10 min，key 包含来源、正文、上下文、语言、model、promptVersion；只缓存成功结果。显式「重试」针对 error，不拿缓存掩盖失败。
- 错误显示区分额度耗尽、请求过快、配置缺失、超时、服务异常；不把临时查词失败变成整页错误。
- 在 `/api/ai/status` 上添加可选 selectionTranslation capability，不改变原有 consumers。默认关闭开关时不挂监听；关闭开关期间已在途请求按关闭规则失效。

**P4 出口：**可运行的用户主流程、无额外请求、没有生词本/收藏 UI 或本地历史、默认关闭时与原 Paper 行为一致。

### P5 — 完整回归、Owner QA 和实施 PR

按照实施候选的真实 changed-path classifier 与 AGENTS 选择检查，不以本 Draft 的文件风险代替代码风险。新增 dependency、共享 runner/鉴权/配置相关改动需要应用仓库高风险边界；不要因为组件视觉很小就走 CSS-only 路径。

- 开发期跑 focused checks + `pnpm -C app verify:changed`。
- 最终跑 `pnpm -C app build`、`pnpm -C app lint` 及本功能新增 verifiers。
- 当前计划会涉及 dependency 与共享付费调用边界；实施候选按 AGENTS 安排最终 `verify:all`、独立 Standards/Spec review 和自然 Actions `verify` / `e2e`，不重复已经覆盖同一候选的 hosted Full。
- PaperSurface 公共契约原则上零改动。若实施实际修改 shared renderer，重新分类并补 `verify:paper` 及受影响 Screen/Print/PDF 的真实验证，不能用 spec 里的「原计划不改」豁免实际改动。
- 准备真实可访问的本地/测试服务、已验证的登录态、具体 Paper URL、初始讲评状态和操作路径，按 Owner QA 模板交接。此时才提供截图/操作录屏，不把当前线上页面冒充新功能预览。
- PR body 记录精确 head/base、pack/reason、实际执行命令和 PASS/SKIP/FAIL。保持 feature 默认关闭；合并和部署需要 Owner 对应授权。

## 4. 预计文件边界

以下「新增」是实施建议路径，**当前 Draft 并未创建这些运行时文件**；实现者可在同一边界内小幅合并，避免机械拆成太多模块。

| 路径 | 计划职责 |
| --- | --- |
| `app/src/features/paper-selection/`（新增） | hook/controller、context resolver、toolbar/popover、局部 types/CSS；第一版仅 translate action |
| `app/src/features/paper-browse/PaperBrowsePage.tsx` | 挂载唯一 controller、注册卷面可读域、接 capability |
| `app/src/features/paper-browse/paperBrowseFocusIntent.ts` | 仅在确有必要时增加 host 仲裁入口，保留原有副作用顺序 |
| `app/src/services/selectionTranslation.ts`（新增） | 使用仓库实际 HTTP client，提供 signal、错误码和 DTO 处理 |
| `app/package.json` 与其现有 pnpm lockfile | 只加入 `@floating-ui/react-dom` 及必需传递依赖，不夹带升级 |
| `server/selection-translation/`（新增） | route、service、固定 prompt、输入/输出 schema、短期限流 |
| `server/api.mjs` | 最小配置/依赖注入/路由装配；不继续塞业务逻辑 |
| `server/ai-proxy/routes.mjs` | additive capability 状态，不改旧 AI 请求含义 |
| `server/ai-providers/completionRunner.mjs` | 向后兼容的 per-call signal/deadline/retry 选项，仍走既有 daily quota |
| `scripts/verify-paper-selection-context.mjs`（新增） | 文本来源、分句、截断与选区快照 fixtures |
| `scripts/verify-selection-translation-api.mjs`（新增） | HTTP/鉴权/输入/额度/provider/取消合同 |
| `scripts/verify-paper-selection-browser.mjs`（新增） | 真实浏览器鼠标/键盘/点题互斥、浮层和请求竞态 |

默认禁止改动：`shared/papersurface/**` 公共协议、Canonical schemas/publication、题库资产、导题 pipeline、DB migrations、print renderer、PDF/export、CI workflow 或生产配置。需要把新增 checks 纳入现有验证入口时，遵循 classifier/CI 的实际约定并单独计入改动风险；不要为了降低 CI 成本改规则。

## 5. 验收矩阵

| 维度 | 必须看到的行为 / 检查 |
| --- | --- |
| 主流程 | 选择 → 仅「翻译」 → 点击一次 → 卡片结果；形成选择时 provider 调用数为 0 |
| 点题互斥 | 拖选/双击不激活新题、不滚动讲评、不改旧焦点；清除选区后的普通点题仍正常 |
| 来源覆盖 | 普通阅读、七选五池、完形选项/空位附近、语法填空、听力题干、写作材料、表格/分栏 |
| 排除范围 | 导航、加卷按钮、讲评栏、输入框、contenteditable、隐藏答案和图片内部不发查询 |
| 几何 | 正反向、跨行、视口四边、窄桌面窗口、浏览器缩放下卡片不溢出；Paper 滚动关闭，卡片内滚动保留 |
| 上下文 | `address` 的处理义、`bank` 的河岸义、同一词不同句缓存区分、短语整体、跨句指代、文章首尾 |
| 精确选择 | 同一句第二次出现的单词、嵌套 evidence span、标点/缩写、Unicode、跨段及分开的选项；不取首次 indexOf |
| 长文本 | 多句/多段原文全部保留；超限明确提示且 0 provider call；输出被截断时不显示部分成功 |
| 不解题 | 保留 `__31__` 等空白，不填正确答案；不从不可见 answer/analysis 取上下文 |
| 安全 | 未认证/无权限/跨源/超 body/伪造字段先拒绝；key、原文、provider debug text 不泄露；输出不执行 HTML |
| 额度 | 请求实际出站计数一次；额度耗尽保留既有 429 code；失败/重试符合现有规则；不会另开绕过 quota 的 client |
| 并发 | 身份级/进程级上限、超时/断线后释放、abort 不再重试；页面快速切选只有最新结果可显示 |
| 缓存 | 相同上下文可复用，不同文章/句子不能串义；用户退出/切换清空；无 localStorage/DB 历史 |
| 键盘 | 不抢焦点、进入工具条、Enter 翻译、Escape 关闭、焦点可见；原生复制及点题键盘操作仍有效 |
| 回退 | feature off、key missing、429、timeout、provider 5xx、empty JSON、bad schema、unmount 均可控；Paper 主流程不中断 |
| 现有功能 | `verify-paper-browse.mjs` 与相关现有 Paper/grammar-fill seam 无回归；讲评高亮、草稿卷操作和导出不受影响 |

用真实 Playwright 鼠标拖动和 dblclick 覆盖事件序列，不能只用 `page.evaluate` 人为设置 Range 便宣称点题冲突已解决。三引擎可用性如受本地环境限制必须写 SKIP，并在适当 CI/Owner QA 补证，不把未运行当 PASS。

模型质量单独用原创合成句/短段做有参考答案的小样本评估（建议至少 20 例，覆盖本文多义、短语、相邻句指代、句段翻译和干扰指令），记录模型实际返回名称、promptVersion、语境错误类型和用时。单词/短句端到端 p50 目标 ≤ 2 秒、p95 目标 ≤ 5 秒，前端工具条出现目标 ≤ 150ms；这些只是验收目标，尚无性能数据，长选区不能承诺同一响应速度。

## 6. 当前验证记录

| 项目 | 当前状态 |
| --- | --- |
| main / 路由 / renderer / provider / 额度相关源码核对 | 已完成只读核对，基线见文首 |
| 浏览器与模型一手技术资料核对 | 已完成；链接和日期在 spec |
| spec 与计划文档 | 本 Draft 的交付 |
| 安装依赖、构建、lint、verifier、Playwright | SKIP：本次只提交方案文档，未创建可执行实现或本地完整工作树 |
| 真实模型调用、成本/延迟/正确率测量 | SKIP：本次未访问密钥或发起付费调用 |
| changed-path classifier / 独立实施审查 | 未执行/未进行；不能宣称已获机器风险分类或实现审查通过 |
| GitHub Actions | 以该 Draft PR 的自然运行状态为准；本文不预先标记通过 |
| 生产配置、部署、DB/R2 修改 | 未执行，且不在本次范围 |

## 7. 后续启动实施的任务边界

Owner 明确启动代码任务后，以本 spec 为输入，按 P1 → P2 → P3 → P4 → P5 顺序完成一个有界功能；不需要为每个阶段自动建立新任务链。优先复用当前 main 已有能力，交付重点是「卷面选择 → 点击翻译 → 本文义」以及不破坏既有交互的证据。高亮、生词本、问 AI、手机交互、全站模型升级和生产部署仍不在此实现范围。
