/**
 * V2.0 团体 / 活动 / 活动商品目录的派生查询。
 */
import type { AppData, ArtistGroup, EventInfo, EventProduct } from '../types'
import { MIN_RESERVE_HOURS } from '../config'

export function groupsOf(data: AppData): ArtistGroup[] {
  return Array.isArray(data.groups) ? data.groups : []
}

export function eventsOf(data: AppData, groupId?: string): EventInfo[] {
  const events = Array.isArray(data.events) ? data.events : []
  return groupId ? events.filter((event) => event.groupId === groupId) : events
}

export function eventOf(data: AppData, eventId?: string): EventInfo | undefined {
  if (!eventId) return undefined
  return eventsOf(data).find((event) => event.id === eventId)
}

export function groupOf(data: AppData, groupId?: string): ArtistGroup | undefined {
  if (!groupId) return undefined
  return groupsOf(data).find((group) => group.id === groupId)
}

export function productsOf(data: AppData, eventId?: string): EventProduct[] {
  const products = Array.isArray(data.eventProducts) ? data.eventProducts : []
  if (!eventId) return products
  return products.filter((product) => product.eventId === eventId)
}

export function productOf(data: AppData, productId?: string): EventProduct | undefined {
  if (!productId) return undefined
  return productsOf(data).find((product) => product.id === productId)
}

/** 活动的商品类别列表（用于筛选） */
export function productCategoriesOf(data: AppData, eventId?: string) {
  return [...new Set(productsOf(data, eventId).map((product) => product.category))].sort()
}

/** 商品在某个成员位置的单价 */
export function memberPriceOf(product: EventProduct | undefined, member?: string) {
  if (!product) return 0
  if (!member) return product.price
  return product.memberPrices?.[member] ?? product.price
}

/**
 * 最晚允许截团时间 = 官方下单截止时间 − 最低采购预留时间。
 */
export function latestCutDeadline(event: EventInfo | undefined) {
  if (!event?.orderDeadline) return ''
  const deadline = new Date(event.orderDeadline).getTime()
  if (Number.isNaN(deadline)) return ''
  return new Date(deadline - MIN_RESERVE_HOURS * 3600 * 1000).toISOString()
}

/** 车主设置的截团时间是否超过平台最晚允许时间 */
export function exceedsLatestCutDeadline(data: AppData, eventId: string | undefined, deadline: string) {
  const latest = latestCutDeadline(eventOf(data, eventId))
  if (!latest || !deadline) return false
  return new Date(deadline).getTime() > new Date(latest).getTime()
}

/** 热度排序用：活动下的拼车数量 */
export function eventHeatOf(data: AppData, eventId: string) {
  return data.carpools.filter((carpool) => carpool.eventId === eventId).length
}
