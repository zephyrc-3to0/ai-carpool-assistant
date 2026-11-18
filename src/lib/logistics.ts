import type { AppData, DomesticStatus, InternationalShipment, OrderShippingAddress, SavedAddress } from '../types'

export function getInternationalShipment(data: AppData, carpoolId: string): InternationalShipment | undefined {
  return data.internationalShipments.find((item) => item.carpoolId === carpoolId)
}

export function getOrderAddress(data: AppData, carpoolId: string, userId: string): OrderShippingAddress | undefined {
  return data.orderAddresses.find((item) => item.carpoolId === carpoolId && item.userId === userId)
}

export function getDomesticShipment(data: AppData, carpoolId: string, userId: string) {
  return data.domesticShipments.find((item) => item.carpoolId === carpoolId && item.userId === userId)
}

/** 根据地址收集情况与发货记录推导国内发货状态 */
export function deriveDomesticStatus(data: AppData, carpoolId: string, userId: string): DomesticStatus {
  const shipment = getDomesticShipment(data, carpoolId, userId)
  if (shipment) return shipment.status
  const address = getOrderAddress(data, carpoolId, userId)
  if (!address || address.status !== 'submitted') return 'pending_address'
  return 'pending_pack'
}

/** 个人地址簿：默认地址优先 */
export function sortSavedAddresses(addresses: SavedAddress[]) {
  return [...addresses].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    return a.createdAt < b.createdAt ? -1 : 1
  })
}
