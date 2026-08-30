# 08 — Universal listening audio 的 opaque evidence closure

- Status: planned
- Blocked by: None
- Next on PASS: None

- Spec: `docs/cuts/import-format-capabilities/spec.md`
- Matrix rows: C05, C06

## Outcome

Universal source manifest可接收一个原始 listening audio artifact，Materialization adapter把它
闭合到现有 inactive listening `captured_uninterpreted` evidence。该能力只证明“收到的音频
字节未丢失且属于这次 source set”，不启用播放、不把音频引用写入 Question，也不从音频
推导题意、答案、transcript 或 timing。

## Input and fixture

- 代码生成 1 秒、单声道 synthetic WAV tone，并固定 media type、byte length和digest。
- 复用现有最短 listening questions/answers/transcript fixture，不提交真实音频或长文本。
- 负例：manifest声明但artifact缺失、digest或media type变化、两个audio artifacts、Question
  带active `audioRef`、inventory漏列收到的audio。

## Public seam

- 扩 `universal-nck1 init --source` 的受限 role/media detection，使一个 `audio_source` 可写入
  manifest的独立 `artifacts` inventory；继续由单 writer、digest和byte length保护。不得把
  audio塞进现有 question/answer PDF/DOCX `documents` enum冒充分页文档。
- 扩现有 NCK1 Materialization `listening` source of truth，增加一个引用 exact manifest
  artifact的 opaque audio evidence；字段只含 disposition、artifactId、mediaType、byteLength
  和digest。adapter把这一份 evidence投影进两个 existing inactive closures，不创建平行
  listening inventory或第二套音频语义模型。
- 与 `shared/paper-canonical/listeningInactive.mjs#validateInventory` 的
  `captured_uninterpreted` 条件保持同一不变量：唯一 `audio_source`、mediaType/length/digest
  一致、artifact inventory complete。Canonical只保留 inactive artifactRef/digest。
- `/ops/` 可显示文件名、media type、byte length和digest摘要并下载原始 artifact；本票不加
  player、waveform或自动听写。

## Fail closed

复用 `LISTENING_AUDIO_EVIDENCE_INCOMPLETE`, `LISTENING_ARTIFACT_INVENTORY_OPEN`,
`LISTENING_ACTIVE_OR_AUDIO_REFERENCE_UNSUPPORTED`；Universal ingress另加
`NCK1_AUDIO_SOURCE_SET_AMBIGUOUS` 与 `NCK1_AUDIO_MEDIA_TYPE_UNSUPPORTED`。缺失、重复、digest
不符或未闭合 inventory 都不得降级成 `not_supplied`。

## Acceptance criteria

- [ ] public init/materialize保存一份 synthetic tone的原字节、media type、length和digest。
- [ ] inactive closure投影为 `captured_uninterpreted`，无 active Group/Question audio ref。
- [ ] 缺失、篡改、重复、未列入 inventory与active ref负例分别 fail closed。
- [ ] Screen/Print/PDF继续不呈现听力 audio；非听力与 listening text regression不变。
- [ ] `/ops/` 能核对artifact metadata；认可 revision仍不等于允许播放或解释音频。

## Non-goals

播放器、音频切段、waveform、语音识别、speaker/题号join、从音频生成transcript/答案、
音频转码、版权音频fixture、发布真实试卷。

## Verification

```bash
node scripts/verify-paper-canonical-listening-inactive-closure.mjs
node scripts/verify-nck1-source-materialization.mjs
node scripts/verify-universal-nck1-listening-audio.mjs
node import-ops/verify.mjs
pnpm -C app verify:paper
pnpm -C app verify:all
```

final只用synthetic tone完成闭合 proof；若以后用真实音频做只读 smoke test，必须另获来源与
权限确认，且不得提交或发布。
