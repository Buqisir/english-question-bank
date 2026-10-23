# 导卷规则回放闸门（BUB-85，第 1 步）

不改变生产解析规则。仅使用 JSON；不会调用完整 compile、加载 PDF/图片、
生成 evidence、OCR/Ovis、浏览器或网络。固定 `jobs=1`，每卷每通道、每个版本
各开一个子进程，`fail → process.exit(1)` 不会中断其他卷的报告。

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
node scripts/import-pipeline/replay/corpus.mjs /absolute/source-worktree
node scripts/import-pipeline/replay/runner.mjs \
  --corpus /Users/your-name/Projects/eqb-replay-corpus/<digest> \
  --expect-corpus-digest <digest> \
  --baseline <new-baseline-ref> --candidate <git-ref> \
  --jobs 1 --report .scratch/replay-report.json
node --test --test-concurrency=1 scripts/import-pipeline/replay/replay.test.mjs
```

冻结器扫描 `scripts/import-pipeline/papers/paper-*`，R 使用
`materialization/{nck1-source-materialization-v1,nck1-ocr-source-evidence-v1,nck1-ocr-source-confirmation-v1}.json`；
T 使用 `universal-source-manifest.json` 及 `imports/ocr-proofread/<paperId>/trace.json`、
trace 中全部逐页 drafts。清单逐文件记录输入类型、绝对原路径、字节数、SHA-256
或缺失原因。只复制 JSON，按内容摘要去重，文件/目录改为只读。
清单本身的稳定 JSON 摘要即 corpus digest；回放前后均校验全部冻结字节。
原工作树后续变化不会改变冻结语料，需生成新 digest 才能采用新输入。
自校验只能证明清单与文件相符，不能证明调用者选中了哪一份语料。调用方必须在
任务/命令中锁定 digest，并传 `--expect-corpus-digest`；不匹配时在执行回放前失败。

`--baseline` 和 `--candidate` 均解析成完整 commit SHA。通过 `git show`
导出对应版本的静态相对模块依赖闭包到本工作树 `.scratch/`，不复制仓库资产、不安装依赖。
仅在导出的入口末尾附加已有 `pageLines` / `expand` 的 export。
不会改写生产规则函数体。静态闭包不覆盖动态 import 或模块运行时读取的 JSON 资源：
检测到 `import(`（允许空白）就 fail closed；新增运行时 JSON 资源须先显式支持、
冻结和校验，不能凭静态闭包声称已覆盖。外部依赖或不支持的模块类型也会失败。
`--repo` 可指定 ref 所在仓库。诊断注入可用 `--candidate-worktree <absolute-path>`：
要求该工作树 HEAD 与 candidate ref 一致，读取其模块闭包，报告每个模块字节摘要及
整体 moduleDigest，明确表示有工作树覆盖；不会把脏代码冒充提交内容。

R 调用原版本 `buildSourceReferences`，完整比较 groups/review 的全部字段和数组顺序，
包括 taskType、captured/not_supplied、entry/paragraph ID、标签、角色、逐字文本、
所有 source locator/SHA/continuationSources 和 review 增删。
T 直接调用与生产 compile 共用的纯生成器 `buildTranscriptJoinDocuments`。
文档筛选、trace 页顺序、角色判断、`inTranscript` 初始化与跨页生命周期和 join
都由该生产入口决定；worker 只投影入口结果，记录全部输出 item 字段、
lines/words、源 item 下标、实际词归属/observation ID、合并次数、页级前后状态及
每次状态赋值。未经过听力拼接的非答案文档也记录输出，以证明角色与页序不漂移。
它是编译前拼接回放，不检查完整 compile 的图片、词闭包、evidence 或文件写入。
**后续重构必须以包含该生产入口的本次修复提交作为新 baseline。**
例如 `50d46913` 不支持 T 通道，runner 会明确报「baseline 不支持该通道 T」，
不会静默回退到旧镜像适配器。旧提交与新入口的等价性另做一次性迁移证明，
不能将这个迁移方法变成日常 runner 的降级路径。

每个记录是 PASS / EXPECTED / UNEXPECTED / ERROR / MISSING。
MISSING 是冻结清单声明的覆盖缺口，绝不计入 PASS；任何可回放卷失败、
覆盖减少、输入改变、未声明差异、未发生的声明均使退出码非零。
报告包括源定位、精确字段前后值和文字最小片段、耗时及 RSS 峰值。
`deterministicDigest` 排除耗时/RSS；同一语料和相同代码连跑应一致。
`metrics` 同时保留 runner 与子进程最大 RSS（非所有进程内存之和）。
每次子进程调用使用独立递增编号的输出文件；输出必须由本次调用产出，且包含
paperId、channel、ref、version、callId。runner 逐项匹配身份，缺文件或身份不符记
ERROR，不能读取上一卷产物；失败调用不计入执行覆盖，覆盖不足时整体失败。

## 预期变化声明

行为修复必须传 `--expected /absolute/expected.json`，纯重构不传。
没有 accept-all、通配符、自动更新基线或只按字段名忽略差异的模式。
每条声明仅对应一个卷、一个通道和一个精确 JSON Pointer：

```json
{
  "schemaVersion": "eqb-replay-expectations-v1",
  "changes": [
    {
      "paperId": "paper-mock-example",
      "channel": "R",
      "path": "/groups/0/essays/entries/0/paragraphs/0/text",
      "target": { "groupId": "writing-application" },
      "before": { "present": true, "value": "Old exact text." },
      "after": { "present": true, "value": "New exact text." },
      "reason": "源页第 2 页该 item 的确认文字应保留标点。"
    }
  ]
}
```

`target` 匹配差异祖先的 groupId / itemId / documentId / page /
sourceItemIndexes 等上下文，必须至少指定 group、item、document 之一。
通道总计等无源 item 的字段显式用 `{ "scope": "channel" }`。
T 的 `sourceItemIndexes` 为原逐页 draft 的 **0 起始**下标。
新增/删除一侧写 `{ "present": false }`。长文字可将任一侧替换为
`{ "sha256": "<摘要>" }`，摘要对象是完整的 `{present,value}` 或 `{present:false}`
经递归键排序的紧凑 JSON（`corpus.mjs` 的 `digest`），不是单独文本。
前后值、卷、路径、目标任一不匹配则仍为 UNEXPECTED；声明未用到也失败。
报告中的字节文本只用于本地审查，不应上传到公共平台。
