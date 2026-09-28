import type { PersonalLayerSaveStatus } from '../../../../../shared/personal-paper-layer/index.mjs'
import type { PersonalAnnotationsApi } from './usePersonalAnnotations'

const STATUS_TEXT: Record<PersonalLayerSaveStatus, string> = {
  loading: '批注加载中…',
  unavailable: '批注暂时不可用',
  saved: '批注已保存',
  dirty: '批注待保存',
  saving: '正在保存批注…',
  offline: '已离线，批注先存在这台设备',
  failed: '批注保存失败，稍后自动重试',
  conflict: '批注在别处有更新',
  'auth-paused': '登录已过期，批注暂未保存',
  'stale-source': '卷子内容已更新，批注暂未同步',
  rejected: '有批注未被接受，请刷新后重试',
}

const QUIET: ReadonlySet<PersonalLayerSaveStatus> = new Set(['saved'])

function ConflictCard({ api }: { api: PersonalAnnotationsApi }) {
  return (
    <div className="paper-personal-conflict" role="alertdialog" aria-label="批注冲突">
      <p>这张卷的批注在别处更新过。选择一个版本继续，另一份不会自动合并。</p>
      <div className="paper-personal-conflict__actions">
        <button type="button" onClick={() => api.session?.resolveConflict('keep-server')}>
          保留已保存的版本
        </button>
        <button type="button" onClick={() => api.session?.resolveConflict('reapply-local')}>
          重新应用本机修改
        </button>
      </div>
    </div>
  )
}

/* Save state of the personal layer, in the topbar actions slot. */
export function PersonalSaveStatus({ api }: { api: PersonalAnnotationsApi }) {
  const status = api.snapshot?.status
  const notice = api.notice

  if (!api.active || !status) return null
  return (
    <>
      <span
        className={`paper-personal-status${QUIET.has(status) ? ' is-quiet' : ''}`}
        role="status"
      >
        {STATUS_TEXT[status]}
      </span>
      {notice ? (
        <span className="paper-personal-notice" role="alert">{notice}</span>
      ) : null}
      {status === 'conflict' ? <ConflictCard api={api} /> : null}
    </>
  )
}
