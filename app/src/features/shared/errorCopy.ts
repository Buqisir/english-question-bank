/** 把未知异常变成能给老师看的一句话；原始错误交给 console 供排查。 */
export function describeError(task: string, error: unknown): string {
  console.error(task, error)
  return `${task}没成功，可以再试一次。`
}
