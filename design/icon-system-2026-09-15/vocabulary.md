# EQB 图标 · 词表（学 Solar 有多全，2026-09-25）

来源：`@iconify-json/solar@1.2.12`（CC BY 4.0，仅临时下载到本机做统计和骨架参照，不进仓库，
见 `craft-rules.md` 顶部说明）。Solar Linear 风格共 37 分类、1396 个图标，比例和 Owner 原话
「37 个分类、每种风格约 1200 个」一致。

用法：把 Solar 的分类当「一个成熟图标库该有哪些词」的清单去对，挑出**现在要用**（已在
`icons-v3.mjs` 里）和**近期大概率要用**的，合并成一张词表；以后加图标先查这张表有没有预留名，
没有再新占名。B 组 57 个已在 2026-09-26 画进 `extended.mjs`，并随 `all` 生成组件。
`bookmark` 是通用书签开关，`book-marked` 仍是领域层的过生词，两个名字都留。C 层仍不画。

## A. 已覆盖（62 个，已在 `icons-v3.mjs` 画出）

见 `icons-v3.mjs` 的 `generic`（45）+ `domain`（11，含 `scissors`）+ `passage`（6）。
不在此重复罗列；下面的新增候选都是这 62 个之外的。

## B. 新增候选（本轮提议，约 60 个）

按 Solar 原分类标注来源，方便以后回去对照该分类还有什么。中文只是占位含义，不代表最终文案。

### 通用动作（Arrows / Arrows Action / UI）

- `external-link`（Arrows Action：`forward` 变体）—— 跳转到站外链接。
- `corner-down-right`（Arrows：无直接对应，借 `reply`）—— 回复 / 嵌套引用。
- `move`（Arrows Action `move`）—— 拖拽重新排序，与 `grip`（纯手柄）语义分开。
- `maximize` / `minimize`（Arrows Action 同名）—— 全屏切换，适合卷面 / PDF 预览。
- `upload`（Arrows Action `upload`）—— 与已有 `download` 对称，目前只有下载没有上传。
- `filter`（UI `filter`，漏斗形）—— 列表筛选，和 `sliders`（参数条）不是同一件事，两者都留。
- `sort`（UI `sort`）—— 排序切换。
- `info-circle`（UI 同名）—— 提示信息。
- `alert-triangle`（UI `danger-triangle`）—— 警告。
- `help-circle`（UI `help`）—— 帮助。
- `loader`（Settings `loader`）—— 加载中状态。
- `star`（Like `star`）—— 收藏 / 星标，和 `tag`（标签）分开。
- `bookmark`（School `bookmark`）—— 通用书签开关；注意与领域层 `book-marked`（过生词，一个固定动作）
  不是同一个词，需要在词表层面明确区分，避免以后重名。
- `share`（UI `share`）—— 分享。
- `lock` / `unlock`（Security `lock` / `lock-unlocked`）—— 权限 / 锁定内容。
- `close-circle`（UI 同名）—— 标签 / chip 里的删除态，比 `x` 更适合小控件。
- `check-circle`（UI 同名）—— 状态型的勾（如"已通过"），比 `check`（动作型）更适合状态展示。
- `target`（UI `target`）—— 目标 / 知识点定位。

### 内容与文件（Notes / Files / Folders）

- `clipboard`（Notes `clipboard`，纯板子不带勾/列表）—— 通用任务容器，和 `board-check` / `board-list`
  （已经带内容记号）分开占名。
- `document`（Notes `document`）—— 非试卷类文档（如说明、公告），和 `paper` 系列（专指卷）分开。
- `folder` / `folder-open`（Folders 同名）—— 分类浏览用的文件夹，当前站内还没有文件夹概念的图标。
- `file-search`（Files `file-search`）—— 在文档里查找。
- `notebook`（Notes `notebook`）—— 备课笔记一类的容器，和「一张卷」家族分开。

### 列表与表格（List / Business）

- `list`（List 同名，纯无序列表）—— 和 `list-checks`（听写）、`list-music`（听力）分开，占一个中性列表位。
- `list-ordered`（List `sort-alphabetically` 概念对应）—— 编号列表，适合按题号排序的场景。
- `table`（Business `table`）—— 表格视图，适合数据统计页面。

### 查看与检索（Search）

- `zoom-in` / `zoom-out`（Search `magnifier-zoom-in` / `-out`）—— 放大缩小，适合卷面 / PDF 预览。

### 时间与历史（Time）

- `clock`（Time `clock-circle`）—— 用时统计。
- `calendar`（Time `calendar`）—— 排期 / 考试日期。
- `history`（Time `history`）—— 版本历史 / 最近查看。
- `hourglass`（Time `hourglass`）—— 进行中状态。

### 身份与协作（Users）

- `user`（Users `user`）—— 个人账户。
- `user-plus`（Users `user-plus`）—— 添加协作者。
- `users`（Users `users-group-rounded`）—— 班级 / 群组。
- `user-check`（Users `user-check`）—— 已认证 / 已批改。

### 安全（Security）

- `shield`（Security `shield`）—— 权限 / 安全状态。
- `key`（Security `key`）—— 密钥 / 集成设置。

### 沟通与通知（Messages / Notifications）

- `mail`（Messages `letter`）—— 邮件通知。
- `bell` / `bell-off`（Notifications 同名）—— 通知开关。
- `paperclip`（Messages `paperclip`）—— 附件。

### 文本排版（Text Formatting）

- `bold` / `italic` / `underline`（Text Formatting 同名）—— 若讲评 / 批注要上富文本编辑器会用到。
- `quote`（Text Formatting `quote`）—— 引用例句。
- `align-left` / `align-center` / `align-right`（Tools `align-*`）—— 排版对齐。

### 工具（Tools）

- `crop`（Tools `crop`）—— 图片 / 截图裁切。
- `ruler`（Tools `ruler`）—— 出卷排版用的标尺。
- `palette`（Tools `palette`）—— 主题 / 配色（如果开放自定义主题）。

### 媒体与听力（Video / Devices）

- `microphone`（Video `microphone`）—— 录音 / 跟读，和已有 `list-music`（听写列表）不是一回事。
- `headphones`（Devices `headphones-round`）—— 听力模块入口。

## C. 预留层（暂不占具体图形，只记分类，供以后讨论）

以下 Solar 分类与本产品当前形态关系不大，不在本轮候选里，列出来是避免以后遗漏：

- **School** 里的 `square-academic-cap`（年级 / 学段）、`calculator`（数学等其他学科预留）、
  `diploma`（证书 / 认证）——是否需要，取决于是否真的要做"其他学科"或"认证"功能，
  `brief.md` §3.C 已经预留了"其他学科"这个层，这里先记名字，不现在画。
- **Money**、**Shopping**：目前产品没有支付 / 交易场景，不占名。
- **Astronomy / Food / Home / Sports / Building / Hands / Parts / Weather / Faces / Call / Medicine**：
  与英语题库场景无关，不占名。

## 统计

A（已覆盖）62 + B（新增候选）约 61 = 约 123 个，落在 Owner 说的「100–120」区间附近。
C 层只记分类不计入这个数字。

## 待 Owner 定的事

1. B 组 57 个已按这张名单画完。要改某个字形，直接说名字。
2. `bookmark`（通用书签）与 `book-marked`（过生词）保持两个名字。
3. C 层的 School 三个（学段 / 学科 / 证书）继续不占名、不画。
