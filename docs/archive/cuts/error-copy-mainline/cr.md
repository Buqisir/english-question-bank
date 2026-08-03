# CR — 刀⑧ error-copy-mainline

**Branch:** `cut/error-copy-mainline` · cut commit `3c407e9`（tip `581a29b` 为 QA 用 merge main）· baseline = merge-base
**Diff：** 5 files, +157/−18 — errorCopy.ts（新）/ MySpacePage.tsx / DraftPaperWorkbench.tsx / verify-error-copy-mainline.mjs（新）/ scripts/README.md
**Reviewer：** fresh Opus subagent，detached worktree 冷读，审完自清。

## Verdict: **APPROVE**

极简、守契约。16 处点位全转换、零生错误残留、重试按钮与去重正确、verify 真咬人（3 组变异 + 1 组 blind-spot 失败模式全部响亮）。无 Must Fix。

## 实际执行的验证

- verify-error-copy-mainline.mjs：18/0
- 变异 1（helper 泄原始 message）→ 5 断言红 ✓
- 变异 2（一处点位回退 raw 模式）→ negative-grep + 计数双红 ✓
- 变异 3（删 `loadState !== 'error'` 去重门）→ 去重断言红 ✓
- 变异 4（签名漂移使 TS-strip no-op）→ 脚本响亮崩溃（非假过）✓
- verify-home-default-feed 37/0 · verify-concierge-desk 230/0 · build ✓
- 手工 negative grep：两文件 `error.message`/`String(error)` 零残留；`describeError(` 6+10=16 ✓

## 灰区文件纪律（逐 hunk）

新增行仅四类：import / 点位字符串替换 / 去重门 / 授权的重试按钮 JSX。零碰 useState/useReducer/useEffect/fetch/URL state。Forbidden 全守：concierge 零碰、server 零碰、无新依赖、重试按钮复用 `.my-space-empty-cta`（No-Blue/Color-Lock 完好）。

## 16 处任务名词逐条裁定

MySpacePage：加载个人空间 / 新建文件夹 / 重命名文件夹 / 删除文件夹 / 下载 PDF / 删除文件——全部贴合，「文件」vs「文件夹」区分得当。
DraftPaperWorkbench：打开草稿卷 / 保存草稿卷 / 保存标题 / 更新分页设置 / 删除题组 / 撤销删除 / 导出 PDF / 读取个人空间文件夹 / 新建文件夹 / 保存到个人空间——两处 DEV 自报重点（更新分页设置、读取个人空间文件夹）均裁定恰当：老师语言、不撒谎、必要地具体。无「操作」偷懒，无漏改。

## my-space 失败态（blind spot #1 裁定）

重试 `onClick={() => void load()}` 复用既有 useCallback；页头 message 加 `loadState !== 'error'` 门实现单点渲染；**非加载类错误（删除/重命名）catch 不改 loadState，页头消息照常显示，无回归**。DEV 对契约的理解正确。

## blind spot 裁定

- #1 契约范围理解：正确（仅加载失败加重试出口）。
- #2 data: URL 剥 TS 注解：安全——漂移时响亮崩溃非假过；为 4 行 helper 拖 TS toolchain 不值（razor）。
- #3 两个名词：恰当（见清单）。

## Should Watch（非阻断）

1. 不丢工作的防回归断言钉的是 `setDraftPaper(null)`/`setTitleDraft('')` 字面量；未来若有人以其他写法清空，逮不到。下刀扩展工作台错误处理时升级为「catch 块内不含任何 setDraftPaper/setTitleDraft 调用」。
2. catch-block 正则依赖 4 空格缩进；缩进风格变动时计数断言先红（响亮自防护），记录即可。
3. describeError 对 task 尾部标点/空格无防护；当前 16 个名词干净，产品无害。

---

## 附：主 agent 真库浏览器 QA（合并前，branch@581a29b）

- **502 复现（杀 API → 进个人空间）**：单条「加载个人空间没成功，可以再试一次。」+ 墨色「重新加载」按钮；对照基线的两条英文 `Failed to load My Space: 502`——去重与人话双确认。
- **重试恢复**：重启 API → 点重新加载 → 无刷新恢复正常空态。
- **工作台动作级错误**：API down 时改标题 → 「保存标题没成功，可以再试一次。」，输入框内容保留（不丢工作），全页无任何英文技术串。
- **console 排查通道**：原始错误带任务前缀完整落 console（`加载个人空间 Error: Failed to load My Space: 502` + 栈），devtools 可排查。
- 结论：QA PASS。
