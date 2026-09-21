# Paper 选区工具条与上下文翻译

> 状态：Draft / spec-only；尚未实现、安装依赖或部署。
> Owner 需求澄清：2026-09-21。
> 代码核对基线：`main@1c3fa75ee03110ae361d2aa38d1a18182f55410c`。
> 本次交付：技术选型、产品/技术边界与[实施计划](plan.md)。不授权合并或生产变更。

## 1. 要做的东西

老师在 Paper 卷面阅读时，选中英文，选区旁出现小操作条；**点击「翻译」后**，在附近的小卡片查看这段英文在当前语境中的中文含义。

```text
选择文字 → [翻译] → 原位置的加载态 → 中文结果
                 ↘ 错误说明 / 手动重试
```

这是网站内置的小组件，不是浏览器扩展、整页翻译、编辑器或聊天窗口。选区是通用入口，翻译是第一项能力；选中本身不代表用户决定翻译。

### 已确认范围

- PC 鼠标划选；英文 → 简体中文。支持词、短语、不完整句、完整句及较长的多句/多段选区，不按文本类型限制成「只能查单词」。
- Paper 卷面可见内容：阅读、题干、选项、听力卷面文字、七选五、完形、语法填空、写作材料、可选择的表格文字及卷面英文指导语。
- 不包含导航、操作按钮、加入草稿卷工具栏、讲评栏、输入框、contenteditable、隐藏答案、图片内部文字或其他页面。卷面上作为题目内容的可点击选项文字不因其 button/role 而被错误排除。
- 形成选区只出现操作条，**不发翻译请求、不消耗 AI 额度**；第一版只显示「翻译」，不展示未实现的高亮、收藏或省略号占位。
- 单词/短语优先给本文义；较长文本给自然中文译文。默认不列词典全部义项，不做音标、发音、例句、语法课或解题。
- 上下文包括选区覆盖的完整句及前后相邻句；边界不存在的句子不得编造。上下文仅帮助消歧，不作为额外翻译目标。
- 不跳页、不占右侧讲评栏、不挤压卷面、不改题目与答案。用户选区操作不能同时触发点题讲评。
- 第一版不做生词本、高亮保存或查词历史；只保留组件动作扩展口和会话内选区快照。手机端另议。

### 「长度都要」与工程边界

上面的要求是支持不同长度和类型，不等于开放无限请求。建议第一版安全上限：选中文字 8,000 个 UTF-16 code units；选中内容加上下文总计 12,000；至多 32 个语义片段；HTTP JSON body 128 KiB。这些是待实现的保护参数，不是已确认的产品字数限制。

超限时保留原生选择/复制能力，并明确提示「选中文字较长，请缩小范围后翻译」。**不得只翻译前半段、静默截断或自动拆成多次收费调用。**完整句的必需上下文超过上限时同样明确提示；可选段落扩展可以省略。

## 2. 技术选型

| 层 | 选择 | 本任务中的用途 |
| --- | --- | --- |
| 选区 | 浏览器 Selection / Range + Pointer Events | 获取真实选区、方向、文本节点及几何；保留原生复制 |
| 浮层 | `@floating-ui/react-dom` + 已有 React DOM portal | 只用定位能力；virtual reference、inline、offset、flip、shift、size |
| 上下文 | 已有 PaperTextMap / 卷面可见内容 + `Intl.Segmenter('en', { granularity: 'sentence' })` | 句界与相邻句；不额外安装 NLP 模型或整篇分析依赖 |
| 前端状态 | React hook / reducer / ref | 一个 Paper host 一套选区会话；不新增全局状态库 |
| 翻译 | DeepSeek 官方 `deepseek-flash`，显式关闭思考，单次 JSON 响应 | 固定的上下文英译中任务，不走 Agent、工具调用或聊天历史 |
| 服务端 | 现有 Node ESM router、共享 completion runner、已有 Ajv | 鉴权、额度、取消/超时、输出校验；不增加模型 SDK |
| 临时缓存 | 当前 Paper 页面内、内存 LRU | 相同选区和语境的重复查询；不新增 DB、Redis 或 localStorage |
| 验证 | 现有 Node verifier 与 Playwright | 纯函数、接口和真实浏览器选区/点题回归 |

### 为什么这样选

Floating UI 官方把只需定位的使用方式单独放在 `@floating-ui/react-dom`；virtual element 支持 Range，inline middleware 支持多行选区。只借用定位，不引入整套 UI 或富文本编辑器。精确依赖版本在实施安装时从发布包核验并锁入现有 pnpm lockfile；本 Draft 不宣称已完成 React 19 兼容性或 bundle 实测。

翻译优先复用仓库现有 DeepSeek transport / server key / 每日额度入口。当前官方推荐模型名为 `deepseek-flash`，对应 V4.1 Flash；旧 `deepseek-v4-flash` 只是兼容路由。**本任务显式指定翻译模型，不改变其他 AI 任务的默认模型或升级全站模型选项。**不能让现有 normalize 函数把新名称静默回退到旧默认值。

DeepL 是有效备选：官方 API 有独立的 `context` 参数，不能把它误判为「不能带上下文」。本轮不选它，是为了先复用已存在的服务端调用和额度设施，并用固定 JSON 同时表达「本文义」和句段译文，而不是声称 DeepSeek 翻译一定更准或更快。若验收语料不达标，再在同一个 service seam 替换供应方；第一版不做多供应商管理和自动切换。

不选：整页翻译脚本、未公开的免费翻译接口、浏览器端直连付费 API、本地大模型下载、向量库/RAG、Agent 框架、整套编辑器。它们不属于这次需求。

### 成本与可用性事实

截至 2026-09-21，官方中文价格页列出的 Flash 缓存未命中输入价格为每百万 tokens 空闲 1 元 / 高峰 2 元，输出为空闲 4 元 / 高峰 8 元。仅作算术示例：一次 1,000 input + 200 output tokens 约 0.0018–0.0036 元，不是实测平均成本；实际包含所选上下文、输出长度、时段和缓存情况。

本次未调用真实付费模型，未读取生产密钥、余额或服务配置。模型可用性、延迟、语境正确率必须在实施时用合成测试文本验证，不能把文档核对当成上线证明。

## 3. 与当前仓库的边界

已核对的接入点：

- `app/src/features/paper-browse/PaperBrowsePage.tsx`：Paper host，管理题组、讲评和卷面。
- `app/src/features/paper-browse/paperBrowseFocusIntent.ts`：`applyPaperSurfaceFocusIntent` 会抑制 scrollspy 清理、激活题组并提交讲评聚焦；必须在这些副作用发生**之前**仲裁选区操作。
- `app/src/shared-ui/papersurface/PaperSurface.tsx`：通过 `onFocusIntent` 发出 `request-lecture-focus`；继续作为受控 renderer，不内置翻译请求或保存逻辑。
- `shared/papersurface/anchorKeys.mjs`：复用现有 section / paragraph / sentence / question / option 等锚点，不增加或重命名公共 `data-paper-*` 协议。
- `server/ai-proxy/routes.mjs`：现有 AI 路由及 `/api/ai/status`；translation 可作为独立 route module 注册，不改现有接口含义。
- `server/ai-providers/completionRunner.mjs`：复用 `callDeepSeekWithFallback` 的额度入口；当前 DeepSeek fetch 未接 AbortSignal，需小幅、向后兼容地增加每次调用的取消、超时和重试参数。
- `server/auth/auth.mjs`：路由层用 `resolveDataUserId(context)` 取得身份，不接受客户端 userId。保留 enforced 与现有 bootstrap-open 的区别。
- `server/paper-canonical/consumerRoutes.mjs`：现有 screen Consumption 加载边界；不为翻译修改 Canonical Publication 或恢复原始资产兜底。

新增能力放在 Paper host 的 feature 层。不得用「顺便重构」改变 PaperSurface、Canonical 模型、导题、讲评数据、DB schema、Print/PDF 或其他详情页。

本工具产生的是**临时翻译结果**，不是 ADR-0003 中的 curated `PaperAnnotation`，不是 Personal Analysis，也不是官方答案。它不改变 ADR 中的预生成注释包或其只读规则。未来保存高亮/生词时需要另行设计用户归属、版本绑定和持久化合同；不能直接把 DOM Range 当成持久坐标或 Source Span。

## 4. 前端交互合同

### 4.1 状态和生命周期

```text
idle → selecting → toolbar → loading → result / error
                        任意状态 → dismiss / 新选区 → idle / toolbar
```

- 工具条在有效选择结束后出现，不随每次 pointermove 发请求。左右方向划选、跨行、跨段都要验证。
- 一个页面同时最多一张卡；重新选择立即使旧请求失效并取消。
- 点外部、Escape、Paper 滚动、切卷、卸载关闭；卡片自身的滚动不关闭。窗口尺寸变化可以重新定位，锚点消失则关闭。
- 点击翻译时使用事先保存的不可变 selection snapshot；不能等按钮 click 后再读取可能已丢失的原生选区。工具条内部 pointer/focus 转移不应被误认为选区失效。
- loading 在卡片内显示「正在翻译…」。错误提供明确原因及手动重试，不自动改用词典/其他模型、不重新激活讲评。
- 长原文显示有限预览，长译文在限定高度内滚动；原文预览缩略不等于请求内容截断。

### 4.2 与点题互斥

- 在 host capture 阶段记录选择手势，并在提交 focus intent 前再次检查。用 ref / gesture token 防止 React state 尚未更新时漏拦。
- 同一手势只要发生了有效卷面文本选择，随后的 click 不能触发激活题组、讲评聚焦、证据重播或滚动。
- 不在整张 Paper 的 pointerdown 上 `preventDefault()`：这会破坏原生选择。不能用「所有 button 都不可选」排除题干/选项。
- 用户下一次普通单击若已清除选择，仍能正常点题；不使用跨手势残留的 `hasSelection` 永久吞点击。键盘激活控件也须保留。
- 双击原生取词需要专门验证：第一次 click 可能早于浏览器生成文字选区，单靠最后一次 `getSelection()` 不足以保证无讲评闪动。P1 必须先验证延迟提交/取消 pending intent 的 host 仲裁；不把未经实测的固定延迟描述为跨浏览器保证。完整拖选路径不可为解决双击而退化。

### 4.3 定位和可访问性

用 cloned Range 的 rects 构造 virtual reference，结合 `inline()` 及选区结束附近的可见行定位；用 `flip/shift/size` 避免视口边缘溢出。Portal 放在卷面布局外，定位监听仅在浮层挂载期间生效并清理。

按钮有可见焦点，可用 Tab / Enter 操作，Escape 可关闭。选区产生时不强行抢走阅读焦点；提供经过浏览器验证的键盘进入操作条路径。结果为非模态可读区域，不将可交互卡片标成 tooltip；加载/错误用适当的 live region，避免整段翻译反复播报。继承现有 UI token，尊重 reduced motion；print 隐藏整个 overlay。

## 5. 上下文与选区快照

### 5.1 提取规则

1. 仅接受同一 Paper host 中已注册的卷面可读区。检查完整 Range 路径，不只检查首尾；跨过操作栏/讲评栏/不可读区域时不得悄悄过滤后发送。
2. 在拥有句子锚点且可准确对齐时，优先使用现有 PaperTextMap / 当前 Consumption 投影的有序文本。**TextMap 不等于页面所有可见内容**；题干、选项、写作和表格不能假定都有 sentence id。
3. 无完整句子映射的可见区域，用局部、只读 DOM text-node traversal 建立文本到节点的临时映射，再用 Intl.Segmenter 分句。它只是临时阅读上下文，不生成新的 Canonical 事实或修改 DOM 包装。
4. 选区跨多句时保留覆盖的全部句子，向前和向后各扩一完整句；同一 Passage 的相邻段落可供边界句使用。必要的段落扩展为确定性本地规则，不追加一次 AI 请求来决定上下文。
5. 题干与选项是独立语义来源：选项内相邻文字可带，所属题干可以作为明确标记的 supporting context；不能把上一选项当「前一句」，也不能把另一篇阅读文章当「后一句」。不查答案、不填空、不带讲评解析。选择横跨独立来源时保留为分开的片段，而不是伪造一个连贯句子。
6. 对缩写、引号、破折号、句末标点、嵌套 evidence span、重复单词、表格和跨段建立 fixtures。不支持 Intl.Segmenter 的环境退到有界当前文本块并标记 `limited`，不使用简单按句点切分冒充精确句界。
7. 先保证完整被选文本，再保证必需完整句和相邻句；仅可省略可选扩展。上下文无法可靠定位时显示「上下文有限」；不把猜测呈现为确定本文义。

### 5.2 会话内快照

快照至少包含 paperId、题组/来源种类、选中文字、有界上下文片段、选区几何、请求代次及已存在的可用锚点。临时 UTF-16 offsets 必须与被映射字符串一致，不以 `indexOf(单词)` 查找首次出现的位置。

可以附 `exact/prefix/suffix` 文本引用信息供未来动作消费，但不建立持久化 schema。动作只需要一个局部、类型化的 `SelectionAction` 列表，当前只有 translate；不要做远程插件注册、工作流引擎或提前生成收藏表。

## 6. 后端接口和模型合同

建议新增 `POST /api/ai/translate-selection`，由独立 translation service 处理；不是给前端开放通用 chat-completions 代理。

请求的应用层形状：

```ts
type TranslateSelectionRequest = {
  paperId: string
  segments: Array<{
    groupId: string
    kind: 'passage' | 'stem' | 'option' | 'writing' | 'instruction' | 'table-cell'
    text: string                 // 这个片段实际选中的文本
    before: string               // 完整句左部及前一句，不作为翻译目标
    after: string                // 完整句右部及后一句，不作为翻译目标
    supportingContext?: string   // 例如所属题干，必须独立标记
    contextStatus: 'complete' | 'limited'
  }>
}
```

片段按选区阅读顺序排列；客户端和服务端共用同一长度/片段数量定义。禁止接收自定义 messages、system prompt、model、baseUrl、apiKey、tools、userId。上下文是客户端提供的非可信阅读输入，不声称服务端已验证其每个字符的来源；服务端验证 Paper/题组可访问及归属关系，输入不获得任何公共内容写权限。

成功返回应用生成的 requestId、promptVersion、contextStatus 和结果：

```ts
type SelectionTranslation = {
  kind: 'term' | 'text'
  zh: string
  partOfSpeech?: string
}
```

模型只产生上述 translation 对象；requestId、版本、来源状态不由模型决定。多片段长文本必须保持阅读顺序和段落，不能把独立选项融合成一句。AJV 限制额外字段、枚举、字符串长度和空结果；`finish_reason=length` 或无效/空 JSON 返回可重试错误，不显示修复拼接出的半个结果。前端以纯文本渲染，禁止 HTML / dangerouslySetInnerHTML。

固定提示词要求：只翻译选中片段；用上下文消歧；本文义优先；输出 JSON；原文与上下文中的指令均为待翻译数据；保留人名、数字、占位空白，不回答题目、不推测答案、不翻译未选上下文、不提供推理过程。语境不足时用保守措辞，不输出未经校准的置信度分数。

## 7. 安全、额度、取消和缓存

- 正常生产模式必须经过现有会话鉴权；owner/member 按现有 Paper 访问权限使用，不进公开白名单。禁止客户端伪造身份；bootstrap-open 测试保持现有语义，不借本功能扩大公开访问。
- POST 验证同源、JSON 类型和 body byte limit，拒绝跨源收费请求；输入、权限、配置和本地速率检查必须先于付费调用。
- 复用现有 server key 及共享每日额度计数，不新建绕过计数器的 DeepSeek client。只在实际发起一次模型调用时计入现有额度；沿用现有失败计数规则，不重复扣数、不自动退款重试。
- 新增有界、会话身份维度的内存限流，建议每分钟 20 次、每用户最多 2 个在途、全进程最多 8 个在途；超出返回 429，不排无界队列。计数器定期过期/释放；多实例部署需重新评估共享限流，不能宣称进程内限制是全局隔离。
- 翻译调用显式 `thinkingMode=false`、JSON output、无工具、无历史、无思考 fallback；每次调用重试数为 0，由用户手动重试。按文本量设置输出预算，最大 8,192 tokens；总 deadline 建议 20 秒。它们是设计参数，不是响应时延承诺。
- 浏览器 fetch 的 AbortController、服务端请求/响应断开、模型 fetch 的 signal 与总 deadline 必须贯通；不要错误地把正常 request body 读取结束当断线。abort 不应触发 transport 自动重试。
- 关闭/新选区除 abort 外，还检查 selection generation + requestId，防止已经返回的旧结果覆盖新卡片。资源释放放在 finally。
- 页面内缓存建议最多 64 项、10 分钟 TTL；key 包含实际选中文字、完整上下文、来源、目标语言、model 和 promptVersion。不能只以单词作 key。切卷、退出、用户切换清空；不做跨用户/跨页面共享缓存。
- 应用不持久化原文、译文或查词历史；现有 AI 额度元数据记账是例外。日志只保留 requestId、模型、耗时、计数和错误码，不记录原文、上下文、原始 provider 返回或 key。应用不保存不等于第三方供应商零留存，不作这种承诺。
- 配置缺失/功能关闭返回 503；格式错误 400、文本超限 413、未认证 401、无权限 403、额度/速率限制 429、provider/输出失败 502、deadline 504。沿用 `AI_DAILY_LIMIT_EXCEEDED` 错误码，不吞成泛化 500；上游密钥错误不能直接暴露给前端。

## 8. 发布和回退

建议新增默认关闭的服务端 `EQB_SELECTION_TRANSLATION_ENABLED`；通过现有 `/api/ai/status` 的可选 additive capability 把开关/可用性告诉 Paper host，不返回 key。未启用时不挂选区监听、不显示未来功能占位；状态探测不包含选中文本，也不扣额度。

真实 key 是否存在需实施/发布时通过获授权路径验证。本 Draft 不创建密钥、不修改生产配置。完成测试和 Owner QA 后，启用仍属于明确的部署任务。关闭开关即可撤掉新交互，正常点题、讲评和导出继续工作；没有用户内容 migration 或回填要撤销。

## 9. 一手资料与仓库依据

外部资料核对日期：2026-09-21；不据此宣称已经实测。

- [Selection API / MDN](https://developer.mozilla.org/en-US/docs/Web/API/Selection)
- [Intl.Segmenter / MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter)
- [Floating UI React：定位专用包](https://floating-ui.com/docs/react)
- [Floating UI virtual elements / Range](https://floating-ui.com/docs/virtual-elements)
- [Floating UI inline middleware](https://floating-ui.com/docs/inline)
- [DeepSeek 当前模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)
- [DeepSeek 模型迁移记录](https://api-docs.deepseek.com/updates/)
- [DeepSeek JSON Output 及空结果限制](https://api-docs.deepseek.com/guides/json_mode/)
- [DeepL text translation / context](https://developers.deepl.com/api-reference/translate/request-translation)

仓库依据：[AGENTS](../../../AGENTS.md)、[PRODUCT](../../../PRODUCT.md)、[CONTEXT](../../../CONTEXT.md)、[steering](../../steering/README.md)、[UI collaboration](../../agents/ui-collaboration.md)、[ADR-0003](../../adr/0003-paper-surface-interaction-model.md)、[PaperBrowsePage](../../../app/src/features/paper-browse/PaperBrowsePage.tsx)、[focus intent](../../../app/src/features/paper-browse/paperBrowseFocusIntent.ts)、[anchorKeys](../../../shared/papersurface/anchorKeys.mjs)、[completion runner](../../../server/ai-providers/completionRunner.mjs)、[AI routes](../../../server/ai-proxy/routes.mjs)、[auth](../../../server/auth/auth.mjs)、[app dependencies](../../../app/package.json)、[server dependencies](../../../server/package.json)。
