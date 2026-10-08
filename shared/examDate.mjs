// Exam dates are Owner input, never inferred from titles, cohorts or import time.
// Missing months remain unknown for immutable legacy publications.
export function readExamDate(provenance, { required = false } = {}) {
  if (provenance?.month === undefined || provenance.month === null) {
    if (required) throw new Error('请提供考试年份和月份；不能用学年或导入时间代替')
    return null
  }
  const { year, month } = provenance
  if (!Number.isInteger(year) || year < 1900 || year > 2100
    || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('考试年份须为1900–2100的整数，月份须为1–12的整数')
  }
  return { year, month }
}
