// Diagnostic data only: never used to rank candidates or choose a layout.
export const milliseconds = value => Math.round(value * 100) / 100

export function finishPaginationTiming(timing) {
  return {
    ...timing,
    // Includes Node startup, projection building and (when called by the CLI
    // before writing its report) rasterization. This is not search time alone.
    totalSeconds: Number(process.uptime().toFixed(3)),
    chromiumLaunchMs: milliseconds(timing.candidates.reduce((sum, row) => sum + (row.chromiumLaunchMs || 0), 0)),
  }
}

export function timedCandidateRender(render, { edition, accepts }) {
  const timing = { candidates: [] }
  const measure = async (html, options, layout) => {
    const row = {
      index: timing.candidates.length + 1, edition,
      layout: structuredClone(layout),
      // V8 keeps regex captures as slices of the source string, so storing them
      // directly retains every ~60MB candidate HTML (inline fonts) for the
      // whole search. The Buffer round trip forces an independent copy.
      breakGroupIds: [...html.matchAll(/<section\b[^>]*data-canonical-group-id="([^"]*)"[^>]*data-pdf-planned-break/g)]
        .map(match => Buffer.from(match[1], 'utf8').toString('utf8')),
      queueWaitMs: 0, chromiumLaunchMs: 0, renderMs: 0, pdfMs: 0, hit: false,
    }
    timing.candidates.push(row)
    const started = performance.now()
    try {
      const result = await render(html, { ...options, timing: row })
      row.pageCount = result.pageCount
      // A hit meets page/writing constraints; the existing planner can still
      // choose another hit for better grouping/whitespace.
      row.hit = accepts(result)
      return result
    } catch (error) {
      row.error = error.code || error.name
      throw error
    } finally {
      row.totalMs = milliseconds(performance.now() - started)
    }
  }
  return { timing, measure }
}
