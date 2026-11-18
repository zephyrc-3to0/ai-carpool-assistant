import type { AppData, ReputationEvent, ReputationLevel, UserReputation } from '../types'

/** V1.2 信誉规则常量 */
export const REPUTATION_MAX = 100
export const REPUTATION_MIN = 0
export const INITIAL_REPUTATION = 100
/** 正常履约奖励每个自然月最多累计加分 */
export const MONTHLY_REWARD_CAP = 5

export interface ReputationLevelMeta {
  label: string
  /** 徽标配色 */
  badge: string
  /** 等级说明 */
  description: string
  /** 该等级下的可用权限说明 */
  permissions: string[]
}

export const levelMeta: Record<ReputationLevel, ReputationLevelMeta> = {
  excellent: {
    label: '信誉优秀',
    badge: 'border-success/20 bg-successSoft text-success',
    description: '信誉分 90–100，可正常使用全部拼车功能。',
    permissions: ['可发起拼车', '可加入拼车', '可处理已有订单与物流'],
  },
  good: {
    label: '信誉良好',
    badge: 'border-primary/20 bg-purple-50 text-primaryDark',
    description: '信誉分 70–89，功能不受限制，但会显示信誉提醒，请按时完成履约。',
    permissions: ['可发起拼车', '可加入拼车', '可处理已有订单与物流'],
  },
  caution: {
    label: '信誉观察',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    description: '信誉分 60–69，可以加入拼车，但不能发起新的拼车。',
    permissions: ['不可发起拼车', '可加入拼车', '可处理已有订单与物流'],
  },
  restricted: {
    label: '信誉受限',
    badge: 'border-danger/20 bg-dangerSoft text-danger',
    description: '信誉分 0–59，暂时不能加入或发起新拼车，已有订单仍可正常处理。',
    permissions: ['不可发起拼车', '不可加入拼车', '可处理已有订单与物流', '可提交申诉'],
  },
}

/** 按分数计算信誉等级 */
export function levelOf(score: number): ReputationLevel {
  if (score >= 90) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 60) return 'caution'
  return 'restricted'
}

export interface ReputationPermissions {
  score: number
  level: ReputationLevel
  canCreate: boolean
  canJoin: boolean
  /** 存在限制时的说明 */
  reason: string
  /** 提示语 */
  hint: string
}

/**
 * 权限规则：
 * 90–100 正常使用全部功能；70–89 正常使用（显示提醒）；
 * 60–69 允许加入、禁止发起；0–59 禁止加入与发起。
 */
export function permissionsOf(score: number): ReputationPermissions {
  const level = levelOf(score)
  if (level === 'excellent') {
    return { score, level, canCreate: true, canJoin: true, reason: '', hint: '信誉状态良好，可正常使用全部拼车功能。' }
  }
  if (level === 'good') {
    return { score, level, canCreate: true, canJoin: true, reason: '', hint: '信誉良好，请按时完成履约，避免扣分。' }
  }
  if (level === 'caution') {
    return {
      score,
      level,
      canCreate: false,
      canJoin: true,
      reason: `信誉分 ${score} 低于 70，暂时无法发起新的拼车，你仍然可以加入拼车并处理已有订单。`,
      hint: '完成履约可以恢复信誉分，扣分原因可以在「我的信誉」中查看并申诉。',
    }
  }
  return {
    score,
    level,
    canCreate: false,
    canJoin: false,
    reason: `信誉分 ${score} 低于 60，暂时无法加入或发起新的拼车，已有订单、群聊与物流仍可正常处理。`,
    hint: '完成履约可以恢复信誉分，扣分原因可以在「我的信誉」中查看并申诉。',
  }
}

/** 自然月标识，例如 2026-11 */
export function monthKey(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** 根据有效事件计算信誉分（撤销的记录不计入） */
export function scoreFromEvents(events: ReputationEvent[], userId: string) {
  const sum = events
    .filter((event) => event.userId === userId && event.status === 'active')
    .reduce((total, event) => total + event.scoreChange, 0)
  return Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, INITIAL_REPUTATION + sum))
}

/** 取用户信誉档案（老数据没有档案时按初始分兜底） */
export function reputationOf(data: AppData, userId: string): UserReputation {
  const existing = data.reputations.find((item) => item.userId === userId)
  if (existing) return existing
  return {
    userId,
    score: scoreFromEvents(data.reputationEvents ?? [], userId),
    level: levelOf(scoreFromEvents(data.reputationEvents ?? [], userId)),
    updatedAt: data.reputationEvents?.[0]?.createdAt ?? '',
  }
}

/** 用户是否存在已完成的履约记录 */
export function hasFulfillmentRecord(data: AppData, userId: string) {
  const owned = data.carpools.some((carpool) => carpool.ownerId === userId && carpool.fulfilledAt)
  const joined = data.orders.some((order) => order.userId === userId && order.fulfillmentStatus === 'completed')
  return owned || joined
}

/** 已完成发车次数（作为车主完成整车履约） */
export function completedOwnerCount(data: AppData, userId: string) {
  return data.carpools.filter((carpool) => carpool.ownerId === userId && carpool.fulfilledAt).length
}

/** 已完成参团次数（作为车员完成订单履约） */
export function completedRiderCount(data: AppData, userId: string) {
  return data.orders.filter((order) => order.userId === userId && order.fulfillmentStatus === 'completed').length
}

/** 车次中的成员（车主 + 车员，去重） */
export function memberIdsOf(data: AppData, carpoolId: string) {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return [] as string[]
  const ids = new Set<string>()
  if (carpool.ownerId) ids.add(carpool.ownerId)
  carpool.positions.forEach((slot) => {
    if (slot.occupantId) ids.add(slot.occupantId)
  })
  return [...ids]
}

/** 车员（不含车主） */
export function riderIdsOfCarpool(data: AppData, carpoolId: string) {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return [] as string[]
  const ids = new Set<string>()
  carpool.positions.forEach((slot) => {
    if (slot.occupantId && slot.occupantId !== carpool.ownerId) ids.add(slot.occupantId)
  })
  return [...ids]
}
