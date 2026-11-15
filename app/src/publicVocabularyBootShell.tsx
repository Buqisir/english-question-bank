// 扫码进来的两张公开页（听写、听音词卡）的启动壳和启动失败页（等待第五轮，2026-11-15，从 main.tsx 挪出来：
// 入口文件只放启动逻辑，组件放这里，react-refresh/only-export-components 不报）。
// 这里只能拿样式、不能拿页面代码：本文件被 main.tsx 静态引入，进入口 JS（verify-launch-deploy Slice 1 入口 ≤450KB）。
// 听写启动壳用听写页同一套容器规则和灰块样子画灰块，两份都只有 CSS。
import './features/vocabulary-dictation/vocabularyDictationPage.css'
import './shared-ui/waiting.css'

/**
 * 启动壳里的一块灰块：和 shared-ui/Skeleton 同一个 class（waiting.css），但不拿 Skeleton 组件（启动壳不加载 shared-ui 的 JS）。
 * Skeleton 组件把呼吸对齐到页面时间轴的 0 点；这里用负的 animation-delay 对齐到同一个点，
 * 页面代码块到了、换成页面自己的灰块时，深浅接得上，不跳一下。
 */
function BootSkeleton({ width, height, pill, phaseDelay }: { width?: number; height: number; pill?: boolean; phaseDelay: string }) {
  return (
    <span
      className="eqb-skeleton"
      data-shape={pill ? 'pill' : undefined}
      style={{ width, height, animationDelay: phaseDelay }}
      aria-hidden="true"
    />
  )
}

/**
 * 扫码听写的启动壳（等待第五轮，2026-11-15；原来是一张居中卡片：方块「EQ」字标、「正在准备听写」和一行说明）。
 * 页面代码块还没到时就画听写页的灰块：顶栏（獭石 / 自动听写）照常，题板、控制区的灰块和听写页 DictationOpeningSkeleton
 * 同一套 class、同样的块（容器几何由 vocabularyDictationPage.css 那一份规则给，值只写一处）。
 * 门槛：启动壳不跑 JS 计时，灰块用 CSS 的 animation-delay 等 300ms 再出（index.css .public-vocabulary-boot-skeleton）；
 * 「出了至少留 500ms」做不到，交给页面：页面挂上时启动壳的灰块已经出了，就接着出（bootStartedAt）。
 */
export function PublicVocabularyDictationBootShell({ phaseDelay }: { phaseDelay: string }) {
  return (
    <div className="vocabulary-dictation-page">
      <header className="vocabulary-dictation-header">
        <a href="/" aria-label="返回獭石首页">獭石</a>
        <span>自动听写</span>
      </header>
      <main className="vocabulary-dictation-shell vocabulary-dictation-skeleton" role="status" aria-busy="true">
        <span className="visually-hidden">正在准备听写</span>
        <div className="public-vocabulary-boot-skeleton" aria-hidden="true">
          <section className="vocabulary-dictation-stage">
            <div className="vocabulary-dictation-title-row">
              <h1><BootSkeleton width={120} height={10} phaseDelay={phaseDelay} /></h1>
              <strong><BootSkeleton width={36} height={10} phaseDelay={phaseDelay} /></strong>
            </div>
            <div className="vocabulary-dictation-question">
              <BootSkeleton width={120} height={64} phaseDelay={phaseDelay} />
            </div>
            <p className="vocabulary-dictation-status"><BootSkeleton width={96} height={14} phaseDelay={phaseDelay} /></p>
            <p className="vocabulary-dictation-instruction"><BootSkeleton width={260} height={12} phaseDelay={phaseDelay} /></p>
            <div className="vocabulary-dictation-progress" />
          </section>
          <section className="vocabulary-dictation-controls">
            <div className="vocabulary-dictation-transport">
              <BootSkeleton width={44} height={44} pill phaseDelay={phaseDelay} />
              <BootSkeleton width={64} height={64} pill phaseDelay={phaseDelay} />
              <BootSkeleton width={44} height={44} pill phaseDelay={phaseDelay} />
            </div>
            <span className="vocabulary-dictation-replay"><BootSkeleton width={72} height={20} phaseDelay={phaseDelay} /></span>
            <div className="vocabulary-dictation-settings">
              {[3, 4].map((count) => (
                <div key={count} className="vocabulary-dictation-skeleton-fieldset">
                  <p className="vocabulary-dictation-skeleton-legend"><BootSkeleton width={56} height={10} phaseDelay={phaseDelay} /></p>
                  <div>
                    {Array.from({ length: count }, (_, index) => <BootSkeleton key={index} height={36} phaseDelay={phaseDelay} />)}
                  </div>
                </div>
              ))}
              <div className="vocabulary-dictation-volume">
                <BootSkeleton width={16} height={16} phaseDelay={phaseDelay} />
                <BootSkeleton height={4} phaseDelay={phaseDelay} />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

/* 獭石的图形标志（BRAND.md §3.1，app/public/brand/mark.svg，只引用现成文件）。等待第五轮（2026-11-15）换掉原来的方块「EQ」字标。
   装饰：读屏读下面的标题。 */
function BootBrandMark() {
  return <img className="public-vocabulary-boot-mark" src="/brand/mark.svg" alt="" aria-hidden="true" />
}

// 听音词卡的启动壳：页面自己的等待是一张居中卡片（VocabularyListenPage LoadState「正在打开听音词卡」），不是灰块，启动壳照旧用卡片。
export function PublicVocabularyListenBootShell() {
  return (
    <main className="public-vocabulary-boot" aria-live="polite">
      <div>
        <BootBrandMark />
        <h1>正在准备词汇练习</h1>
        <p>正在载入本次练习，请稍候。</p>
      </div>
    </main>
  )
}

export function BootstrapError() {
  return (
    <main className="public-vocabulary-boot" role="alert">
      <div>
        <BootBrandMark />
        <h1>页面暂时无法打开</h1>
        <p>请检查网络后重新打开链接。</p>
      </div>
    </main>
  )
}
