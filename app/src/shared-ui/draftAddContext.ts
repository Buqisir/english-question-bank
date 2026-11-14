/**
 * 加入键（DraftAddButton）用的两件事：加入、撤回。由 App 提供（它管着题组列表上的草稿卷状态），
 * 各处的加入键从这里拿，不再一层层往下传 onAdd。
 */
import { createContext } from 'react'

/** 加入成功后服务器给回的凭据。撤回靠它找到刚加的那一条；itemId 为 null 时撤不了，键上不出「撤回」。 */
export type DraftAddReceipt = {
  groupId: string
  draftPaperId: string
  itemId: string | null
}

export type DraftAddActions = {
  /** 把题组加入当前草稿卷。失败时抛出，错误原话由加入键照登。 */
  add: (groupId: string) => Promise<DraftAddReceipt>
  /** 把刚加的那一条从草稿卷移除。失败时抛出，错误原话由加入键照登。 */
  undo: (receipt: DraftAddReceipt) => Promise<void>
}

export const DraftAddContext = createContext<DraftAddActions | null>(null)
