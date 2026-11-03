# EQB 图标 · 状态动效

2026-10-03：Owner 在静态图标收口后提出操作键过渡到下一状态，并询问是否需要补画终态。第一轮以轻交替、旋转和填充表达，Owner 反馈“不够灵性”。第二轮改为图标内部的关系动作，Owner 已确认第二轮，并要求将整套图标与动效落实到代码、做本地提交。静态 SVG 几何保持已选稿。样板中的复制、播放和标重点明确标注为模拟状态，不执行剪贴板、音频或保存操作。

## 起始态、终态与过渡

终态先清楚，再决定过渡。复用已选 Copy / Check、Play / Pause、Chevron、Pin，只有缺少语义终态时才补画。动画不要求给每枚图标多画一套，也不要求逐帧绘制。

| 状态 | 本轮样板 | 现有真实入口与驱动 |
| --- | --- | --- |
| Copy → Check | ~~前纸抽出 1.2 单位作为等待态~~（2026-11 K3 删除）。成功时纸张 80ms 淡出，同时勾自左向右揭示 240ms `cubic-bezier(.33,1,.68,1)`，0ms 起；恢复先后进行：勾 80ms 淡出，纸从 60ms 起 100ms 淡入 | SelectionOverlay.tsx 等 `useClipboardCopy` 消费者；clipboard.writeText 成功后才显示勾；约 1800ms 后恢复 |
| Play ↔ Pause | 三角形分为两片轻轻向外，160ms；暂停双条从中间分开，位移 160ms、显现 120ms，两者一起延迟 40ms。反向时双条收拢、三角形归位；直接改变当前目标 | ListeningSegmentPlayer.tsx 的 onPlay / onPause / onEnded / onError 驱动 |
| 展开 ↔ 收起 | Chevron 上下翻转 180°，160ms；摘要轻移 2px 并揭示，与方向变化同步，预留内容位置 | PaperBrowsePage.tsx 的 readingOverviewOpen 与 aria-expanded 同步；产品现已采用上下翻转；摘要展开轻移与淡入，收起立即隐藏，避免退出文字滞留或占位 |
| 未标重点 ↔ 重点 | 以针尖 (12,21) 为支点，按下时纵向轻压至 0.955，80ms，松开后 160ms 归位；选中填充延迟 80ms 后以 160ms 淡至 0.16 | VocabularyDictationWorkbench.tsx 的 toggleFlag 保存并刷新数据成功后驱动；产品现已接入；等待期间按钮禁用，失败保留旧状态 |

每种动作由对象关系决定：复制是前后纸张分离，播放是分开与收拢，展开是方向与内容呼应，图钉是针尖固定、上部受压。保留已选终态。播放样板使用分片与交替，并非连续路径形变；复制勾使用裁切揭示，并非重新画路径。若未来要做连续形变，需要两端路径节点、顺序和轮廓分组能够对应，并逐段检查中间形状。Figma 可以展示两端与时间关系，产品中的状态由前端逻辑驱动。

## 节奏与边界

- 复用 `app/src/index.css` 的 `--motion-micro:80ms`、`--motion-fast:120ms`、`--motion-base:160ms`、`--motion-slow:220ms`、`--ease-out:cubic-bezier(0.23,1,0.32,1)` 和 `--ease-in-out:cubic-bezier(0.77,0,0.175,1)`。样板内复制这些已核对的 token 以便独立演示；正式页面直接使用全局 token，无需安装动画库。
- 状态切换用 CSS transition，以 transform / opacity 为主；摘要揭示使用 clip-path；复制勾和生词本勾改用两个反向 transform 揭示（2026-11 K4）。快速再次触发从当前视觉值返回，不排队，不依赖动画结束才改变业务状态。
- 固定图标占位并为最长按钮文字留出宽度。正文、周围按钮和阅读内容不随小图标变化移动。
- 键盘激活立即显示状态，不执行装饰过渡；减少动态效果时取消位移、旋转和加载转动，保留轻淡入与状态文字。
- 失败应保留可重试操作与错误说明。样板等待 220ms 仅用于展示异步顺序，不能复制成产品成功定时器；成功反馈停留 1800ms 后恢复。耗时很短的复制无需强制显示加载圈或人为拖延成功。
- 不为119枚图标普遍添加动效，不给高频工具增加弹跳或无意义旋转。循环只允许绑定真实进行中状态，规则见下节 K1；没有归属状态的循环一律不做。全屏/退出全屏目前未查到产品使用点，不宣称已接入全屏行为。

## 样板与验证

对话内可点击样板：`eqb-icon-motion.html`。第二轮证据目录：`.amp/in/artifacts/icon-motion-character-20261003/`，其中 `preview.html` 是检查用页面，`verify.mjs` 和 `verification.json` 记录实际交互；`before.html` 和 `before-motion-rules.md` 保留第一轮。第一轮证据与静态文件校验基线保留于 `.amp/in/artifacts/icon-motion-20261003/`。

第二轮已验证 PASS：部件实际产生位移过渡、连续快速反向后终态正确、图钉轻压时针尖位置固定、模拟 pending → success → 恢复、按钮位置及尺寸稳定、键盘立即切换、减少动态效果时仅保留透明度过渡、窄屏无横向溢出、浅色/深色实看、无页面运行错误。使用已选图标路径，静态源稿与125个生成组件未改变。独立节奏检查指出暂停双条原先先移动后显现，本轮已改为同时延迟 40ms 启动并重新验证。

以上为产品接入前的样板验证记录，当时未修改产品消费者或提交。产品接入范围见下节；样板通过本身不等于产品业务验收。

## 产品接入（2026-10-03）

- `app/src/icons/MotionIcons.tsx` 组合既有生成组件，不复制路径、不引入动效库。四种动作共用现有全局 token，鼠标和触摸有状态反馈，键盘立即切换，减少动态效果时仅保留透明度过渡。
- 复制用于选区译文、查词卡、生词清单与公开分享链接；共用 `useClipboardCopy`，原生剪贴板成功才显示勾，失败给出重试提示；新请求、切换词条及卸载使旧结果失效，恢复定时器可清理。产品没有样板的 220ms 假等待。
- 播放用于听力片段、单词听音（主按钮与悬浮按钮）、自动听写；保留现有音频事件和会话状态，倒数与词间等待仍可暂停，结束/错误保留重播图标。
- 展开用于讲评文章简介。图钉用于听写工作台待复习词的重点标记，填充跟保存及刷新后的 `word.pinned`；按压不代表保存成功。
- 全部 119 枚非题型源稿已生成到组件库；现有入口按语义使用查词、题组、阅读解析与生词本。没有实际入口的图标只入库，未新增产品功能。6 枚题型历史组件保留，首页题型入口图形已移除。
- `scripts/verify-icon-motion.mjs` 验证真实 React 组件与 App 路由，HTTP/剪贴板结果使用可控测试数据；这不证明线上环境或真实保存服务已经部署。本轮只做本地提交，不推送、合并或部署。

产品专项验证：`node scripts/verify-icon-motion.mjs` PASS（真实组件、App 路由、受控接口数据）；`node scripts/verify-paper-selection-browser.mjs` PASS 22；`node scripts/verify-motion-tokens.mjs` PASS 70；`node scripts/verify-eqb-icons.mjs` PASS；`pnpm -C app build` PASS。新增组件/hook lint PASS；两个选区原文件仍有 HEAD 已存在的 lint 错误，本次未拓展修复。全量 `verify:changed` 未通过并中断，详见工艺记录末节；不宣称全量回归完成。

## 2026-11 状态动效深化（做深不做大）

Owner 在评审页（v2 样板，两轮盲审）后确认：「①②③ 都做；K1–K5 按建议；K6 b，K7 a，K8 a」。只加深三个已有语义的状态，不扩大到其他图标，不新增状态，不引入外部图库的图形、配色或运行时。

### 规则

- **K1 循环**：只允许绑定真实进行中状态的循环。带位移的循环最多 5 秒，之后只保留透明度；没有归属状态的循环禁止。循环结束从当前视觉值回到静止（读计算值后用单个 offset-0 关键帧回落），不跳变。
- **K2 键盘**：键盘触发时过渡和一次性揭示立即到位；与进行中状态绑定的循环照常运行（它表达状态，不是装饰），结束时不做回落。
- **K3 复制等待态**：删除。剪贴板写入实测 p95 < 1ms，等待态没有表现；`data-state="pending"` 仍保留给按钮禁用逻辑。
- **K4 揭示**：复制勾与生词本勾用“窗口右移 + 内容左移”两个 transform，不用 clip-path。
- **K5 时长**：这些时长只写在 `app/src/icons/motionIcons.css` 的 `.eqb-motion` 作用域变量里，不进全局 token。
- **K6 b**：下载按压 5 次（5100ms）后切到透明度往复 1↔.45，1200ms 一次，直到结束。
- **K7 a**：揭示 240ms，`cubic-bezier(.33,1,.68,1)`，0ms 起。
- **K8 a**：发音保持单层声波，不加第二道弧。

### 三个状态

| 状态 | 表现 | 减少动态效果 | 驱动 |
| --- | --- | --- | --- |
| ① 发音 | 喇叭不动。点击后 100ms 宽限期内仍无声音，声波降至 .35（等待）；`playing` 事件到达后声波 1↔.6 往复，640ms 一次（sine），直到 ended / pause / error；回到静止 120ms | 相同（本来只改透明度） | 真实音频事件：`useAudioIconState`（`app/src/hooks/useAudioIconState.ts`）或查词卡的 `dictionaryAudio` 模块状态；`play()` 被拒绝回到 idle；换源前旧的 pause 事件在 `audio.paused === false` 时忽略 |
| ② 下载生成中 | 托盘不动；箭头（杆和头）下压 3 个 viewBox 单位再回来，1000ms 一次（下 400ms、上 400ms、停 200ms，sine），100ms 宽限后开始，5 次；之后按 K6 b 改为透明度往复；结束从当前值 160ms 回落 | 从一开始就是透明度往复，无位移 | 拿到保存位置、真正开始生成后才算；选位置的对话框不算；`finally` 中结束 |
| ③ 完成 | 复制与加入生词本：原图标 80ms 淡出，勾按 K7 a 揭示；复制恢复先后进行（勾 80ms 淡出，纸从 60ms 起 100ms 淡入），避免叠成“带斜杠的复制图标” | 80ms 淡入代替揭示 | 复制：剪贴板成功；生词本：只有本次“正在加入 → 已加入”才揭示，进来时已加入的显示静态勾 |

### 组件与产品入口

- `VolumeFeedbackIcon`（`state: idle | waiting | playing`）：查词卡发音（`DictionaryCard.tsx`）、认词面板播放（`VocabularyMeaningRecallPanel.tsx`）、复习页重播与音标按钮（`VocabularyReviewPage.tsx`，按词条 id 区分）、翻牌消消乐英文卡（`VocabularyPracticePage.tsx`，按词条 id 区分）。音量滑块旁的标签图标、口音说明图标保持静态。
- `DownloadFeedbackIcon`（`working`）：认词面板下载菜单、听写工作台的任务“下载资料”（两处）与“下载本轮错词”菜单（按 `task:<id>` / `meaning:<id>` 区分）。复习页、我的空间里的下载入口不在本轮范围。
- `CheckRevealIcon`（`reveal`）：`NotebookAddButton.tsx`。
- `CopyFeedbackIcon`：原有消费者不变，CSS 按 K3/K4/K7 更新。
- 包含图标的控件使用 `iconMotionInput` 标记输入方式。两处原有选择器改为只选直接子元素：`.dictation-download-menu > summary > svg:last-child`（只转 Chevron）、`.vocabulary-match-card-face > .eqb-motion`。

### 验证

`node scripts/verify-icon-motion.mjs` PASS 13 段（新增：发音宽限/等待/播放循环/暂停回落/播放被拒；下载托盘静止、5 次按压后转透明度、回落、键盘立即结束；生词本只在加入完成时揭示、已加入为静态勾；减少动态效果下下载只有透明度、声波照常、揭示无位移）。脚本支持 `EQB_CHROMIUM=<chromium 路径>` 指定浏览器。`node scripts/verify-motion-tokens.mjs` PASS 76；`pnpm -C app build` PASS；改动文件 lint 与基线相同（无新增问题，既有 set-state-in-effect 等未处理）。`verify-eqb-icons.mjs` 在本环境因 Playwright 浏览器版本缺失无法启动，基线同样失败；本轮未改任何图标几何。

未验证：真实课堂网络下的音频等待时长、真实设备（低端平板、手机）上的帧率、学生对三种状态的理解测试、生产环境 PDF 生成的实际耗时分布。未运行全量回归（Owner 尚未 Ship）。

