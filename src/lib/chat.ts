/**
 * V2.0 群聊相关的派生查询：访问权限与未读消息统计。
 * 群聊是拼车的附属功能，成员资格完全依据拼车参与关系。
 */
import type { AppData, Chat } from '../types'

/** 当前账号是否有权访问该群聊 */
export function canAccessChat(data: AppData, chat: Chat, userId: string) {
  const carpool = data.carpools.find((item) => item.id === chat.carpoolId)
  if (!carpool) return false
  if (carpool.ownerId === userId) return true
  return carpool.positions.some((slot) => slot.occupantId === userId)
}

/**
 * 未读消息数量。
 * 只有在存在可靠已读记录时才返回数值，否则返回 null（界面不展示未读数）。
 */
export function unreadCountOf(chat: Chat, userId: string) {
  const lastReadAt = chat.reads?.[userId]
  if (!lastReadAt) return null
  const since = new Date(lastReadAt).getTime()
  if (Number.isNaN(since)) return null
  return chat.messages.filter(
    (message) => message.userId !== userId && new Date(message.sentAt).getTime() > since,
  ).length
}
