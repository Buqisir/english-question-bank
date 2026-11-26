# 獭獭词典增量更新

同一天新送审的卷合成一批。词典更新失败时，送审照常进行。

## 1. 生成题包

```sh
tool=scripts/paper-dictionary/dict-update/index.mjs
work=$(mktemp -d)
node "$tool" prepare --work "$work" --paper paper-… --paper paper-…
```

`prepare` 只写工作目录。`--paper` 可重复，涵盖新增、修订及撤回的卷。省略时使用生产目录和已有分片。生产只读口令取自 `~/.config/eqbank/agent-token`。`scope.json` 的 `exclude` 排除旧批次高二卷，`include` 可显式恢复。`--local <Canonical 包目录>` 可重复，读取其中的 `paper-asset.json`。

首次接入的归档目录默认为 `~/Projects/otter-dict-work`，可用 `--legacy` 覆盖。旧分片现存块哈希全部出现在目标卷时，才用 `occurrences.ndjson.gz` 和 `phrases/hits.ndjson` 归档。来源对不上的卷列在 `skipped`，原分片保留。

## 2. 判题并应用

派 Light 判 `packets/mock/*.json`，Medium 判 `packets/gaokao/*.json`。每包只判断 `【】` 内的目标词或短语。短语隔开的固定成分按选中范围读取。将每个题包的答案按原顺序写入对应的 `out/<tier>/<同名>.ndjson`，每题一行 `{"idx":0,"pick":"w:address#s2"}`。各义项都不适用填 `NONE`，上下文不足填 `UNSURE`。

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
