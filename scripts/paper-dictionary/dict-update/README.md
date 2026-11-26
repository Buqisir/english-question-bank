# 獭獭词典增量更新

同一天新送审的卷合成一批。词典更新失败时，送审照常进行。

## 1. 生成题包

```sh
tool=scripts/paper-dictionary/dict-update/index.mjs
work=$(mktemp -d)
node "$tool" prepare --work "$work" --paper paper-… --paper paper-…
```

`prepare` 只写工作目录。`--paper` 可重复，涵盖新增、修订及撤回的卷。省略时使用生产目录和已有分片。生产只读口令取自 `~/.config/eqbank/agent-token`。`scope.json` 的 `exclude` 排除旧批次高二卷，`include` 可显式恢复。`--local <Canonical 包目录>` 可重复，读取其中的 `paper-asset.json`。

首次归档以当前目标 revision 和原文哈希为基线，沿用词条、词形和锚点相符的旧标注（短语还须匹配块哈希）。首批题包只含旧标注疑点，其余新命中计数并留作未标。后续随卷面变化按基线原句保留或重算。归档目录默认为 `~/Projects/otter-dict-work`，可用 `--legacy` 覆盖。归档计数不完整的卷列在 `skipped`，原分片保留。

## 2. 判题并应用

派 Light 判 `packets/mock/*.json`，Medium 判 `packets/gaokao/*.json`。真题和短语全判，模拟每词每卷最多 2 处，优先不同句子。只判断 `【】` 内的目标词或短语。答案写入 `out/<tier>/<同名>.ndjson`，每题一行 `{"idx":0,"pick":"w:address#s2"}`。各义项都不适用填 `NONE`，上下文不足填 `UNSURE`。允许部分回填，未答和预算外的词计入总数，留作未标。

用新工作目录执行 `prepare --entry w:address --work "$work"` 可重判同版卷里此词的 `NONE`、`UNSURE` 和未标命中。已确认的命中保持原样。重判短语使用已经计入总数的未分义命中。

每日补判可用 `prepare --pending --work "$work" --paper paper-…`，从当前版本已计数的未标命中出题，沿用模拟每词每卷最多 2 处及短语全判的规则。

Medium 确认 `NONE` 的用例足够明确时，可在这题答案附新义，如 `{"idx":0,"pick":"NONE","newSense":{"pos":"v.","glossZh":"登记住址"}}`。可附 `note` 和已有的 `pronunciationId`。永久 ID、编辑定义写入 `otter-data/editorial-senses.json`，应用时同时更新词条。已应用的 `NONE` 可用定向重判回填。

```sh
node "$tool" apply --work "$work"
```

`apply` 复核目标 revision、状态和范围，变动卷列在 `deferred`。生产尚未提供 `view=dictionary` 时只可 dry-run。`new-senses.ndjson` 交 Medium 复核待补新义。中断时用同一工作目录重跑，后续批次使用新目录。

## 3. 检查并提交当天一批

```sh
node "$tool" check --work "$work"
git diff --check
```

一起提交 `server/paper-dictionary/otter-data/` 下变动的词条、分片及 `update/`。工作目录内的卷文本和题包留在本地。
