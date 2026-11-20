// 卷的来源类型中文名：卷行标签和浏览页已选条共用（已选条在分面里找不到这个值时退回这里，不露 mock_exam 这样的原始值）。
export const SOURCE_TYPE_LABEL: Record<string, string> = {
  real_exam: '真题',
  mock_exam: '模拟',
  self_made: '自建',
  other: '其他',
}
