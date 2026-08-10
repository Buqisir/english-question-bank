# 美音修复归档（2026-08-09）

这是万唯一轮 1600 词美音资产的可恢复归档。正式 voice/version ID 仍沿用历史值 `eqb-british-teacher-v1`，本轮不做跨系统重命名。

- `before/`：70 个问题词在修复前的正式 MP3，原字节完整保留。
- `approved-sources/`：Owner 实际听选的候选原文件；`create` 最终选择 `VC轻`。
- `formal-after/`：70 个已写入正式 1600 词资产的最终文件。只对候选头尾静音做边界归一化，字音与重音来源不变。
- `evidence/`：原 Owner 决策、`create` 对比清单和用于 `VC轻` 的 Z 字音来源。
- `decision-ledger.json`：每个选择、哈希和生成关系的机器可读记录。

`.scratch/vocabulary-audio-*`、Qwen 模型、OpenVoice 模型和虚拟环境均继续保留，没有清理或删除。
