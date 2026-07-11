# warm-paper-promotion — plan（small/medium，Workflow 试点，2026-07-11）

档位：small/medium，CR-lite 级风险（纯 CSS token 收编 + display-only
预览暖化 + 文档法条）。按试点纪律仍走 fresh CR（Opus/high 钉死）。
Must Read：同目录 agent-entrypoint.md（决策与边界全文）+
`docs/cuts/draft-desk/program.md` 关联决策五裁点。

## 施工三件事（照 agent-entrypoint，此处只补实施细节）

1. **token 转正**（零视觉变化硬约束）：
   - 盘点面：`app/src/features/paper-browse/paperBrowsePage.css` 全部
     硬编码 hex（约 20 种值；对照审计
     `.impeccable/critique/2026-07-10T05-30-00Z__full-project.md`
     Coherence 节「两套壳色温并存」的 15/15 清单）。讲评态与整卷同页
     同 CSS，一并收。
   - 暖纸系值收编为 `--paper-*` token 家族：`app/src/index.css` 定义
     （集中一段、带注释），CSS 内改 `var(--paper-…)` 引用。**纯等值
     替换**——computed style 前后必须逐值相等。
   - 非暖纸系的通用值（纯白/纯黑/品牌绿系）若已有全局 token 就换用，
     没有的**不新造 token 不改值**（范围纪律：本刀只收暖纸家族）。
2. **工作台预览入暖**：`app/src/features/draft-paper/DraftPaperWorkbench.css`
   预览区桌面换暖纸桌 token + A4 纸面 Resting 阴影
   （`0 1px 2px rgba(30,30,28,.06)` 量级）+ 去渐变桌。
   `DraftPaperWorkbench.tsx` 灰区：display-only 可动，禁碰
   reducer/state/数据获取。
3. **DESIGN.md**：--paper-* token 登记 + 三法条文（色温法/命名法/
   删除法，条文原文取自 program.md 关联决策；命名法删除法只入条文，
   实施归卷宗柜刀）。

## Forbidden

- print/PDF/DOCX 导出样式（暖纸只上屏幕面）；my-space 一切文件；
- DraftPaperWorkbench 的 reducer/state/数据获取；
- 上列 4 文件（paperBrowsePage.css / index.css /
  DraftPaperWorkbench.css(+tsx display-only) / DESIGN.md）与 verify
  脚本以外的一切。

## 验收

- DEV 自验 + 流水线复核代理重跑：verify-paper-browse、app tsc、
  `pnpm -C app run verify:all`，原始退出码入回执。
- palette-hex 护栏不回退（新增色值一律走 token）。
- 主代理 QA：整卷/讲评页 computed-style 前后 diff 零差异 + 截图对照；
  工作台预览暖桌+纸影生效；owner 过目工作台观感。
- main CI 绿。

## Workflow 试点纪律（写死，违者废试点）

- 三步流水线：DEV(Sonnet/medium) → verify 复核(Sonnet/low，机械重跑
  命令，回执带原始退出码——手工模式下主代理亲跑的等价替身) →
  fresh CR(Opus/high)。每个 agent() 显式钉 model+effort。
- 1:1 不扇出：每步单代理，不加验证票不加评审票。
- 主代理只出现在裁决点：verify 红→接管；CR verdict→MF 判定；merge。
- 收官记录附真实 token 账单对比（对照组=lecture-rail 常规管线）。

## Worktree 纪律（AGENTS.md 血书，DEV prompt 照抄）

独立 worktree /Users/huangxuewei/Projects/eqb-wt-warm-paper；开工第一步
`bash scripts/setup-worktree.sh`；pwd 自证；禁 stash、禁主树写命令；
用 worktree 自带分支；实现完进自验前打 checkpoint commit。
