// 「09b 图形语言 · 物件」：2026-11-14 草案 0.7 新加的一页，从 template.jsx 复制。十一件物件的图直接取 mascot/objects/ 下的文件原样，不另画。
(
    <div style={{ backgroundColor: '#FFFFFF', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontSynthesis: 'none', height: '1132px', MozOsxFontSmoothing: 'grayscale', overflow: 'clip', overflowWrap: 'anywhere', paddingBottom: '44px', paddingInline: '96px', paddingTop: '48px', WebkitFontSmoothing: 'antialiased', width: '1600px' }}>
      <div style={{ alignItems: 'center', borderBottomColor: '#E3E8DF', borderBottomStyle: 'solid', borderBottomWidth: '1px', boxSizing: 'border-box', display: 'flex', flexShrink: '0', justifyContent: 'space-between', paddingBottom: '16px' }}>
        <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', gap: '12px' }}>
          <div style={{ backgroundImage: 'url(../../logo/mint/mark.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxSizing: 'border-box', flexShrink: 0, height: '20px', width: '31px' }} />
          <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '13px', letterSpacing: '0.04em', lineHeight: '16px' }}>
            视觉规范手册 · 草案 0.11
          </div>
        </div>
        <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '13px', letterSpacing: '0.04em', lineHeight: '16px' }}>
          05 图形语言
        </div>
      </div>
      <div style={{ boxSizing: 'border-box', display: 'flex', flexBasis: '0%', flexDirection: 'column', flexGrow: '1', gap: '40px', paddingBottom: '40px', paddingTop: '48px' }}>
        <div style={{ alignItems: 'end', boxSizing: 'border-box', display: 'flex', gap: '80px', justifyContent: 'space-between' }}>
          <div style={{ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '20px' }}>
            <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Inter", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, letterSpacing: '0.12em', lineHeight: '16px' }}>
              05 · 图形语言
            </div>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', gap: '12px' }}>
              <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', lineHeight: '16px' }}>
                物件
              </div>
              <div style={{ backgroundColor: '#2C6E56', borderRadius: '4px', boxSizing: 'border-box', flexShrink: '0', paddingInline: '7px' }}>
                <div style={{ boxSizing: 'border-box', color: '#FFFFFF', fontFamily: '"PingFangSC-Medium", "PingFang SC", system-ui, sans-serif', fontSize: '12px', fontWeight: 500, lineHeight: '18px' }}>
                  画法已定 · 第 106、109–112 条
                </div>
              </div>
              <div style={{ borderColor: '#D5DACF', borderRadius: '4px', borderStyle: 'solid', borderWidth: '1px', boxSizing: 'border-box', flexShrink: '0', paddingInline: '7px' }}>
                <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Medium", "PingFang SC", system-ui, sans-serif', fontSize: '12px', fontWeight: 500, lineHeight: '18px' }}>
                  用在哪 · 没定
                </div>
              </div>
            </div>
            <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"Noto Serif SC", system-ui, sans-serif', fontSize: '40px', fontWeight: 700, lineHeight: '135%' }}>
              十一件物件，同一把尺。
            </div>
          </div>
          <div style={{ boxSizing: 'border-box', color: '#191D18', flexShrink: 0, fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '14px', lineHeight: '180%', width: '620px' }}>
            生态物件画了七轮，每样的画法 Owner 都定过；统一检查第二遍过了以后，2026-11-14 搬进 mascot/objects/（第 113 条）。搬进目录这一步是 agent 照已定的顺序做的，Owner 没再单独看搬入结果。还没放进真实页面，各用在哪没定，含义先只当装饰（第 106 条）。
          </div>
        </div>
        <div style={{ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ alignItems: 'center', borderBottomColor: '#191D18', borderBottomStyle: 'solid', borderBottomWidth: '1px', boxSizing: 'border-box', display: 'flex', gap: '10px', paddingBottom: '8px' }}>
            <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', lineHeight: '16px' }}>
              十一件并排
            </div>
            <div style={{ boxSizing: 'border-box', flexGrow: '1' }} />
            <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px' }}>
              每格 112px 宽 = 画框 240 单位 = 獭獭头宽；按画框原样排，不各自缩放
            </div>
          </div>
          <div style={{ alignItems: 'start', backgroundColor: '#F1F5F7', borderRadius: '12px', boxShadow: '#E3E8DF 0px 0px 0px 1px inset', boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between', paddingBottom: '18px', paddingInline: '20px', paddingTop: '20px' }}>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '6px', width: '112px' }}>
              <div style={{ backgroundImage: 'url(../../mascot/objects/stone-otter.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxSizing: 'border-box', flexShrink: '0', height: '112px', width: '112px' }} />
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '18px', textAlign: 'center' }}>
                獭獭的石头
              </div>
              <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Paper Mono", ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace', fontSize: '11px', lineHeight: '16px', textAlign: 'center' }}>
                stone-otter.svg
              </div>
              <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px', minHeight: '16px', textAlign: 'center' }}>
                带一刀平切面
              </div>
            </div>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '6px', width: '112px' }}>
              <div style={{ backgroundImage: 'url(../../mascot/objects/stone-long.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxSizing: 'border-box', flexShrink: '0', height: '112px', width: '112px' }} />
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '18px', textAlign: 'center' }}>
                扁长卵石
              </div>
              <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Paper Mono", ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace', fontSize: '11px', lineHeight: '16px', textAlign: 'center' }}>
                stone-long.svg
              </div>
              <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px', minHeight: '16px', textAlign: 'center' }}>
                
              </div>
            </div>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '6px', width: '112px' }}>
              <div style={{ backgroundImage: 'url(../../mascot/objects/stone-round.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxSizing: 'border-box', flexShrink: '0', height: '112px', width: '112px' }} />
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '18px', textAlign: 'center' }}>
                圆墩石
              </div>
              <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Paper Mono", ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace', fontSize: '11px', lineHeight: '16px', textAlign: 'center' }}>
                stone-round.svg
              </div>
              <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px', minHeight: '16px', textAlign: 'center' }}>
                
              </div>
            </div>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '6px', width: '112px' }}>
              <div style={{ backgroundImage: 'url(../../mascot/objects/stone-flat.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxSizing: 'border-box', flexShrink: '0', height: '112px', width: '112px' }} />
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '18px', textAlign: 'center' }}>
                小扁片石
              </div>
              <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Paper Mono", ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace', fontSize: '11px', lineHeight: '16px', textAlign: 'center' }}>
                stone-flat.svg
              </div>
              <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px', minHeight: '16px', textAlign: 'center' }}>
                
              </div>
            </div>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '6px', width: '112px' }}>
              <div style={{ backgroundImage: 'url(../../mascot/objects/urchin.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxSizing: 'border-box', flexShrink: '0', height: '112px', width: '112px' }} />
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '18px', textAlign: 'center' }}>
                海胆
              </div>
              <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Paper Mono", ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace', fontSize: '11px', lineHeight: '16px', textAlign: 'center' }}>
                urchin.svg
              </div>
              <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px', minHeight: '16px', textAlign: 'center' }}>
                整只带刺的圆球
              </div>
            </div>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '6px', width: '112px' }}>
              <div style={{ backgroundImage: 'url(../../mascot/objects/clam.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxSizing: 'border-box', flexShrink: '0', height: '112px', width: '112px' }} />
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '18px', textAlign: 'center' }}>
                合着的蛤
              </div>
              <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Paper Mono", ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace', fontSize: '11px', lineHeight: '16px', textAlign: 'center' }}>
                clam.svg
              </div>
              <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px', minHeight: '16px', textAlign: 'center' }}>
                两道纹
              </div>
            </div>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '6px', width: '112px' }}>
              <div style={{ backgroundImage: 'url(../../mascot/objects/clam-open.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxSizing: 'border-box', flexShrink: '0', height: '112px', width: '112px' }} />
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '18px', textAlign: 'center' }}>
                敲开的蛤
              </div>
              <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Paper Mono", ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace', fontSize: '11px', lineHeight: '16px', textAlign: 'center' }}>
                clam-open.svg
              </div>
              <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px', minHeight: '16px', textAlign: 'center' }}>
                掀约 52°
              </div>
            </div>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '6px', width: '112px' }}>
              <div style={{ backgroundImage: 'url(../../mascot/objects/scallop.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxSizing: 'border-box', flexShrink: '0', height: '112px', width: '112px' }} />
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '18px', textAlign: 'center' }}>
                扇贝
              </div>
              <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Paper Mono", ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace', fontSize: '11px', lineHeight: '16px', textAlign: 'center' }}>
                scallop.svg
              </div>
              <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px', minHeight: '16px', textAlign: 'center' }}>
                五瓣四缝
              </div>
            </div>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '6px', width: '112px' }}>
              <div style={{ backgroundImage: 'url(../../mascot/objects/starfish.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxSizing: 'border-box', flexShrink: '0', height: '112px', width: '112px' }} />
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '18px', textAlign: 'center' }}>
                海星
              </div>
              <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Paper Mono", ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace', fontSize: '11px', lineHeight: '16px', textAlign: 'center' }}>
                starfish.svg
              </div>
              <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px', minHeight: '16px', textAlign: 'center' }}>
                只做点缀
              </div>
            </div>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '6px', width: '112px' }}>
              <div style={{ backgroundImage: 'url(../../mascot/objects/bubbles.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxSizing: 'border-box', flexShrink: '0', height: '112px', width: '112px' }} />
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '18px', textAlign: 'center' }}>
                气泡
              </div>
              <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Paper Mono", ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace', fontSize: '11px', lineHeight: '16px', textAlign: 'center' }}>
                bubbles.svg
              </div>
              <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px', minHeight: '16px', textAlign: 'center' }}>
                一串
              </div>
            </div>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '6px', width: '112px' }}>
              <div style={{ backgroundImage: 'url(../../mascot/objects/kelp-blade.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', boxSizing: 'border-box', flexShrink: '0', height: '112px', width: '112px' }} />
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '18px', textAlign: 'center' }}>
                巨藻一段
              </div>
              <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Paper Mono", ui-monospace, "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace', fontSize: '11px', lineHeight: '16px', textAlign: 'center' }}>
                kelp-blade.svg
              </div>
              <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px', minHeight: '16px', textAlign: 'center' }}>
                叶朝一侧飘
              </div>
            </div>
          </div>
        </div>
        <div style={{ alignItems: 'start', boxSizing: 'border-box', display: 'flex', gap: '48px' }}>
          <div style={{ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '14px', width: '380px' }}>
            <div style={{ alignItems: 'center', borderBottomColor: '#191D18', borderBottomStyle: 'solid', borderBottomWidth: '1px', boxSizing: 'border-box', display: 'flex', gap: '10px', paddingBottom: '8px' }}>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', lineHeight: '16px' }}>
                画框约定
              </div>
              <div style={{ borderColor: '#D5DACF', borderRadius: '4px', borderStyle: 'solid', borderWidth: '1px', boxSizing: 'border-box', flexShrink: '0', paddingInline: '7px' }}>
                <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Medium", "PingFang SC", system-ui, sans-serif', fontSize: '12px', fontWeight: 500, lineHeight: '18px' }}>
                  提案 · 记在 objects/README
                </div>
              </div>
            </div>
            <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', gap: '20px' }}>
              <div style={{ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '4px', width: '120px' }}>
                <div style={{ alignItems: 'center', boxSizing: 'border-box', display: 'flex', gap: '4px' }}>
                  <div style={{ backgroundColor: '#2C6E56', boxSizing: 'border-box', flexShrink: '0', height: '9px', width: '1px' }} />
                  <div style={{ backgroundColor: '#2C6E56', boxSizing: 'border-box', flexGrow: '1', height: '1px' }} />
                  <div style={{ boxSizing: 'border-box', color: '#2C6E56', fontFamily: '"Inter", system-ui, sans-serif', fontSize: '11px', fontWeight: 600, lineHeight: '14px' }}>
                    240
                  </div>
                  <div style={{ backgroundColor: '#2C6E56', boxSizing: 'border-box', flexGrow: '1', height: '1px' }} />
                  <div style={{ backgroundColor: '#2C6E56', boxSizing: 'border-box', flexShrink: '0', height: '9px', width: '1px' }} />
                </div>
                <div style={{ backgroundImage: 'url(../../mascot/objects/stone-otter.svg)', backgroundPosition: '50%', backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', borderColor: '#B9C3BE', borderRadius: '2px', borderStyle: 'dashed', borderWidth: '1px', boxSizing: 'border-box', flexShrink: '0', height: '120px', width: '120px' }} />
              </div>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '13px', lineHeight: '175%' }}>
                每个 SVG 的画框是 240 × 240，240 = 獭獭头宽（含耳朵）。物件按相互的大小画在框里，放在一起时不用再各自缩放；要多大，就把整个画框按头宽缩放。
              </div>
            </div>
          </div>
          <div style={{ boxSizing: 'border-box', display: 'flex', flexBasis: '0px', flexDirection: 'column', flexGrow: '1', gap: '4px' }}>
            <div style={{ alignItems: 'center', borderBottomColor: '#191D18', borderBottomStyle: 'solid', borderBottomWidth: '1px', boxSizing: 'border-box', display: 'flex', gap: '10px', paddingBottom: '8px' }}>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', lineHeight: '16px' }}>
                每样的来历
              </div>
            </div>
            <div style={{ borderBottomColor: '#E3E8DF', borderBottomStyle: 'solid', borderBottomWidth: '1px', boxSizing: 'border-box', display: 'flex', gap: '16px', paddingBlock: '10px' }}>
              <div style={{ boxSizing: 'border-box', color: '#191D18', flexShrink: '0', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '175%', width: '84px' }}>
                石头四块
              </div>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '13px', lineHeight: '175%' }}>
                石色主体加一块石面顶面，光滑卵石，没有花纹；獭獭那块带一刀平切面（第 106 条）。圆墩石顶面内收是 agent 照规则改的（第 110、111 条）。
              </div>
            </div>
            <div style={{ borderBottomColor: '#E3E8DF', borderBottomStyle: 'solid', borderBottomWidth: '1px', boxSizing: 'border-box', display: 'flex', gap: '16px', paddingBlock: '10px' }}>
              <div style={{ boxSizing: 'border-box', color: '#191D18', flexShrink: '0', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '175%', width: '84px' }}>
                海胆
              </div>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '13px', lineHeight: '175%' }}>
                整只带刺的圆球（第 107 条）；顶面放大是 agent 照规则改的，Owner 看过没有异议，没单独定（第 111 条）。
              </div>
            </div>
            <div style={{ borderBottomColor: '#E3E8DF', borderBottomStyle: 'solid', borderBottomWidth: '1px', boxSizing: 'border-box', display: 'flex', gap: '16px', paddingBlock: '10px' }}>
              <div style={{ boxSizing: 'border-box', color: '#191D18', flexShrink: '0', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '175%', width: '84px' }}>
                蛤和扇贝
              </div>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '13px', lineHeight: '175%' }}>
                敲开的蛤掀约 52°（a6-2），合着的蛤两道纹（c2），扇贝五瓣四缝（s1），都是 Owner 定的（第 111 条）。
              </div>
            </div>
            <div style={{ borderBottomColor: '#E3E8DF', borderBottomStyle: 'solid', borderBottomWidth: '1px', boxSizing: 'border-box', display: 'flex', gap: '16px', paddingBlock: '10px' }}>
              <div style={{ boxSizing: 'border-box', color: '#191D18', flexShrink: '0', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '175%', width: '84px' }}>
                海星、气泡
              </div>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '13px', lineHeight: '175%' }}>
                海星留着，只做点缀（第 106 条）。气泡的浅色小点是「次色不碰外轮廓」的唯一例外（第 110 条）。
              </div>
            </div>
            <div style={{ boxSizing: 'border-box', display: 'flex', gap: '16px', paddingBlock: '10px' }}>
              <div style={{ boxSizing: 'border-box', color: '#191D18', flexShrink: '0', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '175%', width: '84px' }}>
                巨藻一段
              </div>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '13px', lineHeight: '175%' }}>
                略弯的茎加三片朝一侧飘的宽叶，叶根气囊，中脉浅雾薄荷（第 112 条）。agent 的保留意见：48px 下还有一点描边感（目测）。
              </div>
            </div>
          </div>
          <div style={{ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', flexShrink: '0', gap: '4px', width: '380px' }}>
            <div style={{ alignItems: 'center', borderBottomColor: '#191D18', borderBottomStyle: 'solid', borderBottomWidth: '1px', boxSizing: 'border-box', display: 'flex', gap: '10px', paddingBottom: '8px' }}>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', lineHeight: '16px' }}>
                还没做的
              </div>
              <div style={{ borderColor: '#D5DACF', borderRadius: '4px', borderStyle: 'solid', borderWidth: '1px', boxSizing: 'border-box', flexShrink: '0', paddingInline: '7px' }}>
                <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Medium", "PingFang SC", system-ui, sans-serif', fontSize: '12px', fontWeight: 500, lineHeight: '18px' }}>
                  未开始
                </div>
              </div>
            </div>
            <div style={{ borderBottomColor: '#E3E8DF', borderBottomStyle: 'solid', borderBottomWidth: '1px', boxSizing: 'border-box', display: 'flex', gap: '16px', paddingBlock: '10px' }}>
              <div style={{ boxSizing: 'border-box', color: '#191D18', flexShrink: '0', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '175%', width: '84px' }}>
                真实页面
              </div>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '13px', lineHeight: '175%' }}>
                十一件都没放进网站看过（第 113 条）。
              </div>
            </div>
            <div style={{ borderBottomColor: '#E3E8DF', borderBottomStyle: 'solid', borderBottomWidth: '1px', boxSizing: 'border-box', display: 'flex', gap: '16px', paddingBlock: '10px' }}>
              <div style={{ boxSizing: 'border-box', color: '#191D18', flexShrink: '0', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '175%', width: '84px' }}>
                用在哪
              </div>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '13px', lineHeight: '175%' }}>
                先只当装饰，不进界面的功能位置；等「找题 → 组卷 → 导出」走查结果出来再挑一两处试（第 106 条）。
              </div>
            </div>
            <div style={{ borderBottomColor: '#E3E8DF', borderBottomStyle: 'solid', borderBottomWidth: '1px', boxSizing: 'border-box', display: 'flex', gap: '16px', paddingBlock: '10px' }}>
              <div style={{ boxSizing: 'border-box', color: '#191D18', flexShrink: '0', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '175%', width: '84px' }}>
                小尺寸、盲看
              </div>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '13px', lineHeight: '175%' }}>
                没做小尺寸，没盲看；石色对雾薄荷只有 1.85，色弱下分不分得开没验证（第 106 条）。
              </div>
            </div>
            <div style={{ boxSizing: 'border-box', display: 'flex', gap: '16px', paddingBlock: '10px' }}>
              <div style={{ boxSizing: 'border-box', color: '#191D18', flexShrink: '0', fontFamily: '"PingFangSC-Semibold", "PingFang SC", system-ui, sans-serif', fontSize: '13px', fontWeight: 600, lineHeight: '175%', width: '84px' }}>
                kelp.svg
              </div>
              <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '13px', lineHeight: '175%' }}>
                原语巨藻 illustration/kelp.svg 已照第 114 条换成这件的画法（09 页）；64px 用 kelp-small.svg。
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ alignItems: 'center', borderTopColor: '#E3E8DF', borderTopStyle: 'solid', borderTopWidth: '1px', boxSizing: 'border-box', display: 'flex', flexShrink: '0', justifyContent: 'space-between', paddingTop: '16px' }}>
        <div style={{ boxSizing: 'border-box', color: '#60665C', fontFamily: '"PingFangSC-Regular", "PingFang SC", system-ui, sans-serif', fontSize: '12px', lineHeight: '16px' }}>
          出处：BRAND.md §1.5、§3.4 · 第 106、107、109–114 条 · 文件 mascot/objects/*.svg、mascot/objects/README.md
        </div>
        <div style={{ boxSizing: 'border-box', color: '#191D18', fontFamily: '"Inter", system-ui, sans-serif', fontSize: '13px', fontWeight: 500, lineHeight: '16px' }}>
          09b
        </div>
      </div>
    </div>
  )
