// 本地 QA 账号的密码只从环境变量读取，仓库里不放任何固定值。
// 缺少配置时立刻退出：调用方要在模块顶层先取值，保证在重置账号或发出登录请求之前就停下。
//
//   export EQB_LOCAL_QA_OWNER_PASSWORD='<只给本地 QA 用的密码>'
//   export EQB_LOCAL_QA_MEMBER_PASSWORD='<只给本地 QA 用的密码>'   # 只有用到 member 账号的脚本需要
//
// 用一次性的本地密码，不要复用网站正式账号或其他平台的密码。

export const LOCAL_QA_OWNER_PASSWORD_ENV = 'EQB_LOCAL_QA_OWNER_PASSWORD'
export const LOCAL_QA_MEMBER_PASSWORD_ENV = 'EQB_LOCAL_QA_MEMBER_PASSWORD'

export function requireLocalQaPassword(envName, env = process.env) {
  const value = env[envName]
  if (typeof value === 'string' && value.length > 0) return value
  console.error(
    `缺少环境变量 ${envName}。请先设置本地 QA 账号密码再运行；` +
      '脚本已停止，没有重置账号，也没有发出登录请求。',
  )
  process.exit(2)
}
