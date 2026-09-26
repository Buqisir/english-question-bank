# Full import rehearsal — Owner agreement, 2026-09-20

## Owner 压测分区与试卷登记（2026-09-22）

Owner 计划用几套试卷完成本轮压测，具体套数未定。分区用于管理压测进度，
不替代 Review 状态、批准或发布凭据，也不新增网站分区功能：

- **C 区**：正在导入、检查和处理问题的试卷。
- **B 区**：暂时没有待处理问题，退出当前压测、保留候选与证据的试卷；尚未上线。
- **A 区**：最终已上线的试卷；只有完成另行明确授权的正式发布后才登记到此区。

**C 区发现问题须回查 B 区。** C 区压测确认的通用规则缺口或实现缺陷，
必须检查 B 区试卷是否同样适用、是否已经做到；不把单卷特有内容错误推广到其他卷。
确有同类问题的 B 区试卷标记为“B 区待返修”，完成受影响内容或共享实现修复，
按实际影响复核 Screen/PDF 及相关门禁，通过后才恢复“暂时没问题”状态。
回查已符合或不适用的试卷只记录依据，不无故重建 revision 或重渲染。
返修保留旧 revision、PDF 与证据，需更新时生成新版本，不覆盖历史。
B 区不是永久豁免区；此规则不授权修改或重新发布 A 区生产试卷。

### 当前产品线收口：三产品均友好分页（Owner 2026-09-26 确认并授权实现）

本节记录新的实现目标，优先于下方旧产品组合；不是已上线规则，也不改变历史
Review、renderer 或分页计划身份。Owner 已授权在样张基础上实现共享自动选档、
友好分页与正式产品入口，不授权发布、部署或推 Git。

| 学生试卷产品 | 内容与字号 | 页数门槛 |
| --- | --- | --- |
| 省纸版 | 无听力；优先小四 12pt／19.5pt，未通过有界八页验收再回退五号 10.5pt／18pt | 恰好 8 页 A4，原尺寸顺序 2-up 为两张双面 A3 |
| 大字无听力版 | 无听力；固定小四 12pt／19.5pt，不自动降档 | 最多 10 页 A4，写实际页数，不补空白页 |
| 大字完整版 | 完整有听力；固定小四 12pt／19.5pt，不自动降档 | 最多 12 页 A4，写实际页数，不补空白页 |

字号按整卷选档，不混用或增加中间字号；省纸版须明确告知最终字号。五号仍不合格
就报告无可用省纸版，不将九／十页或内容不完整的卷标作八页。两个大字版超过
各自上限同样报告失败。教师答案解析是配套投影，不套学生卷页数上限。

三产品都在页数约束内做友好分页，改善题组邻接与翻页，不以首次排下即结束。
答题框优先正常高度（应用65mm、续写57mm），必要时才压缩；确定断页后须重新
尝试恢复被压缩的框，空间足够时不得沿用小框。Owner 已指出五号样张p8存在此问题。
恢复不能造成页数越限、题面与框不当分离、给定语裁切或图文碰撞。

三产品只省略卷首行政说明；听力／题型指导语、写作词数和答题卡要求、源给定语
全部保留。另有答题卡，卷面写作框可以紧凑，但须保留完整四边框，不能隐藏或
裁切内容。不以凑页数牺牲漫画可辨性、选项完整性或学生答案隐藏。
本阶段沿用左右20／上21／下24mm及现有纸面标题“英 语”；完整模拟卷名的
纸面呈现仍未拍板，不能用本阶段页数推断另加长标题后仍合格。

**Owner 收口确认（2026-09-26）**：Owner 已认可新三产品 PDF 样张及 Screen
16px／26px 连续阅读的桌面 QA。卷首行政注意事项只在 Screen 保留，三个学生
PDF 均去掉；题型、听力和写作的作答说明保留。此确认是样式验收，不是 Review
批准、上线或最终全量门禁通过。旧 R6 精确重放与新产品样张不能混作同一身份。

**B 区新产品线待回验**：皖南八校（以已登记 R11 为历史起点）与浙江县域联盟
（已登记 R5）均须按上述三个产品及 Screen 规则重新核对。保留已审题文、答案、
解析及历史证据；返修针对输出版式与新产品绑定，不无故重新导题或重做校对。
逐卷先跑新三档，检查页数、最终字号、友好分页及框恢复；需变更的候选另存新
revision，未受影响的数据不改。完成复核之前，不用旧八／十页证据宣称新三档
已通过。本次登记尚未执行 B 区新渲染或修改其 Review，也不触及 A 区生产卷。

**B 区三产品本地重渲染（2026-09-26）**：已从皖南八校 R11
`rev-1389dee8-43cd-4c99-b1fb-c5ff19d5927a` 与县域 R5
`rev-c2a93a83-ef08-485d-8ea8-f64d54042447` 的精确原始 Student HTML，
使用当前共享三产品 planner 重新生成六份 PDF，不复用历史分页结果。

| 试卷 | 大字完整版 | 大字无听力版 | 省纸版 | 省纸版应用／续写框 |
| --- | --- | --- | --- | --- |
| 皖南八校 | 小四12页 | 小四10页 | 五号8页 | 65／57mm |
| 浙江县域联盟 | 小四12页 | 小四10页 | 五号8页 | 54／57mm |

四份大字稿的框均65／57mm；两套省纸版先搜索小四再回退五号，
续写框均恢复正常高度。六份逐项比对源文本（仅排除卷首行政说明和空白）、
图片字节／顺序、题目ID、计算字号／行高／框高，全部通过；全页联系图
已检查，写作题面和完整框同页。两份八页稿另生成原尺寸顺序双拼四面A3，
不缩放，四面均目检。产物在 `.amp/in/artifacts/b-products/{wn8,county}/`，
输入、渲染哈希和逐项检查在 `.scratch/b-products/{wn8,county}/`。
`verify-student-product-pdf` PASS；侧栏中文标签 `verify-paper-browse`
237 PASS／0 FAIL，app build PASS。未逐卷重跑 Full，未宣称全量门禁通过。
实体打印、B卷新版受保护PDF端点及新Review绑定仍未验收；旧R11／R5保留，
本次是本地重渲染样张，不是新revision、批准、发布、提交或推送。

**大字版留白平衡候选（2026-09-26）**：Owner 保留三产品战略，要求改善
跨页和空白的取舍。两个大字产品在原连续性评分上增加非末页页尾空白代价；
实测文字、图片、表格及完整答题框的占用，不把框内空白当浪费。三行以内的
页尾参差不扣分，超过部分按行数平方计分；这是待 Owner QA 的排序参数，
不是金样物理标准或硬性拒绝阈值。搜索、选用及重放汇总一致，省纸版及旧
调用者默认不启用；字号、行距、边距和题目完整性约束未改。
第一次低权重试排把皖南B篇前空白移到了C篇前，已拒绝作为交付；最终候选
皖南完整版11页（保留听力第二节、续写起页），无听力9页（自然接排），
县域无听力10页（保留D篇起页，D不再跨三页）。三份文字、图片比对通过，
65／57mm框不变，全页已目检；县域p8及皖南完整版p1仍有留白，未宣称无空白。
文件在 `.amp/in/artifacts/b-balanced/`，测量和首轮失败证据在
`.scratch/b-balanced*`。这是本地代码及样张，不是新Review或已发布产品。

Owner 随后否定皖南p1听力后76mm空白：大字自动候选不再主动对听力题组
加分页，仍保留材料提示／小题原子保护及后续阅读写作的优化；历史显式计划不改。
新皖南完整版仍11页，p1尾空白约15mm，p10约47mm换取p11完整续写与57mm框。
全页目检、逐字DOM对照、字体嵌入及 `verify-student-product-pdf` PASS；样张
`.amp/in/artifacts/wn8-listening-flow/wn8-largeComplete.pdf`，未封存新Review。
前一轮全量记录172 PASS／1 SKIP／2 FAIL：运维测试提交签名环境失败（隔离关闭
签名后113 PASS），续写Screen测试仍有旧24px与Owner确认26px的口径冲突。
本轮只做上述针对性验证，不宣称最终全量门禁通过。

**B 区绑定返修静态交付完成（2026-09-26，待 Owner 审核）**：Owner 接受上述皖南11页样张后授权
回修B区。皖南R11与县域R5在各自原隔离checkout逐文件保留前像后移植三产品；
不以origin/main替代未推overlay，不迁移各卷authority或文本校对版本。
新增预处理报告evidence v3支持三产品，旧v1/v2保持原语义；最终交接另核
具体revision、renderer、plan、受保护PDF字节及每版字号／行高，不以报告页数
代替绑定与可视验收。两卷题文Candidate保持原值；皖南提交唯一新R12
`rev-0aad881b-9c4e-4b06-92af-ccc702cd92d5`，县域提交唯一新R6
`rev-7258a125-458f-4f7d-b894-905e0e2844bd`。最终只读预检均 awaiting_review、
rendererStale=false、blockers=[]、approval/promotion=null。

实际Screen检查补齐听力题干、选项及材料提示26px行高，Print/PDF未改；
续写和golden-role的旧Screen24px测试同步到已确认26px（原半步段间距12px不变）。
后续Owner确认Screen回归10.5pt／约18pt基准，并保留整张试卷自适应DOM放大；
此决定取代上述Screen16px／26px覆盖，不改变三档PDF字号或分页计划。
Screen与PDF保持内容一致，不要求版式一一对应；听力播放器与居中目录保留。
独立Standards复核限定本轮B区的v1/v2历史计划与新v4产品；C区R6的compact-v3
仍只由其原独立环境重放，本轮没有迁入父或B区，不能声称父支持该历史格式。
旧import-ops PDF issue录入已不在本轮产品入口范围，其旧edition限制保留；
Owner通过Amp反馈，不恢复已取消的批注UI。冻结24文件后完整回归
`pnpm -C app verify:all` 为174 PASS／1 SKIP／0 FAIL（1867.4s；仅本进程
关闭测试Git提交签名）；i16a因卷外fixture缺失SKIP。两隔离区通用发布测试的
临时origin与真实磁盘绑定origin冲突FAIL仍保留，不以父区PASS抹去。
皖南三档11/9/8页、县域12/10/8页，受保护endpoint共58页光栅与目检版本
逐页相同；两卷省纸版补齐原尺寸顺序四面A3，未实体打印。
静态交付在`.amp/in/artifacts/b-repair-final/`；在线Owner身份边界未证明，
QA Ready:no。不批准、不发布、不Ship；本地代码尚未提交。

现有只读证据：C 卷 R6 的 title-only 小四无听力自然10页、有听力自然12页；
无听力小四两轮十格诊断未找到八页，不能据此宣称所有布局都不可能。
先复验新卷首规则下的五号八页回退，并复用精确版本的小四含听力证据；样张
尚不等于自动选档已实现。试排仅做针对性数字／视觉检查；共享代码稳定后再按
仓库门禁做最终全量验证，不逐格运行 Full。历史 R6 与旧版证据保持不变。

**C 卷五号回退样张（2026-09-26，数字 QA 通过，待 Owner 实印）**：同一 R6
来源投影、纸面“英 语”、无卷首行政说明，10.5pt／18pt、21/20/24/20mm。
新渲染的[八页 A4 样张](../../../.amp/in/artifacts/product-line-samples/v61-r6-title-only-10_5pt-8page-sample.pdf)
SHA256 `db1e2856352346a4c45a41c2135c1b37981af1e0fe75bbee27a714a818605651`；
漫画80%右浮，应用文144×44mm完整框与题面在p7，续写全文及约145×23.81mm
双段首完整短框在p8，A–G同p5，选项字形越界0、学生答案节点0。p7框底距
正文区底约0.69mm，但纸张下边距仍24mm，不等于距纸边0.69mm。
[原尺寸顺序 A3 校样](../../../.amp/in/artifacts/product-line-samples/v61-r6-title-only-10_5pt-a3-sample.pdf)
SHA256 `6a26627e2e96b8b7dc722ab7d4e2d46ad30eec57f211a2dbd4fab27d551d2067`，
仅平移原矢量页、不缩放，1–2／3–4／5–6／7–8四面；A4/A3尺寸、内容及
逐页视觉检查通过，实体双面／打印机安全边界仍 SKIP。
[小四含听力十二页样张](../../../.amp/in/artifacts/product-line-samples/v61-r6-natural-title-only-12pt-19_5pt-full-listening.pdf)
复用精确 SHA256 `70b6b16e8e7ac426065108496820a037d308b61b81b1abe5152f35be8f59c758`，
未重复渲染。两档目前均只是只读样张，不是新的 Review 或自动回退实现；
五号样张不是旧compact PDF重命名。R6状态仍待审、未批准，未跑Full、未推送。

### 历史要求：长卷无听力 A3 节纸版硬门槛（Owner 2026-09-24）

每套本轮交付的长卷除原有标准版外，**必须另有完整、可精确重放的无听力
8 页学生版**，供 A4 原尺寸顺序 2-up／A3 双面打印：1–2、3–4、5–6、7–8，
共四个 A3 面、两张双面 A3。不能用无听力 long10 的 9／10 页代替，也不能
只凭临时 CSS 或未绑定的 PDF 声称通过。若完整题面、图、选项、写作给定语
在保留字号／行距和可读性的前提下排不成恰好8页，则该卷仍需返工／继续试排，
不得作为完成此产品线的长卷交付；不能删题、缩正文或悄悄牺牲源内容。
试卷另有答题卡，卷上写作框不承担学生手写足额词数的功能；但框及源给定语
仍须完整呈现、同页、无裁切。允许有界压框，选中的版心、图文规则、间距、
框几何与分页断点须随 Candidate／renderer 绑定保存并精确重放，历史版式不迁移。
标准 long10／long12 仍分别是不含／含听力 10／12 页上限；这项额外8页要求
不把它们改名或改成“必须恰好”。真实 A3 实印／翻面仍需独立验收；数字拼版
不冒充实物证明。C 区确认的共性门槛回查 B 区，A 区生产卷不自动返工。

### C 区：浙江省北斗星盟 2025 年 12 月新压测（R6 隔离 Owner QA；R4/R5 历史）

**下述已完成的长卷 QA 属于隔离本地 R4 历史版** `rev-ae0c0a03-ad9a-4cc4-8a6f-1066b38e41b3`，
paperId `paper-mock-zj-beidouxing-2025-dec`，管理名
「2025年12月浙江省北斗星盟首考适应卷英语试卷」。Source
`sha256:8171a7b35d57ddb12cb723522a85d00b97a875bacc335d614e7c9e0f24c882ce`，
Candidate `sha256:f845762e14b551f98e60e3ca2f998253836e1fa3851e1ba42262899ee60980bb`，
bundle `sha256:cb59bfc036f99dc21413df9c9c4129a6e6a7548f0a16e94ac9a79dad4742c091`，
renderer `sha256:28a1b2b9877cc58012d623c45ee86844d8288fa8b59f9971aba0722b99f2122b`。
最终 Full 后重新提交，精确 status/preflight 为 `awaiting_review`、
`rendererStale=false`、`blockers=[]`、approval=null、下一步待 Owner 审阅；
R1/R2/R3 均保留历史，R3 stale。未批准、发布、部署、推 Git 或转 B 区。
按新增 A3 硬门槛，R4 的原长卷 QA 证据仍有效，但**R4 交付未完成**：
下述8页仅为未绑定 Review 的 scratch，须正式版式／分页计划及新 revision 验收。

**R5 历史取证（2026-09-25，不作为 Owner QA）**：隔离导题工作区已将
`compact-a3-v1` v3 计划保存，plan digest
`sha256:3469cb30027ec063a15abb3d1cb2e9a935a6f20479c99d39cc705c6e27784081`；
本地精确重放为无听力 A4 8 页，应用文整组与 144×44mm 框在 p7，续写及原
57mm 框在 p8，七选五 A–G 库在 p5。新提交的 R5
`rev-67ffd0f2-38e0-4578-97ab-d9c63c83d8ab` 一度只读查得
`awaiting_review`、`rendererStale=false`、preflight blockers=[]，
但以 Import Agent Bearer 直接请求该 revision 的 `student/compactA3` PDF
返回 **401**：全局会话门禁先于 Review 路由执行。离线 PDF 不能替代现场
PDF 身份／像素证据。已有 `import_agent` 或 Owner 会话可读 Review PDF，
本轮为 Bearer 新增的权限已撤回。隔离 Owner 会话已通过门禁，但精确 GET
返回 **500 `ERR_INVALID_CHAR`**：新 PDF 响应将函数型 renderer build ID
直接作为 `x-eqb-renderer-build-id` 头写入，函数源码中的换行不合法；
Store 已调用该函数并保存正常摘要，不把它误诊为 renderer 身份变化。
隔离线程已改为请求时取摘要、并给 v3 报告改用受保护的会话 GET，
路由文件属于 renderer hash 范围。修复重启后 R5 的精确会话 GET 已返回
explicit 8 页 PDF，plan／revision／renderer 头和全部八页 raster 对照通过；
但此时只读 status 的 `rendererStale=true`，R5 须留历史、另建 R6 取证。
动态身份反例已 PASS，最终 Full 与 R6 正式交付证据见下；
R5 不作为当前 QA，不向 Owner 交 R4/R5 旧门户，也不批准／发布／推送。

**R6 当前隔离 Owner QA 候选（2026-09-25）**：Review
`rev-82429d6c-8c5c-42fe-b780-31829422c7ac`（revision 6），
Source／Candidate 仍如上，plan
`sha256:3469cb30027ec063a15abb3d1cb2e9a935a6f20479c99d39cc705c6e27784081`，
renderer `sha256:691126c266904c75efa53f912fec13dcf5263944f1d795a1492cc07cc4173132`，
bundle `sha256:0396cf7124befe2fd305b51bc793ba198ca274bdea878a87a19efb9a160a1b9c`。
只读 status/preflight：`awaiting_review`、`rendererStale=false`、
`blockers=[]`、approval=null、next=`wait_for_owner_review`。未批准、发布、
部署或推 Git；当前分支是未推送隔离 overlay，不等于 `origin/main`。
最终稳定代码的
`pnpm -C app verify:all` 退出 0，174 PASS／1 声明 SKIP／0 FAIL，
1892.9 秒；SKIP 为离仓 `verify-i16a-teaching-dimension-search` fixture，
不是已验证。函数型 renderer ID 在同进程变更根文件的定向反例 PASS；
独立 Standards/Spec 只读复审无阻断。此前诊断 `verify:changed` 和修复前 Full
不冒充这轮最终结果。

受保护会话对**精确 R6** 的 `student/compactA3` PDF GET 返回 HTTP 200、
`explicit`、8 页及相符的 revision／renderer／plan 响应头；8／8 张 120dpi
页图与保存的 QA 图像素一致。正式[无听力八页 A4 PDF](file:///home/user/workspace/repo/.amp/in/artifacts/v62-r6-c-beidouxing-compact-a3/paper-mock-zj-beidouxing-2025-dec-compactA3.pdf)
SHA256 `6cc546b6764f9782bec85ce5d9994b98b515205392ddc54c6c4a5c6b55ba75ef`；
p7 漫画、两要求、提醒与 144×44mm 整框同页，p8 续写全文与原 57mm 框同页，
A–G 库未拆、Student 无答案。四版长卷 R6 真 PDF 带／去卷首分别为
9／12／9／11 页，内容及逐页 96dpi 像素与已目检 R4 对照一致；
[四版与审校中文报告](file:///home/user/workspace/repo/.amp/in/artifacts/v62-r6-c-beidouxing-校正报告与预处理完成表.md)
SHA256 `d3615929bd9c9a0279821964b345b08aed403ef0598725d154e342b6532b8951`。
[数字 A3 两张双面四面拼版](file:///home/user/workspace/repo/.amp/in/artifacts/v62-r6-c-beidouxing-sequential-a3-digital.pdf)
是 1–2／3–4／5–6／7–8 顺序、四面 A3；**实体原尺寸双面试印 SKIP**，
p7 框底距正文区底约 0.7mm，数字证据不能证明打印机安全余量。

[R6 私有只读 Screen](https://t-03gxdww5ohxfgetr1d4cx34v6-p25938.onamp.dev/?view=paper-browse&paperId=paper-mock-zj-beidouxing-2025-dec&reviewRevision=rev-82429d6c-8c5c-42fe-b780-31829422c7ac "amp-portal")
用现有 Amp 会话打开，**不需要应用登录**；首屏卷首／听力，左侧“写作”→
“第一节”见漫画、两要求和提醒。隔离服务 active，本地代理 27 PASS／0 FAIL：
只读固定资源、旧 revision／OPS 403、POST 405、漫画 200、音频 Range 206；
Screen 截图已目检（截图未覆盖整个作答框，完整框由 PDF p7 证明）。
父 orb 对该门户的无会话请求与伪造 Owner `x-amp-*` 请求均得 HTTP 302，
未获得卷面；这**不**代验 Owner 本人已登录浏览器或其他已登录者身份头覆盖。
听力只做播放／信号证据，未核语义。新讨论的“模拟卷显示卷名”规则
尚未裁定／进入 R6，不能用本轮 8 页证据推断加标题后仍是 8 页。

[**R4 校正报告与预处理完成表**](file:///home/user/workspace/repo/.amp/in/artifacts/v61-r4-c-beidouxing-校正报告与预处理完成表.md)
SHA256 `b7a232cf47ca8f94ba8a8b5332f839fc8bc83aced11703976a59997136bcbc50`；
四版 Student A4 PDF 在 `.amp/in/artifacts/v61-r4-c-beidouxing-` 前缀下，
依次带卷首 long10/long12 9/12 页、去卷首 long10/long12 9/11 页，
SHA256 依次 `a5af5539f8ba2ff1bbf5ecbe8387dbdb2ae496c1b5fcc906a5834ca6f574c743`、
`c192cbc68d259d3ddea1bad4f06c13178440fa40f6faf25f4cd6ed9422206495`、
`d3b6da6c71553445251f11f5c7a33e731490c6bb0da38cc47b20c8fdacb6d91f`、
`88d78621f4e2602357c22afae5b62f4a3923524f2c350da4365b60de15a912d8`。
卷首两版为精确 R4 PDF endpoint 原响应；应用文漫画、完整题面／提醒与
65mm 答题框同页，代表页 p11 与 Screen 截图已目检（Screen 截图视口未拍全
作答框，PDF p11 拍全）。原 MP3 此前实际点播、当前 R4 Range GET 206、
信号分段通过；未核音频语义。原题仅改 `AD→AI`、`thee→the`，四处疑点保留。

[R4 历史私有 Screen（勿作当前 QA）](https://t-03gxdww5ohxfgetr1d4cx34v6-p26445.onamp.dev/?view=paper-browse&paperId=paper-mock-zj-beidouxing-2025-dec&reviewRevision=rev-ae0c0a03-ad9a-4cc4-8a6f-1066b38e41b3)
使用现有 Amp 会话，不另登应用；首屏卷首／听力，左侧“写作”→“第一节”看漫画。
代理精确 R4 固定、只读 allowlist（17 个静态资源），本地 27 PASS／0 FAIL。
父 orb 对 R4 公网门户无会话和伪造 Owner header 均得 HTTP 302 到 Amp 授权，
未获得卷面；线程为 private，门户非 public。此检查不代验 Owner 本人浏览器，
也不证明其他已登录 viewer 的 header 覆盖行为。旧 R3 p25225 已停，不再交 QA。

`pnpm -C app verify:all` 最终退出 0：174 PASS／1 SKIP／0 FAIL，日志 SHA256
`aaf4696106a4a3053f0d0fbe3665eec30689589f80e84092fade2d9193ca9929`；
SKIP 是离仓 I16A fixture 缺失，不能算 PASS。独立 Standards/Spec 复审所指
v58 历史 Publication consumer-ref 漂移单列事项；当前 R4 验证不代表所有
v58 Publication 精确回放。机器风险 `unknown-fallback`。

**严格 8 页宽版心隔离实验（2026-09-24）**：按 Owner 要求完整比较左右各
24、22、20mm × 保留／省略卷首。精确 R4 的 student／无听力 HTML 仅在 scratch
修改 `@page` 左右边距，正文 10.5pt／18pt、上下边距、页脚及 65／57mm
正常作答框不变；六格真实诊断 PDF 均为 A4 **9 页**，应用文完整题面跨
p7–8 而答题框在 p8。六格原有 `planFixedPagePdf(targetPages:8)` 各用了
24 次渲染预算，均返回 `PAPER_FIXED_PAGE_IMPOSSIBLE`，**未找到可验收的 8 页版**；
不能据此证明所有可能排法都不可能。20mm 无卷首正文宽 643px（标准
612px），跨页题组 7→6、双面跨面风险 2→1，但应用文仍拆页且续写框占 p9；
末页文字余量不能当作可直接合页的空间。20mm 已完整测试，不据此承诺更长卷
能进 8 页，也不启用双边距档或连续边距算法。完整矩阵、六份标明**诊断失败**
的 PDF／九页接触图见[实验报告](file:///home/user/workspace/repo/.amp/in/artifacts/c-beidouxing-strict8-margin-experiment.md)，
SHA256 `45e4e5cd6de6b9b664aea668c084aa03ebe132ce59e1cf0879d4a219e96ade44`。
无精确 8 页候选，故逐页合格验收 SKIP；物理 A3 实印亦 SKIP。实验后
R4 只读 preflight 仍 `awaiting_review`、`rendererStale=false`、`blockers=[]`。

**应用文第 7 页几何只读试排（2026-09-24）**：在同一 R4 Source／Candidate／renderer
的 20mm 无卷首 Student 诊断上，单独及组合测试漫画右移8mm、缩至90%／80%、
注意段前距18→6pt、框前距9→3pt、应用文框65→48／40mm、续写框57→48／40mm，
另做一次漫画靠右浮动并让要求占左侧空白的真渲染。共12格 A4 PDF **均为9页**。
单纯右移不改变分页；80%图使完整要求和提醒进p7，但即使应用文／续写框均为
40mm，前者仍在p8、后者仍在p9。浮动图与要求无重叠、顺序可读，但p7图下
余176.9px，小于48mm框181.4px加框前距，整框仍在p8。40mm应用文框扣除
内衬名义可写高度仅34mm（约5.4行），不能以机器允许替代约80词可写性。
完整矩阵、失败诊断PDF与p7/p8目检图见[试排报告](file:///home/user/workspace/repo/.amp/in/artifacts/c-beidouxing-r4-scratch-application-geometry-report.md)，
SHA256 `df46b1b8486556c35896cba9697482863b16316c27fc68af939360768fa00ebb`。
没有合格8页候选、正式分页方案或新Review；A3实体双面验收SKIP。R4只读
preflight仍`awaiting_review`、`rendererStale=false`、`blockers=[]`，不改变长卷QA。

**后续边界补验修正上段结论（2026-09-24）**：同一 R4 只读 Student HTML、
20mm 无卷首、80%右浮漫画、注意段前6pt／框前3pt下，应用文框144×45mm
仍9页（框p8）；**144×44mm真实PDF恰好8页**，完整应用文题面、提醒和整框
在p7，续写完整材料及原高145×57mm框在p8。另一72×65mm左侧窄框与漫画
并排也得8页，但现有分页方案没有宽度字段；44mm高是已有友好版允许的高度，
其名义内区138×38mm、约6行／标准可写面积的64.4%，框底距p7正文下缘
仅0.7mm。逐页A4／页脚1–8、p5七选五A–G整库、p7/p8 200dpi和两张四页
接触图均检查；Student无答案标记、无可见重叠／裁切。报告与优先
[8页只读试排PDF](file:///home/user/workspace/repo/.amp/in/artifacts/c-beidouxing-r4-strict8-scratch-44x144-8p.pdf)
分别为SHA256 `5ba693584be8d7b3fdbffe275ddf0aa38e8706a3dc428222168430abcffcd92c`
（[补验报告](file:///home/user/workspace/repo/.amp/in/artifacts/c-beidouxing-r4-strict8-scratch-boundary-report.md)）和
`9feb753af8002e3f75839bad9cc326b96915e6ae6850473a2a208a3eb362ecaf`。
**这是几何成功，不是正式8页Review**：20mm边距、右浮图、紧缩提醒／框前距
尚无可保存的版式合同；Owner确认另有答题卡，卷上80词手写容量不作门槛。
本地将该8页PDF按顺序无正文缩放拼成[四面A3数字校样](file:///home/user/workspace/repo/.amp/in/artifacts/c-beidouxing-r4-strict8-scratch-a3-sequential-2up-4p.pdf)，
`pdfinfo`为4页A3、页脚1–8，1–2／3–4／5–6／7–8各占一面；四面接触图
已目检无可见裁切／叠印，校样SHA256
`4cb25ba587e072d43f0c08b97669124384d7daae621310d1b760718326bc97f1`。
真实双面打印／翻面SKIP；旧R4长卷和Review状态不变。前两段“无8页候选”
只描述当时已测组合，不再是最终实验结论。

#### 原件与 R1–R3 历史记录（不作当前 QA）

Owner 指定管理名称：**2025年12月浙江省北斗星盟首考适应卷英语试卷**。
2026-09-24 收到五份附件，原字节存于 `.scratch/bd-2512-inputs/`：
`source-2.docx`（题面，SHA256 `441c8ab0ff146c77273bfc974cb1f96c9b7da444b2ac2d6a0e6af337dde72f5c`）、
`source-4.pdf`（题面，10 页 A4，SHA256 `e9ce1d8a3430051f48f292df2fea026f6fc196b482a88bb9dee9d059116ecd40`）、
`source-1.docx`（参考答案，SHA256 `5739a8552bf42d2242a8b6d490c53957a784ee327f97f9c166995f4831e14be3`）、
`source-3.pdf`（参考答案，13 页，SHA256 `ea33fa1ef4d8a923dd5d285d6d16f5c4afe408296bff7fc5498de5fa036b5d92`）、
`source-5.mp3`（约 21 分 48 秒，SHA256 `8a9bf01b2fb157e02c669997472ee7f3f7a787db793e972765ef67b5e3f643e7`）。
题面原文标题与管理名不同，不改原件。以上只确认文件角色、哈希和音频时长，
未宣称题文、答案或音频语义已核验。专用导题 Project 的独立
[压测线程](https://ampcode.com/threads/T-01a0d310-dbb0-723c-a427-1e03d3322c62)
是本卷唯一写者；paperId 为 `paper-mock-zj-beidouxing-2025-dec`，Review revision
为隔离本地 R3 `rev-920aa6c5-ff25-4d45-932c-829116379a7f`，`awaiting_review`、
未决 0、`blockers=[]`、`rendererStale=false`、approval=null；R1/R2 保留历史。Source
`sha256:8171a7b35d57ddb12cb723522a85d00b97a875bacc335d614e7c9e0f24c882ce`，
Candidate `sha256:f845762e14b551f98e60e3ca2f998253836e1fa3851e1ba42262899ee60980bb`，
bundle `sha256:cb59bfc036f99dc21413df9c9c4129a6e6a7548f0a16e94ac9a79dad4742c091`。
隔离工作区报告原件双格式材料化、65/65
官方答案核对通过；第 9 页漫画触发的应用文图文消费共享缺口已在该分支修复
并做定向验证。逐段摘要 8 组／61 段与 compact metadata 9 组已分别正式
verify 并绑定 R3 Candidate；后者当前 sidecar SHA256 为
`24344caa933e4efd86001f1c0ee70f61cdfd007e687b49521cf1e4780495b261`。
旧 metadata 试稿虽曾本地 finalize/verify，但未 push Review，已留历史；
最终版改了 reading-c 体裁及完形 46／47／53 的无证据 signatureFacet。
346 目标仅修正 `AD→AI`、`thee→the` 两处明确源错字，另有 4 项非阻断疑点。
信号音频完整解码、10 个分段候选及 Screen 第 1 题点播已实测，**未核验听力语义**。

四版真实 Student A4 长卷实际为带卷首 9／12 页、去卷首 9／11 页，满足
最多 10／12 页；每版唯一漫画、完整应用文提醒及 65mm 作答框在同一页
（p8／p11／p8／p10），七选五 A–G 选项库各自同页。卷首版绑定精确 Review
PDF endpoint，去卷首版为同 Candidate／renderer 的额外真渲染；四版 PDF
保存在 `.amp/in/artifacts/c-beidouxing-r3-{cover,no-cover}-long{10,12}.pdf`，
现仅作历史对比，不能作为当前 renderer 的 Owner QA。旧收口报告
`.amp/in/artifacts/c-beidouxing-r3-校正报告与预处理完成表.md`、
只读代理报告 `v61-r3-c-beidouxing-校正报告与预处理完成表.md`，SHA256
`19f2198519499559a78c6e2aeedfe27c158c76a6383e558e54f347537687b2d6`；
机器证据 `v61-r3-c-beidouxing-handoff-evidence.json`，SHA256
`efdd217f124c7d19885965f79c8444d3b257616f650a3b349e5cd85e5a0d68dc`
也只记录 R3 历史状态。**QA Ready: no**：此前交付的 p25225 固定 R3 入口
不得再作为 renderer-current 审稿入口；旧 p22707 登录门户也不交 Owner。
R3 代理服务端持有隔离测试 session，仅放行固定 revision 的 Screen 资源和
漫画／音频 GET/HEAD；本地模拟身份与 27 项准入／拒绝测试
通过。所属 orb 自己请求门户会绕过 Amp 外部身份门禁，其伪造头得到 200
不能证明外部也可伪造；安全排查期间曾停服并恢复供跨 orb 测试，
现已请求隔离卷工作区停用旧 R3 专属入口，尚待停服回执。
另一个父 orb 从外部入口对已恢复的门户作无 Amp 会话请求，普通请求和附带
伪造 Owner `x-amp-*` 头的请求都返回 HTTP 302，跳转 Amp portal-auth，
均未获得预览内容。Amp 对精确线程的查询显示创建者是 Owner，线程可见性为
`private`（非 workspace/group/unlisted）；门户保持非 public，外部入口沿用
仅线程可见者可访问的 Amp 门禁。此为匿名绕过的否证，不是已登录非 Owner 伪造头测试，
**也不能代验 Owner 本人浏览器是否可达**；不把本地 27 PASS 当作端到端身份验证。

最终 Full 后使用精确绑定的隔离 Review origin 只读重查：R3 仍为
`awaiting_review`、bundle 不变、approval=null，但 `rendererStale=true`；
preflight 为 `changes_requested`／`resubmit_for_current_renderer`。先前
`rendererStale=false` 的状态记录已失效；不据此批准或继续 Owner QA。
隔离卷工作区保留 R3，查明身份变化后新建 R4 并重做 Screen／四版 PDF QA。
此前 app build 和 R3 定向 v61 renderer／Review 回放通过。独立 Standards/Spec
复审初报 v58 回放 BLOCKED，记录原样保留：其要求将 v58 Review 的 Screen v44／
Print v45 改成 v43／v44 不成立（Candidate 与 renderer authority 独立），
但历史 Publication `loadCanonicalOnlyConsumers` 对 v58 自动落到当前 v61 refs，
存在 consumer-ref 身份漂移；未证实旧卷可视损坏。此为单独历史回放事项，
不为它手动更换 R3 renderer 身份；上述实际 stale 原因另查，不能称所有 v58
Publication 精确回放通过。
机器风险 `unknown-fallback`。最终 `pnpm -C app verify:all` 退出 0：
174 PASS／1 SKIP／0 FAIL，日志 SHA256
`aaf4696106a4a3053f0d0fbe3665eec30689589f80e84092fade2d9193ca9929`；
离仓 I16A fixture 缺失的 SKIP 不能当 PASS。Full 通过不抵消上述精确
Review preflight 的 stale 结果，R3 不可作为当前 QA 或发布候选。
OCR 不适用；没有批准、发布、部署或 Git push，也**未转入 B 区**。
对 B 区的只读回查：WN8 无 drawing/instrText/posOffset，不适用漫画子路径；
县域联盟七图通用提取已另修，漫画子路径在本隔离工作区证据不足，未改其候选。
新 C 区确认的通用问题须按上文规则回查 B 区 WN8 和浙江县域联盟卷，
但不能无故更改它们。本次不授权批准、发布、生产写入或 Git 推送。

### C 区：浙江县域联盟 2025 年 12 月新压测（历史过程，现已转 B 区）

Owner 指定名称：**2025年12月浙江省县域联盟高三英语试卷**。
2026-09-22 收到五份原始附件，已下载核对开头标题：source-2.docx 为题面，
source-1.docx 为参考答案；source-4.pdf 为 10 页题面，source-3.pdf 为 8 页参考答案。
MP3 时长约 22 分 56 秒，当前仅确认容器时长，未据此声称音频内容已核对。
原件保存在 `.scratch/zhejiang-county-2512-inputs/`，两种文档格式用于源对照，
不得重复导入成两套卷。沿用当前隔离导卷链路与 v58 源生标记保留规则，
最终提交待审核预览；不授权正式发布。新确认的通用问题按上述规则回查 B 区 WN8。

2026-09-23 长卷版裁定：浙江 C 卷按新 `long10/long12` 页数上限另做验收，
保留原 8／10 页友好版的精确页数合同，不改 A/B 卷旧证据。独立隔离 R1
`rev-42c327f8-531e-40e3-9b6e-35f5d54398bc` 仍 awaiting_review、未决 0、
未批准或发布；原四种精确 8／10 目标均未通过。正常写作框的只读诊断：
带卷首无听力 9 页、无卷首无听力 9 页、带卷首含听力 12 页但应用文题面
p10／框 p11 分离、无卷首含听力 11 页且同页。四者均不能直接改名为
合格长卷 PDF，带卷首 12 页须在批准的卷首留白范围内另寻同页排版并真实
复验。新标准以 [`exam-paper-format-standards.md`](../../product/exam-paper-format-standards.md)
为准；旧导题审核台不作为长卷交付界面，交付仍用精确 Screen 链接和 PDF 证据。

后续同一 Candidate/renderer 只读真实重放找到了合法通用解：`long10` 保留卷首
[72,72]pt、9页、应用文 p8/p8；`long12` 首档自然流12页但 p10/p11 分离，
在完整应用文题组前一次断页后仍12页、题面/框 p11/p11、续写 p12 完整。
新版规划器两次实渲选中 [72,72]pt + 应用文断组，第三次按所选方案精确重放；
七选五选项库未拆、7图完整、无溢出。此为隔离验证，不是已保存方案或新
Review revision；R1 仍 awaiting_review，审批／发布均未发生。

随后无卷首 `long10` 暴露假同页阳性：旧检查只记应用文题面最后分片，
将实际跨 p7–8 的题面误记为 p8，与 p8 答题框看似同页。共享长卷规划器现记录
题面／作答框的所有分页片段并拒收跨页，再试整个应用文题组前断页；该版本仍为
9 页且完整应用文同处 p8。最终四份长卷学生 PDF 实测为带卷首无听力 9 页、
带卷首含听力 12 页、无卷首无听力 9 页、无卷首含听力 11 页，均未超各自
10／12 页上限，应用文完整题面与原高答题框同页，选项库未拆、7 图完整，
Screen 与 PDF 安全表格横线连续。源与 Candidate 均不变；新本地 Review R2
`rev-4620f5b8-ee77-4369-8555-ac55a6cf5c31` 绑定 v2 分页方案，状态
`awaiting_review`、未决 0、未批准或发布。最终校正报告与四版 PDF 见
`.scratch/zhejiang-county-2512-handoff/long-v2-correction-report.md`；精确 R2
只读 Screen 入口是报告中的 p29151 portal，原 p27835 专属 R1，不能作为 R2 入口。

首次源审校发现 DOCX 绘图坐标 `wp:posOffset` 与隐藏 `w:instrText` 被旧
`extractXmlText` 当成正文，导致浙江卷 7 个图标旁数字泄漏、阅读 A 隐藏链接
指令泄漏，源忠实性校验阻止了错误校对。共享修复仅提取 `w:t` 和 Word 显式
分隔符，保留图标引用；合成来源与源生强调回归已通过，浙江卷校对及
Screen/PDF 后续已按上述 R2 完成。B 区 WN8 原生题面 DOCX 实查无 drawing、
instrText 或 posOffset；221 个段落提取文字修复前后逐字一致，全文仅文件开头非正文 XML
换行被去掉，因此此缺陷对 WN8 不适用，不为此重建 B 卷 revision/PDF。

### B 区：浙江县域联盟 2025 年 12 月（从 C 区转入）

Owner 于 2026-09-24 将此卷移入 B 区，退出当前压测，保留隔离本地候选和证据；
这是进度登记，不是 Review 批准、发布或生产数据迁移。上文 R1/R2 是历史过程，
当前保留版本以本表 R5 为准；后续 C 区确认通用问题时仍按 B 区回查规则复核。

| 项目 | 记录 |
| --- | --- |
| Owner 指定名称 | 2025年12月浙江省县域联盟高三英语试卷 |
| paperId | `paper-mock-zj-county-2025-dec` |
| 保留候选 | 隔离本地 R5 `rev-c2a93a83-ef08-485d-8ea8-f64d54042447`；R1–R4 保留历史 |
| 候选身份 | Source `sha256:7c6aacdf40890312d136d26e1f8689cd07128169851c0ed6adfc6a0de5fe0bff`；Candidate `sha256:63febbdfc46e7810bd112ea8cb176df33e98beed517fbc464d3f4543c15b3f91`；bundle `sha256:b7ac37e3d5279a61f36a37c8d7562181aee6f11ac39f45e89e9274eaec011029` |
| 已核对状态 | `awaiting_review`，`blockers=[]`，`rendererStale=false`，未决问题 0，`approvalId=null`；未批准、发布、生产部署或推送 Git |
| 收口报告 | `.amp/in/artifacts/zj-r5-v59-review-report.md`，SHA256 `f65a53f3ed0c9bcf0b2ffa15cf7689803b134373c3036b7d87f40f13421ade55` |
| 绑定 evidence | `.scratch/zhejiang-county-2512-handoff/zj-r5-v59-handoff-evidence.json`，SHA256 `ebbb37ac33f6e6859dc6b834b38e77cc9ea5429a7c3203d9b0ead55273ab6811` |

R5 按 Owner 收窄的文本修理边界保留 4 处明确错拼／词形修正及 5 处有来源
锚点的选项尾空白清理，撤回 R4 其余 21 处改动；16 项疑点不阻断。
四版 Student A4 长卷真渲染为带卷首 9／11 页、无卷首 9／11 页，均满足
最多 10／12 页，应用文完整题面和答题框同页。两份带卷首为 Review 计划显式
重放；无卷首两份是额外真渲染，未写入 Review 计划。父工作区已核对传回 PDF
的 SHA、A4／页数并检查选项、写作和表格的代表页图像。定向审校／分页门禁由
C 隔离工作区报告 PASS；本轮未重跑广义 `verify:changed`，音频未做语义核验，
公网 Amp Owner 登录态未代验。B 区登记不声称全套测试通过或正式上线。
按新增无听力 A3 八页硬门槛，R5 已交四份长卷的无听力两份均为9页，
且无绑定的精确8页版；标记为**B 区待返修／补验**，保留 R5 与原证据，
不伪称它已满足新产品线，也不在此直接改 Review 数据。

### B 区：皖南八校（既有登记）

Owner 已将本轮 WN8 命名并归入 **B 区**：

| 项目 | 记录 |
| --- | --- |
| Owner 指定名称 | 2025年12月安徽市皖南八校高三第二次联考英语试卷 |
| paperId | `paper-mock-wn8-2026-m2` |
| 保留候选 | R11 `rev-1389dee8-43cd-4c99-b1fb-c5ff19d5927a` |
| 已核对状态 | `awaiting_review`，`rendererStale=false`，未决问题 0，approval/promotion 均 null |
| 收口报告 | `.amp/in/artifacts/wn8-source-emphasis-final-report.md`，SHA256 `80cf80ba014b6149ebfc1b8eb4cd21898ca644eaf575024d2e6dfecbfe5a10d5` |
| 绑定 evidence | `.scratch/docx-stress-2512-transfer/wn8-source-emphasis-final-evidence.json`，SHA256 `b76cd43abc7e071fbdf5c7c8eeb31ab18e00ccb112427595ef4d7e0894abf43f` |

此名称是 Owner 指定的管理名称，按原文保留“安徽市”，不据此推改源文件、
Canonical 元数据、paperId 或已定稿 revision。B 区不表示全套测试全绿：本轮 Full
仍为 PASS172/SKIP1/FAIL1，保留既有 routing count 断言失败、外部 fixture 缺失，
以及未新增音频语义复核、无独立 Print QA 的限制。四 PDF 在 R10 生成并验证，
R11 按身份不变复用；本次登记不触发新 revision、PDF 渲染、批准或上线。
新增 A3 门槛尚待本卷精确身份下回验；`bullet-table-final-friendly8.pdf`
是下述嘉兴扫描卷的产物，不能作为 WN8 八页证据。
**2026-09-26 身份核对更正**：后文 R12
`rev-da2673a3-69d9-4c35-be4b-48a09cea285f` 属于嘉兴扫描卷
`paper-aa34b9b2-65f5-4a3b-b2b1-a771c14c5c82`，不是皖南八校。
此前将该 R12 及其八／十页证据关联到 WN8 的登记错误，不作返修依据。
本轮从皖南独占线程留存 R11 核对当前身份，禁止用嘉兴卷的 revision 或 PDF 背书。

## Owner follow-up: Amp-only intake

The Owner subsequently canceled webhook automatic intake. Amp is the sole
communication/start entry; preview acceptance and explicit publication remain
separate. Keep current server storage; no COS/R2 migration. This authorizes
retiring automatic dispatch, not website deployment or production paper writes.
The fixed controller has paused automatic handling and preserved its two old
bindings/journals. Neither has evidence of an active lease; do not reacquire them.
The inert plugin and status-only dispatcher were transferred to that controller;
scoped plugin reload passed with zero registered events/commands/tools. This
retires its executable handler, but does not prove durable capability deletion:
the current Plugin API has no unregister/read-only registration operation.
Local sender/plugin/dispatcher retirement and authenticated 410 mutation routes
passed focused backend and browser checks; independent review's stale operational
instructions were corrected. Legacy claim/status/handoff remain intact. Website
sender/UI changes have not been deployed. First full run: 170 PASS / 1 SKIP /
1 FAIL (temporary Git fixture inherited signing). That check passed 113/113 with
signing disabled only for its test process; no global/repository config changed.

The follow-up restored Reading A's three source-backed bullets (lost between
raw OCR and confirmed OCR). Shared compact table CSS now uses content-aware
columns and vertical centering under the current role binding, without changing
type size or baseline. Focused Screen/Print geometry tests and independent review
passed. Actual PDF inspection caught the first bullet retaining prose indent;
the shared all-bullet-paragraph marker now removes that indent only under the
current role binding. Mixed prose, media and historical bindings are unchanged.
Final Screen marker X coordinates are [289,289,289]px; the 612px table has
139.898/471.102px columns and middle-aligned cells without overflow. Parent
inspected the final Screen and both editions' Reading A, plus ten-page p9/p10.

Fresh OCR R9 was asserted latest/awaiting before Agent proofreading; the only
Materialization semantic delta is three bullet prefixes. Original PDFs/audio
remain byte-identical. A fresh directory alone cannot defeat historical OCR
bundle/build dedup; never perturb metadata just to obtain a fresh revision.
The first report incorrectly used old Materialization
as its before text; the server rejected it, leaving R10 uploading. Preserve it.
Correcting only report.before to the exact R9 receipt's original OCR text passed
the normal report finalizer and server receipt validation; no receipt was edited.
R7/R8/R9 and superseded R11 remain preserved. Final local Candidate R12 is
`rev-da2673a3-69d9-4c35-be4b-48a09cea285f`, awaiting_review, latest and not stale,
bundle `sha256:2df160185e140f3842be03ab5fb7179ce3633211b1e92824af10374119183f27`.

Explicit final runtime-JS/CSS checks pass8/10 pages, one render each, using the
preserved cover[0,18] plans; application48mm stays with its prompt on p9 and
continuation stays on p10. The earlier eight-page harness accidentally included
listening; retain that invalid attempt separately, not as a product failure.
The declaration-only .d.ts companion was added after these renders, verified
identical to .d.mts, then the final build/runtime/revision identity was refreshed
without another PDF render. Summary38 and metadata9 gates pass with unchanged
authored content. The parent retained final PDFs under
`.amp/in/artifacts/bullet-table-final-friendly8.pdf` and `...friendly10.pdf`.
The pre-indent combined full run finished171 PASS/1 SKIP/0 FAIL. The final
runtime follow-up full run finished170 PASS/1 SKIP/1 FAIL in1739.4s; its sole
failure was the missing .d.ts companion, fixed during that run. The exact
declaration-parity verifier was rerun after completion:28 PASS/0 FAIL. The
whole pack was not repeated after that declaration-only fix, so do not claim
an all-green final full record. I16A teaching-dimension search remains SKIP
because its external fixture is absent. App build, bullet/table geometry,
independent Standards review and actual Screen/PDF checks pass. No approval,
publication, production or Ship.

## Outcome

Complete a fresh isolated import of the supplied question PDF, official-answer
PDF and listening audio. Use built-in Low with `features: []` and the explicit
Import Project. Iterate locally before proposing one consolidated PR. This goal
does not authorize a PR, deployment, production writes, live webhook changes,
or replay/replacement of any old submission. Preserve the first rehearsal.

## Owner-confirmed workflow

1. OCR the source, then let the Agent compare every page with the immutable PDF,
   recover omissions and correct recognition errors. OCR alone is not a claim
   of 100% correctness. The Owner does not proofread intermediate OCR pages.
2. Distinguish OCR repairs from mistakes present in the source itself. Correct
   clear source typos/spelling mistakes, but do not polish unidiomatic wording.
   Preserve uncertain readings and flag them; never silently alter question
   meaning, options, answer relationships or authoritative answers by solving.
3. Complete all public-paper-v1 work: passages, groups, questions, source
   locators, tables/images, source-answer transcription checks, paragraph
   summaries, controlled topics and compact type-specific search metadata.
   Do not generate the legacy nine teaching analyses or invented metadata.
4. Use signal-only listening segmentation, never ASR. Preserve original audio,
   cue tones, later-group announcements/reading pauses and original repeats;
   trim long trailing answer gaps. Validate actual group-to-audio correspondence.
   Signal candidates are not proof of semantic/content-safety validation.
5. Deliver the real Paper page with per-group audio play/pause, expandable seek
   control, speed control, segment-end stop and mutually exclusive playback.
   Questions 1–5 have individual clips; later questions share their dialogue group.
6. Owner reviews the final Paper page, comparable original PDFs and a correction
   report. Report source edits separately from OCR repairs, including location,
   before/after and reason, plus remaining uncertainties. Summaries/search fields
   are Agent work, not Owner data entry. Check Screen and Student/Teacher
   Print/PDF. Final approval and later publication remain distinct actions.

## Implementation boundary

The existing Owner-only intermediate OCR confirmation contradicts this agreed
workflow. Replace it for new public-paper-v1 imports with an authenticated,
source-bound Agent proofreading path whose actor is recorded truthfully. Do not
forge an Owner receipt, loosen final approval/promotion authorization, or silently
reinterpret historical confirmations. Preserve source/evidence/revision digest
checks and complete page coverage. Report authorization is not publication.

## Evidence and current limitations

The first isolated rehearsal reached OCR revision 2 awaiting review. Signal-only
initialization and ten audio candidates succeeded; OCR bundle transport omitted
audio attachments and was fixed locally. Review playback lacked Range support;
the local fix passed byte-range tests. Component tests are not whole-paper QA.
The first rehearsal and its incomplete diagnostic revision remain intact.

Next: implement and test truthful Agent proofreading, transfer the exact local
candidate to a fresh Low worker, import fresh raw inputs through disposable real
Source Intake/Review routes, and fix encountered failures without bypassing gates.
Only claim success when the real complete Paper, audio and reports are inspectable.

## OCR performance diagnosis, 2026-09-20

The second worker measured 920s for TXT and a further 625s for TSV over the same
13 scanned pages (200 dpi, `eng+chi_sim`, PSM 6, two parallel processes, no explicit
OpenMP thread limit). These were shell-measured durations, not polling gaps.
The first worker measured 25s including rasterization at 180 dpi, three parallel
processes, `OMP_THREAD_LIMIT=1`, and one invocation emitting both `txt tsv`.

A controlled parent-Orb reproduction used identical question-page-3 pixels at
200 dpi, identical installed language data, and two concurrent invocations:

| CPU affinity | Tesseract thread limit | Batch wall time | CPU user time |
| --- | --- | --- | --- |
| 8 cores | default | 2.38s | 11.44s |
| 4 cores (`taskset -c 0-3`) | default | 102.92s | 406.06s |
| 4 cores (`taskset -c 0-3`) | `OMP_THREAD_LIMIT=1` | 2.45s | 4.65s |

TXT and TSV outputs for the slow/fast four-core runs were byte-identical. This
reproduces severe nested-parallelism contention; increasing DPI was not necessary
to trigger it. Running three single-threaded jobs on four cores also took 2.45s.
The worker's completed processes were unavailable for retrospective thread
sampling, so this is a controlled reproduction, not a claim of a historical trace.

The worker independently confirmed identical page pixels and installed eng/chi_sim
model hashes. On its four-core Orb a single invocation took 2.45s with the limit
and 2.81s without; both outputs were byte-identical. Live sampling showed four
Tesseract threads without the limit. A single invocation was not pathologically
slow: the reproduction specifically requires the outer parallelism interaction.
These bounded tests did not interrupt import; its new OCR revision upload succeeded.

For further required OCR, cap each Tesseract process with `OMP_THREAD_LIMIT=1`,
use one `tesseract INPUT OUTPUT -l eng+chi_sim --psm 6 txt tsv` invocation, and
bound outer parallelism to `max(1, min(3, available CPUs - 1))`. Retain completed
artifacts; do not rerun a whole paper just for benchmarking. OCR timings do not
include Agent visual comparison or the remaining import stages and are not an
end-to-end completion-time promise.

## Owner gold-layout correction, 2026-09-20

Owner rejected R3's cover proportions and Reading openings after real review.
Successful rendering/audio controls are not whole-paper visual acceptance.
Keep a single shared Paper rule for Screen, Student/Teacher Print and PDF:

- Notice label matches part-heading weight/size; numbered notices are regular
  10.5pt body with fixed 18pt line steps. Section heading is regular, not browser bold.
- Notice numbers begin at 2em; continuation lines return to the label/body left
  edge. The listening transfer notice also indents only its first line by 2em.
- Apply the page top margin once, without another 72pt cover spacer. Natural
  title-to-notices gap remains 72pt; explicit fixed-page gap compression remains
  distinct from changing body geometry.
- Screen Review preserves 794px proof width when room permits and hides selection
  scissors. Lecture docking must not reserve so much space that the paper narrows.
- B/C/D openings are body according to original pages 4/5/6; fix materialization
  roles, not title CSS. Preserve text, options, answers, audio and old revisions;
  rebuild and verify bound sidecars before a fresh immutable Review revision.

Renderer successor v56 records presentation changes without advancing source
Candidate authority. Verify actual continuation glyph alignment, fonts/weights,
width, student answer exclusion, teacher answers, and PDF pages/overflow. Re-QA
the explicit pagination plan; do not repeat bounded-auto searches or treat old
PDF evidence as proof for changed geometry.

### Local closeout evidence, 2026-09-20

The specification entrypoints now distinguish current visual roles, data product
requirements, import operations, historical evidence and the unpublished v56
candidate. The cover verifier explicitly reports synthetic CSS coverage, not
actual three-surface proof.

R4 `rev-9fb9df7f-97d5-454e-b364-39efe780f1d8` remains awaiting review, without
approval or publication. The isolated worker verified actual Screen,
Student/Teacher Print HTML and Student PDF; friendly10 uses its bound explicit
plan with gaps [0,18], 10 A4 pages and no option-bank split. Reading B/D cross-face
warnings remain. The final Screen-only cut-line correction leaves the revision,
source data and Print/PDF geometry unchanged: both writing pseudo-elements are
hidden in Review, while ordinary question selection retains them. Actual R4
DOM and screenshot inspection confirmed the missing dashed lines and unchanged
solid answer box.

Initial full verification recorded 168 PASS / 1 SKIP / 3 FAIL; retain that log.
Seven Choices now explicitly tests direct clicks in the 1440px docked layout.
Cloze anchors are compared in paper-space pt at real reading zoom and at 100%;
historical 1px ruling checks run at controlled 100% to avoid Chromium's zoom
pixel snapping. Original anchors and tolerances remain unchanged.

Final `pnpm -C app verify:all` completed: **171 PASS / 1 SKIP / 0 FAIL**,
1772.8s, recorded in `.scratch/cover-v56-final-full.log`. Only this invocation
disabled Git commit signing for disposable verification repositories through
`GIT_CONFIG_COUNT`; no repository/global signing configuration was changed.
The SKIP is `verify-i16a-teaching-dimension-search.mjs`: its off-repo
`paper-960d0f8d/versions/v1` fixture is absent, so that check was not performed.
Separate cover CSS regression, design detector and `git diff --check` also pass.
No push, PR, deployment or Owner approval occurred. This closeout does not claim
a generic DOCX first-paragraph role fix or semantic audio-content validation.

### Inline blank spacing correction, 2026-09-20

Owner identified inconsistent blank-adjacent spaces. The real R4 audit found
22 missing text-facing sides across 17 of 30 blanks: eight Seven sentence
boundaries and fourteen word-facing Cloze/Grammar boundaries. Provenance is
scanned PDF/OCR plus import-agent proofreading, not a DOCX producer.

Advisor review selected a new-write quality gate, not a retroactive Candidate
schema/adapter change. `inlineBlankBoundaries.mjs` checks compiled NCK1 groups;
universal verify and Review CLI push expose it early, while live raw/analyzed
publication admission enforces it before issuing its proof. Historical Candidate
derivation, confirmation and sealed-publication validation are unchanged.
Diagnostics retain group/block/question/blank/path/side. Split text nodes,
directional punctuation, paragraph edges and recognized grammar prompts have
explicit tests. Independent review caught U+FEFF passing JavaScript whitespace;
the retained red case now passes with the zero-width character rejected.

Unpublished v56 presentation selects source-owned external spacing. Print's
extra .15em margins and absent-hint grid track disappear only for that policy;
hinted grammar keeps .5em and historical consumer refs retain old geometry.
The normative rule remains in exam-paper-format-standards §6, not a new parallel
format document.

The isolated paper worker preserved R4 and added exactly 22 ASCII spaces to
22 JSON string leaves (+22 bytes), without changing words, questions, answers,
roles or audio. All 38 summary texts and authored metadata values were retained;
fresh source-bound sidecars passed their verifiers. Final raw/analyzed admission
checks passed, including freshly rebound missing-space and zero-width inputs.
The correction's full regression and new revision three-surface QA results are
recorded below; the earlier closeout is not evidence for this later correction.

During the correction QA, the isolated worker mistakenly inherited the production
origin for its first push, outside the local-only authorization. Retained status
shows production revision `rev-10f4b4fd-bc6d-465a-8cdf-e0efc4e7f764` in `uploading`
(created 2026-09-20T06:13:04.077Z), `latestRevisionId: null`, `finalizedAt: null`,
and no approval/promotion. Finalization rejected the source-manifest version.
This is a real production mutation, not a successful publication or an empty
dry run. Evidence is preserved at
`.scratch/full-import-rehearsal/production-status-after-misdirected-push.json`.
No production retry/cleanup is authorized; Owner was informed. Any cleanup of
this exact unfinished revision and its exclusive uploaded files requires a new
bounded Owner authorization and supported maintenance route. The worker then
explicitly bound the isolated origin and created local R5; further QA is local
only and must not repeat that push.

The first spacing `verify:paper` run recorded **96 PASS / 0 SKIP / 1 FAIL**
in `.scratch/blank-spacing-paper.log`. The image-source test exposed a real
upstream defect: OCR/PDF/DOCX share `contentWithBlanks`, which trimmed both ends
of first/last text runs and removed source-authored blank-facing spaces. It now
trims only paragraph exterior before splitting. Synthetic DOCX/PDF fixtures use
prose-separated blanks; whitespace-only adjacent blanks remain a rejected case,
not a relaxation of the signed materialization schema.

Producer identities advance to DOCX10/PDF7/OCR7 so old cache output cannot count
as new output. The read-only inspector recognizes exactly each immediately prior
version with its recorded-version source digest and reports historical evidence.
The writer still accepts only current-version caches; the OCR replacement branch
also requires the current version, preventing upgrade-triggered deletion of old
output/receipts. R5 is not regenerated or retagged. Independent follow-up review
found no blockers; focused DOCX, PDF and OCR checks pass, including historical
evidence inspection and refusal to replace it with unchanged or changed inputs.

R5 read-only inspection exposed a further provenance assumption: the original
OCR review retains three issues while the corrected materialization has none.
The inspector now checks issue-list equality only for byte-unchanged producer
output. Modified output remains `agent_modified`, with the original disposition
`needs_agent_review`; source-intake automation still stops for review. The new
regression checks both branches and byte-preserving inspection. Focused DOCX
and OCR checks pass after this correction. The real R5 inspection also passes
as historical OCR v6 / agent_modified; receipt, review, materialization, both
sidecars and pagination hashes are unchanged.

Local R5 `rev-d23becf2-cd54-4f1f-9ad6-ec4a62b89cf1` remains awaiting_review.
Screen and Student/Teacher natural Print checks cover 30/30 blanks each, with
zero external margins, no bad word-facing boundary, no phantom hintless track,
and 7px hinted-grammar spacing. The one explicit friendly10 plan `[0,18]`, with
no forced breaks or automatic search, produces ten A4 pages and zero split
option banks. Reading B/D cross-face and listening/Reading A–D page-split
warnings remain. The real Review PDF opened once at 1/10; navigation to page 7
left its embedded preview blank, so no claim is made that later-page viewer
navigation passed. The existing explicit PDF raster pages 7–9 were inspected
instead. Parent independently inspected page 8: blanks 41–55 and all options
are readable, without clipping, overlap or formal answer leakage.

Parent evidence includes `.scratch/full-import-rehearsal/r5-pagination-report.json`,
`r5-screen-inline-blank-dom.json` in the same directory, and
`.amp/in/artifacts/r5-inline-blank-pdf-page-08.png`. Owner state is R5 Screen,
immersive, scroll top. No further revision or production operation was made
during this inspection correction.

Final correction regression: `pnpm -C app verify:all` (with test-only Git signing
disabled through `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign
GIT_CONFIG_VALUE_0=false`) exited zero: **171 PASS / 1 SKIP / 0 FAIL**, 1768.6s.
Log: `.scratch/blank-spacing-final-full.log`. The SKIP is
`verify-i16a-teaching-dimension-search.mjs`: its off-repo
`paper-960d0f8d/versions/v1` fixture is absent; that check was not tested.
The final inspector correction happened after the full run started; its affected
DOCX/OCR checks were separately rerun successfully on the corrected code in
`.scratch/blank-producer-docx-final.log` and `blank-producer-ocr-final.log`.
`node scripts/verify-inline-blank-boundaries.mjs`,
`node scripts/generate-paper-presentation-v56.mjs --check`, and
`git diff --check` also pass. No Git push, PR, deployment, Owner approval,
publication or production cleanup is included in this closeout.

Owner subsequently explicitly authorized cleanup of only the accidental
`rev-10f4b4fd-bc6d-465a-8cdf-e0efc4e7f764` and its exclusive uploaded files.
A fresh authenticated GET at 2026-09-20T07:31:18.578Z confirms one revision,
still uploading, finalizedAt/latestRevisionId null, no approval or promotion,
and the same bundle digest and 11-file / 49,282,453-byte manifest. Evidence:
`.scratch/full-import-rehearsal/production-cleanup-authorized-status.json`,
SHA256 `aef0f85e828e59ef23cb1577a05e35a4766509cc50dada86b20a176960d3ce51`.
This status is not a disk inventory or proof of exclusive file references.

Cleanup remains blocked by the maintenance surface, not missing deletion
authorization: Review has no revision-abort/delete API, and the installed
restricted Deployment SSH grammar supplies no Review DB/file inspection or
cleanup operation. No delete, finalize, retry, deployment, host configuration,
credential or privilege change was performed. Do not disguise deletion as a
deployment/migration, use arbitrary SQL/shell, or remove the paper row whose
pre-incident existence is unknown. A bounded reviewed maintenance-entry change
needs separate authorization before installation/execution; the existing
authorization for this exact cleanup remains valid.

Owner subsequently accepted retaining the unfinished upload rather than adding
a maintenance capability for it. Cleanup and maintenance-entry work are paused;
do not resume either from the earlier authorization alone.

### Continuation material alignment follow-up

Owner spotted ragged-right PDF continuation prose versus justified Screen in
the R5 screenshots. Actual DOM confirms five Screen narrative paragraphs use
justify/auto; Student and Teacher Print use start/auto. The sixth Print paragraph
is a notice, not narrative. Source text and line breaks are not the cause.

The unpublished v56 presentation now explicitly binds
`continuationMaterialAlignment: justify_except_last_line`. Print selects a shared
CSS rule only through the consumer's resolved policy, targeting exactly
`material_paragraph`; notices, instructions, starters and answer geometry stay
unchanged. Missing/historical consumer refs preserve previous Print alignment.
The initial unconditional prototype was replaced after the advisor identified
its historical-consumer scope violation. Focused continuation browser/PDF tests
pass with new-policy positive and pre-contract negative coverage, including
unstretched paragraph-final lines. The follow-up Standards/Spec review reports
no blockers; explicit Print v44 browser coverage is a nonblocking suggestion.

Full regression is recorded in `.scratch/continuation-justify-full.log`; focused
PASS is `.scratch/continuation-justify-focused-final.log`. The isolated worker
has the exact ten-file archive SHA256
`a9d5f91875f314abfb0c187ad325d7fbddebd183d0aeb1f339a68ba7842d6954`
for a fresh local renderer-bound revision and real last-page PDF QA. Every
Review command must explicitly assert origin `http://127.0.0.1:18887`.
No source/answer/sidecar mutation, production request, approval or publication
is part of this alignment correction.

Isolated R6 `rev-89ef7855-d1b9-4622-886c-b8b6384156b2` is awaiting_review,
rendererStale=false, unresolved=0, blockers=[]; source/candidate/bundle digests
and the source/answer/audio/sidecar byte manifests remain unchanged from R5.
The explicit friendly10 replay still gives ten A4 pages, no overflow and zero
split option banks, with the previous cross-face/group-split warnings retained.
Actual R6 Screen and Student/Teacher Print each have five narrative paragraphs
at justify/auto. Notice alignment and 548.031×215.43px response geometry stay
unchanged. The real Student Review PDF was downloaded once; its page10 raster
is `.amp/in/artifacts/r6-student-pdf-continuation-page10.png`. Parent independently
inspected it: ordinary line right edges align, paragraph endings are natural,
notice/starters/box/footer intact, no clipping or overlap. Browser is restored
to R6 Screen immersive at scroll0, 1280×900 DPR2.

This follow-up's own `pnpm -C app verify:all` finished with **171 PASS / 1 SKIP /
0 FAIL**, 1760.4s (test-only Git signing disabled as in the prior full run).
The skipped I16A teaching retrieval check still lacks its off-repo fixture;
it was not tested. Generator `--check` and `git diff --check` pass. The normative
format index now explicitly requires role/consumer-based rules, not paperId,
title or sentence patches, with this alignment rule and its three-surface
acceptance linked at the existing entry. R6 remains for Owner QA, not approved
or published; no Git push, PR or deployment was performed.

### Whole-paper gold-reference role layout (Owner follow-up)

Parent and an independent subagent audited actual R6 Screen, Print and the
existing ten-page PDF against the gold images. Thirty-five prose paragraphs
(reading 18, seven-choice 6, cloze 5, grammar 4, application 2) still differed
in alignment; continuation's five narrative paragraphs were already justified.
Writing notice indentation/rhythm differed, Reading A semantic newlines were
collapsed on both surfaces, and two PDF headings were orphaned at page bottoms.

The unpublished v56 candidate now binds `roleLayout: golden_reference_v1`.
All six prose families, writing notices, reading paragraph/table semantic
newlines and heading-follow constraints share role-based rules. Screen adapters
carry the exact consumer policy through whole-paper and single-group surfaces;
Print binds each group and its preceding chrome independently for mixed-version
drafts. No paper ID, question number or sentence selects a fix. Historical
consumers have no marker and retain previous behavior. Source, answer and
occurrence identities are unchanged. Existing continuation verification imports
the new shared-role stress test, including real Paged output and old-policy
negative controls; this is not only a one-off manual check.

The first Paged stress run caught an unsupported functional selector in break
handling; explicit selectors fixed it. App build, the focused role test and
generator reproduction pass. Independent Standards/Spec review found no
blockers; actual whole-paper verification remains necessary. Parent logs are
`.scratch/gold-layout-build.log` and `.scratch/gold-layout-paper.log`.

Isolated transfer `golden-role-layout-v56.tar.gz` (15 files, SHA256
`2e6d44468c3d830a7d73c0cdf9c2e8e07830c7e0e2f2282592b3a0511d2ad377`)
passed safe extraction, exact comparison, generator and build. The old R6 plan
was preserved/deactivated. The single explicit `[0,18]`, no-break/no-auto
friendly10 attempt failed closed: **11 A4 pages**, target10, one candidate,
planSaved=false, no active plan. The diagnostic's page11 is the complete
continuation response box, not blank. Parent inspected pages9–11: grammar title
has following content, body alignment and notice indentation are corrected,
and no clipping is visible. The 10-page edition is not verified or accepted.

All non-plan materialization/source/candidate/answer/audio/sidecar byte manifests
remain identical. No R7 was pushed at that failure boundary. Follow-up QA is
authorized locally on the ordinary, non-fixed-page route, without restoring the
stale plan or mislabelling eleven pages as friendly10. Every Review command must
explicitly assert isolated origin `http://127.0.0.1:18887`; no production,
approval, publication, Git push or deployment belongs to this follow-up.

Ordinary-route R7 `rev-238bb655-3cfd-4565-ac0b-2530a0e7d6da` is now
awaiting_review, rendererStale=false, with no fixed-page plan. Actual Screen and
Student/Teacher Print each pass all40 prose roles at justify/auto/margin0;
both writing notices have a measured24px gap, flush label and28px numbered-line
inset without inherited text-indent. Thirty blanks retain valid boundaries and
zero external margins. Reading paragraph/table semantic lines and response
boxes were visually inspected. The42 non-plan data-file hashes remain identical.

QA incident: entering the Review PDF tab accidentally selected friendly10 and
started bounded automatic search. Switching to Screen did not cancel it; an
already-issued isolated API restart interrupted it. No final HTTP result was
captured, so that request is UNKNOWN, not a layout PASS/FAIL. No production or
paper-data mutation occurred. Subsequent QA used the exact authenticated
`pageLayout=natural&version=student` endpoint, not the PDF tab. Its first GET
returned200/application/pdf but the browser Blob download failed and the bytes
were lost; it is not visual evidence. A second independent GET used a tested
base64-to-file path, with no further PDF request/restart or automatic search.

The saved second response is396,417 bytes, SHA256
`d75c4873d296c2ddc4a7e36971aa3131f984f399a472e83de2ac8ea6889379f2`;
`pdfinfo` reports11 A4 pages (594.96×841.92pt). Worker checked16/16 heading-follow
cases and a full contact sheet. Parent independently inspected exact pages3,4,
7,8,9,10,11, covering all six prose families, semantic table lines and complete
writing boxes: no clipping, overlap or formal answer leakage. Representative
artifact: `.amp/in/artifacts/r7-natural-student-pdf-page10-continuation.png`.
The browser is restored to R7 Screen, immersive, scroll0,1280×900 DPR2.

`pnpm -C app verify:paper`:97 PASS /0 SKIP /0 FAIL,1591.5s. The final
`pnpm -C app verify:all` completed with171 PASS /1 SKIP /0 FAIL,1784.6s,
exit0; log `.scratch/gold-layout-full.log`. Test-only Git signing was disabled
as in prior runs. The skipped `verify-i16a-teaching-dimension-search.mjs`
requires an unavailable off-repository fixture; that coverage is not PASS.

## Owner review simplification — 2026-09-20 follow-up

Owner reviews Screen and final PDF only. Draft Workbench browser printing is
removed; printing uses the downloaded PDF. Print HTML remains an internal PDF
rendering input, not an Owner review tab. Teaching analyses and paragraph
summaries are not shown as import review work. This does not delete historical
analysis data or introduce a new teaching-generation step.

OCR transcription is Agent work. Owner receives a before/after report covering
recognition repairs and original-source spelling/layout errors only; grammar,
style and other editorial changes are out of scope. Historical OCR-stage text
is labelled separately from the current Candidate. Missing old reports remain
missing, not an empty successful audit. Candidate reports bind exact current
source/candidate identities, source bytes, an immutable server-held OCR receipt,
source locations and Materialization after-text. New Agent receipts require the
report for Candidate submission; existing receipts remain readable unchanged.

Listening plays on Screen. New external-package approvals bind audio to ordinary
Screen/PDF approval without complete-playback/cohesion/safety attestations;
historical v1 receipts retain their exact historical meaning. Image-candidate
confirmation remains. Source files, original crops, transcripts/check evidence,
revision/structure and promotion records are secondary disclosures; technical
IDs no longer occupy the primary feedback form. PDF opens natural student output
by default; fixed-page variants require explicit selection.

Local-only implementation and synthetic browser checks: OCR report state and
absent Owner checklist PASS; OPS store/approval verifier PASS; desktop/narrow
PDF selection and revision-bound feedback PASS. Independent Standards/Spec
review found no blockers. Inspected UI fixture screenshots are under
`.amp/in/artifacts/import-pagination-qa/`; they do not depict real R7 report data.
Full regression finished in `.scratch/ops-simplify-full.log`: 167 PASS / 1 SKIP /
4 FAIL, exit 1. The four failures were obsolete UI assumptions in teaching-tab,
promotion-disclosure, source-pairing and summary-review checks. Targeted promotion
retesting additionally caught a real report-gate SQL defect: review kind is
derived from manifest JSON, not a database column. The gate now uses the existing
manifest contract and applies only to Candidate revisions. A regression confirms
that a later OCR-stage revision is not blocked by the Candidate report requirement.

After those fixes, individual reruns of `verify-import-ops.mjs`,
`verify-universal-nck1-publish.mjs`, `verify-import-review-source-pairing.mjs`,
`verify-public-paper-review-consumer.mjs` and
`verify-import-review-ocr-confirmation.mjs` all PASS. This is full-run evidence plus
focused reruns, not a claim of a fresh all-green full run on the final tree.
I16A remains SKIP because its external fixture is unavailable. `git diff --check`
PASS. Desktop/narrow screenshots were inspected; the primary tabs are Screen/PDF,
and source/version materials remain collapsed until opened.
No existing paper revision, approval, publication, production or deployment
action was performed. The earlier PDF-only full run ended170 PASS/1 SKIP/1 FAIL
at the Ops MCP verifier's disposable `git commit` setup (signing was not disabled
for that run). It is retained as evidence, not counted as a pass for this
successor. The new full run disables signing for test subprocesses only, as in
the previously successful full runs.

## Fixed-edition and source-layout follow-up — 2026-09-20

Owner authorized fixing the R7 eight-page rejection and adding generic flexible
writing space, with Screen seven-bank labels at normal weight and PDF labels
8页版/10页版. The isolated pre-render reproduction found exactly one mismatch:
listening omission changed visibleStructure but retained its full-paper digest.
The fix validates the original input before deriving the filtered view digest;
it does not weaken the Profile validation or mutate R7.

Fixed editions now probe bounded cover/bank/answer-space combinations and retain
chosen integer-mm heights for explicit replay. Application floor24mm;
continuation floor40mm for the whole two-starter box. Natural geometry and
historical plans remain unchanged. Unit boundaries, original-input rejection,
plan replay and real 9-to-8-page pressure checks cover the new behavior.
Independent review's single-profile-search finding was fixed and its follow-up
reported no blocker. Actual R7 isolated 8/10-page verification is in progress.

The first actual R7 ten-page fit failed positional acceptance: its application
prompt ended on page9 but its response box started page10. Saved PDF measurement
found only12.98mm after the notice, versus27.175mm required by the24mm box plus
margin. Do not accept page count alone or force this box below its content floor.
Automatic/adaptive plans now require the application response and final prompt
fragment on the same page; canonical application measurements must be present.
Historical explicit plans without adaptive heights retain compatibility.
Unit regression covers detached exact-count candidates and missing measurements;
the rendered fixture proves both application measurements on page7 and continuation
on page8. Independent follow-up review found no blocker. R7 alternate-cover
bounded verification passed17/24 renders: cover[0,18], application48mm, no group
breaks, protected option bank. Final explicit replay passed in one render with
application prompt/response both on page9 and continuation on page10; parent
inspected both rasters. PDF SHA256:
`2b593bdc9bededf188855e62e4cbc2bfe98cdc0ee31bb9dac086d2c1fcc105a0`.
Local R8 was created with the verified8/10 plans before a further under-target
search-budget guard; preserve it without claiming final runtime verification.
Full verification found a synthetic fixed8 route exhausting24 candidates and
the off-repo I16A fixture absent (SKIP). The route failure was reproduced with
its real error body, then fixed by reserving under-target candidates for semantic
break search rather than shrinking them. The added underfull regression and
`verify-universal-nck1-publish` both PASS after that guard; the original failed
full-run evidence remains retained:170 PASS /1 SKIP /1 FAIL,1746.4s, with the
pre-fix route as its sole FAIL. The full pack was not rerun after the guard;
report its result separately from the successful focused rerun.

Final isolated preview loaded the guard and deduplicated to R8
`rev-6437266e-bdaa-413f-ac11-a3834bcb20e1`, awaiting_review, rendererStale=false,
unresolved0. Both bound editions are explicit;42 non-plan files remain byte
identical. Both PDF endpoints returned200 with their exact8/10-page headers.
The8-page endpoint file was saved; the10-page browser response bytes were not
recoverable and no retry was made. Its separately saved explicit replay above
remains the visual evidence, not recovered endpoint bytes. Actual Screen shows
7/7 A–G labels at400 and the PDF selector offers8页版/10页版. Parent inspected
the final Screen and A–G captures. No approval, publication or production action.

Owner additionally asked to investigate the missing Timetable bullets and
table appearance. Original pixels show three bullets; raw OCR used @/e/@;
confirmation removed those prefixes and Materialization inherited the omission.
Current table uses top alignment, 14px text/~24px line-height, 6px horizontal
padding. Proposed follow-up: preserve list markers during proofreading, and
consider shared native-table vertical centering/compact line-height rather than
centering all text horizontally. No bullet/source repair or table-style change
is included in this fixed-edition pass.
