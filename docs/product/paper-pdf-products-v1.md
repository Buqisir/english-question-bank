# 四款 PDF 产品与独立答案版

状态：Owner 2026-10-06 确认产品方向，2026-10-08 授权 Ship；
[PR #499](https://github.com/Buqisir/english-question-bank/pull/499) 交付候选，尚未部署或发布试卷。
Owner 2026-10-06 对 reference-v2 县域样稿回复“OK”，确认本文件的参考格式适配版式与数值；
该版式确认不扩成评分细则、源内容忠实或新 Review 的批准，也不授权试卷发布。
本文件承接 [格式总入口](exam-paper-format-standards.md)，不改历史 Canonical authority。
下方各日期的出样和接线记录保留当时状态，不代替当前 Ship／部署／发布证据。

## 已确认的产品边界

当前目标只有一个 `edition` 选择，不再是 Student/Teacher × pageLayout 的组合。

| edition | 产品 | 内容与分页 |
| --- | --- | --- |
| `largeComplete` | 大字完整版 | 完整题卷与听力；12pt / 19.5pt；最多12张A4 |
| `largeNoListening` | 大字无听力版 | 不含听力的题卷；同正文规格；最多10张A4 |
| `economy8` | 省纸版 | 不含听力；严格8张A4；既有有界字号与友好分页规则 |
| `answerOnly` | 纯答案版 | 独立参考答案册，不重复题卷；自然分页，不要求4页或8页 |

前三款不含答案、范文、解析或录音稿。Screen 阅读、PDF Screen 预览与下载是观看方式，
不是新版本。所有卷一律从扫入题卷的正式题头取名，所有产品复用精确名称，不从文件名
猜或缩写；历史绑定只用于精确重放，后续名称校正也以源题头为准，不设旧命名例外。

旧 `student` / `teacher` 字段只在精确历史重放或题卷内部隐藏答案的实现中保留，
不作为当前产品选择，也不把旧 teacher 自动映射成 answerOnly。Teacher Confirmation、
教师用户及权限角色不改名。个人解析、精选平台参考不混入公共答案版。

## 单卷九页省纸上限（2026-10-13 Owner授权）

M174在默认八页有界搜索失败后，Owner允许本卷超过八页，并授权共享合同支持、
PR合并、网站代码部署及完成待审版本。默认和历史省纸版仍严格八页；不按paperId
或题文打补丁，不改Source、Canonical语义、答案或听力，不授权试卷批准、发布或清理。
本节是新增合同的实施要求，实际Ship／部署／Review状态以相应证据为准。

新`paper-pagination-plan-v5`显式保存`economy8.targetPages:9`，含义是最多九页，
不是补足九页。此版必须有省纸entry，沿用`student-friendly-economy-v2`及
10.5pt／18pt正文；其他三产品及Screen不跟随改变。计划仍绑定paperId、Source、
Candidate和有序slot断点，七选五库不拆、完整应用文题面／框同页等硬约束不放宽。
v1／v2／v4计划保留原含义与字节，不自动迁移。

正式入口可在新的本地工作副本中初始化已验证几何，无需重新搜索八页候选：

```bash
node scripts/import-pipeline/review.mjs pagination-qa <paperId> --edition economy8 \
  --economy-page-limit 9 --product-layout <layout.json> \
  --break-slots writing.continuation --save-plan --output <new-qa-directory>
```

`layout.json`只含现有profile、fontSizePt、figureLayout、answerBoxHeightsMm四项，
先经正式plan validator校验，再实测指定断点。初始24mm框不是最终默认：同一断点／
字号下先恢复续写、再恢复应用文空间，总计最多16次测量，将实际选中高度保存。
失败不保存计划；冻结与后续重放仅使用保存的精确布局，不重新猜尺寸。

正式freeze生成`paper-pdf-products-v2`清单，新增`economyPageLimit:9`；稳定路径仍为
`products/manifest-v1.json`，避免破坏四产品文件访问。清单inputDigest包含完整plan
及其他非产品输入，Review验证清单页数政策与绑定plan一致，仍核实际PDF页数／SHA。
已批准版本只读其已承诺的清单与PDF，不能借新合同覆盖旧版本。renderer指纹变化时，
已有待审卷须同内容提交新revision；产品与输入门禁仍通过才复用字节，不冒称旧审核有效。

## 所有卷统一取源卷名，Owner只给源材料与考试年月（2026-10-07确认）

Owner提供完整源材料（题卷、权威答案、源有的音频）及考试年份、月份；不再逐项提供
卷名、paperId、题型、分值、源文件角色或产品排版参数。Agent按源和固定NCK1合同
自动处理这些字段，保留来源证据。所有卷（真题、模拟卷、B/C区及其他卷）的名称都取
扫入题卷的正式题头，不以人工另起名称替代，也不是答案册标题；扫描换行
可以适配展示，字词、组织、日期与名称不自动润色，不因Owner年月给名称另加前缀。
题头歧义、明确日期冲突、实际缺源或合同不匹配才报告具体异常；不把正常处理交回Owner。
自动化不等于自动审核、批准或发布。已有名称与源题头不一致时，按源核对后走版本
变更，不原地覆盖已绑定Revision。B/C三卷已按源题头制作本地改名候选，详情见文末；
原绑定Revision、源工作区与旧PDF仍保留，不能把候选预览当成名称已经封存或发布。

### PDF长卷名单行适配候选（2026-10-07）

Owner要求题头保留完整名称，长名通过降低字号避免两行。本地候选按加载完毕的
固定字体与170mm可用版心实测，不按字符数猜宽度，不缩写、裁字或横向压扁字形。
从既有18pt依次尝试17、16、15、14pt，取能完整单行容纳的最大档；14pt是本轮
提议的下限，**不是Owner已确认的正式数值**。下限仍放不下则明确报版式异常，
不继续缩小或静默折行。通用导出链尚未启用该候选算法。

只调整PDF卷名：27pt行盒、下隔8pt及独立20pt科目标题不变，不挪正文、缩正文
或重做分页计划来腾位置。三款题卷与纯答案版使用相同题头适配规则。
县域四款实际选中17pt；皖南与北斗星既有18pt已能完整单行。Screen仍沿用独立
24px/36px阅读规格和既有栏宽，长名可响应式换行，本轮不把PDF字体档应用到Screen。

**年月必须成为可索引的来源元数据，而不是标题装饰：**

- 考试年份、月份分别为整数；月份1–12，年份沿现有1900–2100校验范围。
  仅有年月，不造“1日”、时间戳或时区。学年与导入日期不是考试年月。
- 年月取Owner输入，保持独立于卷名；不得靠解析卷名、paperId或文件名完成新卷索引。
  新卷缺年月标为未完成；旧卷缺月份维持未知，不填0或默认1月，也不混入精确月份筛选。
- 年月挂在Source，Question Group／Question沿Passage所属Source继承，不逐题复制。
  四产品不各造时间身份；筛选、排序使用数值年份与月份，`YYYY-MM`仅为一致展示。
- 完整落地需贯穿导题输入与收据、Review封存元数据、批准／发布、`sources`持久化及
  查询消费，读写结果一致；已有精确Revision不原地修改，不以scratch记录冒充已入库。

**当前实现（2026-10-08，本地候选）：** initializer／attach-answers已接入`--year`、
`--month`，经config、Review封存和import-meta写入Source。`sources.month`为可空整数，
查询支持year/month，网站按年再按月筛选；旧月份不回填。尚未部署数据库变更或网站，
真实试卷未发布；隔离可丢弃数据已完成Review→publication→存储→四产品读取验收。
B/C候选及原待审身份保持不变。

## 正式文件与网站产品访问（2026-10-08，Ship候选）

Owner要求接通正式文件存储、年月索引和产品访问，不新增管理／检阅台。
导入和准备产品不会自动发布；网页验样后仍需Owner明确授权单卷上线。

- 新raw-source工作区声明`pdfProductsRequired:true`。源参考、年月和分页准备完成后，
  用`node scripts/import-pipeline/freeze-products.mjs --paper-dir <workspace>`冻结四款PDF，
  再提交Review。`products/manifest-v1.json`及四个edition文件均进入精确Review清单；
  manifest绑定全部非产品输入字节、精确卷名及考试年月。不覆盖已有products目录。
- 网站原卷下载读取已审文件，不再在点击时重新排版。PDF Screen和下载按
  paperId＋Canonical publicationDigest＋edition定位唯一版本；缺固定产品、版本不符或
  字节改变均拒绝，不回退mutable latest或现场重渲染。个人组卷仍按所选题组排版。
- 授权promotion在内容事务前将全部已审文件及清单存入私有内容地址存储，逐文件读取
  验SHA和长度。DB成功发布记录绑定storage inventory与Review／Canonical身份。
  本地私有目录和R2使用同一`eqb-blobs/v1/sha256/<digest>`键；R2条件写入，不覆盖、
  不删除、不提供公开桶URL。上传响应丢失先按相同内容地址读取核实，不盲目重放。
- 已归档版本的音频路径可从同一存储读取hash匹配的playback，保留HEAD与Range；
  当前鉴权不改变。存储后端配置不全或读取失败时，不悄悄改用其他后端。
- 返修从保留的源与已审输入另建工作副本，重做受影响产品，提交新Review、认可后
  单独授权promotion。网站当前指针随原子发布更新；旧版本与旧文件保留，旧摘要链接
  仍定位旧版本。不能直接覆盖已发布PDF，也不能把未审样张加入旧批准清单。

R2服务端配置为`QUESTION_BANK_FILE_STORE=r2`、`QUESTION_BANK_R2_ENDPOINT`、
`QUESTION_BANK_R2_BUCKET`及独立的`QUESTION_BANK_R2_ACCESS_KEY_ID`／
`QUESTION_BANK_R2_SECRET_ACCESS_KEY`；密钥走既有安全配置渠道，不进入聊天、源码或
进度记录。默认本地路径为`data/published-blobs`，可由`QUESTION_BANK_BLOB_ROOT`指定。
后端身份绑定发布记录，切换后端不是自动迁移旧版本；不得修改历史记录伪造远端存储。
现有R2定时灾备仍独立，不把文件归档当成SQLite／整站备份已完成。

**尚未完成：** 私有R2未配置、未请求远端、未改生产。Canonical的实际源／音频字节
验证和Review工作副本仍依赖本地文件，本轮没有删本地副本、做缓存驱逐或实现完整减容。
正式发布、恢复／回滚和R2端到端验收待Ship及相应环境授权；不能据本地接线宣称上线。

隔离预览用合成年月／发布记录与保留县域样张，真实前端可筛2025年12月，未知月份
不混入结果。四次实际浏览器下载经`sha256sum`和`pdfinfo`核对为原样张12／10／8／4页，
原生答案PDF已加载并实点适页。桌面／390px Chromium窄视口的完整卷名、月份和操作
已截图查看，溢出0；非触屏实机。此证据不构成真实Review、发布或源忠实验收。

私密预览p29169首次跨orb检查11项中7满足、4失败（exit2）：四PDF的HEAD未注册，
落到404；已保留失败证据。仅为这组已存产品路由补显式GET／HEAD共用读取，HEAD不
返回body。受影响部分补查14／14 PASS（2026-10-08 14:53:41 UTC，exit0）：匿名与
未登录伪造头四PDF HEAD均302登录拦截；合法Owner四PDF HEAD200、private,no-store、
inline，长度472912／432259／427368／198177；错摘要与异卷HEAD均400非PDF。未重复
已通过的索引／OPS／POST，未检查外部print HEAD，外部未GET PDF，不冒称远端字节验收。
索引DOM的`time.dateTime`为`2025-12`，可见月份为`12月`，年份在2025分区标题。

`verify-published-products-storage.mjs`已加入Full registry；Owner授权Ship后，
本地独有存储／公开读取、源参考答案和v60闭合检查已通过。Full和六个E2E沿用
当前精确head/base的自然GitHub Actions，保留失败尝试；旧提交结果不授权新提交合并。
私有R2、真实发布和生产部署仍未执行，不将隔离验收标成生产PASS。

## 答案内容合同

1. **客观题答案**：复用当前材料化的 questionId、标准题号、源答案与原有 variants。
   不重新做题，不从解析推答案；听力已 captured 时包含1–20，其余21–65完整覆盖。
2. **写作源范文**：附着在零 Questions 的 Writing Task / groupId，不造写作 questionId。
   保留源给的全部范文、源标签（包括正反立场）、顺序、标题、段落、称呼和落款。
   使用“源参考范文”身份，不凭答案文件角色冒称命题机构官方；不读取 AI modelAnswer。
3. **评分参考**：源给的细则单独捕获，不由 AI 归纳或推导。是否打印尚待 Owner 决定；
   本地样张默认不打印，但捕获数据不丢弃，不另造第五款产品。
4. **听力原文**：复用 captured listening 的源 transcriptSegments、题号关联和顺序，
   不打印播放器、波形、音频核对 receipt 或 ASR。样张默认包含源卷全部听力答案与原文，
   不随上一款无听力题卷改变；这个默认仍待 Owner 验样确认。
5. **缺失必须诚实**：`not_supplied` 必须有源审查位置；`unprocessed` 是未完成，
   不能当成源没有。源缺范文不编；未完成捕获不导出答案版。

写作使用独立 `source-references-v1.json`，绑定 paperId、sourceDigest、candidateDigest、
materializationDigest；每段有稳定ID和角色，每篇有 source-reference 身份及原文定位，
定位绑定原文档SHA。不向既有材料化 schema 插字段或重算已审 Candidate。
该文件不代替 OCR/源忠实核对：schema、位置、SHA 只能证明结构与来源绑定，不能证明
作者转录正确，也不能把 layout-only Owner Review 扩成语义审核。

## 按 Owner 参考格式适配（reference-v2，Owner 已确认）

Owner 2026-10-06 明确否定先前五项逐题号／两列语法的自拟版式，要求针对
新提供的四页答案 PDF 做适配，并在查看适配样稿后回复“OK”。版式依据为该文件的
真实页面；确认对象是下面的 reference-v2，不是此前已否定的 draft-v1。参考文件 SHA256：
`32356a86758143c2beb0bfa0f5b2bf0975d6d358323a1dfb70622c5b3e5181c9`。

**结构沿用参考，内容沿用本卷与 NCK1 合同：**

1. 首行精确来源卷名，下一行“英语学科　参考答案”。不印独立封面；历史版本仅按原绑定重放。
2. 按第一部分听力、第二部分阅读理解、第三部分语言运用、第四部分写作组织；
   阅读与语言运用下有第一／第二节。题数与分值来自 NCK1 固定结构，不从参考卷猜。
3. 选择题使用“题号范围＋连续答案字母”：听力1–5／6–10／11–15／16–20；
   阅读21–23／24–27／28–31／32–35（A–D篇）；七选五36–40；完形41–45／46–50／51–55。
   不再逐题重印题号；内部仍逐题保留编号与源值，不把压缩字串当成新答案数据。
4. 语法五栏、两组逐行顺序：56–60，随后61–65。列宽按两行内容共同分配；
   长词组与源 variants 可在所属栏换行，不缩字、不裁切，不改变编号顺序。
5. 写作紧随答案区，不另起页。源版本标签左对齐加粗；源范文标题居中粗斜体；
   正文首行2em、两端对齐；称呼左对齐、落款右对齐。保留所有源范文及正反立场。
   源标签若已带节名，只拆视觉行、不重写原字符，不额外重复节标题。
6. 续写段首句仅在源范文确实包含绑定的源 starter 时斜体、下划线；不增写缺失句，
   不擅自补 `Paragraph 1/2` 或改源段落。范文后直接接加粗左对齐的 Text 1–10，
   每段 M/W 角色和换行沿用源原文，没有额外的大“听力原文”标题页。
7. 页脚居中“英语参考答案　第 n 页（共 N 页）”；标题带下一段，长文自然跨页。
   四页是参考样本结果，**不是答案版的硬限**。不印题干、选项、写作空框、教学解析、
   AI范文；不复制样本的“绝密”、水印、公众号或范文文字到其他卷。

**当前适配数值（不是从 PDF 精确反推出的字体参数）：** A4，上21、左右20、下24mm；
固定 EQB Termes / Source Han Serif。原reference-v2卷名18pt / 27pt、加粗居中；
本轮长卷名单行缩字号候选见上节，未改题头的历史样稿仍按原绑定重放。
下隔8pt，科目标题20pt / 27pt；标题后19.5pt进入答案。正文12pt / 19.5pt，
部标题同字号加粗，节标题常规；部与写作标签前6pt，范文标题上下6pt，Text标签前13pt，
页脚9pt。这些数值服务于参考的层级与密度，不做逐像素仿制或按页数自动缩字。

## 实施顺序与完成条件

此迁移跨多个上下文，按可恢复阶段推进，不把局部 preview 当成全产品上线。

1. **源参考出样**：记录合同，建立严格源参考 schema/语义绑定与 prepare/finalize，
   实现独立答案 HTML + 同页分页PDF的本地 QA。只在 scratch 捕获和出样，不动现有卷。
2. **不可变内容闭合**：源参考进入 Review bundle/identity、approval、promotion、原子版本
   资产与消费端；导出只能读同一精确 revision/version。增加专属摘要或新 manifest 版本时
   保留旧字节和旧解析，不从 mutable latest、别卷或原PDF在导出时补内容。
3. **产品接线**：统一 paper browse、draft preview/download/save、My Space、旧 export、
   导题后台及“配套解析”入口。缓存和文件名至少绑定 edition 与精确内容版本。
   新答案版不加入 `FIXED_PAGINATION_EDITIONS`，不复用题卷断点/作答框规划。
4. **混编不丢失**：跨卷、子集、重排继续能导出，答案按最终题号映射；只取所选写作任务。
   题卷仍使用相应产品约束，必要时内部自然排版，但不出现第五款“自然版”，不静默降档。
   大字完整版必须有其声明需要的完整听力；不满足时明确失败，省纸版失败不冒充成功。
5. **验收与退役**：四款对同一输入的真实预览/下载/保存一致，证明题卷无答案泄露、
   答案无题卷/AI内容、多范文与variants不丢、精确版本隔离；覆盖混编，再退役当前
   Student/Teacher生成入口。Owner 未说Ship，正式验收套件尚不启动。

当前本地 prepare/finalize/qa 不调用 Review API，不提交新revision，不批准或发布。
只有新 sidecar 随精确 Review revision 一起封存、审核与发布后，消费端才能提供答案版；
本地接线不能作为原 R6 已审补件，也不能声明网站已支持四款产品。

## 第1阶段出样历史（2026-10-06，draft-v1 后被 Owner 否定）

县域卷按 Owner 命名出独立答案册，不覆盖原 R6 或现存三款题卷。原生答案 DOCX
中的两篇源范文、六个段落和源标签已按原文档 SHA 与段落位置逐字回放。
65 个客观答案和10段听力原文按既有材料化核对，没有拷贝逐题详解、AI范文或题干。
Text 1 末句在原 DOCX 同样没有结束标点，不擅自续写。

可重复的本地出样命令：

```bash
node scripts/import-pipeline/answer-products.mjs prepare --paper-dir <workspace> --output <new-request.json>
node scripts/import-pipeline/answer-products.mjs finalize --paper-dir <workspace> --input <authored-references.json> --output <new-sidecar.json>
node scripts/import-pipeline/answer-products.mjs qa --paper-dir <workspace> --references <sidecar.json> --output <new-qa-directory>
```

每次新建输出，不改 paper workspace，也不覆盖失败样稿。QA 使用一次既有分页渲染，
同一 Chromium 页输出分页 Screen 和 PDF，逐项核对答案、源标签、范文段落、听力原文，
实际 A4 尺寸、边距、字号、8pt标题间距以及文字越界；reference-v2 另核范围分组和
语法56–60／61–65的逐行顺序；失败保留结果与失败记录。
评分参考仍默认不打印，显式 `--include-scoring` 可做非默认样张，不代表 Owner 已确认。

被 Owner 否定的 draft-v1 县域本地样稿为5页A4，实测卷名24px/36px、正文16px/26px，标题间距10.65625px
（8pt，允许浏览器小数取整）；PDF SHA 为
`9282ed548c58626ec13d713eb2fa5e31a0c2bd7653e25ca27854d7788e89d6bc`。
已实际查看各页、完整第一页分页 Screen 和原生 PDF Screen 的1/5页状态，下载字节一致。
另有不含听力的合成4页样张，覆盖多范文正反源标签、长语法答案/variants、跨页长段落、
称呼/落款与选入评分参考；不将合成文保存为真实卷内容。

保留的失败：早期文本采集错误将跨页连字符后误加空格；随后字体大CSS进入 Paged.js
解析导致 Letter 尺寸和标题样式丢失。已分别改为原文本节点拼接、沿用题卷 renderer
的独立 `data-pagedjs-ignore` 字体CSS，前述失败稿不得交付为合格产品。

最终样张入口p26233的跨 orb HTTP 断言16/16通过（2026-10-06 06:09:35 UTC，exit0），
未用旧p20133结果授权新入口：匿名/未登录伪造头均302登录拦截，
Owner可读精确样张，别卷、旧teacher及OPS拒绝，POST拒绝。它只证明入口门禁，
不构成新 Review、源转录批准或四产品完整验收。正式合同/回归用例已编写但未运行；
Owner 未说 Ship，Full/E2E 未运行。截至该稿出样，第2–5阶段尚未完成，网站旧产品入口未退役。

## reference-v2 适配出样记录（2026-10-06，Owner 版式验样通过）

新稿只改答案册排版，未改原 R6、sidecar 或既有三款题卷。县域
`.scratch/answer-only-qa/county-render-v7` 自然4页A4；卷名18pt/27pt、科目20pt、
正文12pt/19.5pt及8pt间距仍保持，未为凑4页降字号或删内容。65个源答案、12组范围、
语法五栏逐行顺序、6个范文段落、源标签和10段原文均通过本地出样核对；
逐页视觉检查与真实浏览器同版4页Screen、PDF Screen的1/4状态已完成。
PDF、HTTP下载及交付附件SHA一致：
`1adbd61882ace77c166f17cc305709a15c573ff33ac159d7ffab24b284d3a628`。
无听力、多范文、长variants与评分参考的非默认合成出样通过；超长答案允许栏内换行。
县域及北斗星38个原paper文件逐文件SHA核对仍全部一致。

保留首轮适配5页稿：等宽语法栏将长词组折行，Text间距留下末页仅两行；改为
自适应栏宽与13pt Text前间距后得到上述4页稿。旧draft-v1与三款题卷入口未覆盖。
新服务第一次注册时端口与监听不一致，p28329实际不响应；只修正新样张服务的
注册端口为30675，保留首次失败，不将该地址交付为可用入口。

当前新入口p26035跨orb HTTP16/16通过（2026-10-06 06:26:30 UTC，exit0）：
匿名/未登录伪造头实际302登录拦截，短期Owner精确viewer200且HTML含未提交提示、
Screen/PDF HEAD200且private,no-store、PDF inline；teacher/OPS/foreign拒绝，POST405。
未借用旧p26233结果。该证据不证明源忠实、版式、Review或批准；版式/字节证据来自
本地独立检查。本次无新revision、批准、发布、Ship、提交或部署；正式套件仍未运行。

Owner 对此稿回复“OK”，后续答案册沿用 reference-v2 的结构、字号与间距，按内容
自然分页，不固定4页。该确认是版式接受，不代替源内容审核、不可变版本接线或
四款产品完整验收；第2–5阶段和正式 Ship／发布仍未完成。

## 当前接线候选（2026-10-06，本地未提交、未正式验收）

Owner 随后要求“继续接线”。第2–4阶段的本地实现已接入同一候选：源参考 sidecar
进入精确 Review bundle、批准身份、版本资产及原子发布记录；消费端只读取同一版本
的封存材料化、原文档和源参考字节，不回退 mutable latest。历史无答案承诺的版本
明确不可用；声明过承诺却缺失或改变的字节报错，不降格为历史无答案状态。
既有 Canonical 四件闭合与历史 Student/Teacher Review 重放不变，不提高 authority。

浏览卷面的 PDF Screen／下载、草稿预览／下载／保存、个人空间、通用 export 和
导题后台已改为单一 edition 合同；当前教师卷和配套解析生成入口不再供新产品使用，
混用旧 versionType/pageLayout 的 PDF 下载或保存请求拒绝。题卷与答案册不共享断点；
缓存绑定 edition、内容与答案承诺，切换产品时立即隐藏旧预览。答案源不足时明示
不可用，不读取教师卷或 AI modelAnswer。子集、重排、混编按最终题号输出，只取所选
写作任务；完整原序原题号卷仍沿用 Owner 接受的 reference-v2 层级。

已执行的本地 UI 准备只使用真实前端组件与隔离内存 API，不访问数据库、Review 或生产：

- 草稿四选项、纯答案预览、下载与保存实点：请求 edition=answerOnly，保存文件名为
  Owner 完整卷名加“纯答案版”；个人空间显示该文件并可点击下载。保存仅在内存模拟。
- 浏览页四选项、PDF Screen URL 与下载实点：edition 及精确 publicationDigest 一致；
  此摘要为 UI 模拟值，不是新增发布。浏览 Screen 仍为题卷。
- 390px 桌面 Chromium 窄视口：修正打开更多面板后的横向溢出264px，复查为0；
  缺答案状态 iframeCount=0，显示源参考不足及不能替代的错误。不是触屏实机验收。
- 真实导题后台模块／CSS加内存 API：缺答案的 answerOnly 选项 disabled=true；
  产品元数据失败时 selectDisabled=true、iframeCount=0，不回退旧 PDF。
- 最终预览构建 `pnpm -C app build --outDir ../.scratch/four-products-preview-build`
  通过，TypeScript 与 Vite753模块成功。保留已有大chunk及运行时字体URL警告。

上述状态均已截图并查看。后台首轮 fixture 因 Vite 不允许直接加载 checkout 外路径失败，
未当作产品通过；随后在浏览器内加载原模块与CSS并截获API完成检查，未改服务门禁。
题卷 UI 预览在该 fixture 中是显式占位，下载复用已有样张；不能据此声称四款题卷
内容、真实保存、不可变发布、恢复／回滚或混编端到端均已验收。

精确发布／缺失与篡改／恢复与回滚、混编编号和拒绝条件的正式用例已编写但未运行。
第5阶段及自然 Full/E2E、独立 Standards/Spec 审阅仍待 Ship；没有新revision、批准、
发布、提交、push、部署，也未覆盖 B/C 既有样张入口。

## B区四产品补齐（2026-10-06，本地 QA 候选）

Owner 要求“请完善”后，B区两卷已有8/8份候选PDF，原有七份PDF不覆盖、不重渲染。
两卷的私密只读卷面入口增加同一四产品菜单、PDF Screen切换、返回卷面与下载。
这是原待审内容和本地布局／答案样张的交接，不是网站发布或原revision已审补件。

| 卷 | 大字完整版 | 大字无听力版 | 省纸版 | 纯答案版 |
| --- | --- | --- | --- | --- |
| 2026届“皖南八校”高三第二次大联考·英语 | 11页 | 9页 | 8页 | 新样张5页 |
| 2025年12月浙江省县域教研联盟高三年级模拟考试 | 12页候选 | 10页候选 | 8页候选 | 已接受版式样张4页 |

皖南前三款仍为精确R20 `rev-fbf9bca2-5bbe-4d69-b979-0fccf83940ba` 字节。
新答案侧车绑定同一Source/Candidate，原生答案DOCX逐段捕获全部三篇范文、12段；
按实际DOCX位置与原PDF八页审查记录缺评分细则，不造评分文字、不读取AI范文。
新出样 `.scratch/b-four-products/wn8-answer-reference-v2-complete` 自然5页，
65个答案、12组范围、语法五栏、全部源标签／范文段落、10段听力原文及A4字号／边距
均通过出样核对；PDF SHA256为
`d07645eaee50ab14ee4027096a60874a3baff8b71dae2a5702599629e36647e7`。
县域复用既有reference-v2四页答案及三款布局候选，没有重渲染或改变原R6。
两份答案 `reviewRevision` 与 `publication` 仍为null；没有新revision或发布批准。

已执行的交接检查：

- 新皖南答案五页逐页视觉检查；两封应用文的源标签与称呼同页，长正文自然跨页；
  续写starter斜体及下划线在高分辨率页图确认，未为页数删减末页Text10尾段。
- 两卷真实浏览器四产品切换与8次下载，逐文件SHA256及 `pdfinfo` 页数全部匹配；
  使用完整Owner卷名加产品名称下载，现有七份PDF保持原SHA。
- 两卷桌面及390px Chromium窄视口的打开菜单、PDF Screen已截图并查看；
  菜单四项可见、最小44px，横向溢出为0。原生PDF实际加载，不把空iframe当成通过；
  两卷原生适页缩放实点为62%，皖南页码实点从1/5切到2/5并截图确认。
  窄视口不是触屏实机验收。
- 同日07:57:52／57 UTC新 `/preview-products/` 路径跨orb门禁各30项，共60/60通过、
  exit0：匿名／未登录伪造头HTML/PDF HEAD实际302登录拦截；短期Owner四HTML GET200、
  四PDF HEAD200，private,no-store且PDF inline；旧teacher及异卷query拒绝；
  largeComplete HTML/PDF POST405。异卷query拒绝不区分逐卷校验与全query拒绝，
  POST仅采样largeComplete；此证据不替代PDF字节、源忠实、视觉或Review审核。

保留失败尝试：前两次皖南稿的第二范文标签／称呼跨页，最终只将标签与称呼包为
不可拆开头，不强制整篇不跨页；四产品菜单初稿左侧裁切，改锚点后桌面／窄视口复查。
皖南服务一次重启漏传原fixture/static环境路径，ENOENT启动失败；恢复原固定路径后
受管服务恢复同一portal，并在恢复后完成字节与外部门禁检查。PDF viewer首捕未等加载
呈空壳，等待真实原生PDF加载后重捕确认；原生嵌套frame DOM定位未成功，不以其证明交互。
这些失败稿和记录不覆盖。C区与其他原入口未改变；未运行正式验收／Full／E2E，未Ship，
未提交、push、批准、发布或部署。不可变发布、真实持久化与混编验收仍保持上一节限制。

## C区北斗星四产品接线（2026-10-07，本地 QA 候选）

Owner要求尝试接入C区后，北斗星同一受管私密只读入口已提供四产品菜单、PDF Screen
切换、返回卷面与完整卷名下载：大字完整版12页、大字无听力版10页、省纸版8页、
新增纯答案样稿5页。原三份PDF没有重新生成或覆盖；仍绑定原C R6
`rev-82429d6c-8c5c-42fe-b780-31829422c7ac`。卷名沿用已确认的
“2025年12月浙江省北斗星盟首考适应卷英语试卷”，不应用新卷自动取名规则追溯改写。

源参考只在`.scratch/c-four-products/`捕获，使用C自己的compiler，重建Source
`sha256:8171a7b35d57ddb12cb723522a85d00b97a875bacc335d614e7c9e0f24c882ce`与Candidate
`sha256:f845762e14b551f98e60e3ca2f998253836e1fa3851e1ba42262899ee60980bb`，issues为空。
不能用旧产品checkout compiler处理C的应用文漫画后丢弃其prompt错误或替换Candidate。
答案DOCX原生段落与原答案PDF的正文／评分表边界已读取核对：两篇应用文各保留标题及
三正文段；续写沿源保留一个共享第一段和两个第二段备选，不复制第一段造两篇全文。
源实际有`Paragraph 1`标记，新增`label`角色仅保留该标记，不凭空为别卷添加。
评分原则与档次全部捕获，样稿默认不打印；不读取AI范文或逐题详解。

独立答案侧车SHA256为`8d951c4d72ec11210848429b9c45ec6304a317c1e75638bd8c71d2baf3fd978e`；
`.scratch/c-four-products/answer-reference-v2/report.json`记录65答案、12范围、语法五栏、
12个源参考段落（含标题与源标记）、10段录音稿，18pt卷名／20pt科目／12pt正文、
8pt标题间隔及A4既定边距。PDF SHA256为
`9fb58a5017fd62ccb02d24ac669ca4aba4c40365ef19cddf63138a6c97586446`，自然5页；
`reviewRevision`与`publication`为null，不是原R6已审答案补件或新revision。

实际交接证据：

- 真实浏览器四次下载，逐文件SHA256及`pdfinfo`页数4/4匹配；原三题卷SHA保持
  `60e91fad…`／`f95886ae…`／`60811f81…`。四份完整卷名文件在本线程root
  `.amp/in/artifacts/c-four-products/downloads/`，不需要重新生成。
- 新答案五页contact已逐页查看，无裁切或叠字；长范文与录音稿自然跨页，不为五页删尾。
- 四款原生PDF均实际加载并截图查看，页数分别12／10／8／5；桌面及390px Chromium
  窄视口菜单／viewer横向溢出为0，四项及页数可见。答案适页按钮实点后显示62%，
  完整第一页及页脚可见；页码输入尝试的截图仍为1/5，未声称翻页通过。窄视口非触屏实机。
- 09:18:01 UTC新p25519 `/preview-products/` 跨orbHTTP门禁30/30、exit0：四HTML/PDF
  匿名／未登录伪造头HEAD共16项实际302登录拦截；合法短期Owner四HTML GET及四PDF
  HEAD200、private,no-store、PDF inline；teacher及foreign query403，largeComplete
  HTML/PDF POST405。foreign query不能区分逐卷校验和全query拒绝，POST仅采样该款。
  不用HEAD证明PDF字节或源忠实，不复跑旧消费矩阵，无新审核／发布证明。

保留失败：初稿菜单右溢桌面94px／窄视口111px，仅C局部右对齐后复查0；原生viewer
首捕是尚未加载的空壳，等待实际加载后重捕；native frame DOM定位失败不作为交互证明。
受管服务重启瞬间一次导航连接拒绝，核实仍监听显式PORT18949后完成新导航与检查，
不把CLI重启输出的随机port当作实际listener。旧产品compiler的C漫画失败未用于出样。
正式套件／Full／E2E未运行；没有新revision、批准、发布、提交、push或部署。年月规则
已记录但月份全链路未实施，真实发布／持久化／混编等上一阶段验收仍待完成。

## B/C源题头校正及单行PDF候选交接（2026-10-07）

从题卷DOCX原生段落及原题卷PDF核对正式名称；不从答案册或文件名取名：

| 项目索引 | 精确来源卷名 | PDF卷名字号 | 四产品页数（完整／无听力／省纸／答案） |
| --- | --- | --- | --- |
| B皖南 | 2026届“皖南八校”高三第二次大联考 | 18pt | 11／9／8／5 |
| B县域 | 2025-2026学年第一学期浙江省县域教研联盟高三年级模拟考试 | 17pt | 12／10／8／4 |
| C北斗星 | 高三年级英语学科试题 | 18pt | 12／10／8／5 |

县域源题头的学年属于名称，独立“英语试题”和“2025年12月”不拼入卷名；C原题卷
确实没有北斗星或年月前缀，不能根据项目索引补造。考试年月仍取Owner输入，不能
把这些校正后的名称当成已实现时间索引。Screen、viewer与下载文件名统一复用源名称。

候选及重放脚本位于产品checkout `.scratch/source-title-qa/`，最终目录为`wn8`、
`county-single-line`与`beidouxing`；各`manifest.json`保留源题头DOCX SHA／段落位置、
原PDF SHA、新PDF SHA及null revision/publication。现存来源快照49个文件
（11／21／17）和12份旧PDF逐文件复核不变；WN使用已保留的精确R20端点，不伪造
缺失历史输入。新题卷只校正卷名并复用原布局及分页计划；答案沿原输入重放字体、
正文、65答案、源参考段落与10段录音稿，实际分页DOM内容核对一致。

本轮预览检查（非正式verify套件）：

- 浏览器逐份真实下载12/12，`sha256sum`与manifest、`pdfinfo`页数均匹配；完整源名
  下载件位于本线程root `.amp/in/artifacts/source-title/downloads/`。
- 加载字体后的12份分页HTML均实测单行36px行盒、科目26.6667px、间隔10.65625px
  （分别为27pt／20pt／8pt的布局舍入）；县域文字宽619.265625px、小于643px版心。
- 12份原生PDF实际加载，题头裁片逐份查看；三卷Screen展开四菜单并实际进入viewer，
  全名及四项页数正确，桌面外层溢出为0。县域390px的完整版及答案viewer亦为0，
  网页标题可响应式换行，但PDF纸面卷名仍单行；不是触屏实机验收。
- `impeccable detect`仅扫描本轮四个脚本，0 anti-patterns，保留C旧横幅两项颜色advisory；
  不为这次题头任务改横幅。截图在root `.amp/in/artifacts/source-title/screenshots/`。

私密受管服务仍使用既有p25065／p22335／p25519及`/preview-products/`四款路径；
没有改门禁逻辑。本轮不复跑旧跨orbHTTP矩阵，也不把旧HEAD或旧PDF哈希当作新字节证明。
新下载与视觉证据不代表Source忠实复验、新Review或发布。保留初版县域双行导致页数变化
的失败产物、WN旧renderer缺卷名断言、iframe选择器漏`#view`而超时的检查失败；
修正选择器后12份检查通过。最终县域回到原分页计划，未再次规划。

当前交付仍是未提交本地候选，单行算法的通用接线与正式数值确认尚未完成；
原待审R20/R6、批准／发布状态及旧字节未被覆盖。未Ship／Full／E2E／生产修改。
