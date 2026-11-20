import type {
  AdminActionLog,
  Appeal,
  AppData,
  Complaint,
  ComplaintCategory,
  Notification,
  ReputationEvent,
  ReputationEventType,
} from '../types'
import { uid } from '../utils'
import {
  INITIAL_REPUTATION,
  levelOf,
  MONTHLY_REWARD_CAP,
  monthKey,
  permissionsOf,
  REPUTATION_MAX,
  REPUTATION_MIN,
  scoreFromEvents,
} from './reputation'

export interface OpResult<T = undefined> {
  ok: boolean
  message: string
  next: AppData
  data?: T
}

const fail = <T,>(message: string, data: AppData): OpResult<T> => ({ ok: false, message, next: data })
const done = <T,>(message: string, data: AppData, payload?: T): OpResult<T> => ({ ok: true, message, next: data, data: payload })

const now = () => new Date().toISOString()

/** 模拟管理员身份（演示用，不对应任何真实账号） */
export const ADMIN_ID = 'admin-demo'
export const ADMIN_NAME = '平台管理员（模拟）'

/** 投诉类型 → 扣分规则 */
export const complaintCategoryMeta: Record<ComplaintCategory, {
  label: string
  description: string
  eventType: ReputationEventType
  minDeduction: number
  maxDeduction: number
  defaultDeduction: number
}> = {
  owner_cancel: {
    label: '车主无故取消已成团车次',
    description: '车次已成团后车主无正当理由取消订单。',
    eventType: 'owner_cancel',
    minDeduction: 10,
    maxDeduction: 10,
    defaultDeduction: 10,
  },
  owner_delay: {
    label: '车主无合理说明延迟发货',
    description: '已完成到货检查后，车主没有合理说明就延迟发货。',
    eventType: 'owner_delay',
    minDeduction: 5,
    maxDeduction: 5,
    defaultDeduction: 5,
  },
  rider_quit: {
    label: '车员擅自退出已成团车次',
    description: '成团后车员未说明理由就退出，或退出后不配合履约。',
    eventType: 'rider_quit',
    minDeduction: 5,
    maxDeduction: 5,
    defaultDeduction: 5,
  },
  fake_logistics: {
    label: '提供虚假物流信息',
    description: '物流公司、单号或发货状态与实际情况不符。',
    eventType: 'fake_logistics',
    minDeduction: 15,
    maxDeduction: 15,
    defaultDeduction: 15,
  },
  fraud: {
    label: '严重欺诈 / 恶意骚扰',
    description: '根据具体违规类型扣除 20–40 分。',
    eventType: 'fraud',
    minDeduction: 20,
    maxDeduction: 40,
    defaultDeduction: 20,
  },
  other: {
    label: '其他违规行为',
    description: '由管理员根据具体违规类型酌情认定（1–40 分）。',
    eventType: 'other_violation',
    minDeduction: 1,
    maxDeduction: 40,
    defaultDeduction: 10,
  },
}

/** 信誉事件类型的展示文案 */
export const reputationEventText: Record<ReputationEventType, string> = {
  owner_complete: '完成整车履约',
  rider_complete: '完成一次拼车',
  owner_cancel: '车主无故取消成团车次',
  owner_delay: '车主延迟发货',
  rider_quit: '车员擅自退出成团车次',
  fake_logistics: '提供虚假物流信息',
  fraud: '严重违规（欺诈 / 骚扰）',
  other_violation: '其他违规行为',
}

/** 是否为加分类型 */
export function isRewardType(type: ReputationEventType) {
  return type === 'owner_complete' || type === 'rider_complete'
}

function makeNotification(
  userId: string,
  type: Notification['type'],
  title: string,
  content: string,
  carpoolId: string,
  createdAt: string,
): Notification {
  return { id: uid('noti'), userId, type, title, content, carpoolId, createdAt, read: false }
}

function makeAdminLog(
  action: string,
  targetType: AdminActionLog['targetType'],
  targetId: string,
  detail: string,
  createdAt: string,
): AdminActionLog {
  return { id: uid('adminlog'), adminId: ADMIN_ID, action, targetType, targetId, detail, createdAt }
}

/**
 * 同步用户信誉档案：分数始终由有效事件推导，保证 0–100 且与记录一致。
 */
export function syncReputation(data: AppData, userId: string, at?: string): AppData {
  const score = scoreFromEvents(data.reputationEvents, userId)
  const level = levelOf(score)
  const updatedAt = at ?? new Date().toISOString()
  const existing = data.reputations.find((item) => item.userId === userId)
  const record = { userId, score, level, updatedAt }
  return {
    ...data,
    reputations: existing
      ? data.reputations.map((item) => (item.userId === userId ? record : item))
      : [...data.reputations, record],
  }
}

export interface EventInput {
  userId: string
  carId: string
  eventType: ReputationEventType
  /** 期望的分数变化 */
  scoreChange: number
  reason: string
  complaintId?: string
  appealId?: string
  at?: string
}

export interface EventResult {
  data: AppData
  event: ReputationEvent
  /** 实际生效的分数变化 */
  applied: number
  /** 是否因为重复事件而跳过 */
  skipped: boolean
}

/**
 * 权限校验：发起拼车（信誉分需 ≥ 70）。
 * 权限不是「隐藏按钮」，而是真正拦截业务操作。
 */
export function checkCreatePermission(data: AppData, userId: string) {
  const permissions = permissionsOf(scoreFromEvents(data.reputationEvents, userId))
  return {
    ok: permissions.canCreate,
    message: permissions.canCreate ? '' : permissions.reason,
    permissions,
  }
}

/**
 * 权限校验：加入拼车（信誉分需 ≥ 60）。
 */
export function checkJoinPermission(data: AppData, userId: string, carpoolId: string) {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return { ok: false, message: '没有找到这辆拼车，请返回广场重试。', permissions: null }
  if (carpool.status !== 'recruiting') {
    return { ok: false, message: '这辆拼车已经停止招募。', permissions: null }
  }
  if (carpool.ownerId === userId) return { ok: false, message: '车主不能加入自己发起的拼车。', permissions: null }
  const permissions = permissionsOf(scoreFromEvents(data.reputationEvents, userId))
  return {
    ok: permissions.canJoin,
    message: permissions.canJoin ? '' : permissions.reason,
    permissions,
  }
}

/**
 * V1.3-A.1 购买权限校验：首次购买与加购走完全相同的规则。
 * - 招募中 / 待确认成团：允许购买剩余份额（待确认成团时确认成团会重新校验成团条件）
 * - 已成团 / 已下单 / 已关闭：禁止新增购买
 * - 信誉分需 ≥ 60，车主为自己购买份额同样受限，限制无法绕过
 */
export function checkPurchasePermission(data: AppData, userId: string, carpoolId: string) {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return { ok: false, message: '没有找到这辆拼车，请返回广场重试。', permissions: null }
  if (carpool.status !== 'recruiting') {
    const reason = carpool.status === 'cut'
      ? '这辆拼车已经截团，不能再购买份额。'
      : carpool.status === 'purchasing'
        ? '这辆拼车已经进入采购履约阶段，不能再购买份额。'
        : carpool.status === 'failed'
          ? '这辆拼车已经流团，不能再购买份额。'
          : carpool.status === 'expired'
            ? '这辆拼车的招募截止时间已到，正在等待车主处理，暂时不能购买份额。'
            : '这辆拼车已经结束，不能再购买份额。'
    return { ok: false, message: reason, permissions: null }
  }
  const permissions = permissionsOf(scoreFromEvents(data.reputationEvents, userId))
  if (!permissions.canJoin) {
    return {
      ok: false,
      message: permissions.reason,
      permissions,
    }
  }
  return { ok: true, message: '', permissions }
}

/**
 * 记录一次信誉分变动。
 * - 同一车次同一用户同一类型只会产生一次记录（含已撤销记录，避免重复加减分）
 * - 正常履约奖励每个自然月最多累计 +5 分
 * - 信誉分始终保持在 0–100
 */
export function recordReputationEvent(data: AppData, input: EventInput): EventResult {
  const at = input.at ?? now()
  const existing = data.reputationEvents.find((event) =>
    event.userId === input.userId
    && event.carId === input.carId
    && event.eventType === input.eventType)
  if (existing) {
    return { data, event: existing, applied: 0, skipped: true }
  }

  const currentScore = scoreFromEvents(data.reputationEvents, input.userId)
  let applied = input.scoreChange
  let reason = input.reason

  if (applied > 0) {
    const monthlyUsed = data.reputationEvents
      .filter((event) => event.userId === input.userId && event.scoreChange > 0 && monthKey(event.createdAt) === monthKey(at))
      .reduce((total, event) => total + event.scoreChange, 0)
    const monthlyLeft = Math.max(0, MONTHLY_REWARD_CAP - monthlyUsed)
    const roomLeft = Math.max(0, REPUTATION_MAX - currentScore)
    applied = Math.min(applied, monthlyLeft, roomLeft)
    if (applied < input.scoreChange) {
      if (monthlyLeft <= 0) reason = `${input.reason}（本月履约奖励已达上限 +${MONTHLY_REWARD_CAP} 分，本次未加分）`
      else if (roomLeft <= 0) reason = `${input.reason}（信誉分已达上限 ${REPUTATION_MAX} 分，本次未加分）`
      else reason = `${input.reason}（受本月 +${MONTHLY_REWARD_CAP} 分上限限制，本次实际加分 ${applied} 分）`
    }
  } else {
    applied = Math.max(applied, REPUTATION_MIN - currentScore)
  }

  const event: ReputationEvent = {
    id: uid('repevent'),
    userId: input.userId,
    carId: input.carId,
    eventType: input.eventType,
    scoreChange: applied,
    reason,
    createdAt: at,
    status: 'active',
    complaintId: input.complaintId,
    appealId: input.appealId,
  }

  const next = syncReputation({
    ...data,
    reputationEvents: [...data.reputationEvents, event],
  }, input.userId, at)

  return { data: next, event, applied, skipped: false }
}

// ---------------------------------------------------------------------------
// 履约完成（演示专用操作：不把「车主点击已发货」当作交易完成）
// ---------------------------------------------------------------------------

/**
 * 车员确认收货并完成本次拼车履约 → 信誉分 +1。
 */
export function completeRiderOrderOp(data: AppData, userId: string, carpoolId: string, at?: string): OpResult<ReputationEvent> {
  const timestamp = at ?? now()
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  // 车主自留的份额不算车员，不能领取车员履约奖励
  const isRider = carpool.positions.some((slot) => slot.occupantId === userId && slot.occupantId !== carpool.ownerId)
  if (!isRider) return fail('只有本车车员可以确认收货。', data)

  // 同一车员在同一车次可能有多笔订单（例如额外承接空位），需要一起完成
  const myOrders = data.orders.filter((item) => item.carpoolId === carpoolId && item.userId === userId)
  if (!myOrders.length) return fail('没有找到你在本车的订单。', data)
  if (myOrders.every((item) => item.fulfillmentStatus === 'completed')) {
    return fail('这些订单已经完成履约，信誉奖励不会重复发放。', data)
  }

  const domestic = data.domesticShipments.find((item) => item.carpoolId === carpoolId && item.userId === userId)
  if (!domestic || (domestic.status !== 'shipped' && domestic.status !== 'received')) {
    return fail('车主发货之后才能确认收货，暂不能完成履约。', data)
  }

  const recorded = recordReputationEvent(data, {
    userId,
    carId: carpoolId,
    eventType: 'rider_complete',
    scoreChange: 1,
    reason: '正常完成一次拼车履约',
    at: timestamp,
  })
  if (recorded.skipped) {
    return fail('该车次的履约奖励已经结算过，不会重复加分。', data)
  }

  const next: AppData = {
    ...recorded.data,
    orders: recorded.data.orders.map((item) => (
      item.carpoolId === carpoolId && item.userId === userId && item.fulfillmentStatus !== 'completed'
        ? { ...item, fulfillmentStatus: 'completed' as const, fulfilledAt: timestamp }
        : item
    )),
  }
  const score = scoreFromEvents(next.reputationEvents, userId)
  return done(
    `已确认收货，履约完成，信誉分 +${recorded.applied || 0}（当前 ${score} 分）。`,
    next,
    recorded.event,
  )
}

/**
 * 车主确认整车履约完成（需所有车员都已确认收货）→ 信誉分 +2。
 */
export function completeOwnerFulfillmentOp(data: AppData, ownerId: string, carpoolId: string, at?: string): OpResult<ReputationEvent> {
  const timestamp = at ?? now()
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以确认整车履约完成。', data)
  if (carpool.fulfilledAt) return fail('本车已经完成履约，信誉奖励不会重复发放。', data)
  if (carpool.status === 'recruiting') {
    return fail('车次还没有截团，暂时不能确认履约完成。', data)
  }

  const riderOrders = data.orders.filter((order) => order.carpoolId === carpoolId && order.userId !== ownerId)
  const pending = riderOrders.filter((order) => order.fulfillmentStatus !== 'completed')
  if (pending.length) {
    return fail(`还有 ${pending.length} 位车员没有确认收货，暂时不能确认整车履约完成。`, data)
  }

  const recorded = recordReputationEvent(data, {
    userId: ownerId,
    carId: carpoolId,
    eventType: 'owner_complete',
    scoreChange: 2,
    reason: '完成一辆车的全部履约流程',
    at: timestamp,
  })
  if (recorded.skipped) {
    return fail('该车次的履约奖励已经结算过，不会重复加分。', data)
  }

  const next: AppData = {
    ...recorded.data,
    carpools: recorded.data.carpools.map((item) => (
      item.id === carpoolId ? { ...item, fulfilledAt: timestamp } : item
    )),
  }
  const score = scoreFromEvents(next.reputationEvents, ownerId)
  return done(
    `本车履约已完成，信誉分 +${recorded.applied || 0}（当前 ${score} 分）。`,
    next,
    recorded.event,
  )
}

// ---------------------------------------------------------------------------
// 投诉
// ---------------------------------------------------------------------------

export interface ComplaintInput {
  carId: string
  targetUserId: string
  category: ComplaintCategory
  description: string
}

/**
 * 提交投诉：投诉进入「待审核」，提交时不会立即扣分。
 */
export function submitComplaintOp(data: AppData, reporterId: string, input: ComplaintInput, at?: string): OpResult<Complaint> {
  const timestamp = at ?? now()
  const carpool = data.carpools.find((item) => item.id === input.carId)
  if (!carpool) return fail('没有找到关联的拼车车次。', data)

  const isMember = carpool.ownerId === reporterId || carpool.positions.some((slot) => slot.occupantId === reporterId)
  if (!isMember) return fail('只有本车成员可以针对这辆车提交投诉。', data)
  if (input.targetUserId === reporterId) return fail('不能投诉自己。', data)

  const targetIsMember = carpool.ownerId === input.targetUserId
    || carpool.positions.some((slot) => slot.occupantId === input.targetUserId)
  if (!targetIsMember) return fail('被投诉人不是本车成员。', data)

  const description = input.description.trim()
  if (description.length < 10) return fail('请至少用 10 个字说明具体问题。', data)

  const duplicated = data.complaints.some((complaint) =>
    complaint.reporterId === reporterId
    && complaint.targetUserId === input.targetUserId
    && complaint.carId === input.carId
    && complaint.status === 'pending')
  if (duplicated) return fail('你已经提交过针对该成员的投诉，正在等待管理员审核。', data)

  const complaint: Complaint = {
    id: uid('complaint'),
    reporterId,
    targetUserId: input.targetUserId,
    carId: input.carId,
    category: input.category,
    description,
    status: 'pending',
    createdAt: timestamp,
  }

  const next: AppData = {
    ...data,
    complaints: [complaint, ...data.complaints],
    notifications: [
      makeNotification(
        reporterId,
        'complaint_result',
        '投诉已提交',
        `你针对「${carpool.title}」提交的投诉已进入待审核状态，管理员核实前不会影响任何人的信誉分。`,
        input.carId,
        timestamp,
      ),
      ...data.notifications,
    ],
  }
  return done('投诉已提交，管理员核实后才会处理。', next, complaint)
}

export interface ComplaintDecision {
  /** 确认违规时的扣分数值 */
  deduction?: number
  /** 处理原因 / 审核备注 */
  note?: string
}

/**
 * 管理员处理投诉：确认违规才会扣分，驳回不改变任何信誉分。
 */
export function reviewComplaintOp(
  data: AppData,
  complaintId: string,
  decision: 'confirm' | 'reject',
  input: ComplaintDecision = {},
  at?: string,
): OpResult {
  const timestamp = at ?? now()
  const complaint = data.complaints.find((item) => item.id === complaintId)
  if (!complaint) return fail('没有找到这条投诉。', data)
  if (complaint.status !== 'pending') return fail('这条投诉已经处理过了。', data)

  const carpool = data.carpools.find((item) => item.id === complaint.carId)
  const title = carpool?.title ?? '相关车次'
  const meta = complaintCategoryMeta[complaint.category]

  if (decision === 'reject') {
    const note = input.note?.trim() || '经核实未发现违规行为。'
    const next: AppData = {
      ...data,
      complaints: data.complaints.map((item) => (item.id === complaintId
        ? { ...item, status: 'rejected' as const, reviewedAt: timestamp, reviewNote: note }
        : item)),
      notifications: [
        makeNotification(
          complaint.reporterId,
          'complaint_result',
          '投诉未成立',
          `你对「${title}」的投诉经核实未成立：${note}`,
          complaint.carId,
          timestamp,
        ),
        ...data.notifications,
      ],
      adminLogs: [
        makeAdminLog('驳回投诉', 'complaint', complaintId, `投诉「${meta.label}」未成立：${note}`, timestamp),
        ...data.adminLogs,
      ],
    }
    return done('投诉已驳回，相关用户的信誉分没有变化。', next)
  }

  const requested = Math.round(input.deduction ?? meta.defaultDeduction)
  const deduction = Math.max(meta.minDeduction, Math.min(meta.maxDeduction, requested))
  const note = input.note?.trim() || `核实后确认存在「${meta.label}」。`

  const recorded = recordReputationEvent(data, {
    userId: complaint.targetUserId,
    carId: complaint.carId,
    eventType: meta.eventType,
    scoreChange: -deduction,
    reason: note,
    complaintId: complaint.id,
    at: timestamp,
  })

  if (recorded.skipped) {
    // 同一违规事件只扣分一次：更新投诉状态但不再次扣分
    const next: AppData = {
      ...recorded.data,
      complaints: recorded.data.complaints.map((item) => (item.id === complaintId
        ? {
            ...item,
            status: 'confirmed' as const,
            reviewedAt: timestamp,
            reviewNote: `${note}（该违规事件此前已扣分，本次未重复扣分）`,
            deduction: 0,
          }
        : item)),
      notifications: [
        makeNotification(
          complaint.reporterId,
          'complaint_result',
          '投诉已核实成立',
          `你对「${title}」的投诉经核实成立，处理结果已记录。`,
          complaint.carId,
          timestamp,
        ),
        ...recorded.data.notifications,
      ],
      adminLogs: [
        makeAdminLog('确认违规（未重复扣分）', 'complaint', complaintId, `${meta.label} 此前已处理，未重复扣分。`, timestamp),
        ...recorded.data.adminLogs,
      ],
    }
    return done('该违规事件此前已扣分，本次没有重复扣分。', next)
  }

  const score = scoreFromEvents(recorded.data.reputationEvents, complaint.targetUserId)
  const actualDeduction = Math.abs(recorded.applied)
  const next: AppData = {
    ...recorded.data,
    complaints: recorded.data.complaints.map((item) => (item.id === complaintId
      ? {
          ...item,
          status: 'confirmed' as const,
          reviewedAt: timestamp,
          reviewNote: note,
          deduction: actualDeduction,
        }
      : item)),
    notifications: [
      makeNotification(
        complaint.targetUserId,
        'reputation_penalty',
        '信誉分扣分通知',
        `你在「${title}」中被核实存在「${meta.label}」，信誉分扣除 ${actualDeduction} 分，当前 ${score} 分。处理原因：${note}。如有异议可在「我的信誉」中提交申诉。`,
        complaint.carId,
        timestamp,
      ),
      makeNotification(
        complaint.reporterId,
        'complaint_result',
        '投诉已核实成立',
        `你对「${title}」的投诉经核实成立，平台已按规则处理。`,
        complaint.carId,
        timestamp,
      ),
      ...recorded.data.notifications,
    ],
    adminLogs: [
      makeAdminLog('确认违规并扣分', 'complaint', complaintId, `${meta.label}：扣 ${actualDeduction} 分。${note}`, timestamp),
      ...recorded.data.adminLogs,
    ],
  }
  return done(`违规已确认，已扣除 ${actualDeduction} 分，当前信誉分 ${score} 分。`, next)
}

// ---------------------------------------------------------------------------
// 申诉
// ---------------------------------------------------------------------------

/**
 * 针对扣分记录提交申诉：提交时不会立即恢复分数，等待管理员审核。
 */
export function submitAppealOp(data: AppData, userId: string, reputationEventId: string, reason: string, at?: string): OpResult<Appeal> {
  const timestamp = at ?? now()
  const event = data.reputationEvents.find((item) => item.id === reputationEventId)
  if (!event) return fail('没有找到对应的扣分记录。', data)
  if (event.userId !== userId) return fail('只能对自己的扣分记录提交申诉。', data)
  if (event.status === 'revoked') return fail('该扣分记录已经撤销，无需再次申诉。', data)
  if (event.scoreChange >= 0) return fail('只有被扣分的记录才能提交申诉。', data)

  const duplicated = data.appeals.some((appeal) => appeal.reputationEventId === reputationEventId)
  if (duplicated) return fail('该扣分记录已经提交过申诉，正在等待管理员审核。', data)

  const text = reason.trim()
  if (text.length < 10) return fail('请至少用 10 个字说明申诉理由。', data)

  const appeal: Appeal = {
    id: uid('appeal'),
    reputationEventId,
    userId,
    reason: text,
    status: 'pending',
    createdAt: timestamp,
  }

  const next: AppData = {
    ...data,
    appeals: [appeal, ...data.appeals],
    notifications: [
      makeNotification(
        userId,
        'appeal_result',
        '申诉已提交',
        '你的申诉已进入待审核状态，管理员审核通过后系统会自动撤销扣分并重新计算信誉分。',
        event.carId,
        timestamp,
      ),
      ...data.notifications,
    ],
    adminLogs: [
      makeAdminLog('提交申诉', 'appeal', appeal.id, `针对扣分记录 ${event.id}（${event.scoreChange} 分）提交申诉。`, timestamp),
      ...data.adminLogs,
    ],
  }
  return done('申诉已提交，等待管理员审核。', next, appeal)
}

/**
 * 管理员审核申诉：通过则撤销扣分并重新计算信誉分与权限（不会重复恢复）。
 */
export function reviewAppealOp(
  data: AppData,
  appealId: string,
  decision: 'approve' | 'reject',
  note = '',
  at?: string,
): OpResult {
  const timestamp = at ?? now()
  const appeal = data.appeals.find((item) => item.id === appealId)
  if (!appeal) return fail('没有找到这条申诉。', data)
  if (appeal.status !== 'pending') return fail('这条申诉已经处理过了。', data)

  const event = data.reputationEvents.find((item) => item.id === appeal.reputationEventId)
  if (!event) return fail('申诉对应的扣分记录不存在。', data)

  const carpool = data.carpools.find((item) => item.id === event.carId)
  const title = carpool?.title ?? '相关车次'

  if (decision === 'reject') {
    const reviewNote = note.trim() || '经核实，原扣分记录成立，申诉未通过。'
    const next: AppData = {
      ...data,
      appeals: data.appeals.map((item) => (item.id === appealId
        ? { ...item, status: 'rejected' as const, reviewedAt: timestamp, reviewNote }
        : item)),
      notifications: [
        makeNotification(
          appeal.userId,
          'appeal_result',
          '申诉未通过',
          `你针对「${title}」的申诉未通过：${reviewNote}`,
          event.carId,
          timestamp,
        ),
        ...data.notifications,
      ],
      adminLogs: [
        makeAdminLog('驳回申诉', 'appeal', appealId, reviewNote, timestamp),
        ...data.adminLogs,
      ],
    }
    return done('申诉已驳回，扣分记录保持生效。', next)
  }

  if (event.status === 'revoked') {
    return fail('该扣分记录已经撤销，不会重复恢复信誉分。', data)
  }

  const reviewNote = note.trim() || '经核实，申诉理由成立，撤销本次扣分。'
  const withRevoked: AppData = {
    ...data,
    reputationEvents: data.reputationEvents.map((item) => (item.id === event.id
      ? { ...item, status: 'revoked' as const, revokedAt: timestamp, appealId: appeal.id, reviewNote }
      : item)),
  }
  const next = syncReputation({
    ...withRevoked,
    appeals: withRevoked.appeals.map((item) => (item.id === appealId
      ? { ...item, status: 'approved' as const, reviewedAt: timestamp, reviewNote }
      : item)),
    notifications: [
      makeNotification(
        appeal.userId,
        'appeal_result',
        '申诉已通过',
        `你针对「${title}」的申诉已通过，${Math.abs(event.scoreChange)} 分扣分已撤销，系统已重新计算你的信誉分与可用权限。`,
        event.carId,
        timestamp,
      ),
      ...withRevoked.notifications,
    ],
    adminLogs: [
      makeAdminLog('通过申诉并撤销扣分', 'appeal', appealId, `${reviewNote}（恢复 ${Math.abs(event.scoreChange)} 分）`, timestamp),
      ...withRevoked.adminLogs,
    ],
  }, appeal.userId, timestamp)

  const score = scoreFromEvents(next.reputationEvents, appeal.userId)
  return done(`申诉已通过，扣分已撤销，当前信誉分 ${score} 分。`, next)
}
