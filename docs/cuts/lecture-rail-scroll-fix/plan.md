# lecture-rail-scroll-fix — plan（medium，2026-07-11）

档位：medium（PA-lite 理由：切口为 PaperSurface **加法扩展**——新增模式值，
默认 `'rail'` 与既有 `'in-passage'` 路径字节不变；可回退产品面，无 schema/
导出/锚协议触碰。开刀包已预授权本切口 + contract-unlock。CR 复核本降档。）

## 背景（Must Read：同目录 agent-entrypoint.md + triage.md）

owner 拍板需求：讲评态下，卷面上**七选五与完形**的空可点，点空 → 右栏
讲评面板显示该空/该题解析。语法填空已有同款机制（I15，`blankFocusMode=
'in-passage'`），但 in-passage 模式会压掉题目 rail 与 `__global__` 选项池
——完形每题有 A-D 选项、七选五有选项池，不能直接复用。

**切口拍板（主代理，2026-07-11）**：PaperSurface 受控改动（开刀包切口一）。
理由：I15 全套机器（按钮化、active 态、aria-label、questionIdByNo 映射、
`request-lecture-focus` 意图）都在 PaperSurface 内；扩一个模式值即白拿
键盘可达性与聚焦态。外层事件委托要在页面层重新发明这些且跨组件摸 CSS
类，成本更高质量更低。

## 改动面（Files）

1. `app/src/shared-ui/papersurface/PaperSurface.tsx`（契约面，DEV 开工先
   `touch <worktree根>/.claude/contract-unlock`，收口后删）：
   - `blankFocusMode` 增第三值 `'paper-blank'`：paperBlankPattern 匹配的空
     （cloze `__41__`、七选五 `_____36_____`）渲染为可点按钮；**rail 与
     `__global__` 选项池不压**——两处压制条件（约 L247、L351）从
     `blankFocus` 非空改为 `blankFocusMode === 'in-passage'`。
   - `BlankFocusContext` 加渲染器判别字段（如 `renderer: 'grammar-fill'
     | 'paper-blank'`）；`renderTextWithPaperBlanks` 在 paper-blank 模式下
     走新的按钮化分支（复用 `ps-paper-blank-button` 的 active/aria 形态，
     号码解析不到 questionId 时降级为现有静态 span——不出死按钮）。
   - **`'rail'`（默认）与 `'in-passage'`（语法填空）两条既有路径行为
     字节不变**——这是本刀硬不变量。
2. `app/src/shared-ui/papersurface/PaperSurface.css`：paper-blank 按钮
   变体——保持 `ps-paper-blank` 的视觉（宽度/下划线/号码居中），叠加
   hover/active 可点性 affordance 与 `--active` 聚焦态，用既有 tokens。
3. `app/src/features/paper-browse/PaperBrowsePage.tsx`（约 L1244-1250）：
   `lectureOpen && (kind === 'cloze' || kind === 'sevenChoices')` →
   `blankFocusMode = 'paper-blank'`。不依赖 lectureEntry 是否已拉到解析
   （点空即联动右栏，解析加载是右栏自己的事）。挑题态（!lectureOpen）
   保持 undefined → 空不可点，零解析噪音不变量不动。
4. `app/src/features/paper-browse/paperBrowsePage.css`：讲评态隐藏
   `.paper-browse-group-actions`（加入草稿卷悬浮钮）——审计挂账归本刀
   （ui-p1-panels #3 未覆盖；且空变 button 后 `:focus-within` 会误弹此钮，
   必须收）。选择器挂 `.paper-browse-shell--lecture-open` 之下。
5. `scripts/verify-paper-browse.mjs`：新增断言——cloze/sevenChoices 讲评态
   blankFocusMode 接线、挑题态不接线、in-passage 压制条件收窄为模式判等、
   讲评态 group-actions 隐藏。风格与现有脚本一致即可。

## Forbidden

- 导出/print 面、`server/print-renderer.mjs`、DOCX/PDF 任何路径。
- 语法填空 `__NN__` 数据形状旧账（归 data-health 批，本刀不收）。
- rail 滚动容器/scrollspy 实现（①③ 是留观项，QA 复测，不预防性改码）。
- `shared/papersurface/blankPattern.mjs`（单源 regex 不动）。
- 除上列 5 文件外的一切。

## 验收

- DEV 自验：`node scripts/verify-paper-browse.mjs` 绿 + `tsc` 过 +
  `pnpm -C app run verify:all` 绿（worktree 内）。
- 断点锚：实现完成进自验前打 `wip(lecture-rail-scroll-fix): impl
  complete, pre-QA` checkpoint commit。
- 主代理 QA（浏览器真点击）：讲评态七选五/完形点空 → 右栏对应解析；
  语法填空点空回归不坏；挑题态点空无反应、无按钮 affordance；讲评态
  悬浮加卷钮不再出现；冷加载+立点 rail 滚动复测一轮（留观①）+
  scrollspy 漂移观察（留观③）。
- fresh Opus CR → main CI 绿。

## Worktree 纪律（AGENTS.md 血书照抄）

独立 worktree；开工第一步 `bash scripts/setup-worktree.sh`；一切操作
（git/编辑/构建/verify）只在自己 worktree 内，动手前 `pwd` 自证；禁
`git stash`、禁对主树跑任何写命令；用 worktree 自带分支，不另建分支。
