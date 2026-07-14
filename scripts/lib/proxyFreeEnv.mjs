// env-dead-proxy-502（三次实撞：2026-07-12 本机重启残留假红、2026-07-14
// trust-cracks 与 home-blank 两次流水线 verify 步假红中止）：系统代理挂了
// 但 HTTP_PROXY 系变量还在时，vivliostyle 的 localhost viewer(:13000) 会被
// 死代理劫走，报 `ERROR 502` 假红。spawn vivliostyle（或任何依赖 localhost
// 子服务的进程）时传本 env：剥掉代理变量 + 钉死 NO_PROXY。
export function proxyFreeEnv(base = process.env) {
  const env = { ...base, NO_PROXY: 'localhost,127.0.0.1', no_proxy: 'localhost,127.0.0.1' }
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']) {
    delete env[key]
  }
  return env
}
