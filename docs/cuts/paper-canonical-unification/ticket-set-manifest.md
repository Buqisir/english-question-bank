# Paper canonical unification measured replacement ticket-set manifest

Status: published; owner manifest-digest approval pending
Source phase: Ticket 23 post-approval measured-replan publication
Source HEAD: `7aeb5a963eff14e103c1645a600d72d8705ef53e`
Approved proposal task: `019fbdec-6f5a-7381-a0b7-53beb390b387`
Owner approval: “批准 Ticket 23 measured replan 的逐票粒度，按 Tickets 24–53、总票数 53 发布。”
Accepted spec: `docs/cuts/paper-canonical-unification/spec.md`
Accepted spec SHA-256: `c6cbbe778d94e1205612fa5ac535e2198020317b09064190fec1d0b6660d868b`
Bound Wayfinder map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`
Preserved completed ticket count through Ticket 23: 23
New unfinished-route ticket count: 30
Current total ticket count: 53
Unique initial implementation frontier after all four gates pass: Ticket 24
Implementation dispatch: forbidden
Coordinator dispatch: forbidden

## Binding

This manifest publishes exactly the owner-approved Tickets 24–53 measured
replan. The approval binds each Title, Blocked by edge, What it delivers
statement, diagnostic-cluster membership, migration-cohort membership,
old-ticket mapping, capacity/fail-closed rule, and proposed total count of 53.

The owner approved ticket granularity only. The owner has not approved this
manifest's exact SHA-256. Every current manifest byte change invalidates a later
digest approval. Ticket 24 remains blocked until this publication is committed,
the owner separately approves the exact committed manifest SHA-256, and all
four implementation gates verify. This publication does not begin Ticket 24.

Tickets 01–23 remain the accepted route and completed results already recorded.
Tickets 24–53 are the sole follow-on route. The former Tickets 16–71 under
`docs/cuts/paper-canonical-unification/history/2026-07-26-superseded-ticket-set/`
remain historical evidence only and never become parallel dispatch authority.

## Capacity and fail-closed rule

- Pilot is 1 paper / 88 units.
- Diagnostic clusters are capped at 328 units and 5 papers.
- Migration canaries contain 1 paper each.
- Migration cohorts are capped at 328 units and 5 papers.
- Every ticket reserves implementation, ordinary Standards/Spec review, and
  fix room within about 150K context. If new diagnostics increase risk or
  change the approved shape, that ticket fails closed and does not absorb
  additional scope.
- Any correction may only add an immutable Source Capture or an explicit review
  decision. Historical source, answer, and Publication bytes are never edited
  in place.

## Approved route

| # | Title | Blocked by | What it delivers | Superseded old-ticket mapping |
|---:|---|---|---|---|
| 24 | Costed immutable-source-adapter pilot — `paper-2026-i` | Ticket 23 approved publication and exact manifest-digest approval | 对最高成本、12 documents、88 units、risk 17 的 paper 建立注册不可变 source envelope；零写编译并实测新 diagnostics、family、成本和风险；不迁移 | Old 21–50 pilot |
| 25 | Source-adapter recovery cluster A | 24 | 4 papers / 267 units；按 compiler diagnostics 新增 capture/review decisions，使其可确定性重编译 | Old 21–50 |
| 26 | Source-adapter recovery cluster B | 25 | 4 papers / 266 units；同上 | Old 21–50 |
| 27 | Source-adapter recovery cluster C | 26 | 5 papers / 328 units；同上 | Old 21–50 |
| 28 | Source-adapter recovery cluster D | 27 | 5 papers / 328 units；同上 | Old 21–50 |
| 29 | Source-adapter recovery cluster E | 28 | 5 papers / 327 units；同上 | Old 21–50 |
| 30 | Source-adapter recovery cluster F | 29 | 5 papers / 327 units；同上 | Old 21–50 |
| 31 | Source-adapter recovery cluster G | 30 | 4 papers / 267 units；同上 | Old 21–50 |
| 32 | Full-corpus diagnostic and source-closure gate | 31 | 重跑 33-paper zero-write compiler；要求 33/33 source、official answer、Profile、inactive closure 有来源证明，所有 migration candidates ready；完整 accounting；随后独立评审 | Old 21–50 closure |
| 33 | Boundary canary 1 — local/outlier package | Ticket 32 independent review PASS | 原子迁移 `paper-960d0f8d`（69 units），exact reload、Screen/Print/PDF、retry/rollback | Old 51–54 |
| 34 | Boundary canary 2 — national II | 33 | 原子迁移 `paper-2025-ii`（68 units），同样闭合 public seams 与 rollback | Old 51–54 |
| 35 | Boundary canary 3 — seven-document low-cost shape | 34 | 原子迁移 `paper-2023-yi`（62 units） | Old 51–54 |
| 36 | Boundary canary 4 — Zhejiang dual-session shape | 35 | 原子迁移 `paper-zj-2022-jun`（66 units）；四 canary 汇总后独立评审 | Old 51–54 |
| 37 | Measured migration cohort A | Ticket 36 independent review PASS | 5 papers / 328 units；逐纸 atomic publish、reload、Screen/Print/PDF、retry/rollback | Old 55–62 |
| 38 | Measured migration cohort B | 37 | 5 papers / 328 units；同上 | Old 55–62 |
| 39 | Measured migration cohort C | 38 | 5 papers / 328 units；同上 | Old 55–62 |
| 40 | Measured migration cohort D | 39 | 5 papers / 328 units；同上 | Old 55–62 |
| 41 | Measured migration cohort E | 40 | 4 papers / 267 units；同上 | Old 55–62 |
| 42 | Measured migration cohort F | 41 | 4 papers / 266 units；完成剩余 28-paper migration | Old 55–62 |
| 43 | Full-corpus semantic, accounting, recovery and rollback closure | 42 | 33 papers / 273 Groups / 1,530 objective Questions / 1,035 A–D sets 全闭合；无漏纸、重复 current、孤立 publication/journal；恢复与 rollback 可重演 | Old 63–64 |
| 44 | Full-corpus Screen artifact closure | 43 | 汇总并验证 cohort 产生的 33-paper plain/lecture Screen 语义、答案可见性和 family coverage；不以 renderer 自报值自证 | Old 63–64 Screen |
| 45 | Full-corpus Print/PDF artifact closure | 44 | 汇总并验证 Student/Teacher Print HTML 与 direct Chromium PDF；A4、语义、答案边界、分页和 rollback artifact proof；随后独立评审 | Old 63–64 Print/PDF |
| 46 | Retire Cloze legacy path | Ticket 45 independent review PASS | 先证明 canonical-only public behavior，再删除 Cloze legacy selection/fallback；保留 rollback 证据 | Old 65 |
| 47 | Retire Grammar Fill legacy path | 46 | 同样顺序退休 Grammar Fill | Old 66 |
| 48 | Retire Seven Choices legacy path | 47 | 同样顺序退休 Seven Choices | Old 67 |
| 49 | Retire Reading legacy path | 48 | 同样顺序退休 Reading | Old 68 |
| 50 | Retire Application Writing legacy path | 49 | 同样顺序退休 Application Writing | Old 69 |
| 51 | Retire Continuation Writing legacy path | 50 | 最后退休 Continuation Writing；证明六 family 无 fallback/legacy selection；随后独立评审 | Old 70 |
| 52 | Post-retirement Owner QA | Ticket 51 independent review PASS | 从 exact reviewed HEAD provision 并打开完整可点击状态；真实检查 Screen、Student/Teacher Print/PDF、family transitions 与 legacy absence；停在 owner verdict | Old 63–70 cross-cut Owner QA |
| 53 | Repository-only release closeout | Ticket 52 Owner QA PASS | 完整 suite/CI、release receipts、≤5 行 STATUS 更新和仓库 closeout；明确排除 production deploy、DB/config mutation、R2 sync/backfill | Old 71 |

## Diagnostic cluster membership

- A, 267 units: `paper-960d0f8d`, `paper-2022-ii`,
  `paper-zj-2020-jul`, `paper-zj-2021-jun`
- B, 266 units: `paper-2022-i`, `paper-zj-2025-jan`,
  `paper-zj-2021-jan`, `paper-2020-jia`
- C, 328 units: `paper-2023-ii`, `paper-zj-2026-jan`,
  `paper-zj-2022-jan`, `paper-2020-bing`, `paper-2023-jia`
- D, 328 units: `paper-2024-ii`, `paper-2020-i`, `paper-2023-i`,
  `paper-2021-yi`, `paper-2024-jia`
- E, 327 units: `paper-2025-ii`, `paper-2020-ii`, `paper-2024-i`,
  `paper-2022-jia`, `paper-2021-jia`
- F, 327 units: `paper-zj-2023-jan`, `paper-2021-i`, `paper-2025-i`,
  `paper-2022-yi`, `paper-2023-yi`
- G, 267 units: `paper-zj-2024-jan`, `paper-2021-ii`,
  `paper-zj-2020-jan`, `paper-zj-2022-jun`

## Remaining migration cohort membership

- A, 328 units: `paper-2022-i`, `paper-zj-2026-jan`,
  `paper-zj-2021-jan`, `paper-2020-jia`, `paper-2021-jia`
- B, 328 units: `paper-2023-ii`, `paper-2020-i`, `paper-2023-i`,
  `paper-2020-bing`, `paper-2022-yi`
- C, 328 units: `paper-2024-ii`, `paper-2020-ii`, `paper-2024-i`,
  `paper-2021-yi`, `paper-2023-jia`
- D, 328 units: `paper-zj-2023-jan`, `paper-2021-i`,
  `paper-2025-i`, `paper-2022-jia`, `paper-2024-jia`
- E, 267 units: `paper-zj-2024-jan`, `paper-2021-ii`,
  `paper-zj-2020-jan`, `paper-zj-2022-jan`
- F, 266 units: `paper-zj-2025-jan`, `paper-2022-ii`,
  `paper-zj-2020-jul`, `paper-zj-2021-jun`

## Superseded-ticket mapping

- Old Tickets 21–50: costed pilot plus measured diagnostic clusters, ending
  in full-corpus diagnostic and source closure.
- Old Tickets 51–54: four measured boundary canaries.
- Old Tickets 55–62: six measured migration cohorts.
- Old Tickets 63–64: full-corpus semantic/accounting/recovery/rollback,
  Screen, and Print/PDF closure.
- Old Tickets 65–70: ordered Cloze, Grammar Fill, Seven Choices, Reading,
  Application Writing, and Continuation Writing legacy retirement.
- Old Ticket 71: repository-only release closeout; production deployment,
  database/config mutation, R2 synchronization, and production backfill remain
  excluded.

## Ticket publication SHA-256

| Ticket | SHA-256 |
| --- | --- |
| `docs/cuts/paper-canonical-unification/tickets/01-canonical-foundation.md` | `9e70c9e90fb4459dbc87b8d93181a15647aa3bb592c7a5388fe1710e56ae45e7` |
| `docs/cuts/paper-canonical-unification/tickets/02-route-authority-repair.md` | `04ce4fb192fee857f7170151283f83c63f0e650a70c189996ea0af608b55c19d` |
| `docs/cuts/paper-canonical-unification/tickets/03-cloze-grammar-canonical-publication.md` | `925ecfe91390903af0d9eedd497d8d01152a0deecfd8d8d0dacc5906d5a7b0d4` |
| `docs/cuts/paper-canonical-unification/tickets/04-shared-abcd-rendered-placement.md` | `16b5129c84e832337c4e2df5f3a39f8ec891846416aff7b94cc0141f89f67322` |
| `docs/cuts/paper-canonical-unification/tickets/05-cloze-grammar-canonical-consumption.md` | `55801572beb9f786da19d21e063a550a4a196fe9784dcc1190d67dc5b03819c5` |
| `docs/cuts/paper-canonical-unification/tickets/06-seven-choices-canonical-publication.md` | `a5dc27b0b2d06b0472b1aa0191c888226dc570d933130051c1a4e88d114749de` |
| `docs/cuts/paper-canonical-unification/tickets/07-seven-choices-rendered-behavior.md` | `c12880f871fc058ffa84aebcebae7ebf83445c2e9cd38733e5e98911ec46cc0f` |
| `docs/cuts/paper-canonical-unification/tickets/08-reading-canonical-publication.md` | `c116559d1a32a7e0f945734a8e28c853e178318c562af399818a508370b8bbf6` |
| `docs/cuts/paper-canonical-unification/tickets/09-reading-rendered-behavior.md` | `859f32b784a20e9fa14b3bc29f9ddc84ca4786a0fb402a933a1bfc57b02d0d9d` |
| `docs/cuts/paper-canonical-unification/tickets/10-application-writing-canonical-publication.md` | `1a6fa5adce51f15c8f68ad8c390531837f13877d5efec180ca7311cb07c7e833` |
| `docs/cuts/paper-canonical-unification/tickets/11-application-writing-rendered-behavior.md` | `284f12dd3a4eb511d5894be4d74ae3ab017edd4e4d0e5871c400f8a5e2e3db2d` |
| `docs/cuts/paper-canonical-unification/tickets/12-continuation-writing-canonical-publication.md` | `e2d28a7af7853e6d6af71a9725b44f7bbfce11e88480ba79906abdb530991abf` |
| `docs/cuts/paper-canonical-unification/tickets/13-continuation-writing-rendered-behavior.md` | `a8ceabbe8b0ceae7acdc4ca1b933ae3f4b71e999faf6e4146553c5af01578406` |
| `docs/cuts/paper-canonical-unification/tickets/14-listening-inactive-canonical-closure.md` | `d5836012a1b129319cbd4b0c75b3ee758401a0c9f5e1bb5b5fd9d4abfe7b177f` |
| `docs/cuts/paper-canonical-unification/tickets/15-listening-zero-occurrence-proof.md` | `e935b4dc172c92f9aa6458e70c60e65e5553a2d744d5ec09c63abd804b313439` |

## Approved replacement route

| Ticket | SHA-256 |
| --- | --- |
| `docs/cuts/paper-canonical-unification/tickets/16-disconnect-generated-docx-capability.md` | `e41d9e335c066d22dae99ace1816c5e1b611e49eb8597db9704a0c9ef93b76e0` |
| `docs/cuts/paper-canonical-unification/tickets/17-delete-docx-output-implementation.md` | `92614ac355c1cf19de25575828944fd8795a950ca16d2ac3f09255221c7cd2bf` |
| `docs/cuts/paper-canonical-unification/tickets/18-atomic-canonical-import-admission.md` | `d482db1d5dca39eecca9bc8bd95bc0fc42a77cd5fa3cd60255989148d017dfc0` |
| `docs/cuts/paper-canonical-unification/tickets/19-import-recovery-retry-rollback.md` | `6abdf76b554ad8f11c7394a66f1143f45418639a04530ba6533cb6822f1655aa` |
| `docs/cuts/paper-canonical-unification/tickets/20-backend-canonical-import-pilot.md` | `b1eb6b765f81806507d2a44e77cd1db3c5c41a77b6302e554c4d3df8a9f831f8` |
| `docs/cuts/paper-canonical-unification/tickets/21-freeze-corpus-migration-ledger.md` | `1f25438f9e9a4fb7cf86755b99251310a5e56741bab767635fe74da8b08847c9` |
| `docs/cuts/paper-canonical-unification/tickets/22-full-corpus-zero-write-dry-run.md` | `0c3dff2f039e8f2af6e9237367bfd244c6e3d9a3973be7290853d7194744dca2` |
| `docs/cuts/paper-canonical-unification/tickets/23-hard-measured-migration-replan.md` | `6a88ee82808be4f6330bc80be84fc556ae3ec46f596fc5d33479fc27e7a613e0` |
| `docs/cuts/paper-canonical-unification/tickets/24-costed-immutable-source-adapter-pilot.md` | `6ee03690b6b2ec483315242d6302995a6ec324fa798b2a8efeae6d692b81837c` |
| `docs/cuts/paper-canonical-unification/tickets/25-source-adapter-recovery-cluster-a.md` | `a80207de91e856aeadb33b25cc902f309ea210417f6a3b68f1e60dc8eeae6044` |
| `docs/cuts/paper-canonical-unification/tickets/26-source-adapter-recovery-cluster-b.md` | `05b7aa77e1213f0a88ca8aff09865c23566f2749207562633ef170ee084332fc` |
| `docs/cuts/paper-canonical-unification/tickets/27-source-adapter-recovery-cluster-c.md` | `9c22395bad74f5975e9929496f5cb283ff850e4c7de7e5be630c625fb5297aa0` |
| `docs/cuts/paper-canonical-unification/tickets/28-source-adapter-recovery-cluster-d.md` | `5612d3672456d08e0b4ba6ab88ef26ab9903fb781a49ec16047b402b00d3cf74` |
| `docs/cuts/paper-canonical-unification/tickets/29-source-adapter-recovery-cluster-e.md` | `dd62bed90ef59216e8807320d989645017f2df36f22f1ff17e22aa3f579daa99` |
| `docs/cuts/paper-canonical-unification/tickets/30-source-adapter-recovery-cluster-f.md` | `35efd6b112821899bba6762ec6723b4cfc4016723070905c4d5d9e7494afa48a` |
| `docs/cuts/paper-canonical-unification/tickets/31-source-adapter-recovery-cluster-g.md` | `a8357b84fd1a0590c3f14e6a7204fe5f97ff80934a938a1a9f1bd903b1ee970a` |
| `docs/cuts/paper-canonical-unification/tickets/32-full-corpus-diagnostic-source-closure-gate.md` | `fae87168264a1b7f1a4f3a7b7f88e61a9ecab58b510f0341c8c36600c71f0232` |
| `docs/cuts/paper-canonical-unification/tickets/33-boundary-canary-local-outlier-package.md` | `82b1e5029c04811b0f7b258e23a5bd680a8c12b7582a9de675c2618bc91ea43b` |
| `docs/cuts/paper-canonical-unification/tickets/34-boundary-canary-national-ii.md` | `7554460541c0e9d09d93a612cc28fc487e108142f75539d86f8875e0c36d4a70` |
| `docs/cuts/paper-canonical-unification/tickets/35-boundary-canary-seven-document-low-cost-shape.md` | `63ad96692cecf14e40a85c222f2896d29cb95927565f4559f90f9c754d909304` |
| `docs/cuts/paper-canonical-unification/tickets/36-boundary-canary-zhejiang-dual-session-shape.md` | `e25d6d07c0f09f6fa6927fb060c910777c6c1b4ded29c3b2ddb36ba34edfc03b` |
| `docs/cuts/paper-canonical-unification/tickets/37-measured-migration-cohort-a.md` | `b3cbd664c9ae48061abf1378fa821c5ad7710b3564c73ed699be0e0859503e05` |
| `docs/cuts/paper-canonical-unification/tickets/38-measured-migration-cohort-b.md` | `cc1d939312a4fa4bf06de4793fe9c6f121a5f27c6501b3728a897a3729e8b46c` |
| `docs/cuts/paper-canonical-unification/tickets/39-measured-migration-cohort-c.md` | `0119865e8a25530d4304d6e92387233c95f5c990c518013df485eda99f033a72` |
| `docs/cuts/paper-canonical-unification/tickets/40-measured-migration-cohort-d.md` | `afc916ee18874ebda7520df49db4ee59443f7ca58e899c7cd663cff8c9371962` |
| `docs/cuts/paper-canonical-unification/tickets/41-measured-migration-cohort-e.md` | `8a15b64b90f9e84c57300744c37b0fb51d7747eac3c2089dd6d81a435f162f44` |
| `docs/cuts/paper-canonical-unification/tickets/42-measured-migration-cohort-f.md` | `4cd55f037344063b63371a15d8954998c05298ae34097880e2f174786ab5e0e5` |
| `docs/cuts/paper-canonical-unification/tickets/43-full-corpus-semantic-accounting-recovery-rollback-closure.md` | `1be54a257308fc2902d7230ea6c99b3b00d788501a8ead1c94283daabaf44462` |
| `docs/cuts/paper-canonical-unification/tickets/44-full-corpus-screen-artifact-closure.md` | `e91538ef24aab18e18e1ff7932c78ea1a7e84dff12c350f0676927ab751dc706` |
| `docs/cuts/paper-canonical-unification/tickets/45-full-corpus-print-pdf-artifact-closure.md` | `709272f01ed44154dd542f58a050338c852d483edba992cf7f09e3d7fe4f9c63` |
| `docs/cuts/paper-canonical-unification/tickets/46-retire-cloze-legacy-path.md` | `a6b8d915e3ff0d5350a3111432ee546552a6677d1d1ba7c1378f9402259ccb27` |
| `docs/cuts/paper-canonical-unification/tickets/47-retire-grammar-fill-legacy-path.md` | `6460b43e1308ad0db22c574b3589723bf16597990762e20068e57c3b1001f79f` |
| `docs/cuts/paper-canonical-unification/tickets/48-retire-seven-choices-legacy-path.md` | `7c0451c0a6ff28c34ad5484723d3243e41b37ffc5c2e84363f2479573ed74497` |
| `docs/cuts/paper-canonical-unification/tickets/49-retire-reading-legacy-path.md` | `241a6d73cf3f3fecc2ca9a817087f4099a3c539e142a43680b34cefe17753a00` |
| `docs/cuts/paper-canonical-unification/tickets/50-retire-application-writing-legacy-path.md` | `1fee9a5301dfe4de9254689c9819c143d264d826ef8c15f7a404d9bbc97811e8` |
| `docs/cuts/paper-canonical-unification/tickets/51-retire-continuation-writing-legacy-path.md` | `d742c107741eb3c793dbb843ca6796536cb226fd8a941fde923aab84a1af0c38` |
| `docs/cuts/paper-canonical-unification/tickets/52-post-retirement-owner-qa.md` | `6fd94fe1b1d7266feb9f313925799d994a48bd565efe1967c1eb34f0b2af458a` |
| `docs/cuts/paper-canonical-unification/tickets/53-repository-only-release-closeout.md` | `005bbe5fb03376917bc54d989d3c56eabc82c2ab973ddfb533c65ae564b45366` |
