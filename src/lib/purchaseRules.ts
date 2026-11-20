import type { AppData, Carpool, PositionSlot } from '../types'

/** 取得份额对应的活动商品 ID。历史平铺份额没有商品 ID。 */
export function productIdOfSlot(carpool: Carpool, slot: PositionSlot): string | undefined {
  return (carpool.shareGroups ?? []).find((group) => group.id === slot.groupId || group.slotIds.includes(slot.id))?.productId
}

/**
 * 统计同一用户在同一活动中已经有效占用的某商品件数。
 * 车员付款占位与车主自购都以 positions[] 为唯一库存事实来源。
 */
export function purchasedProductUnitsOf(
  data: AppData,
  eventId: string | undefined,
  userId: string,
  productId: string,
): number {
  if (!eventId) return 0
  return data.carpools
    .filter((carpool) => carpool.eventId === eventId)
    .reduce((total, carpool) => total + carpool.positions.filter((slot) => (
      slot.occupantId === userId && productIdOfSlot(carpool, slot) === productId
    )).length, 0)
}

/** 某活动商品对当前用户仍可购买的件数。 */
export function remainingProductQuotaOf(
  data: AppData,
  eventId: string | undefined,
  userId: string,
  productId: string,
): number {
  const product = (data.eventProducts ?? []).find((item) => item.id === productId && item.eventId === eventId)
  if (!product) return Number.MAX_SAFE_INTEGER
  return Math.max(0, product.perUserLimit - purchasedProductUnitsOf(data, eventId, userId, productId))
}

/**
 * 校验一组待占用份额是否符合活动商品限购。
 * 返回空字符串表示通过；该校验会在预留和付款确认两个阶段重复执行。
 */
export function validateActivityProductLimits(
  data: AppData,
  carpool: Carpool,
  userId: string,
  slotIds: string[],
): string {
  if (!carpool.eventId) return ''
  const selectedByProduct = new Map<string, number>()
  for (const slotId of slotIds) {
    const slot = carpool.positions.find((item) => item.id === slotId)
    if (!slot) continue
    const productId = productIdOfSlot(carpool, slot)
    if (!productId) continue
    selectedByProduct.set(productId, (selectedByProduct.get(productId) ?? 0) + 1)
  }

  for (const [productId, selected] of selectedByProduct) {
    const product = (data.eventProducts ?? []).find((item) => item.id === productId && item.eventId === carpool.eventId)
    if (!product) return '所选商品不属于当前活动，请返回详情页重新选择。'
    const purchased = purchasedProductUnitsOf(data, carpool.eventId, userId, productId)
    if (purchased + selected > product.perUserLimit) {
      const remaining = Math.max(0, product.perUserLimit - purchased)
      return `「${product.name} · ${product.spec}」每人限购 ${product.perUserLimit} 件，你还可以购买 ${remaining} 件。`
    }
  }
  return ''
}
