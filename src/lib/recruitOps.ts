/**
 * V2.0 招募与截团状态迁移（纯函数，可直接单元测试）。
 *
 * 关键规则：
 * - 有效占用 = 车员付款成功的份额 + 车主已确认的自购份额
 * - 整套凑套：全部开放份数被有效占用时自动截团，不需要车主手动截团
 * - 普通拼邮：按「最低金额 × 包裹件数」四种情况处理
 * - 车主自购不产生模拟付款交易；流团按已付款车员订单逐笔关联退款
 */
import type {
  AppData,
  Carpool,
  FreightBill,
  Notification,
  OwnerPurchase,
  Participation,
  PaymentRecord,
  PurchaseMode,
} from '../types'
import { allocateByWeight } from './money'
import { latestCutDeadline, eventOf } from './catalog'
import { FREIGHT_REMAINDER_STRATEGY } from '../config'
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
// 有效占用统计
// ---------------------------------------------------------------------------

export interface ValidOccupancy {
  /** 车员付款成功占用的份数 */
  riderSlots: number
  /** 车主自购占用的份数 */
  ownerSlots: number
  /** 有效总份数 */
  totalSlots: number
  /** 车员有效商品金额（分） */
  riderAmountCents: number
  /** 车主自购金额（分） */
  ownerAmountCents: number
  /** 有效总金额（分） */
  totalAmountCents: number
  /** 每个参与者的有效份数（userId → 份数） */
  unitsByUser: Record<string, number>
  /** 每个参与者的有效金额（分） */
  amountByUser: Record<string, number>
}

export function validOccupancyOf(data: AppData, carpoolId: string): ValidOccupancy {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  const result: ValidOccupancy = {
    riderSlots: 0,
    ownerSlots: 0,
    totalSlots: 0,
    riderAmountCents: 0,
    ownerAmountCents: 0,
    totalAmountCents: 0,
    unitsByUser: {},
    amountByUser: {},
  }
  if (!carpool) return result

  carpool.positions.forEach((slot) => {
    if (!slot.occupantId) return
    const price = Math.round((slot.price ?? carpool.price) * 100)
    const isOwner = slot.occupantId === carpool.ownerId
    result.totalSlots += 1
    result.totalAmountCents += price
    result.unitsByUser[slot.occupantId] = (result.unitsByUser[slot.occupantId] ?? 0) + 1
    result.amountByUser[slot.occupantId] = (result.amountByUser[slot.occupantId] ?? 0) + price
    if (isOwner) {
      result.ownerSlots += 1
      result.ownerAmountCents += price
    } else {
      result.riderSlots += 1
      result.riderAmountCents += price
    }
  })
  return result
}

// ---------------------------------------------------------------------------
// 招募状态判定
// ---------------------------------------------------------------------------

export interface RecruitmentState {
  mode: PurchaseMode
  /** 有效份数（件数 / 成员位置份数） */
  items: number
  /** 有效金额（分） */
  amountCents: number
  /** 最低成团金额（分） */
  minAmountCents: number
  /** 包裹最大件数 */
  maxPackageItems: number
  /** 开放总份数 */
  openSlots: number
  /** 已占用份数 */
  occupiedSlots: number
  /** 全部开放份数是否已被有效占用 */
  allOccupied: boolean
  /** 是否达到最低成团金额 */
  amountReached: boolean
  /** 是否达到包裹上限 */
  packageFull: boolean
  /** 是否应当自动截团 */
  autoCut: boolean
  /** 车主是否可以手动截团 */
  manualCutAllowed: boolean
  /** 未达最低金额但包裹已满：必须停止新增购买 */
  mustFail: boolean
  /** 是否仍在招募 */
  recruiting: boolean
  /** 提示文案 */
  hint: string
}

export function recruitmentStateOf(data: AppData, carpoolId: string): RecruitmentState {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  const occupancy = validOccupancyOf(data, carpoolId)
  const mode: PurchaseMode = carpool?.purchaseMode ?? 'single'
  const configuredCapacity = carpool?.maxPackageItems ?? 0
  // 普通拼邮会为每种可选商品准备候选份额，但整车进度与容量只以全局包裹上限为准。
  const openSlots = mode === 'single' && configuredCapacity > 0
    ? configuredCapacity
    : (carpool?.positions.length ?? 0)
  const occupiedSlots = occupancy.totalSlots
  const allOccupied = openSlots > 0 && occupiedSlots >= openSlots
  const minAmountCents = carpool?.minAmountCents ?? 0
  const maxPackageItems = configuredCapacity
  const amountReached = mode === 'bundle'
    ? allOccupied
    : minAmountCents > 0 && occupancy.totalAmountCents >= minAmountCents
  const packageFull = mode === 'bundle'
    ? allOccupied
    : maxPackageItems > 0 && occupiedSlots >= maxPackageItems

  let autoCut = false
  let manualCutAllowed = false
  let mustFail = false
  let hint = ''

  if (mode === 'bundle') {
    autoCut = allOccupied
    hint = allOccupied
      ? '全部开放成员位置已被有效占用，系统自动截团。'
      : `还有 ${openSlots - occupiedSlots} 个成员位置未被认领，全部认领后自动截团。`
  } else {
    autoCut = amountReached && packageFull
    manualCutAllowed = amountReached && !packageFull
    mustFail = !amountReached && packageFull
    if (autoCut) hint = '已达最低成团金额且包裹装满，系统自动截团。'
    else if (manualCutAllowed) hint = '已达最低成团金额，包裹尚未装满，车主可以手动截团。'
    else if (mustFail) hint = '包裹已装满但未达最低成团金额，停止新增购买，按未成团规则处理。'
    else hint = '尚未达到最低成团金额，继续招募中。'
  }

  return {
    mode,
    items: occupiedSlots,
    amountCents: occupancy.totalAmountCents,
    minAmountCents,
    maxPackageItems,
    openSlots,
    occupiedSlots,
    allOccupied,
    amountReached,
    packageFull,
    autoCut,
    manualCutAllowed,
    mustFail,
    recruiting: !autoCut && !mustFail,
    hint,
  }
}

// ---------------------------------------------------------------------------
// 参与关系
// ---------------------------------------------------------------------------

/** 确保存在参与关系（同一用户同一车次只建立一份） */
export function ensureParticipation(data: AppData, carpoolId: string, userId: string): { data: AppData; participation: Participation; created: boolean } {
  const existing = data.participations?.find((item) => item.carpoolId === carpoolId && item.userId === userId)
  if (existing) return { data, participation: existing, created: false }
  const participation: Participation = {
    id: uid('part'),
    carpoolId,
    userId,
    createdAt: now(),
  }
  return {
    data: { ...data, participations: [...(data.participations ?? []), participation] },
    participation,
    created: true,
  }
}

// ---------------------------------------------------------------------------
// 车主优先自购
// ---------------------------------------------------------------------------

export interface OwnerSelfPurchaseInput {
  /** 开放分组 ID */
  groupId: string
  /** 认领份数 */
  quantity: number
}

/**
 * 车主优先自购：
 * - 不需要模拟付款，不生成任何支付记录
 * - 确认后直接占位，计入招募进度、采购清单与国际运费分摊
 * - 不得覆盖已被车员付款占用的份额
 */
export function ownerSelfPurchaseOp(
  data: AppData,
  ownerId: string,
  carpoolId: string,
  input: OwnerSelfPurchaseInput,
): OpResult<OwnerPurchase[]> {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以追加自购份额。', data)
  if (carpool.status !== 'recruiting') return fail('车次已经截团，无法再追加自购。', data)

  const quantity = Math.max(1, Math.floor(input.quantity))
  const group = (carpool.shareGroups ?? []).find((item) => item.id === input.groupId)
  if (!group) return fail('没有找到对应的开放商品分组。', data)

  const timestampMs = Date.now()
  const freeSlots = carpool.positions.filter((slot) => (
    slot.groupId === group.id
    && !slot.occupantId
    && (!slot.reservation || new Date(slot.reservation.expiresAt).getTime() <= timestampMs)
  ))
  if (freeSlots.length < quantity) {
    return fail(`该商品只剩 ${freeSlots.length} 份可自购，无法认领 ${quantity} 份。`, data)
  }

  // 普通拼邮的包裹上限是整车全局容量，不能因选择了多个商品而成倍放大。
  if (carpool.purchaseMode === 'single' && (carpool.maxPackageItems ?? 0) > 0) {
    const occupied = validOccupancyOf(data, carpoolId).totalSlots
    const activeReservations = carpool.positions.filter((slot) => (
      !slot.occupantId
      && slot.reservation
      && new Date(slot.reservation.expiresAt).getTime() > timestampMs
    )).length
    const remaining = Math.max(0, (carpool.maxPackageItems ?? 0) - occupied - activeReservations)
    if (quantity > remaining) {
      return fail(`整车包裹只剩 ${remaining} 件容量，无法再自购 ${quantity} 件。`, data)
    }
  }

  const candidateIds = freeSlots.slice(0, quantity).map((slot) => slot.id)
  const limitError = validateActivityProductLimits(data, carpool, ownerId, candidateIds)
  if (limitError) return fail(limitError, data)

  const timestamp = now()
  const taken = candidateIds
  const records: OwnerPurchase[] = [{
    id: uid('ownbuy'),
    carpoolId,
    productId: group.productId ?? group.id,
    member: group.member,
    quantity,
    unitPrice: group.price,
    confirmedAt: timestamp,
  }]

  const next: AppData = {
    ...data,
    carpools: data.carpools.map((item) => (item.id !== carpoolId ? item : {
      ...item,
      positions: item.positions.map((slot) => (taken.includes(slot.id)
        ? { ...slot, occupantId: ownerId, orderId: undefined, reservation: undefined }
        : slot)),
    })),
    ownerPurchases: [...(data.ownerPurchases ?? []), ...records],
  }
  const state = recruitmentStateOf(next, carpoolId)
  const finalData = state.autoCut
    ? cutCarpoolOp(next, ownerId, carpoolId, true).next
    : next
  return done(
    state.autoCut
      ? `已确认自购 ${quantity} 份，不产生模拟付款。本车已自动截团。`
      : `已确认自购 ${quantity} 份，不产生模拟付款。`,
    finalData,
    records,
  )
}

/** 取消车主自购（仅限尚未截团且尚未进入采购的份额） */
export function cancelOwnerSelfPurchaseOp(
  data: AppData,
  ownerId: string,
  carpoolId: string,
  purchaseId: string,
): OpResult {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以调整自购份额。', data)
  if (carpool.status !== 'recruiting') return fail('车次已经截团，无法再调整自购份额。', data)

  const purchase = (data.ownerPurchases ?? []).find((item) => item.id === purchaseId)
  if (!purchase) return fail('没有找到这条自购记录。', data)

  const group = (carpool.shareGroups ?? []).find((item) => (item.productId ?? item.id) === purchase.productId && (item.member ?? undefined) === (purchase.member ?? undefined))
  const ownerSlots = group
    ? carpool.positions.filter((slot) => slot.groupId === group.id && slot.occupantId === ownerId)
    : []

  const released = ownerSlots.slice(0, purchase.quantity).map((slot) => slot.id)
  const next: AppData = {
    ...data,
    carpools: data.carpools.map((item) => (item.id !== carpoolId ? item : {
      ...item,
      positions: item.positions.map((slot) => (released.includes(slot.id)
        ? { ...slot, occupantId: undefined, orderId: undefined }
        : slot)),
    })),
    ownerPurchases: (data.ownerPurchases ?? []).filter((item) => item.id !== purchaseId),
  }
  return done('已释放该条自购份额。', next)
}

// ---------------------------------------------------------------------------
// 国际运费账单
// ---------------------------------------------------------------------------

/** 生成国际运费账单：按有效份数均摊，含车主自购 */
export function buildFreightBills(data: AppData, carpool: Carpool): FreightBill[] {
  const occupancy = validOccupancyOf(data, carpool.id)
  const total = carpool.internationalFreightCents ?? 0
  const userIds = Object.keys(occupancy.unitsByUser)
  if (!userIds.length || total <= 0) return []

  const weights = userIds.map((userId) => occupancy.unitsByUser[userId])
  const sum = weights.reduce((acc, weight) => acc + weight, 0)
  const allocation = allocateByWeight(total, weights, carpool.freightRemainderStrategy ?? FREIGHT_REMAINDER_STRATEGY)
  const timestamp = now()

  return userIds.map((userId, index) => {
    const base = allocation.shares[index]
    // 承担尾差：实际分摊高于按比例向下取整的结果
    const ownsRemainder = base > Math.floor((total * weights[index]) / sum)
    return {
      id: uid('freight'),
      carpoolId: carpool.id,
      userId,
      units: weights[index],
      amountCents: base,
      ownsRemainder,
      status: userId === carpool.ownerId ? 'booked' as const : 'pending' as const,
      createdAt: timestamp,
    }
  })
}

// ---------------------------------------------------------------------------
// 截团 / 流团 / 延期
// ---------------------------------------------------------------------------

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

/**
 * 截团：锁定最终有效购买数量，并生成国际运费账单。
 * 整套凑套由系统自动触发；普通拼邮在满足条件后可由车主手动触发。
 */
export function cutCarpoolOp(data: AppData, ownerId: string, carpoolId: string, automatic = false): OpResult<FreightBill[]> {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以截团。', data)
  if (carpool.status !== 'recruiting') return fail('该车次已经结束招募。', data)

  const state = recruitmentStateOf(data, carpoolId)
  if (!automatic && !state.manualCutAllowed) {
    return fail(state.hint, data)
  }
  if (automatic && !state.autoCut) {
    return fail(state.hint, data)
  }

  const timestamp = now()
  const bills = buildFreightBills(data, carpool)
  const occupancy = validOccupancyOf(data, carpoolId)
  const participants = Object.keys(occupancy.unitsByUser).filter((userId) => userId !== carpool.ownerId)

  const next: AppData = {
    ...data,
    carpools: data.carpools.map((item) => (item.id === carpoolId ? { ...item, status: 'cut' as const, cutAt: timestamp } : item)),
    freightBills: [...(data.freightBills ?? []), ...bills],
    notifications: [
      makeNotification(
        carpool.ownerId,
        'carpool_cut',
        '你的拼车已截团',
        `「${carpool.title}」已${automatic ? '自动' : '手动'}截团，国际运费账单已生成，可以开始采购与发货。`,
        carpoolId,
        timestamp,
      ),
      ...participants.map((userId) => makeNotification(
        userId,
        'freight_bill',
        '拼车已截团，国际运费账单已生成',
        `「${carpool.title}」已截团，国际运费按有效份数自动分摊，请在参与订单详情中查看并完成模拟支付。`,
        carpoolId,
        timestamp,
      )),
      ...(data.notifications ?? []),
    ],
  }
  return done(
    automatic ? '已自动截团，国际运费账单已生成。' : '已手动截团，国际运费账单已生成。',
    next,
    bills,
  )
}

/**
 * 延期：仅在未成团时可用，且不得超过平台最晚允许截团时间。
 * 「招募已截止、等待车主处理」的车次同样可以延期，延期后回到招募中。
 */
export function extendRecruitmentOp(data: AppData, ownerId: string, carpoolId: string, deadline: string): OpResult {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以延期。', data)
  if (carpool.status !== 'recruiting' && carpool.status !== 'expired') {
    return fail('该车次已经结束招募，无法延期。', data)
  }

  const target = new Date(deadline).getTime()
  if (Number.isNaN(target)) return fail('请选择有效的延期截止时间。', data)
  const current = new Date(carpool.deadline).getTime()
  if (target <= current) return fail('延期后的截止时间需要晚于当前截止时间。', data)

  const latest = latestCutDeadline(eventOf(data, carpool.eventId))
  if (latest && target > new Date(latest).getTime()) {
    return fail(`延期不能超过平台最晚允许截团时间（${new Date(latest).toLocaleString('zh-CN')}）。`, data)
  }

  const timestamp = now()
  const occupancy = validOccupancyOf(data, carpoolId)
  const riders = Object.keys(occupancy.unitsByUser).filter((userId) => userId !== carpool.ownerId)
  const next: AppData = {
    ...data,
    carpools: data.carpools.map((item) => (item.id === carpoolId ? {
      ...item,
      status: 'recruiting' as const,
      deadline,
      expiredAt: undefined,
      extensions: [...(item.extensions ?? []), { at: timestamp, deadline }],
    } : item)),
    notifications: [
      ...riders.map((userId) => makeNotification(
        userId,
        'recruitment_extended',
        '拼车招募延期',
        `「${carpool.title}」的招募截止时间已延期到 ${new Date(deadline).toLocaleString('zh-CN')}，你可以继续购买剩余份额。`,
        carpoolId,
        timestamp,
      )),
      ...(data.notifications ?? []),
    ],
  }
  return done('已延期，并通知了已参与的车员。', next)
}

/**
 * 流团：未成团且未延期（或已达最晚截团时间）时处理。
 * 为每笔已付款车员订单生成一笔关联退款：优先使用商品支付流水金额，
 * 旧订单缺少流水时回退到订单实付金额；车主自购不退款，已关联退款不重复生成。
 * 已经是流团状态的车次不会重复生成退款。
 */
export function failCarpoolOp(data: AppData, ownerId: string, carpoolId: string, reason = ''): OpResult<PaymentRecord[]> {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以结束流团。', data)
  if (carpool.status !== 'recruiting' && carpool.status !== 'expired') return fail('该车次已经结束招募。', data)

  const timestamp = now()
  const riderOrders = data.orders.filter((order) => (
    order.carpoolId === carpoolId
    && order.userId !== carpool.ownerId
    && !order.ownerHeld
    && Boolean(order.paidAt)
  ))
  const refundedOrderIds = new Set(
    (data.payments ?? [])
      .filter((payment) => payment.carpoolId === carpoolId && payment.kind === 'refund')
      .map((payment) => payment.refId)
      .filter((refId): refId is string => Boolean(refId)),
  )
  const goodsPaymentByOrder = new Map<string, PaymentRecord>()
  for (const payment of data.payments ?? []) {
    if (
      payment.carpoolId === carpoolId
      && payment.kind === 'goods'
      && payment.status === 'paid'
      && payment.refId
      && !goodsPaymentByOrder.has(payment.refId)
    ) {
      goodsPaymentByOrder.set(payment.refId, payment)
    }
  }
  const refunds: PaymentRecord[] = riderOrders
    .filter((order) => !refundedOrderIds.has(order.id))
    .map((order) => {
      const goodsPayment = goodsPaymentByOrder.get(order.id)
      return {
        id: uid('pay'),
        carpoolId,
        userId: order.userId,
        kind: 'refund' as const,
        // 新订单优先按关联支付流水退款；旧订单没有流水时回退到订单实付金额。
        amountCents: goodsPayment?.amountCents ?? Math.round(order.amount * 100),
        status: 'refunded' as const,
        refId: order.id,
        note: reason || '未成团，已生成模拟退款记录。',
        createdAt: timestamp,
      }
    })

  const riders = [...new Set(riderOrders.map((order) => order.userId))]

  const next: AppData = {
    ...data,
    carpools: data.carpools.map((item) => (item.id === carpoolId ? { ...item, status: 'failed' as const, cancelledAt: timestamp } : item)),
    payments: [...(data.payments ?? []), ...refunds],
    notifications: [
      makeNotification(
        carpool.ownerId,
        'carpool_failed',
        '拼车未成团，已流团',
        `「${carpool.title}」已结束招募并流团，已为实际付款的车员生成模拟退款记录。`,
        carpoolId,
        timestamp,
      ),
      ...riders.map((userId) => makeNotification(
        userId,
        'carpool_failed',
        '拼车未成团，已生成退款',
        `「${carpool.title}」未能在截团前成团，你已支付的商品款已生成模拟退款记录，可在参与订单详情中查看。`,
        carpoolId,
        timestamp,
      )),
      ...(data.notifications ?? []),
    ],
  }
  return done(`已结束流团，生成 ${refunds.length} 条模拟退款记录。`, next, refunds)
}

// ---------------------------------------------------------------------------
// 招募截止自动处理
// ---------------------------------------------------------------------------

export interface ExpiredCarpoolReport {
  carpoolId: string
  title: string
  /** expired = 进入等待车主处理；failed = 已自动流团 */
  action: 'expired' | 'failed'
  /** 生成的退款条数 */
  refunds: number
}

/**
 * 招募截止自动处理（可在页面加载或定时器中重复执行，结果幂等）：
 *
 * 1. 招募截止时间（车主自设）到达且仍未成团 → 进入「等待车主处理」状态，
 *    车主仍可在平台最晚允许截团时间之前延期，或手动结束流团。
 * 2. 平台最晚允许截团时间到达仍未成团 → 自动流团，并按已付款车员订单逐笔生成退款。
 * 3. 已截团 / 采购履约中 / 已完成 / 已流团的车次不受截止时间影响。
 *
 * 没有活动上下文的历史车次没有最晚截团时间，到达截止时间后直接流团，
 * 避免它们无限停留在招募中。
 */
export function sweepExpiredRecruitments(
  data: AppData,
  at = Date.now(),
): { data: AppData; reports: ExpiredCarpoolReport[] } {
  const reports: ExpiredCarpoolReport[] = []
  let current = data

  const pending = current.carpools.filter((carpool) => (
    carpool.status === 'recruiting' || carpool.status === 'expired'
  ))

  for (const carpool of pending) {
    const deadline = new Date(carpool.deadline).getTime()
    if (Number.isNaN(deadline)) continue
    const latest = latestCutDeadline(eventOf(current, carpool.eventId))
    const latestAt = latest ? new Date(latest).getTime() : Number.NaN
    const latestReached = Number.isFinite(latestAt) && at >= latestAt
    const deadlineReached = at >= deadline

    if (carpool.status === 'recruiting') {
      if (!deadlineReached) continue
      // 还在最晚截团时间之前 → 等待车主处理
      if (Number.isFinite(latestAt) && !latestReached) {
        const timestamp = new Date(at).toISOString()
        const occupancy = validOccupancyOf(current, carpool.id)
        const riders = Object.keys(occupancy.unitsByUser).filter((userId) => userId !== carpool.ownerId)
        current = {
          ...current,
          carpools: current.carpools.map((item) => (item.id === carpool.id ? {
            ...item,
            status: 'expired' as const,
            expiredAt: timestamp,
          } : item)),
          notifications: [
            makeNotification(
              carpool.ownerId,
              'carpool_expired',
              '拼车招募已截止，等待你处理',
              `「${carpool.title}」的招募截止时间已到但尚未成团。你可以在平台最晚允许截团时间（${new Date(latest!).toLocaleString('zh-CN')}）之前延期，或结束本次拼车并为车员生成模拟退款。`,
              carpool.id,
              timestamp,
            ),
            ...riders.map((userId) => makeNotification(
              userId,
              'carpool_expired',
              '拼车招募已截止',
              `「${carpool.title}」的招募截止时间已到，车主正在处理是否延期。如果最终未能成团，你已支付的商品款会生成模拟退款记录。`,
              carpool.id,
              timestamp,
            )),
            ...(current.notifications ?? []),
          ],
        }
        reports.push({ carpoolId: carpool.id, title: carpool.title, action: 'expired', refunds: 0 })
        continue
      }
    } else if (!latestReached) {
      // 已经在等待车主处理，但最晚截团时间还没到 → 保持等待
      continue
    }

    // 走到这里说明：已过最晚截团时间，或没有活动上下文的过期车次 → 自动流团
    const result = failCarpoolOp(current, carpool.ownerId, carpool.id, '招募截止时仍未成团，已自动流团')
    if (result.ok) {
      current = result.next
      reports.push({ carpoolId: carpool.id, title: carpool.title, action: 'failed', refunds: result.data?.length ?? 0 })
    }
  }

  return { data: current, reports }
}

/** 采购清单：合并车员购买与车主自购 */
export interface PurchaseListItem {
  productId: string
  name: string
  spec: string
  category: string
  unitPrice: number
  /** 有效采购数量 */
  quantity: number
  /** 来自车员购买的数量 */
  riderQuantity: number
  /** 来自车主自购的数量 */
  ownerQuantity: number
}

export function purchaseListOf(data: AppData, carpoolId: string): PurchaseListItem[] {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return []
  const map = new Map<string, PurchaseListItem>()

  const ensure = (productId: string) => {
    const key = productId
    if (map.has(key)) return map.get(key)!
    const product = (data.eventProducts ?? []).find((item) => item.id === productId)
    const item: PurchaseListItem = {
      productId,
      name: product?.name ?? '未知商品',
      spec: product?.spec ?? '',
      category: product?.category ?? '其他',
      unitPrice: product?.price ?? carpool.price,
      quantity: 0,
      riderQuantity: 0,
      ownerQuantity: 0,
    }
    map.set(key, item)
    return item
  }

  carpool.positions.forEach((slot) => {
    if (!slot.occupantId) return
    const group = (carpool.shareGroups ?? []).find((item) => item.slotIds.includes(slot.id))
    const productId = group?.productId ?? group?.id ?? 'unknown'
    const item = ensure(productId)
    item.quantity += 1
    if (slot.occupantId === carpool.ownerId) item.ownerQuantity += 1
    else item.riderQuantity += 1
  })

  // positions[] 是有效采购数量的唯一事实来源；ownerPurchases[] 仅保存自购行为审计记录，
  // 不能再次累加，否则车主自购会被重复计入采购清单。
  return [...map.values()].sort((a, b) => b.quantity - a.quantity)
}
