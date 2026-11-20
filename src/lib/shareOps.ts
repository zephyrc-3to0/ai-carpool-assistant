/**
 * V1.3-A 商品与份额管理的纯状态迁移函数。
 *
 * 与 logisticsOps / reputationOps 保持一致：不依赖 React，可以直接单元测试。
 * 所有操作都返回新的 AppData，由 store 负责持久化。
 */
import type {
  AppData,
  Carpool,
  Chat,
  PaymentRecord,
  FeeRules,
  Notification,
  Order,
  OwnerPurchase,
  PendingRuleChange,
  PositionSlot,
  PurchaseGuarantees,
  PurchaseMode,
  ShareGroup,
  SlotReservation,
} from '../types'
import {
  RESERVATION_TTL,
  buildFeeSnapshot,
  buildItemSnapshot,
  buildRulesSnapshot,
  isReservationAlive,
  riderIdsOf,
} from './share'
import { cutCarpoolOp, ensureParticipation, recruitmentStateOf, validOccupancyOf } from './recruitOps'
import { validateActivityProductLimits } from './purchaseRules'
import { uid } from '../utils'

export interface OpResult<T = undefined> {
  ok: boolean
  message: string
  next: AppData
  data?: T
}

const fail = <T,>(message: string, data: AppData): OpResult<T> => ({ ok: false, message, next: data })
const done = <T,>(message: string, data: AppData, payload?: T): OpResult<T> => ({ ok: true, message, next: data, data: payload })

const now = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// 车次构建
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// V2.0 车次构建（来自活动商品目录）
// ---------------------------------------------------------------------------

export interface OpenItemInput {
  /** 活动商品 ID */
  productId: string
  /** 成员位置（整套凑套） */
  member?: string
  /** 开放份数 */
  quantity: number
  /** 单价（元） */
  price: number
  /** 商品名称 */
  name: string
  /** 规格 */
  spec: string
  /** 商品类别 */
  category: string
}

export interface NewCarpoolInput {
  /** 从草稿发布时用于在成功发布后移除源草稿，不进入车次模型 */
  sourceDraftId?: string
  title: string
  groupId: string
  eventId: string
  description: string
  rules: string
  purchaseMode: PurchaseMode
  /** 开放商品与成员位置 */
  openItems: OpenItemInput[]
  guarantees: PurchaseGuarantees
  fallbackRule: string
  /** 招募截止时间 */
  deadline: string
  /** 整车国际运费总额（元） */
  internationalFreight: number
  /** 普通拼邮：最低成团金额（元） */
  minAmount: number
  /** 普通拼邮：整车国际包裹最大商品件数 */
  maxPackageItems: number
  /** 车主优先自购 */
  ownerHeld: Array<{ productId: string; member?: string; quantity: number }>
}

/**
 * 根据活动商品目录构建 V2.0 车次。
 * - 整套凑套：每个「商品 × 成员位置」是一个开放分组，可开放多份
 * - 普通拼邮：每个商品一个分组，份数上限取整车包裹容量
 */
export function buildV2Carpool(
  ownerId: string,
  input: NewCarpoolInput,
  eventName: string,
): { carpool: Carpool; ownerPurchases: OwnerPurchase[] } {
  const carpoolId = uid('car')
  const timestamp = now()
  const positions: PositionSlot[] = []
  const shareGroups: ShareGroup[] = []
  const bundle = input.purchaseMode === 'bundle'

  input.openItems.forEach((item, groupIndex) => {
    const groupId = `grp-${carpoolId}-${groupIndex}`
    const slotIds: string[] = []
    const copies = bundle ? Math.max(1, item.quantity) : Math.max(1, item.quantity)
    for (let index = 0; index < copies; index += 1) {
      const slotId = uid('slot')
      const label = bundle
        ? (copies > 1 ? `${item.spec} ${item.member} ${index + 1}` : `${item.spec} ${item.member}`)
        : (copies > 1 ? `${item.spec} ${index + 1}` : item.spec)
      positions.push({
        id: slotId,
        label,
        groupId,
        price: item.price,
      })
      slotIds.push(slotId)
    }
    shareGroups.push({
      id: groupId,
      kind: bundle ? 'bundle' : 'product',
      name: bundle ? `${item.spec} ${item.member ?? ''}`.trim() : item.name,
      version: item.spec,
      productId: item.productId,
      member: item.member,
      price: item.price,
      quantity: copies,
      slotIds,
    })
  })

  const basePrice = input.openItems[0]?.price ?? 0
  const carpool: Carpool = {
    id: carpoolId,
    title: input.title,
    eventName,
    productName: input.openItems.map((item) => item.name).filter((value, index, list) => list.indexOf(value) === index).join(' / ') || '拼车商品',
    price: basePrice,
    ownerId,
    deadline: input.deadline,
    description: input.description,
    rules: input.rules,
    status: 'recruiting',
    positions,
    createdAt: timestamp,
    groupId: input.groupId,
    eventId: input.eventId,
    orderDeadline: '',
    internationalFreightCents: Math.round(input.internationalFreight * 100),
    minAmountCents: bundle ? 0 : Math.round(input.minAmount * 100),
    maxPackageItems: bundle ? 0 : Math.max(1, input.maxPackageItems),
    purchaseMode: input.purchaseMode,
    shareGroups,
    guarantees: input.guarantees,
    feeRules: { unitPrice: basePrice, serviceFee: 0, shippingFee: 0 },
    rulesVersion: 1,
    fallbackRule: input.fallbackRule,
    requiresDomesticFee: true,
  }

  // 车主优先自购：确认后直接占位，不产生任何模拟付款
  const ownerPurchases: OwnerPurchase[] = []
  input.ownerHeld.forEach((held) => {
    const group = shareGroups.find((item) => item.productId === held.productId && (item.member ?? undefined) === (held.member ?? undefined))
    if (!group) return
    const count = Math.min(Math.max(0, held.quantity), group.slotIds.length)
    const taken = group.slotIds.slice(0, count)
    if (!taken.length) return
    positions.forEach((slot) => {
      if (taken.includes(slot.id)) slot.occupantId = ownerId
    })
    ownerPurchases.push({
      id: uid('ownbuy'),
      carpoolId,
      productId: held.productId,
      member: held.member,
      quantity: count,
      unitPrice: group.price,
      confirmedAt: timestamp,
    })
  })

  return { carpool, ownerPurchases }
}

// ---------------------------------------------------------------------------
// 库存预留
// ---------------------------------------------------------------------------

/** 清理已经过期的预留，释放库存 */
export function purgeExpiredReservations(data: AppData, at = Date.now()): AppData {
  let changed = false
  const carpools = data.carpools.map((carpool) => {
    let carpoolChanged = false
    const positions = carpool.positions.map((slot) => {
      if (slot.reservation && !isReservationAlive(slot, at)) {
        carpoolChanged = true
        const { reservation: _reservation, ...rest } = slot
        return rest
      }
      return slot
    })
    if (!carpoolChanged) return carpool
    changed = true
    return { ...carpool, positions }
  })
  return changed ? { ...data, carpools } : data
}

export interface ReservationInfo {
  reservationId: string
  slotIds: string[]
  expiresAt: string
}

/**
 * 付款前原子预留库存：
 * - 目标份额必须存在、未被占用、且没有他人有效预留
 * - 同一用户不能重复预留同一份份额
 * - 预留到期后由 purgeExpiredReservations 自动释放
 */
export function reserveSlotsOp(
  data: AppData,
  userId: string,
  carpoolId: string,
  slotIds: string[],
): OpResult<ReservationInfo> {
  const cleaned = purgeExpiredReservations(data)
  const carpool = cleaned.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', cleaned)
  if (carpool.status !== 'recruiting') {
    return fail('这辆拼车已经停止接受新的占位。', cleaned)
  }
  if (carpool.ownerId === userId) {
    return fail('车主自购不经过模拟付款，请使用车主自购操作。', cleaned)
  }
  if (!slotIds.length) return fail('请至少选择一个份额。', cleaned)
  if (new Set(slotIds).size !== slotIds.length) return fail('选择的份额有重复，请重新选择。', cleaned)

  const slots = slotIds.map((slotId) => carpool.positions.find((slot) => slot.id === slotId))
  if (slots.some((slot) => !slot)) return fail('所选份额不存在，请返回详情页重新选择。', cleaned)

  const occupied = slots.find((slot) => slot!.occupantId)
  if (occupied) return fail(`「${occupied!.label}」已经被占用，请重新选择。`, cleaned)

  const existingReservations = slots.map((slot) => slot!.reservation).filter(Boolean) as SlotReservation[]
  if (existingReservations.length === slots.length) {
    const first = existingReservations[0]
    const sameExisting = existingReservations.every((reservation) => (
      reservation.id === first.id
      && reservation.userId === userId
      && new Date(reservation.expiresAt).getTime() > Date.now()
    ))
    if (sameExisting) {
      return done('这些份额已经为你预留，请继续完成模拟支付。', cleaned, {
        reservationId: first.id,
        slotIds,
        expiresAt: first.expiresAt,
      })
    }
  }
  if (existingReservations.some((reservation) => reservation.userId === userId)) {
    return fail('你选择的部分份额已经在另一笔预留中，请先完成或释放原预留。', cleaned)
  }

  const blocked = slots.find((slot) => slot!.reservation && slot!.reservation.userId !== userId)
  if (blocked) return fail(`「${blocked!.label}」正在被其他车员预留，请稍后再试或选择其他份额。`, cleaned)

  const limitError = validateActivityProductLimits(cleaned, carpool, userId, slotIds)
  if (limitError) return fail(limitError, cleaned)

  if (carpool.purchaseMode === 'single' && (carpool.maxPackageItems ?? 0) > 0) {
    const activeReservations = carpool.positions.filter((slot) => (
      !slot.occupantId && slot.reservation && isReservationAlive(slot)
    )).length
    const occupiedCount = validOccupancyOf(cleaned, carpoolId).totalSlots
    const remaining = Math.max(0, (carpool.maxPackageItems ?? 0) - occupiedCount - activeReservations)
    if (slotIds.length > remaining) {
      return fail(`整车包裹只剩 ${remaining} 件容量，请减少本次购买数量。`, cleaned)
    }
  }

  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + RESERVATION_TTL).toISOString()
  const reservationId = uid('res')
  const reservation: SlotReservation = { id: reservationId, userId, createdAt: createdAt.toISOString(), expiresAt }

  const next: AppData = {
    ...cleaned,
    carpools: cleaned.carpools.map((item) => (item.id !== carpoolId ? item : {
      ...item,
      positions: item.positions.map((slot) => (slotIds.includes(slot.id) ? { ...slot, reservation } : slot)),
    })),
  }
  return done('份额已为你预留，请在有效期内完成模拟支付。', next, { reservationId, slotIds, expiresAt })
}

/** 主动释放预留（取消支付、超时或退出时） */
export function releaseReservationOp(
  data: AppData,
  userId: string,
  carpoolId: string,
  reservationId: string,
): OpResult {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  const next: AppData = {
    ...data,
    carpools: data.carpools.map((item) => (item.id !== carpoolId ? item : {
      ...item,
      positions: item.positions.map((slot) => (
        slot.reservation && slot.reservation.id === reservationId && slot.reservation.userId === userId
          ? { ...slot, reservation: undefined }
          : slot
      )),
    })),
  }
  return done('预留已释放，份额重新开放。', next)
}

// ---------------------------------------------------------------------------
// 正式占位与下单
// ---------------------------------------------------------------------------

/** 保证群聊存在：首位车员成功占位后自动创建，后续车员自动加入同一个群聊 */
export function ensureChatOp(data: AppData, carpoolId: string): { data: AppData; chat: Chat; created: boolean } {
  const existing = data.chats.find((chat) => chat.carpoolId === carpoolId)
  if (existing) return { data, chat: existing, created: false }
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return { data, chat: undefined as unknown as Chat, created: false }
  const timestamp = now()
  const chat: Chat = {
    id: uid('chat'),
    carpoolId,
    name: `${carpool.productName}拼车群`,
    announcement: '群聊已自动创建。车主会在这里同步下单、到货和发货进度，请大家留意群消息。',
    messages: [{
      id: uid('msg'),
      userId: carpool.ownerId,
      content: '首位车员已成功占位，群聊已自动创建。后续成功占位的车员会自动加入本群。',
      sentAt: timestamp,
      system: true,
    }],
    createdAt: timestamp,
  }
  return { data: { ...data, chats: [chat, ...data.chats] }, chat, created: true }
}

export interface ConfirmOrderOptions {
  /** 模拟支付是否失败（演示用） */
  simulateFailure?: boolean
  /** 模拟预留已超时（演示用） */
  simulateTimeout?: boolean
}

/**
 * 模拟支付成功后正式占位：
 * - 校验预留仍然有效且份额未被抢占
 * - 生成带商品 / 费用 / 规则快照的订单
 * - 首位车员占位成功时自动创建群聊
 */
export function confirmOrderOp(
  data: AppData,
  userId: string,
  carpoolId: string,
  reservationId: string,
  options: ConfirmOrderOptions = {},
): OpResult<Order> {
  const cleaned = options.simulateTimeout ? purgeExpiredReservations(data) : data
  const carpool = cleaned.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', cleaned)
  if (carpool.status !== 'recruiting') {
    return fail('这辆拼车已经停止招募，预留不能继续付款。', releaseReservationOp(cleaned, userId, carpoolId, reservationId).next)
  }
  if (carpool.ownerId === userId) {
    return fail('车主自购不产生模拟付款，请使用车主自购操作。', releaseReservationOp(cleaned, userId, carpoolId, reservationId).next)
  }

  const reservedSlots = carpool.positions.filter((slot) => slot.reservation?.id === reservationId)
  if (!reservedSlots.length) {
    return fail('预留已失效，份额已释放，请重新选择。', cleaned)
  }
  if (reservedSlots.some((slot) => slot.reservation?.userId !== userId)) {
    return fail('这笔预留不属于当前账号，无法完成付款。', cleaned)
  }
  if (options.simulateTimeout) {
    // 演示用：模拟预留到期，释放份额
    return fail('预留已超时，份额已被释放，请重新选择。', releaseReservationOp(cleaned, userId, carpoolId, reservationId).next)
  }
  if (reservedSlots.some((slot) => slot.occupantId)) {
    return fail('所选份额已被占用，请重新选择。', cleaned)
  }
  if (reservedSlots.some((slot) => !isReservationAlive(slot))) {
    return fail('预留已超时，份额已被释放，请重新选择。', cleaned)
  }
  if (options.simulateFailure) {
    return fail('模拟支付失败，预留已释放，请重新选择份额。', releaseReservationOp(cleaned, userId, carpoolId, reservationId).next)
  }

  const slotIds = reservedSlots.map((slot) => slot.id)
  const limitError = validateActivityProductLimits(cleaned, carpool, userId, slotIds)
  if (limitError) {
    return fail(limitError, releaseReservationOp(cleaned, userId, carpoolId, reservationId).next)
  }
  if (carpool.purchaseMode === 'single' && (carpool.maxPackageItems ?? 0) > 0) {
    const occupiedCount = validOccupancyOf(cleaned, carpoolId).totalSlots
    if (occupiedCount + reservedSlots.length > (carpool.maxPackageItems ?? 0)) {
      return fail('整车包裹容量已满，预留已释放。', releaseReservationOp(cleaned, userId, carpoolId, reservationId).next)
    }
  }

  const orderId = uid('order')
  const timestamp = now()
  const feeSnapshot = buildFeeSnapshot(carpool, slotIds)
  // 车主为自己购买的份额不计入车员人数，也不产生车员信誉奖励
  const ownerHeld = carpool.ownerId === userId
  const order: Order = {
    id: orderId,
    carpoolId,
    userId,
    slotIds,
    amount: feeSnapshot.total,
    paidAt: timestamp,
    itemSnapshot: buildItemSnapshot(carpool, slotIds),
    feeSnapshot,
    rulesSnapshot: buildRulesSnapshot(carpool, timestamp),
    ownerHeld,
  }

  const withOrder: AppData = {
    ...cleaned,
    carpools: cleaned.carpools.map((item) => (item.id !== carpoolId ? item : {
      ...item,
      positions: item.positions.map((slot) => (slotIds.includes(slot.id)
        ? { ...slot, occupantId: userId, orderId, reservation: undefined }
        : slot)),
    })),
    orders: [order, ...cleaned.orders],
  }

  // 首位车员成功占位 → 自动建群（与成团状态解耦）
  const isFirstRider = riderIdsOf(withOrder.carpools.find((item) => item.id === carpoolId)).length === 1
  const withChat = isFirstRider ? ensureChatOp(withOrder, carpoolId).data : withOrder

  // 建立参与关系（同一用户同一车次只建立一份）
  const withParticipation = ensureParticipation(withChat, carpoolId, userId).data

  // 记录商品款模拟支付
  const payment: PaymentRecord = {
    id: uid('pay'),
    carpoolId,
    userId,
    kind: 'goods',
    amountCents: Math.round(feeSnapshot.total * 100),
    status: 'paid',
    refId: orderId,
    createdAt: timestamp,
  }
  const withPayment: AppData = {
    ...withParticipation,
    payments: [...(withParticipation.payments ?? []), payment],
  }

  // 达到成团条件时自动截团（凑套全部占满 / 拼邮金额与件数同时达标）
  const state = recruitmentStateOf(withPayment, carpoolId)
  const finalData = state.autoCut ? cutCarpoolOp(withPayment, carpool.ownerId, carpoolId, true).next : withPayment

  const message = state.autoCut
    ? '模拟支付成功，份额已经锁定。本车已自动截团。'
    : '模拟支付成功，份额已经锁定。'
  return done(message, finalData, order)
}

/**
 * ConfirmPage 的一次性「预留 → 模拟付款」事务。
 * 付款阶段直接读取本次 reserveSlotsOp 返回的 next，避免 React 状态尚未刷新时
 * confirmOrderOp 读到预留前的旧数据。
 */
export function purchaseSharesOp(
  data: AppData,
  userId: string,
  carpoolId: string,
  slotIds: string[],
  options: ConfirmOrderOptions = {},
): OpResult<Order> {
  const reserved = reserveSlotsOp(data, userId, carpoolId, slotIds)
  if (!reserved.ok || !reserved.data) {
    return fail(reserved.message, reserved.next)
  }
  return confirmOrderOp(reserved.next, userId, carpoolId, reserved.data.reservationId, options)
}

// ---------------------------------------------------------------------------
// 采购状态机（V2.0：截团由 src/lib/recruitOps.ts 负责）
// ---------------------------------------------------------------------------

/** 已截团 → 采购履约中：车主确认已经完成实际采购 */
export function markOrderedOp(data: AppData, ownerId: string, carpoolId: string): OpResult {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以标记已下单。', data)
  if (carpool.status !== 'cut') {
    return fail('请先截团，再标记已下单。', data)
  }
  const next: AppData = {
    ...data,
    carpools: data.carpools.map((item) => (item.id === carpoolId ? { ...item, status: 'purchasing' as const } : item)),
  }
  return done('已确认下单，车次进入采购履约阶段。', next)
}

/** 结束拼车：保留订单与群聊历史（V2.0 统一记为已流团，由 recruitOps 负责生成退款） */
export function cancelCarpoolOp(data: AppData, ownerId: string, carpoolId: string, reason = ''): OpResult {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以取消拼车。', data)
  if (carpool.status !== 'recruiting') return fail('这辆拼车已经结束招募。', data)
  const timestamp = now()
  const riders = riderIdsOf(carpool)
  const notifications: Notification[] = riders.map((riderId) => ({
    id: uid('noti'),
    userId: riderId,
    type: 'slot_takeover',
    title: '拼车已结束',
    content: `车主结束了「${carpool.title}」的招募${reason ? `：${reason}` : '，你可以在群聊中查看历史消息，也可以在「我的信誉」中提交投诉。'}`,
    carpoolId,
    createdAt: timestamp,
    read: false,
  }))
  const next: AppData = {
    ...data,
    carpools: data.carpools.map((item) => (item.id === carpoolId ? { ...item, status: 'failed' as const, cancelledAt: timestamp } : item)),
    notifications: [...notifications, ...data.notifications],
  }
  return done('拼车已结束，订单与群聊记录保留。', next)
}

// ---------------------------------------------------------------------------
// 规则变更（影响已有订单权益时需受影响车员确认）
// ---------------------------------------------------------------------------

export interface RuleChangeDraft {
  rules: string
  fallbackRule: string
  guarantees: PurchaseGuarantees
  feeRules: FeeRules
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

/** 受影响车员：已经付款且不是车主自留订单的成员 */
export function affectedRiderIds(data: AppData, carpoolId: string): string[] {
  const ids = new Set<string>()
  data.orders
    .filter((order) => order.carpoolId === carpoolId && !order.ownerHeld)
    .forEach((order) => ids.add(order.userId))
  return [...ids]
}

/**
 * 车主修改规则：
 * - 没有已有订单时立即生效
 * - 已有订单时生成待确认变更，需要全部受影响车员确认后才会生效
 */
export function proposeRuleChangeOp(
  data: AppData,
  ownerId: string,
  carpoolId: string,
  draft: RuleChangeDraft,
): OpResult<PendingRuleChange> {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以修改拼车规则。', data)
  if (carpool.status === 'completed' || carpool.status === 'failed') return fail('已结束的拼车不能修改规则。', data)

  const affected = affectedRiderIds(data, carpoolId)
  const timestamp = now()

  if (!affected.length) {
    const next = applyRuleChange(data, carpoolId, {
      id: uid('rulechange'),
      createdAt: timestamp,
      draft,
      requiredUserIds: [],
      confirmedUserIds: [],
      status: 'applied',
    })
    return done('规则已更新。', next, {
      id: uid('rulechange'),
      createdAt: timestamp,
      draft,
      requiredUserIds: [],
      confirmedUserIds: [],
      status: 'applied',
    })
  }

  const change: PendingRuleChange = {
    id: uid('rulechange'),
    createdAt: timestamp,
    draft,
    requiredUserIds: affected,
    confirmedUserIds: [],
    status: 'pending',
  }
  const next: AppData = {
    ...data,
    carpools: data.carpools.map((item) => (item.id === carpoolId ? { ...item, pendingRuleChange: change } : item)),
    notifications: [
      ...affected.map((riderId) => makeNotification(
        riderId,
        'rule_change',
        '拼车规则有待确认的变更',
        `车主修改了「${carpool.title}」的规则，需要你确认后才会生效。请到车次详情中确认或驳回。`,
        carpoolId,
        timestamp,
      )),
      ...data.notifications,
    ],
  }
  return done(`规则变更已提交，需要 ${affected.length} 位车员确认后生效。`, next, change)
}

/** 应用规则变更：已确认订单的商品与价格快照保持不变，仅更新规则条款 */
export function applyRuleChange(data: AppData, carpoolId: string, change: PendingRuleChange): AppData {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return data
  const nextVersion = (carpool.rulesVersion ?? 1) + 1
  return {
    ...data,
    carpools: data.carpools.map((item) => (item.id !== carpoolId ? item : {
      ...item,
      rules: change.draft.rules,
      fallbackRule: change.draft.fallbackRule,
      guarantees: change.draft.guarantees,
      feeRules: change.draft.feeRules,
      rulesVersion: nextVersion,
      pendingRuleChange: undefined,
    })),
    // 商品与价格快照永不覆盖，只有规则条款随确认结果更新
    orders: data.orders.map((order) => {
      if (order.carpoolId !== carpoolId || !order.rulesSnapshot) return order
      return {
        ...order,
        rulesSnapshot: {
          ...order.rulesSnapshot,
          rulesVersion: nextVersion,
          rules: change.draft.rules,
          fallbackRule: change.draft.fallbackRule,
          guarantees: change.draft.guarantees,
          consentApprovedAt: change.createdAt,
        },
      }
    }),
  }
}

/**
 * 车员确认（或驳回）待生效的规则变更：
 * - 全部受影响车员确认后自动生效
 * - 任一车员驳回则整条变更作废
 */
export function confirmRuleChangeOp(
  data: AppData,
  userId: string,
  carpoolId: string,
  approve: boolean,
): OpResult {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  const change = carpool.pendingRuleChange
  if (!change || change.status !== 'pending') return fail('当前没有待确认的规则变更。', data)
  if (!change.requiredUserIds.includes(userId)) return fail('这条规则变更不需要你确认。', data)
  if (change.confirmedUserIds.includes(userId)) return fail('你已经确认过这条规则变更了。', data)

  const timestamp = now()
  if (!approve) {
    const next: AppData = {
      ...data,
      carpools: data.carpools.map((item) => (item.id === carpoolId
        ? { ...item, pendingRuleChange: { ...change, status: 'rejected' as const, confirmedUserIds: [...change.confirmedUserIds, userId] } }
        : item)),
      notifications: [
        makeNotification(
          carpool.ownerId,
          'rule_change',
          '车员驳回了规则变更',
          `${userId === carpool.ownerId ? '车员' : '有车员'}驳回了「${carpool.title}」的规则变更，本次修改不会生效。`,
          carpoolId,
          timestamp,
        ),
        ...data.notifications,
      ],
    }
    return fail('你已驳回本次规则变更，车主需要重新发起。', next)
  }

  const confirmedUserIds = [...change.confirmedUserIds, userId]
  const allConfirmed = change.requiredUserIds.every((id) => confirmedUserIds.includes(id))
  const updated: PendingRuleChange = { ...change, confirmedUserIds, status: allConfirmed ? 'applied' : 'pending' }

  const withStatus: AppData = {
    ...data,
    carpools: data.carpools.map((item) => (item.id === carpoolId ? { ...item, pendingRuleChange: updated } : item)),
  }
  if (!allConfirmed) {
    return done('已确认你的部分，等待其他车员确认后生效。', withStatus)
  }
  const next = applyRuleChange(withStatus, carpoolId, updated)
  return done('所有受影响车员已确认，规则变更已生效。', next)
}

// ---------------------------------------------------------------------------
// 校验辅助
// ---------------------------------------------------------------------------

/** 校验一组份额是否可以占位 */
export function validateSelection(carpool: Carpool | undefined, slotIds: string[], userId: string) {
  if (!carpool) return { ok: false, message: '没有找到这辆拼车。' }
  if (!slotIds.length) return { ok: false, message: '请至少选择一个份额。' }
  if (carpool.ownerId === userId) return { ok: false, message: '车主不能加入自己发起的拼车。' }
  if (carpool.status !== 'recruiting') {
    return { ok: false, message: '这辆拼车已经停止接受新的占位。' }
  }
  const slots = slotIds.map((slotId) => carpool.positions.find((slot) => slot.id === slotId))
  if (slots.some((slot) => !slot)) return { ok: false, message: '所选份额不存在，请返回详情页重新选择。' }
  if (slots.some((slot) => slot!.occupantId)) return { ok: false, message: '所选份额已经被占用，请重新选择。' }
  if (slots.some((slot) => slot!.reservation && slot!.reservation.userId !== userId)) {
    return { ok: false, message: '所选份额正在被其他车员预留，请稍后再试。' }
  }
  return { ok: true, message: '' }
}
