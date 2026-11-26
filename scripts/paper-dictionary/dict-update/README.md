# 獭獭词典增量更新

同一天新送审的卷合成一批。词典更新失败时，送审照常进行。

## 1. 生成题包

```sh
tool=scripts/paper-dictionary/dict-update/index.mjs
work=$(mktemp -d)
node "$tool" prepare --work "$work" --paper paper-… --paper paper-…
```

`prepare` 只写工作目录。`--paper` 可重复，涵盖新增、修订及撤回的卷。省略它会对照生产全部真题和模拟卷，包含待审卷。生产只读口令取自 `~/.config/eqbank/agent-token`。已建增量状态的待审卷按 revision 跳过，无 revision 的卷逐块比对。卷目录也可重复传 `--local <包含 paper-asset.json 的 Canonical 包目录>`，只处理这些卷。

首次处理旧分片时，额外指定 `--legacy-corpus <原始卷导出.ndjson> --legacy-hits <原始 occurrences.ndjson.gz>`。旧分片只有已归义命中，原始归档用于恢复旧块哈希和全部词频。增量状态随数据提交，此后该卷无需再读原始归档。

## 2. 判题并应用

派 Light 判 `packets/mock/*.json`，Medium 判 `packets/gaokao/*.json`。每包只判断 `【】` 内的目标词或短语。短语隔开的固定成分按选中范围读取。将每个题包的答案按原顺序写入对应的 `out/<tier>/<同名>.ndjson`，每题一行 `{"idx":0,"pick":"w:address#s2"}`。各义项都不适用填 `NONE`，上下文不足填 `UNSURE`。

```sh
node "$tool" apply --work "$work"
```

`apply` 写词条、命中分片和按卷增量状态。`new-senses.ndjson` 交 Medium 复核待补新义。一次 `apply` 中断时，在同一工作目录重跑。后续批次使用新目录。

## 3. 检查并提交当天一批

```sh
node "$tool" check --work "$work"
git diff --check
```

一起提交 `server/paper-dictionary/otter-data/` 下变动的词条、分片及 `update/`。工作目录内的卷文本和题包留在本地。
