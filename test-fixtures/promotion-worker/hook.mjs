import { registerHooks } from 'node:module'
const faultImport = `import { promotionFault as __promotionFault, promotionAsyncFault as __promotionAsyncFault } from ${JSON.stringify(new URL('./faults.mjs', import.meta.url).href)};\n`
const replacements = {
  '/server/search/similarQuestions.mjs': [
    ["    findSimilar: (db, input) =>", "    __promotionFixtureRawIndex: getRawIndex,\n    findSimilar: (db, input) =>"],
  ],
  '/server/import-review/runPromotionWorker.mjs': [
    ["      row = operations.reserve(", "      __promotionFault('after-host-slot');\n      row = operations.reserve("],
    ["    return supervise(row, nonce)", "    __promotionFault('after-job-before-fork');\n    await __promotionAsyncFault('live-reserve-before-fork');\n    return supervise(row, nonce)"],
    ["phase = 'running'; send('go')", "phase = 'running'; __promotionFault('api-before-go'); send('go'); __promotionFault('api-after-go', { phase, result })"],
    ["      function unknown(reason) {", "      function unknown(reason) {\n        __promotionFault('api-unknown-callback', { reason, phase, result, settled });"],
    ["          result = message", "          __promotionFault('api-received-outcome');\n          result = message"],
    ["              send('ack')", "              __promotionFault('api-before-ack');\n              send('ack');\n              if (__promotionFault('api-after-ack') === 'http-timeout') unknown('HTTP_WAIT_TIMEOUT')"],
    ["        slot = handoffPromotionSlot(leader.lease, recoverySlot.token, id)",
      "        slot = handoffPromotionSlot(leader.lease, recoverySlot.token, id);\n        await __promotionAsyncFault('retry-after-handoff')"],
  ],
  '/server/import-review/promotionSupervisor.mjs': [
    ["        operations.acknowledge(row.id, outcome)",
      "        __promotionFault('supervisor-ack-before-recheck');\n        operations.acknowledge(row.id, outcome)"],
    ["  send(canRelease ? 'outcome' : 'unknown'", "  if (canRelease) __promotionFault('supervisor-before-outcome');\n  send(canRelease ? 'outcome' : 'unknown'"],
    ["  if (canRelease && process.connected) {", "  if (canRelease) __promotionFault('supervisor-after-outcome');\n  if (canRelease && process.connected) {"],
    ["      phase = 'launch'\n      send('ready')", "      phase = 'launch'\n      __promotionFault('supervisor-ready');\n      send('ready')"],
    ["      phase = 'running'\n      executor.send(", "      phase = 'running'\n      __promotionFault('supervisor-before-go');\n      executor.send("],
  ],
  '/server/import-review/promotionOperationStore.mjs': [
    ["            releasePromotionSlot(current.host_slot_token)",
      "            __promotionFault('ack-locked-before-release');\n            releasePromotionSlot(current.host_slot_token);\n            __promotionFault('after-slot-release')"],
    ["          const current = readPromotionOperation(db, id)\n          // Serialize with acknowledge",
      "          __promotionFault('unknown-write-lock-acquired');\n          const current = readPromotionOperation(db, id)\n          // Serialize with acknowledge"],
  ],
  '/server/import-review/importReviewStore.mjs': [
    ["        linkPromotionOperation(db, operation, promotion)\n        db.exec('COMMIT')",
      "        linkPromotionOperation(db, operation, promotion)\n        if(operation)__promotionFault('begin-before-commit');\n        db.exec('COMMIT');\n        if(operation)__promotionFault('begin-after-commit')"],
  ],
  '/server/import-review/singlePaperPromotion.mjs': [
    ["              return write()", "              __promotionFault('guard-write-lock');\n              return write()"],
    ["          return archiveReviewFiles(", "          __promotionFault('before-archive');\n          return archiveReviewFiles("],
    [".then(storage => execute(paperId, begun, storage, binding))", ".then(storage => { __promotionFault('after-archive'); return execute(paperId, begun, storage, binding) })"],
    ["        const result = publish({", "        __promotionFault('before-publisher');\n        const result = publish({"],
    ["        if (afterPublish) afterPublish", "        __promotionFault('after-bank-commit');\n        if (afterPublish) afterPublish"],
    ["        const receipt = store.markPromotionPublished(\n          paperId,", "        __promotionFault('before-mark-published');\n        const receipt = store.markPromotionPublished(\n          paperId,"],
    ["        return {\n          status: result.status", "        __promotionFault('after-mark-published');\n        return {\n          status: result.status"],
    ["              target,\n            )", "              target,\n            );\n            __promotionFault('after-target-binding')"],
  ],
  '/server/import-review/reviewCompatibilityWorker.mjs': [
    ["const samples = []", "__promotionFault('compatibility-input');\nconst samples = []"],
  ],
  '/server/import-review/promotionWorker.mjs': [
    ["    const execution = { id: row.id", "    __promotionFault('executor-before-begin', {}, { operationId: row.id, nonce: message.nonce });\n    const execution = { id: row.id"],
    ["    send('outcome', { outcome })\n    process.disconnect()", "    __promotionFault('before-worker-ipc');\n    send('outcome', { outcome })\n    process.disconnect()"],
  ],
  '/server/paper-import/publisher.mjs': [
    ["    onPrepared({", "    __promotionFault('before-on-prepared');\n    onPrepared({"],
    ["  const write = (outputInventory = null) => {", "  __promotionFault('after-on-prepared');\n  const write = (outputInventory = null) => {"],
    ["    if (failurePoint === 'process-exit-after-version-rename')", "    __promotionFault('after-version-rename');\n    if (failurePoint === 'process-exit-after-version-rename')"],
    ["    if (failurePoint === 'process-exit-after-latest-swap')", "    __promotionFault('after-latest-swap');\n    if (failurePoint === 'process-exit-after-latest-swap')"],
  ],
}
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context)
    const entry = Object.entries(replacements).find(([suffix]) => url.endsWith(suffix))
    if (!entry || !process.env.EQB_PROMOTION_FAULT_STAGE) return result
    let source = String(result.source)
    for (const [before, after] of entry[1]) {
      if (!source.includes(before)) throw new Error(`Stale promotion fault anchor: ${url} ${before}`)
      source = source.replaceAll(before, after)
    }
    return { ...result, source: faultImport + source }
  },
})
