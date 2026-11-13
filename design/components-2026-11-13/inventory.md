# 界面构件清点 · 清单（脚本生成）

> 由 `scripts/component-inventory/report.mjs` 从 `analysis.json` 生成，别手改；重跑方法见 README。
> 本地测试数据（四个题组的一套卷 + 一个 owner 账号），1440 宽实拍 31/31 个页面状态（主线上 14 个），390 宽复拍 31/31 个。拍失败的：无。
> 所有分组、「干什么」的归类、优先级和选项都是 **提案 · 单一来源**（只有清点脚本和我看过；复核方的独立分组对比见 README 第六节）。

## 一、九类各有几种

| 类 | 种数（容差合并后） | 其中并入了走样 | 精确签名种数 | 实拍处数 | 主线上的种数 | 一件事不止一种样子 | 源码写法位置 | 实拍到的位置 | 覆盖率 |
|---|---|---|---|---|---|---|---|---|---|
| 按钮 | 38 | 4 | 42 | 314 | 28 | 去别的页（导航）（14 种）、登录 / 退出（4 种）、展开 / 收起 / 更多（6 种）、加入草稿卷（2 种）、导出 / 存 PDF（4 种）、采用建议（2 种）、移出 / 删除（3 种）、关闭 / 不做了（2 种）、撤销 / 撤回（2 种）、清除搜索 / 筛选（2 种）、筛选 / 分页签（2 种） | 325 | 67 | 20.9% |
| 标签 / 小签 | 4 | 0 | 4 | 35 | 4 | 去草稿卷（带数量）（2 种） | 29 | 6 | 17.2% |
| 行 | 1 | 0 | 1 | 15 | 1 | — | 35 | 5 | 5.7% |
| 卡片 / 板 / 纸 | 8 | 0 | 8 | 23 | 5 | 底色分区（3 种）、放在桌上的一张纸（3 种）、装一组东西的板（2 种） | 39 | 10 | 12.8% |
| 提示条 / 报错 | 7 | 0 | 7 | 27 | 6 | 说明（6 种）、报错（2 种） | 74 | 9 | 12.2% |
| 底部提示 / 撤销 | 1 | 0 | 1 | 2 | 1 | — | 4 | 2 | 50% |
| 空状态 | 3 | 0 | 3 | 8 | 2 | 还没东西（3 种） | 43 | 7 | 16.3% |
| 对话框 / 菜单 / 抽屉 | 5 | 0 | 5 | 8 | 3 | 菜单（4 种）、对话框（2 种） | 22 | 8 | 50% |
| 输入框 / 搜索 | 11 | 1 | 12 | 31 | 6 | 下拉选择（3 种）、文字输入（4 种）、搜索（4 种） | 67 | 15 | 22.4% |

实拍候选 829 个元素，归进九类 527 个；没归类的：没画东西，只是容器 229，只画了分隔线或装饰 61，卷面（纸张本身，不算） 10，对话框遮罩 / 外壳（算在里面的面板上） 2。
「种数」= 按实算样式签名分组、再把差一点点的（色差 ΔE76 ≤ 3、圆角 ±1px、字号 ±0.5px、高度 ±2px、内边距 ±2px、影子 ±1px）并成一种之后的数；「并入了走样」= 这一种里有差一点点的写法被并进来，明细在第四节。

## 二、优先级表（出现次数 × 在不在主线）

一行 = 一类里的一件事（老师在这里要干什么）。「写法位置」= 源码里不同的写法位置数（同一处写法在每页都出现也只算 1）；「页面数」= 在几个页面状态里看得到；「次数」= 实拍到的总次数（顶栏这种每页都有的会很大，只作参考）。
分档规则（机械规则，不是判断）：**P1** = 在 ≥ 3 个主线页面上出现（主线页面 = home、home-results、home-row-menu、home-added、home-noresult、browse、detail、draft-empty、draft、draft-decided、draft-group-actions、draft-export-menu、draft-more-menu、draft-removed-toast）；**P2** = 在主线页面上出现过，或写法位置 ≥ 5；**P3** = 其余。同档内先按样子种数（越多越该统一）、再按写法位置排。顶栏在每页都有，所以顶栏里的事都会进 P1。

| 档 | 类 | 老师在干什么 | 样子种数 | 写法位置 | 页面数 | 其中主线页面 | 次数 | 变体 |
|---|---|---|---|---|---|---|---|---|
| P1 | 按钮 | 去别的页（导航） | 14 | 14 | 29 | 14 | 122 | button-03 button-07 button-01 button-32 button-05 button-18 button-25 button-27 button-22 button-10 button-37 button-13 button-38 button-19 |
| P1 | 提示条 / 报错 | 说明 | 6 | 6 | 15 | 11 | 24 | notice-01 notice-03 notice-04 notice-06 notice-07 notice-02 |
| P1 | 按钮 | 展开 / 收起 / 更多 | 6 | 5 | 15 | 11 | 42 | button-21 button-04 button-24 button-09 button-02 button-10 |
| P1 | 按钮 | 导出 / 存 PDF | 4 | 5 | 11 | 7 | 13 | button-11 button-13 button-26 button-10 |
| P1 | 对话框 / 菜单 / 抽屉 | 菜单 | 4 | 5 | 5 | 4 | 5 | dialog-03 dialog-01 dialog-02 dialog-04 |
| P1 | 按钮 | 登录 / 退出 | 4 | 2 | 30 | 14 | 30 | button-29 button-03 button-01 button-19 |
| P1 | 输入框 / 搜索 | 搜索 | 4 | 2 | 5 | 4 | 5 | field-08 field-05 field-09 field-11 |
| P1 | 输入框 / 搜索 | 下拉选择 | 3 | 4 | 10 | 7 | 11 | field-01 field-02 field-10 |
| P1 | 卡片 / 板 / 纸 | 底色分区 | 3 | 3 | 13 | 10 | 13 | surface-07 surface-03 surface-01 |
| P1 | 卡片 / 板 / 纸 | 放在桌上的一张纸 | 3 | 3 | 6 | 6 | 7 | surface-02 surface-04 surface-05 |
| P1 | 按钮 | 筛选 / 分页签 | 2 | 5 | 5 | 4 | 8 | button-17 button-20 |
| P1 | 按钮 | 清除搜索 / 筛选 | 2 | 2 | 4 | 4 | 5 | button-15 button-31 |
| P1 | 按钮 | 采用建议 | 2 | 2 | 6 | 4 | 7 | button-33 button-12 |
| P1 | 按钮 | 撤销 / 撤回 | 2 | 2 | 6 | 4 | 6 | button-14 button-22 |
| P1 | 按钮 | 加入草稿卷 | 2 | 1 | 3 | 3 | 11 | button-04 button-24 |
| P1 | 标签 / 小签 | 去草稿卷（带数量） | 2 | 1 | 3 | 3 | 3 | chip-03 chip-04 |
| P1 | 行 | 打开一项（整行可点） | 1 | 2 | 4 | 4 | 12 | row-01 |
| P1 | 标签 / 小签 | 状态标记（不可点） | 1 | 1 | 29 | 14 | 29 | chip-01 |
| P1 | 按钮 | 改名 | 1 | 1 | 9 | 7 | 9 | button-08 |
| P1 | 按钮 | 切换版式 / 版本 | 1 | 1 | 9 | 7 | 9 | button-07 |
| P1 | 按钮 | 跳到某个题组 | 1 | 1 | 8 | 6 | 16 | button-06 |
| P1 | 按钮 | 搜索 | 1 | 1 | 4 | 4 | 4 | button-16 |
| P1 | 输入框 / 搜索 | 勾选 / 开关 | 1 | 1 | 4 | 4 | 4 | field-04 |
| P1 | 按钮 | 换篇 | 1 | 1 | 6 | 4 | 18 | button-02 |
| P2 | 输入框 / 搜索 | 文字输入 | 4 | 8 | 7 | 1 | 11 | field-03 field-02 field-06 field-07 |
| P2 | 空状态 | 还没东西 | 3 | 5 | 3 | 1 | 5 | empty-01 empty-03 empty-02 |
| P2 | 按钮 | 移出 / 删除 | 3 | 5 | 4 | 1 | 5 | button-35 button-28 button-13 |
| P2 | 标签 / 小签 | 筛选 / 切换 | 1 | 3 | 1 | 1 | 3 | chip-02 |
| P2 | 底部提示 / 撤销 | 带撤销的反馈 | 1 | 2 | 2 | 1 | 2 | toast-01 |
| P2 | 空状态 | 加载中（占位文字） | 1 | 1 | 2 | 2 | 2 | empty-02 |
| P2 | 按钮 | 打开 / 查看 | 1 | 1 | 1 | 1 | 1 | button-30 |
| P2 | 空状态 | 搜了没结果 | 1 | 1 | 1 | 1 | 1 | empty-01 |
| P2 | 按钮 | 调整顺序 | 1 | 1 | 1 | 1 | 1 | button-34 |
| P3 | 提示条 / 报错 | 报错 | 2 | 2 | 3 | 0 | 3 | notice-05 notice-04 |
| P3 | 对话框 / 菜单 / 抽屉 | 对话框 | 2 | 2 | 2 | 0 | 2 | dialog-02 dialog-05 |
| P3 | 按钮 | 关闭 / 不做了 | 2 | 2 | 2 | 0 | 2 | button-22 button-13 |
| P3 | 卡片 / 板 / 纸 | 装一组东西的板 | 2 | 2 | 3 | 0 | 3 | surface-06 surface-08 |
| P3 | 行 | 列表里的一项（不可点） | 1 | 2 | 3 | 0 | 3 | row-01 |
| P3 | 按钮 | 保存 | 1 | 1 | 1 | 0 | 1 | button-36 |
| P3 | 对话框 / 菜单 / 抽屉 | 确认危险操作 | 1 | 1 | 1 | 0 | 1 | dialog-01 |
| P3 | 按钮 | 重试 | 1 | 1 | 1 | 0 | 1 | button-23 |
| P3 | 按钮 | 运行维护任务 | 1 | 1 | 2 | 0 | 2 | button-23 |
| P3 | 按钮 | 复制 | 1 | 1 | 1 | 0 | 1 | button-13 |

## 三、变体 × 选项草表（提案 · 单一来源）

每类把实拍到的种按维度摊开：哪个维度真的有几种取值、每种取值覆盖多少处。
推选项的机械规则：一个维度上覆盖 ≥ 10% 实拍处数的取值算「选项」；不到 10% 的算「待收敛」（要么并到最近的选项，要么查到 Owner 决定后升为选项）。只有一个取值的维度不需要做成选项。

### 按钮（38 种，314 处）

| 维度 | 取值数 | 选项（≥10%） | 待收敛（<10%） |
|---|---|---|---|
| 底色 / 字色 | 9 | transparent / --eqb-color-text-secondary（116）；transparent / --blue-text（95）；transparent / --desk-ink（72） | --eqb-color-accent-fill / --eqb-color-accent-fill-ink（9：button-11 button-25）；--desk-page / --blue-text（6：button-12）；--action / --desk-raised（5：button-23 button-29 button-36）；transparent / --eqb-color-accent（4：button-16）；--desk-raised / --desk-ink（4：button-22 button-37）；transparent / --coral-text（3：button-28 button-35） |
| 圆角 | 5 | 8px（234）；4px（44） | 0px（30：button-06 button-08 button-20 button-31）；999px（5：button-15 button-29）；0px/8px（1：button-35） |
| 高度档 | 5 | 25–30（143）；31–36（141） | ≤24（19：button-08 button-14 button-21 button-31 button-32）；37–44（10：button-20 button-22 button-26 button-36）；>44（1：button-29） |
| 影子 | 2 | 无（313） | custom（1：button-29） |
| 边框 | 2 | 无（288） | 有（26：button-09 button-17 button-18 button-20 button-22 button-33 button-35 button-37） |
| 字号 / 字重 | 9 | 13/500（123）；16/400（72）；13/400（55）；14/500（34） | 13/600（13：button-11 button-23 button-25 button-36）；12/400（11：button-12 button-14）；18/400（4：button-15）；15/500（1：button-29）；14/600（1：button-37） |
| 图标 | 3 | icon+text（224）；none（71） | icon-only（19：button-09 button-15 button-16 button-21） |

### 标签 / 小签（4 种，35 处）

| 维度 | 取值数 | 选项（≥10%） | 待收敛（<10%） |
|---|---|---|---|
| 底色 / 字色 | 3 | --accent / --desk-raised（29） | --desk-raised / --blue-text（3：chip-02）；--desk-raised / --desk-ink（3：chip-03 chip-04） |
| 圆角 | 2 | 50%（29）；999px（6） | — |
| 高度档 | 2 | 25–30（33） | 31–36（2：chip-03） |
| 影子 | 2 | 无（32） | --elev-2（3：chip-03 chip-04） |
| 边框 | 2 | 无（29）；有（6） | — |
| 字号 / 字重 | 3 | 12/600（29）；13/400（4） | 14/500（2：chip-03） |
| 图标 | 2 | none（32） | icon+text（3：chip-03 chip-04） |

### 行（1 种，15 处）

| 维度 | 取值数 | 选项（≥10%） | 待收敛（<10%） |
|---|---|---|---|
| 底色 / 字色 | 1 | transparent / --desk-ink（全部）| — |
| 圆角 | 1 | 0px（全部）| — |
| 高度档 | 1 | 不定高（全部）| — |
| 影子 | 1 | 无（全部）| — |
| 边框 | 1 | 无（全部）| — |
| 字号 / 字重 | 1 | 16/400（全部）| — |
| 图标 | 1 | none（全部）| — |

### 卡片 / 板 / 纸（8 种，23 处）

| 维度 | 取值数 | 选项（≥10%） | 待收敛（<10%） |
|---|---|---|---|
| 底色 / 字色 | 3 | --desk-raised / --desk-ink（19）；--blue-soft / --desk-ink（3） | #F4F8FA / --desk-ink（1：surface-07） |
| 圆角 | 3 | 12px（14）；16px（5）；0px（4） | — |
| 高度档 | 1 | 不定高（全部）| — |
| 影子 | 3 | 无（16）；--elev-1（5） | custom（2：surface-05） |
| 边框 | 2 | 无（15）；有（8） | — |
| 字号 / 字重 | 2 | 16/400（22） | 13/400（1：surface-08） |
| 图标 | 1 | none（全部）| — |

### 提示条 / 报错（7 种，27 处）

| 维度 | 取值数 | 选项（≥10%） | 待收敛（<10%） |
|---|---|---|---|
| 底色 / 字色 | 5 | transparent / --blue-text（19）；--desk-raised / --desk-ink（5） | --coral-soft / transparent（1：notice-05）；--desk-page / --blue-text（1：notice-06）；transparent / --amber-text（1：notice-07） |
| 圆角 | 2 | 0px（20）；8px（7） | — |
| 高度档 | 1 | 不定高（全部）| — |
| 影子 | 3 | 无（21）；--elev-1（5） | custom（1：notice-06） |
| 边框 | 1 | 无（全部）| — |
| 字号 / 字重 | 3 | 12/400（13）；13/400（11）；16/400（3） | — |
| 图标 | 2 | none（23）；icon+text（4） | — |

### 底部提示 / 撤销（1 种，2 处）

| 维度 | 取值数 | 选项（≥10%） | 待收敛（<10%） |
|---|---|---|---|
| 底色 / 字色 | 1 | --desk-ink / --desk-raised（全部）| — |
| 圆角 | 1 | 8px（全部）| — |
| 高度档 | 1 | 不定高（全部）| — |
| 影子 | 1 | 无（全部）| — |
| 边框 | 1 | 无（全部）| — |
| 字号 / 字重 | 1 | 16/400（全部）| — |
| 图标 | 1 | none（全部）| — |

### 空状态（3 种，8 处）

| 维度 | 取值数 | 选项（≥10%） | 待收敛（<10%） |
|---|---|---|---|
| 底色 / 字色 | 2 | transparent / --blue-text（7）；transparent / --desk-ink（1） | — |
| 圆角 | 2 | 0px（7）；12px（1） | — |
| 高度档 | 1 | 不定高（全部）| — |
| 影子 | 1 | 无（全部）| — |
| 边框 | 2 | 无（7）；有（1） | — |
| 字号 / 字重 | 2 | 13/400（4）；16/400（4） | — |
| 图标 | 2 | none（7）；icon+text（1） | — |

### 对话框 / 菜单 / 抽屉（5 种，8 处）

| 维度 | 取值数 | 选项（≥10%） | 待收敛（<10%） |
|---|---|---|---|
| 底色 / 字色 | 1 | --desk-raised / --desk-ink（全部）| — |
| 圆角 | 2 | 12px（5）；8px（3） | — |
| 高度档 | 1 | 不定高（全部）| — |
| 影子 | 2 | --elev-3（7）；无（1） | — |
| 边框 | 2 | 无（4）；有（4） | — |
| 字号 / 字重 | 2 | 16/400（7）；13/400（1） | — |
| 图标 | 1 | none（全部）| — |

### 输入框 / 搜索（11 种，31 处）

| 维度 | 取值数 | 选项（≥10%） | 待收敛（<10%） |
|---|---|---|---|
| 底色 / 字色 | 3 | --desk-raised / --desk-ink（23）；--eqb-color-border-strong / #000000（4）；transparent / --desk-ink（4） | — |
| 圆角 | 4 | 8px（19）；12px（4）；999px（4）；0px（4） | — |
| 高度档 | 4 | 31–36（18）；>44（7）；≤24（4） | 37–44（2：field-06） |
| 影子 | 2 | 无（27）；custom（4） | — |
| 边框 | 2 | 有（27）；无（4） | — |
| 字号 / 字重 | 5 | 16/400（12）；13/400（11）；14/400（4） | 14/500（3：field-06 field-11）；12/500（1：field-10） |
| 图标 | 1 | none（全部）| — |

## 四、逐类变体明细

对照图：同目录 `sheet-<类>.png`。「对不上」只列客观检查（DESIGN.md 四档影子与圆角家族、色阶、WCAG 对比度、24×24 点击区域、焦点可见、读屏名字、axe）；「有意」= 查得到 Owner 原话或拍板文档。

### 按钮

| 编号 | 类名 | 处 / 位置 / 页面 | 主线 | 干什么 | 样子 | 走样并入 | 对不上 | 来历 | 有意？ | 抽构件 | 检查脚本锁 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| button-01 | ghost-button | 82 / 5 / 22 | 是 | 去别的页（导航） 60；登录 / 退出 22 | 底 transparent 字 #3F525B 13/500 圆角 8px 影 none 高 28 | — | — | 2026-05-14 f04806787 | 有意（文档里查得到 Owner 决定） | 易（只管样子） | 1 |
| button-02 | draft-group-actions-menu-trigger | 35 / 2 / 6 | 是 | 换篇 18；展开 / 收起 / 更多 17 | 底 transparent 字 #1B2B33 16/400 圆角 4px 影 none 高 32 | 17 处：左右内边距差 1px | axe label-content-name-mismatch×18 | 2026-08-04 68a6ed1ad | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 0 |
| button-03 | ghost-button | 30 / 5 / 6 | 是 | 去别的页（导航） 24；登录 / 退出 6 | 底 transparent 字 #3F525B 14/500 圆角 8px 影 none 高 36 | — | — | 2026-05-14 f04806787 | 有意（文档里查得到 Owner 决定） | 易（只管样子） | 1 |
| button-04 | concierge-group-row-icon | 21 / 2 / 4 | 是 | 展开 / 收起 / 更多 11；加入草稿卷 10 | 底 transparent 字 #5A6C75 16/400 圆角 8px 影 none 高 28 | — | — | 2026-09-04 123e0f0bf | 没查到 Owner 决定 | 易（只管样子） | 0 |
| button-05 | topbar-back | 18 / 1 / 18 | 是 | 去别的页（导航） 18 | 底 transparent 字 #5A6C75 13/500 圆角 8px 影 none 高 28 | — | — | 2026-05-17 30874c11e | 没查到 Owner 决定 | 易（只管样子） | 0 |
| button-06 | draft-paper-rail-item | 16 / 1 / 8 | 是 | 跳到某个题组 16 | 底 transparent 字 #5A6C75 13/400 圆角 0px 影 none 高 36 | — | — | 2026-07-12 b8a1612a6 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 2 |
| button-07 | concierge-browse-entry | 10 / 2 / 10 | 是 | 切换版式 / 版本 9；去别的页（导航） 1 | 底 transparent 字 #5A6C75 13/400 圆角 8px 影 none 高 32 | — | — | 2026-09-14 6fef61079 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 1 |
| button-08 | topbar-page-title-editable | 9 / 1 / 9 | 是 | 改名 9 | 底 transparent 字 #1B2B33 13/500 圆角 0px 影 none 高 18 | — | 点击 111×18 | 2026-07-14 7d5407574 | 没查到 Owner 决定 | 易（只管样子） | 0 |
| button-09 | draft-more-menu-trigger | 8 / 1 / 8 | 是 | 展开 / 收起 / 更多 8 | 底 transparent 字 #5A6C75 16/400 圆角 8px 影 none 高 28 | — | — | 2026-07-14 7d5407574 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 1 |
| button-10 | my-space-row-menu-trigger | 8 / 3 / 3 |  | 导出 / 存 PDF 3；去别的页（导航） 3；展开 / 收起 / 更多 2 | 底 transparent 字 #5A6C75 13/400 圆角 8px 影 none 高 36 | 2 处：左右内边距差 2px | — | 2026-09-17 5240fd58c | 没查到 Owner 决定 | 中 | 0 |
| button-11 | draft-export-menu-trigger | 7 / 1 / 7 | 是 | 导出 / 存 PDF 7 | 底 #72BFA4 字 #191D18 13/600 圆角 8px 影 none 高 32 | — | — | 2026-07-08 63df4d512 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 0 |
| button-12 | draft-group-suggestion | 6 / 1 / 6 | 是 | 采用建议 6 | 底 #F1F5F7 字 #5A6C75 12/400 圆角 8px 影 none 高 32 | — | — | 2026-07-13 a659baad0 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 1 |
| button-13 | ghost-button | 6 / 6 / 3 | 是 | 移出 / 删除 2；去别的页（导航） 1；复制 1；关闭 / 不做了 1；导出 / 存 PDF 1 | 底 transparent 字 #1B2B33 13/500 圆角 8px 影 none 高 36 | 1 处：高度差 2px，左右内边距差 2px | — | 2026-05-14 f04806787 | 有意（文档里查得到 Owner 决定） | 难（和页面状态缠在一起） | 1 |
| button-14 | draft-reorder-suggestion-undo | 5 / 1 / 5 | 是 | 撤销 / 撤回 5 | 底 transparent 字 #5A6C75 12/400 圆角 4px 影 none 高 23 | — | 点击 32×23 | 2026-11-13 e43919012 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 0 |
| button-15 | concierge-intent-clear | 4 / 1 / 4 | 是 | 清除搜索 / 筛选 4 | 底 transparent 字 #5A6C75 18/400 圆角 999px 影 none 高 28 | — | — | 2026-07-10 c70ec84d2 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 0 |
| button-16 | concierge-intent-submit | 4 / 1 / 4 | 是 | 搜索 4 | 底 transparent 字 #11957A 13/400 圆角 8px 影 none 高 32 | — | — | 2026-05-16 aba3eb447 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 0 |
| button-17 | concierge-command-filter-toggle | 4 / 1 / 4 | 是 | 筛选 / 分页签 4 | 底 transparent 字 #1B2B33 13/400 圆角 8px 影 none 高 36 | — | — | 2026-07-09 338b0979c | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 0 |
| button-18 | paper-browse-error-back | 4 / 1 / 4 |  | 去别的页（导航） 4 | 底 transparent 字 #1B2B33 13/500 圆角 8px 影 none 高 36 | — | — | 2026-11-08 95d32fb35 | 没查到 Owner 决定 | 中 | 0 |
| button-19 | ghost-button | 4 / 4 / 1 |  | 去别的页（导航） 3；登录 / 退出 1 | 底 transparent 字 #3F525B 13/400 圆角 8px 影 none 高 28 | — | — | 2026-05-14 f04806787 | 有意（文档里查得到 Owner 决定） | 易（只管样子） | 1 |
| button-20 | （无） | 4 / 4 / 1 |  | 筛选 / 分页签 4 | 底 transparent 字 #5A6C75 14/500 圆角 0px 影 none 高 44 | — | — | — | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 0 |
| button-21 | concierge-row-expand | 3 / 1 / 3 | 是 | 展开 / 收起 / 更多 3 | 底 transparent 字 #1B2B33 13/400 圆角 4px 影 none 高 22 | — | 点击 22×22 | 2026-05-16 ac2d8918f | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 1 |
| button-22 | （无） | 3 / 3 / 3 | 是 | 关闭 / 不做了 1；去别的页（导航） 1；撤销 / 撤回 1 | 底 #FFFFFF 字 #1B2B33 16/400 圆角 8px 影 none 高 38 | — | — | — | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 0 |
| button-23 | primary-button | 3 / 2 / 3 |  | 运行维护任务 2；重试 1 | 底 #29424D 字 #FFFFFF 13/600 圆角 8px 影 none 高 32 | — | — | 2026-05-14 f04806787 | 有意（文档里查得到 Owner 决定） | 中 | 1 |
| button-24 | concierge-group-row-icon | 2 / 2 / 2 | 是 | 加入草稿卷 1；展开 / 收起 / 更多 1 | 底 transparent 字 #1B2B33 16/400 圆角 8px 影 none 高 28 | — | — | 2026-09-04 123e0f0bf | 没查到 Owner 决定 | 易（只管样子） | 0 |
| button-25 | draft-a4-empty-cta | 2 / 2 / 2 | 是 | 去别的页（导航） 2 | 底 #72BFA4 字 #191D18 13/600 圆角 8px 影 none 高 36 | — | — | 2026-11-13 945df800c | 没查到 Owner 决定 | 中 | 0 |
| button-26 | （无） | 2 / 2 / 1 | 是 | 导出 / 存 PDF 2 | 底 transparent 字 #1B2B33 13/400 圆角 8px 影 none 高 38 | — | — | — | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 0 |
| button-27 | ghost-button | 2 / 1 / 2 | 是 | 去别的页（导航） 2 | 底 transparent 字 #1B2B33 13/500 圆角 8px 影 none 高 28 | — | — | 2026-05-14 f04806787 | 有意（文档里查得到 Owner 决定） | 易（只管样子） | 1 |
| button-28 | my-space-row-menu-item-danger | 2 / 2 / 2 |  | 移出 / 删除 2 | 底 transparent 字 #DC2626 13/400 圆角 8px 影 none 高 36 | 1 处：高度差 2px，左右内边距差 2px | — | 2026-09-17 5240fd58c | 没查到 Owner 决定 | 中 | 0 |
| button-29 | login-submit | 1 / 1 / 1 |  | 登录 / 退出 1 | 底 #29424D 字 #FFFFFF 15/500 圆角 999px 影 custom 高 52 | — | 影子不是四档之一：rgba(27, 43, 51, 0.18) 0px 8px 24px 0px | 2026-07-03 66814dba7 | 没查到 Owner 决定 | 易（只管样子） | 0 |
| button-30 | concierge-group-row-menuitem | 1 / 1 / 1 | 是 | 打开 / 查看 1 | 底 transparent 字 #1B2B33 13/400 圆角 8px 影 none 高 32 | — | — | 2026-09-04 123e0f0bf | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 0 |
| button-31 | concierge-filter-clear-inline | 1 / 1 / 1 | 是 | 清除搜索 / 筛选 1 | 底 transparent 字 #1B2B33 13/400 圆角 0px 影 none 高 18 | — | — | 2026-07-03 cf8660543 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 0 |
| button-32 | back-button | 1 / 1 / 1 | 是 | 去别的页（导航） 1 | 底 transparent 字 #5A6C75 13/500 圆角 8px 影 none 高 18 | — | 点击 72×18 | 2026-05-14 f04806787 | 没查到 Owner 决定 | 易（只管样子） | 1 |
| button-33 | draft-reorder-suggestion-act | 1 / 1 / 1 | 是 | 采用建议 1 | 底 transparent 字 #1B2B33 13/500 圆角 8px 影 none 高 26 | — | — | 2026-07-14 382f72f58 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 2 |
| button-34 | （无） | 1 / 1 / 1 | 是 | 调整顺序 1 | 底 transparent 字 #1B2B33 16/400 圆角 4px 影 none 高 36 | — | — | — | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 0 |
| button-35 | danger | 1 / 1 / 1 | 是 | 移出 / 删除 1 | 底 transparent 字 #DC2626 16/400 圆角 0px/8px 影 none 高 36 | — | — | 2026-05-16 a07bb6250 | 有意（文档里查得到 Owner 决定） | 难（和页面状态缠在一起） | 2 |
| button-36 | primary-button | 1 / 1 / 1 |  | 保存 1 | 底 #29424D 字 #FFFFFF 13/600 圆角 8px 影 none 高 38 | — | — | 2026-05-14 f04806787 | 有意（文档里查得到 Owner 决定） | 中 | 1 |
| button-37 | vocabulary-practice-back | 1 / 1 / 1 |  | 去别的页（导航） 1 | 底 #FFFFFF 字 #1B2B33 14/600 圆角 8px 影 none 高 36 | — | — | 2026-08-10 f9f7c5887 | 没查到 Owner 决定 | 易（只管样子） | 0 |
| button-38 | topbar-back | 1 / 1 / 1 |  | 去别的页（导航） 1 | 底 transparent 字 #1B2B33 16/400 圆角 8px 影 none 高 28 | — | — | 2026-05-17 30874c11e | 没查到 Owner 决定 | 易（只管样子） | 0 |

### 标签 / 小签

| 编号 | 类名 | 处 / 位置 / 页面 | 主线 | 干什么 | 样子 | 走样并入 | 对不上 | 来历 | 有意？ | 抽构件 | 检查脚本锁 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chip-01 | topbar-avatar | 29 / 1 / 29 | 是 | 状态标记（不可点） 29 | 底 #2C6E56 字 #FFFFFF 12/600 圆角 50% 影 none 高 28 | — | — | 2026-09-04 123e0f0bf | 有意（文档里查得到 Owner 决定） | 易（只管样子） | 0 |
| chip-02 | concierge-browse-chip | 3 / 3 / 1 | 是 | 筛选 / 切换 3 | 底 #FFFFFF 字 #5A6C75 13/400 圆角 999px 影 none 高 28 | — | — | 2026-09-04 123e0f0bf | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 2 |
| chip-03 | basket-chip | 2 / 1 / 2 | 是 | 去草稿卷（带数量） 2 | 底 #FFFFFF 字 #1B2B33 14/500 圆角 999px 影 --elev-2 高 36 | — | — | 2026-05-16 aba3eb447 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 2 |
| chip-04 | basket-chip | 1 / 1 / 1 | 是 | 去草稿卷（带数量） 1 | 底 #FFFFFF 字 #1B2B33 13/400 圆角 999px 影 --elev-2 高 28 | — | — | 2026-05-16 aba3eb447 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 2 |

### 行

| 编号 | 类名 | 处 / 位置 / 页面 | 主线 | 干什么 | 样子 | 走样并入 | 对不上 | 来历 | 有意？ | 抽构件 | 检查脚本锁 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| row-01 | concierge-group-row | 15 / 4 / 7 | 是 | 打开一项（整行可点） 12；列表里的一项（不可点） 3 | 底 transparent 字 #1B2B33 16/400 圆角 0px 影 none | — | — | 2026-07-08 9c6b6b77b | 有意（文档里查得到 Owner 决定） | 难（和页面状态缠在一起） | 2 |

### 卡片 / 板 / 纸

| 编号 | 类名 | 处 / 位置 / 页面 | 主线 | 干什么 | 样子 | 走样并入 | 对不上 | 来历 | 有意？ | 抽构件 | 检查脚本锁 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| surface-01 | draft-paper-rail | 9 / 1 / 9 | 是 | 底色分区 9 | 底 #FFFFFF 字 #1B2B33 16/400 圆角 12px 影 none | — | — | 2026-07-12 b8a1612a6 | 没查到 Owner 决定 | 易（只管样子） | 3 |
| surface-02 | concierge-intent-bar | 3 / 1 / 3 | 是 | 放在桌上的一张纸 3 | 底 #FFFFFF 字 #1B2B33 16/400 圆角 16px 影 --elev-1 | — | — | 2026-05-16 aba3eb447 | 没查到 Owner 决定 | 中 | 1 |
| surface-03 | concierge-paper-row-head | 3 / 1 / 3 | 是 | 底色分区 3 | 底 #E6EDF0 字 #1B2B33 16/400 圆角 0px 影 none | — | — | 2026-09-04 123e0f0bf | 没查到 Owner 决定 | 易（只管样子） | 2 |
| surface-04 | concierge-intent-bar | 2 / 1 / 2 | 是 | 放在桌上的一张纸 2 | 底 #FFFFFF 字 #1B2B33 16/400 圆角 16px 影 --elev-1 | — | — | 2026-05-16 aba3eb447 | 没查到 Owner 决定 | 中 | 1 |
| surface-05 | concierge-paper-list | 2 / 2 / 2 | 是 | 放在桌上的一张纸 2 | 底 #FFFFFF 字 #1B2B33 16/400 圆角 12px 影 custom | — | 影子不是四档之一：rgb(220, 230, 235) 0px 0px 0px 1px | 2026-05-16 ac2d8918f | 没查到 Owner 决定 | 中 | 0 |
| surface-06 | my-space-file-list | 2 / 1 / 2 |  | 装一组东西的板 2 | 底 #FFFFFF 字 #1B2B33 16/400 圆角 12px 影 none | — | — | 2026-09-17 5240fd58c | 没查到 Owner 决定 | 易（只管样子） | 1 |
| surface-07 | login-page | 1 / 1 / 1 |  | 底色分区 1 | 底 #F4F8FA 字 #1B2B33 16/400 圆角 0px 影 none | — | 底色 #F4F8FA 不在色阶变量里 | 2026-07-03 66814dba7 | 有意（文档里查得到 Owner 决定） | 易（只管样子） | 0 |
| surface-08 | agent-token-secret | 1 / 1 / 1 |  | 装一组东西的板 1 | 底 #FFFFFF 字 #1B2B33 13/400 圆角 12px 影 none | — | — | 2026-11-04 41eeed8e5 | 没查到 Owner 决定 | 易（只管样子） | 0 |

### 提示条 / 报错

| 编号 | 类名 | 处 / 位置 / 页面 | 主线 | 干什么 | 样子 | 走样并入 | 对不上 | 来历 | 有意？ | 抽构件 | 检查脚本锁 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| notice-01 | draft-save-status | 12 / 3 / 12 | 是 | 说明 12 | 底 transparent 字 #5A6C75 12/400 圆角 0px 影 none | — | — | 2026-05-23 4263fb710 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 2 |
| notice-02 | draft-reorder-suggestion | 5 / 1 / 5 | 是 | 说明 5 | 底 #FFFFFF 字 #1B2B33 13/400 圆角 8px 影 --elev-1 | — | — | 2026-07-14 382f72f58 | 没查到 Owner 决定 | 中 | 2 |
| notice-03 | concierge-notice | 4 / 1 / 4 | 是 | 说明 4 | 底 transparent 字 #5A6C75 13/400 圆角 0px 影 none | — | — | 2026-05-16 aba3eb447 | 有意（文档里查得到 Owner 决定） | 中 | 0 |
| notice-04 | paper-browse-error | 3 / 2 / 3 | 是 | 报错 2；说明 1 | 底 transparent 字 #5A6C75 16/400 圆角 0px 影 none | — | — | 2026-07-08 63c878d01 | 没查到 Owner 决定 | 中 | 4 |
| notice-05 | login-error | 1 / 1 / 1 |  | 报错 1 | 底 #EF4444/8% 字 color(srgb 0.711373 0.152941 0.159216) 13/400 圆角 8px 影 none | — | — | 2026-07-03 66814dba7 | 没查到 Owner 决定 | 易（只管样子） | 0 |
| notice-06 | draft-reorder-suggestion | 1 / 1 / 1 | 是 | 说明 1 | 底 #F1F5F7 字 #5A6C75 13/400 圆角 8px 影 custom | — | 影子不是四档之一：rgba(0, 0, 0, 0) 0px 0px 0px 1px | 2026-07-14 382f72f58 | 没查到 Owner 决定 | 中 | 2 |
| notice-07 | draft-save-status | 1 / 1 / 1 | 是 | 说明 1 | 底 transparent 字 #E8901A 12/400 圆角 0px 影 none | — | 对比度 2.27 | 2026-05-23 4263fb710 | 没查到 Owner 决定 | 难（和页面状态缠在一起） | 2 |

### 底部提示 / 撤销

| 编号 | 类名 | 处 / 位置 / 页面 | 主线 | 干什么 | 样子 | 走样并入 | 对不上 | 来历 | 有意？ | 抽构件 | 检查脚本锁 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| toast-01 | draft-undo-toast | 2 / 2 / 2 | 是 | 带撤销的反馈 2 | 底 #1B2B33 字 #FFFFFF 16/400 圆角 8px 影 none | — | — | 2026-05-23 4263fb710 | 有意（文档里查得到 Owner 决定） | 中 | 2 |

### 空状态

| 编号 | 类名 | 处 / 位置 / 页面 | 主线 | 干什么 | 样子 | 走样并入 | 对不上 | 来历 | 有意？ | 抽构件 | 检查脚本锁 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| empty-01 | draft-paper-rail-empty | 4 / 4 / 3 | 是 | 还没东西 3；搜了没结果 1 | 底 transparent 字 #5A6C75 13/400 圆角 0px 影 none | — | — | 2026-07-12 b8a1612a6 | 没查到 Owner 决定 | 中 | 0 |
| empty-02 | draft-a4-empty | 3 / 2 / 3 | 是 | 加载中（占位文字） 2；还没东西 1 | 底 transparent 字 #5A6C75 16/400 圆角 0px 影 none | — | — | 2026-05-23 4263fb710 | 没查到 Owner 决定 | 中 | 0 |
| empty-03 | notebook-empty-state | 1 / 1 / 1 |  | 还没东西 1 | 底 transparent 字 #1B2B33 16/400 圆角 12px 影 none | — | — | 2026-11-08 95d32fb35 | 没查到 Owner 决定 | 易（只管样子） | 0 |

### 对话框 / 菜单 / 抽屉

| 编号 | 类名 | 处 / 位置 / 页面 | 主线 | 干什么 | 样子 | 走样并入 | 对不上 | 来历 | 有意？ | 抽构件 | 检查脚本锁 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| dialog-01 | draft-group-actions-menu-panel | 3 / 3 / 3 | 是 | 菜单 2；确认危险操作 1 | 底 #FFFFFF 字 #1B2B33 16/400 圆角 12px 影 --elev-3 | — | — | 2026-08-04 68a6ed1ad | 没查到 Owner 决定 | 中 | 0 |
| dialog-02 | draft-save-space-dialog | 2 / 2 / 2 | 是 | 菜单 1；对话框 1 | 底 #FFFFFF 字 #1B2B33 16/400 圆角 8px 影 --elev-3 | — | — | 2026-05-23 705d3d309 | 没查到 Owner 决定 | 中 | 1 |
| dialog-03 | concierge-group-row-menu | 1 / 1 / 1 | 是 | 菜单 1 | 底 #FFFFFF 字 #1B2B33 16/400 圆角 8px 影 --elev-3 | — | axe region×1 | 2026-09-04 123e0f0bf | 没查到 Owner 决定 | 中 | 0 |
| dialog-04 | my-space-row-menu | 1 / 1 / 1 |  | 菜单 1 | 底 #FFFFFF 字 #1B2B33 16/400 圆角 12px 影 --elev-3 | — | axe region×1 | 2026-09-17 5240fd58c | 没查到 Owner 决定 | 中 | 0 |
| dialog-05 | agent-token-dialog | 1 / 1 / 1 |  | 对话框 1 | 底 #FFFFFF 字 #1B2B33 13/400 圆角 12px 影 none | — | — | 2026-11-04 41eeed8e5 | 没查到 Owner 决定 | 易（只管样子） | 0 |

### 输入框 / 搜索

| 编号 | 类名 | 处 / 位置 / 页面 | 主线 | 干什么 | 样子 | 走样并入 | 对不上 | 来历 | 有意？ | 抽构件 | 检查脚本锁 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| field-01 | （无） | 8 / 1 / 8 | 是 | 下拉选择 8 | 底 #FFFFFF 字 #1B2B33 13/400 圆角 8px 影 none 高 32 | — | — | — | 没查到 Owner 决定 | 中 | 0 |
| field-02 | draft-recent-select | 5 / 5 / 2 | 是 | 文字输入 3；下拉选择 2 | 底 #FFFFFF 字 #1B2B33 16/400 圆角 8px 影 none 高 36 | 1 处：高度差 2px | — | 2026-05-23 4263fb710 | 没查到 Owner 决定 | 中 | 1 |
| field-03 | （无） | 4 / 2 / 2 |  | 文字输入 4 | 底 #FFFFFF 字 #1B2B33 14/400 圆角 12px 影 custom 高 52 | — | 影子不是四档之一：rgba(27, 43, 51, 0.05) 0px 1px 2px 0px | — | 没查到 Owner 决定 | 易（只管样子） | 0 |
| field-04 | （无） | 4 / 1 / 4 | 是 | 勾选 / 开关 4 | 底 #C5D3DA 字 #000000 16/400 圆角 999px 影 none 高 18 | — | 字色 #000000 不在色阶变量里；点击 32×18；axe target-size×4 | — | 没查到 Owner 决定 | 中 | 0 |
| field-05 | concierge-intent-input | 2 / 1 / 2 | 是 | 搜索 2 | 底 transparent 字 #1B2B33 16/400 圆角 0px 影 none 高 52 | — | — | 2026-05-16 aba3eb447 | 没查到 Owner 决定 | 中 | 1 |
| field-06 | （无） | 2 / 2 / 1 |  | 文字输入 2 | 底 #FFFFFF 字 #1B2B33 14/500 圆角 8px 影 none 高 37 | — | — | — | 没查到 Owner 决定 | 中 | 0 |
| field-07 | （无） | 2 / 1 / 2 |  | 文字输入 2 | 底 #FFFFFF 字 #1B2B33 13/400 圆角 8px 影 none 高 34 | — | — | — | 没查到 Owner 决定 | 易（只管样子） | 0 |
| field-08 | concierge-intent-input | 1 / 1 / 1 | 是 | 搜索 1 | 底 transparent 字 #1B2B33 16/400 圆角 0px 影 none 高 52 | — | — | 2026-05-16 aba3eb447 | 没查到 Owner 决定 | 中 | 1 |
| field-09 | concierge-intent-input | 1 / 1 / 1 | 是 | 搜索 1 | 底 transparent 字 #1B2B33 13/400 圆角 0px 影 none 高 34 | — | — | 2026-05-16 aba3eb447 | 没查到 Owner 决定 | 中 | 1 |
| field-10 | （无） | 1 / 1 / 1 |  | 下拉选择 1 | 底 #FFFFFF 字 #1B2B33 12/500 圆角 8px 影 none 高 35 | — | — | — | 没查到 Owner 决定 | 中 | 0 |
| field-11 | （无） | 1 / 1 / 1 |  | 搜索 1 | 底 #FFFFFF 字 #1B2B33 14/500 圆角 8px 影 none 高 35 | — | — | — | 没查到 Owner 决定 | 中 | 0 |

## 五、证明

### 1. 源码静态统计 vs 页面实拍

| 类 | 源码写法位置 | 实拍到的位置 | 两边一致 | 只在页面（源码归了别的类） | 源码有、页面归成别的类 | 源码有、没拍到 | 覆盖率 |
|---|---|---|---|---|---|---|---|
| 按钮 | 325 | 67 | 67 | 0 | 1（页面里归成「行」 1） | 257 | 20.9% |
| 标签 / 小签 | 29 | 6 | 5 | 1（源码按标签和类名归成「不在九类」，页面按画出来的样子归成「标签 / 小签」 1） | 0 | 24 | 17.2% |
| 行 | 35 | 5 | 2 | 3（源码按标签和类名归成「不在九类」，页面按画出来的样子归成「行」 2；源码按标签和类名归成「按钮」，页面按画出来的样子归成「行」 1） | 0 | 33 | 5.7% |
| 卡片 / 板 / 纸 | 39 | 10 | 0 | 10（源码按标签和类名归成「不在九类」，页面按画出来的样子归成「卡片 / 板 / 纸」 10） | 5（页面里拍到了，但没画东西（不算构件） 3；页面里归成「对话框 / 菜单 / 抽屉」 2） | 34 | 12.8% |
| 提示条 / 报错 | 74 | 9 | 9 | 0 | 0 | 65 | 12.2% |
| 底部提示 / 撤销 | 4 | 2 | 2 | 0 | 0 | 2 | 50% |
| 空状态 | 43 | 7 | 7 | 0 | 0 | 36 | 16.3% |
| 对话框 / 菜单 / 抽屉 | 22 | 8 | 6 | 2（源码按标签和类名归成「卡片 / 板 / 纸」，页面按画出来的样子归成「对话框 / 菜单 / 抽屉」 2） | 5（页面里拍到了，但没画东西（不算构件） 5） | 11 | 50% |
| 输入框 / 搜索 | 67 | 15 | 15 | 0 | 0 | 52 | 22.4% |

### 2. 没拍到的写法位置，按原因

原因由脚本从源码里包着这个元素的最内层条件推出来（逐条见 `data/uncaptured.json`）。

| 类 | 原因 | 位置数 |
|---|---|---|
| 按钮 | A3 拼版时才出现 | 1 |
| 按钮 | 出错时才出现 | 11 |
| 按钮 | 展开或打开之后才出现 | 6 |
| 按钮 | 操作之后才出现 | 1 |
| 按钮 | 本地四组测试题跑不出这一块 | 38 |
| 按钮 | 条件没满足 | 21 |
| 按钮 | 某种模式下才出现 | 3 |
| 按钮 | 空 / 非空某一种情况才出现 | 18 |
| 按钮 | 管理页的这个状态没走到 | 1 |
| 按钮 | 这个组件这次没渲染 | 8 |
| 按钮 | 需要生词或学生数据 | 149 |
| 标签 / 小签 | 加载或进行中才出现 | 1 |
| 标签 / 小签 | 展开或打开之后才出现 | 1 |
| 标签 / 小签 | 本地四组测试题跑不出这一块 | 11 |
| 标签 / 小签 | 条件没满足 | 3 |
| 标签 / 小签 | 空 / 非空某一种情况才出现 | 8 |
| 对话框 / 菜单 / 抽屉 | 展开或打开之后才出现 | 1 |
| 对话框 / 菜单 / 抽屉 | 本地四组测试题跑不出这一块 | 3 |
| 对话框 / 菜单 / 抽屉 | 这个组件这次没渲染 | 1 |
| 对话框 / 菜单 / 抽屉 | 需要生词或学生数据 | 6 |
| 空状态 | 出错时才出现 | 5 |
| 空状态 | 加载或进行中才出现 | 4 |
| 空状态 | 本地四组测试题跑不出这一块 | 8 |
| 空状态 | 条件没满足 | 1 |
| 空状态 | 某种模式下才出现 | 5 |
| 空状态 | 空 / 非空某一种情况才出现 | 9 |
| 空状态 | 这个组件这次没渲染 | 1 |
| 空状态 | 需要生词或学生数据 | 3 |
| 输入框 / 搜索 | 条件没满足 | 9 |
| 输入框 / 搜索 | 某种模式下才出现 | 1 |
| 输入框 / 搜索 | 空 / 非空某一种情况才出现 | 1 |
| 输入框 / 搜索 | 这个组件这次没渲染 | 16 |
| 输入框 / 搜索 | 需要生词或学生数据 | 25 |
| 提示条 / 报错 | 出错时才出现 | 25 |
| 提示条 / 报错 | 加载或进行中才出现 | 5 |
| 提示条 / 报错 | 操作之后才出现 | 1 |
| 提示条 / 报错 | 本地四组测试题跑不出这一块 | 5 |
| 提示条 / 报错 | 条件没满足 | 1 |
| 提示条 / 报错 | 某种模式下才出现 | 1 |
| 提示条 / 报错 | 空 / 非空某一种情况才出现 | 1 |
| 提示条 / 报错 | 管理页的这个状态没走到 | 5 |
| 提示条 / 报错 | 这个组件这次没渲染 | 1 |
| 提示条 / 报错 | 需要生词或学生数据 | 20 |
| 行 | 加载或进行中才出现 | 6 |
| 行 | 展开或打开之后才出现 | 1 |
| 行 | 本地四组测试题跑不出这一块 | 8 |
| 行 | 条件没满足 | 1 |
| 行 | 某种模式下才出现 | 1 |
| 行 | 空 / 非空某一种情况才出现 | 2 |
| 行 | 这个组件这次没渲染 | 3 |
| 行 | 需要生词或学生数据 | 11 |
| 卡片 / 板 / 纸 | 加载或进行中才出现 | 3 |
| 卡片 / 板 / 纸 | 展开或打开之后才出现 | 2 |
| 卡片 / 板 / 纸 | 本地四组测试题跑不出这一块 | 10 |
| 卡片 / 板 / 纸 | 条件没满足 | 3 |
| 卡片 / 板 / 纸 | 某种模式下才出现 | 2 |
| 卡片 / 板 / 纸 | 空 / 非空某一种情况才出现 | 1 |
| 卡片 / 板 / 纸 | 这个组件这次没渲染 | 4 |
| 卡片 / 板 / 纸 | 需要生词或学生数据 | 9 |
| 底部提示 / 撤销 | 操作之后才出现 | 2 |

### 3. 故意塞的变体（找不找得出来）

在找题页上按一个真实按钮（components/AppTopbar.tsx:187:11「生词本」）塞三个：

- A 全新样子（品红 #FF00AA、圆角 3px、字号 11px）→ 单独成一种 button-39；检查标出：圆角 3px 不在家族、底色 #FF00AA 不在色阶
- B 差一点点（圆角 +0.5px、字色红通道 +2）→ 并进参照那一种 button-03，记为走样：字色差 ΔE 0.7、圆角差 0.5px
- C 一模一样的复制 → 同一个精确签名，不算走样

结论：三个都按预期找出来了。塞的元素只用于这次检查，不计入上面任何数。

### 4. 行为（源码里怎么实现的）

| 行为 | 实现处数 | 在哪些组件 |
|---|---|---|
| 撤销 | 6 | ConciergeGroupRowMenu、DraftPaperWorkbench、MySpacePage、SentenceAnalysisCard、VocabularyMeaningRecallPanel、VocabularyReviewPage |
| 计时器（毫秒） | 24 | ConciergeDesk 4000、DraftPaperWorkbench 180、DraftPaperWorkbench 400、DraftPaperWorkbench 150、DraftPaperWorkbench 450、DraftPaperWorkbench 8000、DraftPaperWorkbench 2200、DraftPaperWorkbench 6000、PaperBrowsePageContent durationMs、PaperBrowsePageContent 120、PaperBrowsePageContent 150、PaperBrowsePageContent 2200、AnnotatedSentence MOVE_MS + 20、AnnotatedSentence ECHO_MS、null SENSE_DEBOUNCE_MS、SimilarPassagesPanel 2200、VocabularyDictationPage milliseconds、VocabularyDictationWorkbench 0、VocabularyDictationWorkbench 250、VocabularyListenPage milliseconds、VocabularyPracticePage MATCH_CONFIRMATION_MS |
| Esc 关闭 | 11 | AppTopbar、ConciergeDesk、ConciergeGroupRowMenu、DraftPaperWorkbench、ArtifactMenu、MySpacePage、ListeningSegmentPlayer、PaperBrowsePageContent、features/paper-browse/selection/usePaperSelectionTranslation.tsx、VocabularyHandwritingSelector、VocabularyReviewPage |
| 焦点去向（.focus()） | 11 | AppTopbar、ConciergeGroupRowMenu、DraftPaperWorkbench、ArtifactMenu、MySpacePage、ListeningSegmentPlayer、PaperBrowsePageContent、VocabularyDictationWorkbench、VocabularyHandwritingSelector、VocabularyPracticePage、VocabularyReviewPage |
| 弹层共用钩子 | 3 | AgentTokens、DraftPaperWorkbench、EntryModal |
| 提示出现 / 消失共用钩子 | 4 | DraftPaperWorkbench（removedItem, 120）、DraftPaperWorkbench（savedToastMessage, 120）、DraftPaperWorkbench（swapAddToastMessage, 120）、MySpacePage（confirmTarget, 120） |
| 读屏播报（aria-live / role=alert/status） | 65 | alert 27、status 17、polite 19、off 2 |
| 加载占位（aria-busy / loading 类） | 44 | — |

