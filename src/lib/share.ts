/**
 * V1.3-A 商品与份额管理的常量与派生计算。
 *
 * 设计要点：
 * - 沿用现有 Carpool.positions[] 作为唯一的「可售份额表」，V1.3-A 只做增量扩展。
 * - 旧数据没有 shareGroups / groupId，按 legacy 平铺位置处理，原有流程完全不受影响。
 * - 所有份额共享同一张库存表，因此不会出现重复分配或超卖。
 */
import type {
  Carpool,
  FeeRules,
  OrderFeeSnapshot,
  OrderItemSnapshot,
  OrderRulesSnapshot,
  PositionSlot,
  PurchaseGuarantees,
  PurchaseMode,
  ShareGroup,
} from '../types'

/** 库存预留时长（毫秒）：付款前原子预留，超时自动释放 */
export const RESERVATION_TTL = 10 * 60 * 1000

/** 默认保障语义 */
export const defaultGuarantees = (mode: PurchaseMode): PurchaseGuarantees => ({
  // 整套凑套必须按完整套数购买
  fullSetOrdered: mode === 'bundle',
  // 普通拼邮不涉及成员款式承诺
  memberDesign: mode === 'bundle',
})

/** 默认费用规则 */
export function defaultFeeRules(unitPrice: number): FeeRules {
  return { unitPrice, serviceFee: 0, shippingFee: 0 }
}

/** 未凑齐处理规则默认模板 */
export const fallbackRuleTemplates: Record<PurchaseMode, string> = {
  single: '未凑齐时车主按实际数量下单，差价不退；也可以继续招募到截单时间，或由车主主动承接剩余份额。',
  bundle: '某一套未凑齐时车主会补齐该套缺失的成员位，仍按整套下单；如果补不齐，会在群内与车员协商处理方案，不会未经车员同意分摊费用。',
}

/** 购买方式文案 */
export const purchaseModeText: Record<PurchaseMode, string> = {
  single: '普通拼邮',
  bundle: '整套凑套',
}

export const purchaseModeDescription: Record<PurchaseMode, string> = {
  single: '车主开放指定商品与版本，车员只能选择已开放的商品，不提供自定义商品申请。',
  bundle: '车主配置完整套装、购买套数与成员位置价格，车员只能选择成员位置，不提供随机购买选项。',
}

/** 保障语义文案 */
export const guaranteeText: Record<keyof PurchaseGuarantees, { label: string; description: string }> = {
  fullSetOrdered: {
    label: '保证按整套下单',
    description: '实际采购时按完整套数下单，不拆套购买。这不代表未凑齐时也会无条件下单。',
  },
  memberDesign: {
    label: '保证获得指定成员款式',
    description: '承诺交付你选择的成员款式；是否兑现以最终确认的成员位为准。',
  },
}

/** 是否为旧版平铺车次（没有分组信息） */
export function isLegacyCarpool(carpool: Carpool | undefined): boolean {
  if (!carpool) return false
  return !carpool.purchaseMode || !Array.isArray(carpool.shareGroups) || carpool.shareGroups.length === 0
}

/** 车次的购买方式；旧车视为普通拼邮的平铺形态 */
export function purchaseModeOf(carpool: Carpool | undefined): PurchaseMode {
  if (!carpool) return 'single'
  return carpool.purchaseMode ?? 'single'
}

/** 取车次的分组列表（旧车返回空数组） */
export function shareGroupsOf(carpool: Carpool | undefined): ShareGroup[] {
  if (!carpool || !Array.isArray(carpool.shareGroups)) return []
  return carpool.shareGroups
}

/** 取某个份额所属的分组 */
export function groupOfSlot(carpool: Carpool | undefined, slotId: string): ShareGroup | undefined {
  if (!carpool) return undefined
  return shareGroupsOf(carpool).find((group) => group.slotIds.includes(slotId))
}

/** 份额单价：优先取份额自身价格，其次分组价格，最后整车单价 */
export function slotPrice(carpool: Carpool | undefined, slot: PositionSlot): number {
  if (typeof slot.price === 'number') return slot.price
  const group = groupOfSlot(carpool, slot.id)
  if (group) return group.price
  return carpool?.price ?? 0
}

/** 预留是否仍然有效 */
export function isReservationAlive(slot: PositionSlot, now = Date.now()) {
  if (!slot.reservation) return false
  const expires = new Date(slot.reservation.expiresAt).getTime()
  return Number.isFinite(expires) && expires > now
}

/** 预留是否属于指定用户 */
export function reservationOfUser(slot: PositionSlot, userId: string) {
  return slot.reservation?.userId === userId ? slot.reservation : undefined
}

/** 可被选择的份额：未占用且没有他人有效预留 */
export function selectableSlots(carpool: Carpool | undefined, currentUserId: string, now = Date.now()): PositionSlot[] {
  if (!carpool) return []
  return carpool.positions.filter((slot) => {
    if (slot.occupantId) return false
    if (!slot.reservation) return true
    return isReservationAlive(slot, now) && slot.reservation.userId === currentUserId
  })
}

/** 某组已售 / 已预留的数量 */
export function groupSoldCount(carpool: Carpool | undefined, groupId: string, now = Date.now()) {
  if (!carpool) return 0
  return carpool.positions.filter((slot) => {
    if (slot.groupId !== groupId) return false
    if (slot.occupantId) return true
    return isReservationAlive(slot, now)
  }).length
}

/** 某组剩余可售数量 */
export function groupRemainingCount(carpool: Carpool | undefined, groupId: string, now = Date.now()) {
  const group = shareGroupsOf(carpool).find((item) => item.id === groupId)
  if (!group) return 0
  return Math.max(0, group.quantity - groupSoldCount(carpool, groupId, now))
}

/** 车主自留的份额（occupantId 为车主且该车不是自己加入） */
export function ownerHeldSlots(carpool: Carpool | undefined): PositionSlot[] {
  if (!carpool) return []
  return carpool.positions.filter((slot) => slot.occupantId === carpool.ownerId)
}

/**
 * 车次是否已经进入物流 / 履约阶段。
 * 已成团、已下单以及历史已结束车次都算；招募中与待确认成团不算。
 */
export function isFulfilledPhase(carpool: Carpool | undefined) {
  if (!carpool) return false
  return carpool.status === 'cut' || carpool.status === 'purchasing' || carpool.status === 'completed'
}

/** 车次是否还在接受新的占位（招募已截止、等待车主处理的车次不再接受购买） */
export function isOpenForOccupancy(carpool: Carpool | undefined) {
  if (!carpool) return false
  return carpool.status === 'recruiting'
}

/**
 * V2.0 起整套凑套不再按「第几套」拆分。
 * 全部开放成员位置被有效占用即视为凑齐并自动截团，
 * 因此这里只保留按分组聚合的读取能力，旧的分套编号逻辑已清理。
 *
 * 历史数据中的 `bundleSets` / `setIndex` 字段仍保留在类型中用于兼容读取，
 * 但不再参与任何新建车次的业务判断。
 */
export interface MemberPositionGroup {
  groupId: string
  member: string
  productId?: string
  version?: string
  price: number
  slots: PositionSlot[]
  occupied: number
  total: number
}

/** 凑套模式下按成员位置聚合（不再按套拆分）。 */
export function memberPositionGroupsOf(carpool: Carpool | undefined): MemberPositionGroup[] {
  if (!carpool || purchaseModeOf(carpool) !== 'bundle') return []
  return shareGroupsOf(carpool)
    .filter((group) => group.kind === 'bundle')
    .map((group) => {
      const slots = carpool.positions.filter((slot) => group.slotIds.includes(slot.id))
      return {
        groupId: group.id,
        member: group.member ?? group.name,
        productId: group.productId,
        version: group.version,
        price: group.price,
        slots,
        occupied: slots.filter((slot) => Boolean(slot.occupantId)).length,
        total: slots.length,
      }
    })
}

/** 构造订单商品快照 */
export function buildItemSnapshot(carpool: Carpool, slotIds: string[]): OrderItemSnapshot {
  const slots = carpool.positions.filter((slot) => slotIds.includes(slot.id))
  const groups = shareGroupsOf(carpool)
  const group = groups.find((item) => slots.some((slot) => item.slotIds.includes(slot.id)))
  const unitPrice = slots.length ? slotPrice(carpool, slots[0]) : carpool.price
  if (!group) {
    return {
      kind: 'legacy',
      name: carpool.productName,
      unitPrice: carpool.price,
      quantity: slots.length,
      slotLabels: slots.map((slot) => slot.label),
    }
  }
  return {
    groupId: group.id,
    kind: group.kind,
    name: group.name,
    version: group.version,
    unitPrice,
    quantity: slots.length,
    slotLabels: slots.map((slot) => slot.label),
  }
}

/** 构造订单费用快照 */
export function buildFeeSnapshot(carpool: Carpool, slotIds: string[]): OrderFeeSnapshot {
  const feeRules: FeeRules = carpool.feeRules ?? defaultFeeRules(carpool.price)
  const slots = carpool.positions.filter((slot) => slotIds.includes(slot.id))
  const unitPrice = slots.length ? slotPrice(carpool, slots[0]) : feeRules.unitPrice
  const quantity = slots.length
  const serviceFee = feeRules.serviceFee
  const shippingFee = feeRules.shippingFee
  const total = unitPrice * quantity + serviceFee + shippingFee
  return { unitPrice, quantity, serviceFee, shippingFee, total }
}

/** 构造订单规则快照 */
export function buildRulesSnapshot(carpool: Carpool, at: string): OrderRulesSnapshot {
  return {
    rulesVersion: carpool.rulesVersion ?? 1,
    rules: carpool.rules,
    fallbackRule: carpool.fallbackRule ?? fallbackRuleTemplates[purchaseModeOf(carpool)],
    guarantees: carpool.guarantees ?? defaultGuarantees(purchaseModeOf(carpool)),
    publishedAt: at,
  }
}

/** 车次中作为车员的用户（排除车主自留位与车主本人） */
export function riderIdsOf(carpool: Carpool | undefined): string[] {
  if (!carpool) return []
  const ids: string[] = []
  carpool.positions.forEach((slot) => {
    if (!slot.occupantId) return
    if (slot.occupantId === carpool.ownerId) return
    if (!ids.includes(slot.occupantId)) ids.push(slot.occupantId)
  })
  return ids
}
