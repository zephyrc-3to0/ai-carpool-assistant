/**
 * V1.3-A.1 参与订单聚合。
 *
 * 原则：合并展示不等于覆盖交易记录。
 * - 购买记录：每次成功付款保留独立订单（data.orders），永不覆盖
 * - 参与订单汇总：按 carpoolId + userId 派生，不新增物理汇总表
 */
import type { AppData, Order } from '../types'
import { isReservationAlive, slotPrice } from './share'

export interface ParticipationItem {
  /** 商品 / 成员位置分组 ID（legacy 车次没有分组） */
  groupId?: string
  /** 商品名称 / 成员名称 */
  name: string
  /** 版本说明 */
  version?: string
  /** 累计数量 */
  quantity: number
  /** 单价 */
  unitPrice: number
  /** 累计商品金额 */
  amount: number
  /** 涉及的成员位置 / 份额名称 */
  labels: string[]
}

export interface ParticipationSummary {
  carpoolId: string
  userId: string
  /** 参与该车的全部独立购买记录 */
  orders: Order[]
  /** 合并后的商品 / 成员位置明细 */
  items: ParticipationItem[]
  /** 累计购买份数 */
  totalQuantity: number
  /** 累计商品金额（不含服务费与运费） */
  goodsAmount: number
  /** 累计服务费 */
  serviceFee: number
  /** 累计国内运费 */
  shippingFee: number
  /** 累计已支付金额 */
  paidAmount: number
  /** 尚未支付的费用（当前处于预留状态的份额） */
  unpaidAmount: number
  /** 购买记录条数 */
  orderCount: number
  /** 是否是车主本人 */
  isOwner: boolean
  /** 是否以车员身份参与 */
  isParticipant: boolean
}

function emptySummary(carpoolId: string, userId: string): ParticipationSummary {
  return {
    carpoolId,
    userId,
    orders: [],
    items: [],
    totalQuantity: 0,
    goodsAmount: 0,
    serviceFee: 0,
    shippingFee: 0,
    paidAmount: 0,
    unpaidAmount: 0,
    orderCount: 0,
    isOwner: false,
    isParticipant: false,
  }
}

/**
 * 汇总某个用户在某辆拼车中的参与订单。
 * 每笔订单的商品、价格、费用与规则快照都完整保留，汇总只是派生视图。
 */
export function participationOf(data: AppData, carpoolId: string, userId: string): ParticipationSummary {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return emptySummary(carpoolId, userId)

  const summary = emptySummary(carpoolId, userId)
  summary.isOwner = carpool.ownerId === userId
  summary.isParticipant = carpool.positions.some(
    (slot) => slot.occupantId === userId && userId !== carpool.ownerId,
  )

  const orders = data.orders.filter((order) => order.carpoolId === carpoolId && order.userId === userId)
  summary.orders = orders
  summary.orderCount = orders.length

  const itemMap = new Map<string, ParticipationItem>()

  orders.forEach((order) => {
    const snapshot = order.itemSnapshot
    const fee = order.feeSnapshot
    const quantity = snapshot?.quantity ?? order.slotIds.length
    const unitPrice = snapshot?.unitPrice ?? (fee?.unitPrice ?? order.amount)
    const labels = snapshot?.slotLabels ?? []

    const key = [
      snapshot?.groupId ?? 'legacy',
      snapshot?.name ?? carpool.productName,
      snapshot?.version ?? '',
      unitPrice,
    ].join('|')

    const existing = itemMap.get(key)
    if (existing) {
      existing.quantity += quantity
      existing.amount += unitPrice * quantity
      existing.labels = [...existing.labels, ...labels]
    } else {
      itemMap.set(key, {
        groupId: snapshot?.groupId,
        name: snapshot?.name ?? carpool.productName,
        version: snapshot?.version,
        quantity,
        unitPrice,
        amount: unitPrice * quantity,
        labels: [...labels],
      })
    }

    summary.totalQuantity += quantity
    summary.goodsAmount += unitPrice * quantity
    summary.serviceFee += fee?.serviceFee ?? 0
    summary.shippingFee += fee?.shippingFee ?? 0
    summary.paidAmount += order.amount
  })

  summary.items = [...itemMap.values()]

  // 尚未支付：当前账号在该车还有有效预留（尚未付款）
  const reserved = carpool.positions.filter(
    (slot) => slot.reservation?.userId === userId && isReservationAlive(slot),
  )
  if (reserved.length) {
    const unitPrice = slotPrice(carpool, reserved[0])
    const feeRules = carpool.feeRules
    summary.unpaidAmount = unitPrice * reserved.length + (feeRules?.serviceFee ?? 0) + (feeRules?.shippingFee ?? 0)
  }

  return summary
}

/** 汇总当前用户参与的全部拼车（以车员身份参与的车次） */
export function participationsOf(data: AppData, userId: string): ParticipationSummary[] {
  const carpoolIds = new Set<string>()
  data.carpools.forEach((carpool) => {
    if (carpool.ownerId === userId) return
    if (carpool.positions.some((slot) => slot.occupantId === userId)) carpoolIds.add(carpool.id)
  })
  data.orders.forEach((order) => {
    if (order.userId !== userId || order.ownerHeld) return
    carpoolIds.add(order.carpoolId)
  })
  return [...carpoolIds]
    .map((carpoolId) => participationOf(data, carpoolId, userId))
    .filter((summary) => summary.orderCount > 0 || summary.isParticipant)
}

/** 参与订单的展示标题，例如「成员 A ×1」 */
export function participationItemLabel(item: ParticipationItem) {
  return item.version ? `${item.name} · ${item.version}` : item.name
}
