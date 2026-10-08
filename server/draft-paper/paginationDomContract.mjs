// draft-desk-b step2 (MF-3, plan.md "步2 — DOM 契约 + 缓存解耦").
//
// Wraps renderPaginatedPaper()'s output (server/draft-paper/paginationRenderer.mjs)
// in a STABLE downstream contract so callers never need to know paged.js's own
// internal class names / attributes. This is a pure string-transform module: it
// does not launch Chromium, does not know about draft papers, groups, or scores,
// and — same as paginationRenderer.mjs — never touches server/print-renderer.mjs
// (Forbidden list, plan.md; this module is the "下游 wrapper" plan.md calls for,
// which is exactly why it exists as its own file instead of a print-renderer.mjs
// edit).
//
// CONTRACT (frozen — step3 front-end / rail / scrollspy may depend on ONLY this;
// no downstream code may read a `pagedjs_*` class or `data-split-*`/`data-ref`
// attribute):
//   - every page container additionally carries the class `preview-page`
//     (ADDED alongside paged.js's own `pagedjs_page ...` classes — those stay on
//     the element untouched, but nothing downstream may rely on them).
//   - every `.question-group` section additionally carries
//     `data-group-id="<id>"`, where `<id>` is positionally mapped from the
//     `groupIds` array the caller passes in — the same order
//     draftPaperStore.mjs's buildDraftPaperBlocks / the client's
//     draftPaperPreviewHtml.ts's tagGroupSections use (the caller's
//     non-groupMissing items, in item order).
//
// SPLIT-GROUP MERGING (spike-gate-dp1.md finding #4): paged.js keeps
// `section.question-group` intact as a structural element, but when a group's
// content overflows a page boundary paged.js clones the section into multiple
// `<section class="question-group">` FRAGMENTS — one per page the group spans
// — each carrying `data-split-to`/`data-split-from`/`data-split-original`
// bookkeeping attributes. Empirically confirmed (this cut's dev probe against a
// real multi-page render, not checked in): EVERY fragment of the SAME original
// group — split or not, including the hidden
// `<template data-ref="pagedjs-content">` master copy paged.js always emits —
// shares the exact same `data-ref` UUID. A group that never gets split still
// carries a single `data-ref`, just with no `data-split-*` attributes at all.
// This module therefore never reads `data-split-*`: grouping fragments by
// their shared `data-ref` value is sufficient, and the FIRST-SEEN order of
// distinct `data-ref` values (scanning the whole serialized document,
// including the `<template>` copy — it preserves original block order too) is
// positionally identical to the caller's `groupIds` order. Tagging the
// template's inert copy with the same `data-group-id` is harmless (it is
// never rendered — `display: none` per paged.js's own CSS) and deliberately
// not special-cased out, keeping this a single linear pass with no
// "am I inside <template>" bookkeeping.
//
// FAIL LOUD (same defensive pattern as paginationRenderer.mjs's own
// domPageCount cross-check): if the number of distinct `data-ref` values found
// does not match `groupIds.length`, or the resulting `.preview-page` count
// does not match the caller-supplied `pageCount`, this throws rather than
// silently shipping a mismatched contract.

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

// Renders `paginatedHtml` (renderPaginatedPaper's output — scripts already
// stripped) into the contract shape above. `groupIds` must be the caller's
// ordered, non-groupMissing group id list (same order as the blocks that
// produced `paginatedHtml`'s content); `pageCount` must be
// renderPaginatedPaper's own reported page count for the SAME render.
// Explicit groupIds:null is page-only wrapping for the independent answer
// booklet; its source group markers are already bound, not Question Groups.
export function applyPaginationDomContract(paginatedHtml, { groupIds, pageCount } = {}) {
  if (typeof paginatedHtml !== 'string' || !paginatedHtml) {
    throw new Error('applyPaginationDomContract: paginatedHtml must be a non-empty string')
  }
  if (groupIds !== null && (!Array.isArray(groupIds) || groupIds.length === 0)) {
    throw new Error('applyPaginationDomContract: groupIds must be a non-empty array')
  }
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('applyPaginationDomContract: pageCount must be a positive integer')
  }
  if (/<script\b/i.test(paginatedHtml)) {
    throw new Error(
      'applyPaginationDomContract: paginatedHtml still contains a <script> tag — caller must strip scripts ' +
        'before this module (paginationRenderer.mjs step 5 already does this for its own output)',
    )
  }

  const refToGroupId = new Map()
  let nextIndex = 0

  const withGroupIds = groupIds === null ? paginatedHtml : paginatedHtml.replace(/<section class="question-group"([^>]*)>/g, (fullMatch, attrs) => {
    const refMatch = /data-ref="([^"]+)"/.exec(attrs)
    if (!refMatch) {
      throw new Error(
        `applyPaginationDomContract: a .question-group section has no data-ref attribute — paged.js output shape ` +
          `changed (tag: ${fullMatch})`,
      )
    }
    const ref = refMatch[1]
    if (!refToGroupId.has(ref)) {
      if (nextIndex >= groupIds.length) {
        throw new Error(
          `applyPaginationDomContract: found more distinct question-group fragments (data-ref) than groupIds ` +
            `provided (${groupIds.length}) — pagination output does not match the caller's block list`,
        )
      }
      refToGroupId.set(ref, groupIds[nextIndex])
      nextIndex += 1
    }
    return `<section class="question-group" data-group-id="${escapeAttr(refToGroupId.get(ref))}"${attrs}>`
  })

  if (groupIds !== null && nextIndex !== groupIds.length) {
    throw new Error(
      `applyPaginationDomContract: found ${nextIndex} distinct question-group fragment(s) but expected ` +
        `${groupIds.length} (groupIds.length) — a group may have been dropped or merged unexpectedly`,
    )
  }

  // Word-boundary `\bpagedjs_page\b` (not a plain substring match) so this
  // targets ONLY `.pagedjs_page` page containers, never the plural
  // `.pagedjs_pages` wrapper or `.pagedjs_pagebox` inner box — both share
  // "pagedjs_page" as a literal prefix, and `\b` requires a non-word
  // character on both sides ("s"/"b" are word characters, so neither
  // false-matches). Same reasoning paginationRenderer.mjs's own
  // domPageCount check already relies on.
  const pageContainerMatches = withGroupIds.match(/<div class="[^"]*\bpagedjs_page\b[^"]*"/g) || []
  if (pageContainerMatches.length !== pageCount) {
    throw new Error(
      `applyPaginationDomContract: found ${pageContainerMatches.length} .pagedjs_page container(s) but the ` +
        `caller-supplied pageCount is ${pageCount}`,
    )
  }

  return withGroupIds.replace(
    /<div class="([^"]*\bpagedjs_page\b[^"]*)"/g,
    (fullMatch, classAttr) => `<div class="${classAttr} preview-page"`,
  )
}
