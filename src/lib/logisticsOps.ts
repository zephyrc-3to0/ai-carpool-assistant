import type {
  AddressStatus,
  AppData,
  DomesticShipment,
  DomesticStatus,
  InternationalShipment,
  InternationalStatus,
  Notification,
  OrderShippingAddress,
  SavedAddress,
} from '../types'
import { collectionTriggerStatuses, uid } from '../utils'

export interface AddressInput {
  label: string
  receiverName: string
  phone: string
  province: string
  city: string
  district: string
  detail: string
}

export interface OpResult<T = undefined> {
  ok: boolean
  message: string
  data?: T
  next: AppData
}

const fail = <T,>(message: string, data: AppData): OpResult<T> => ({ ok: false, message, next: data })
const done = <T,>(message: string, data: AppData, payload?: T): OpResult<T> => ({ ok: true, message, next: data, data: payload })

/** 同一车次对同一车员的催促最小间隔（毫秒），避免连续点击产生大量重复通知 */
export const URGE_COOLDOWN = 6 * 60 * 60 * 1000

const now = () => new Date().toISOString()

export function riderIdsOf(carpool: AppData['carpools'][number] | undefined) {
  if (!carpool) return []
  const ids: string[] = []
  carpool.positions.forEach((slot) => {
    if (slot.occupantId && slot.occupantId !== carpool.ownerId && !ids.includes(slot.occupantId)) {
      ids.push(slot.occupantId)
    }
  })
  return ids
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

function isPhone(value: string) {
  return /^1\d{10}$/.test(value.replace(/\s|-/g, ''))
}

function validateAddress(input: AddressInput) {
  if (!input.receiverName.trim()) return '请填写收件人姓名。'
  if (!isPhone(input.phone)) return '请填写 11 位手机号。'
  if (!input.province.trim() || !input.city.trim()) return '请至少填写省份和城市。'
  if (!input.detail.trim()) return '请填写详细地址。'
  return ''
}

function normalizeAddress(input: AddressInput, label: string) {
  return {
    label: label.trim() || '默认',
    receiverName: input.receiverName.trim(),
    phone: input.phone.trim(),
    province: input.province.trim(),
    city: input.city.trim(),
    district: input.district.trim(),
    detail: input.detail.trim(),
  }
}

// ---------------------------------------------------------------------------
// 个人地址簿
// ---------------------------------------------------------------------------

export function addSavedAddressOp(
  data: AppData,
  userId: string,
  input: AddressInput & { asDefault?: boolean },
): OpResult<SavedAddress> {
  const error = validateAddress(input)
  if (error) return fail(error, data)
  const address: SavedAddress = {
    id: uid('addr'),
    userId,
    ...normalizeAddress(input, input.label),
    isDefault: false,
    createdAt: now(),
  }
  const mine = data.savedAddresses.filter((item) => item.userId === userId)
  const hasDefault = mine.some((item) => item.isDefault)
  address.isDefault = Boolean(input.asDefault) || !hasDefault
  const next: AppData = {
    ...data,
    savedAddresses: [
      ...data.savedAddresses.map((item) => (
        item.userId === userId && address.isDefault ? { ...item, isDefault: false } : item
      )),
      address,
    ],
  }
  return done('地址已保存到我的地址簿。', next, address)
}

export function updateSavedAddressOp(
  data: AppData,
  userId: string,
  addressId: string,
  input: AddressInput,
): OpResult {
  const existing = data.savedAddresses.find((item) => item.id === addressId)
  if (!existing) return fail('地址不存在。', data)
  if (existing.userId !== userId) return fail('只能管理自己的地址。', data)
  const error = validateAddress(input)
  if (error) return fail(error, data)
  const next: AppData = {
    ...data,
    savedAddresses: data.savedAddresses.map((item) => item.id === addressId ? {
      ...item,
      ...normalizeAddress(input, input.label || item.label),
    } : item),
  }
  return done('地址已更新。', next)
}

export function deleteSavedAddressOp(data: AppData, userId: string, addressId: string): OpResult {
  const existing = data.savedAddresses.find((item) => item.id === addressId)
  if (!existing) return fail('地址不存在。', data)
  if (existing.userId !== userId) return fail('只能管理自己的地址。', data)
  const next: AppData = {
    ...data,
    // 只删除地址簿副本，已提交的订单地址快照不受影响
    savedAddresses: data.savedAddresses.filter((item) => item.id !== addressId),
  }
  return done('地址已删除，已提交的订单地址保持不变。', next)
}

export function setDefaultSavedAddressOp(data: AppData, userId: string, addressId: string): OpResult {
  const existing = data.savedAddresses.find((item) => item.id === addressId)
  if (!existing) return fail('地址不存在。', data)
  if (existing.userId !== userId) return fail('只能管理自己的地址。', data)
  const next: AppData = {
    ...data,
    savedAddresses: data.savedAddresses.map((item) => (
      item.userId === userId ? { ...item, isDefault: item.id === addressId } : item
    )),
  }
  return done('已设为默认地址。', next)
}

// ---------------------------------------------------------------------------
// 订单收货地址快照
// ---------------------------------------------------------------------------

export function submitOrderAddressOp(
  data: AppData,
  userId: string,
  carpoolId: string,
  input: AddressInput & { saveToBook: boolean; sourceAddressId?: string },
): OpResult<OrderShippingAddress> {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  const isRider = carpool.positions.some((slot) => slot.occupantId === userId)
  if (!isRider) return fail('只有本车车员可以填写收货地址。', data)
  if (!carpool.addressCollection?.enabled) {
    return fail('车主还没有开启地址收集，请稍后再试。', data)
  }
  const domestic = data.domesticShipments.find((item) => item.carpoolId === carpoolId && item.userId === userId)
  if (domestic && (domestic.status === 'shipped' || domestic.status === 'received')) {
    return fail('订单已经发货，无法再修改收货地址。', data)
  }
  const error = validateAddress(input)
  if (error) return fail(error, data)

  const timestamp = now()
  const existing = data.orderAddresses.find((item) => item.carpoolId === carpoolId && item.userId === userId)
  const record: OrderShippingAddress = {
    id: existing?.id ?? uid('oaddr'),
    carpoolId,
    userId,
    status: 'submitted',
    ...normalizeAddress(input, input.label || '本次填写'),
    sourceAddressId: input.sourceAddressId,
    submittedAt: existing?.submittedAt ?? timestamp,
    updatedAt: timestamp,
    urgeCount: existing?.urgeCount ?? 0,
  }

  const savedAddresses = [...data.savedAddresses]
  if (input.saveToBook) {
    const mine = savedAddresses.filter((item) => item.userId === userId)
    const hasDefault = mine.some((item) => item.isDefault)
    savedAddresses.push({
      id: uid('addr'),
      userId,
      ...normalizeAddress(input, input.label),
      isDefault: !hasDefault,
      createdAt: timestamp,
    })
  }

  const next: AppData = {
    ...data,
    savedAddresses,
    orderAddresses: [
      record,
      ...data.orderAddresses.filter((item) => !(item.carpoolId === carpoolId && item.userId === userId)),
    ],
  }
  return done('收货地址已提交给车主。', next, record)
}

// ---------------------------------------------------------------------------
// 国际物流
// ---------------------------------------------------------------------------

export function updateInternationalShipmentOp(
  data: AppData,
  ownerId: string,
  carpoolId: string,
  input: { carrier: string; trackingNumber: string; trackingUrl: string; status: InternationalStatus; note: string },
): OpResult {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以修改国际物流。', data)
  const carrier = input.carrier.trim()
  const trackingNumber = input.trackingNumber.trim()
  if (!carrier) return fail('请填写国际物流公司。', data)
  if (!trackingNumber) return fail('请填写国际物流单号。', data)

  const timestamp = now()
  const existing = data.internationalShipments.find((item) => item.carpoolId === carpoolId)
  const statusChanged = !existing || existing.status !== input.status
  const shipment: InternationalShipment = {
    id: existing?.id ?? uid('intl'),
    carpoolId,
    carrier,
    trackingNumber,
    trackingUrl: input.trackingUrl.trim(),
    status: input.status,
    note: input.note.trim(),
    updatedAt: timestamp,
    timeline: existing ? existing.timeline.slice() : [],
  }
  if (statusChanged) {
    shipment.timeline.push({ id: uid('tl'), status: input.status, note: shipment.note, at: timestamp })
  } else if (shipment.timeline.length) {
    const last = shipment.timeline[shipment.timeline.length - 1]
    shipment.timeline[shipment.timeline.length - 1] = { ...last, note: shipment.note, at: timestamp }
  }

  // 首次进入运输状态时自动开启地址收集，且不会重复创建收集任务
  const shouldOpenCollection = collectionTriggerStatuses.includes(input.status) && !carpool.addressCollection?.enabled

  let carpools = data.carpools
  let orderAddresses = data.orderAddresses
  const notifications = [...data.notifications]

  if (shouldOpenCollection) {
    carpools = data.carpools.map((item) => item.id !== carpoolId ? item : {
      ...item,
      addressCollection: { enabled: true, startedAt: timestamp },
    })
    const riders = riderIdsOf(carpool)
    const existingForCarpool = orderAddresses.filter((item) => item.carpoolId === carpoolId)
    const pendingRecords: OrderShippingAddress[] = riders
      .filter((riderId) => !existingForCarpool.some((item) => item.userId === riderId))
      .map((riderId) => ({
        id: uid('oaddr'),
        carpoolId,
        userId: riderId,
        status: 'pending' as AddressStatus,
        label: '',
        receiverName: '',
        phone: '',
        province: '',
        city: '',
        district: '',
        detail: '',
        urgeCount: 0,
      }))
    orderAddresses = [
      ...existingForCarpool,
      ...pendingRecords,
      ...orderAddresses.filter((item) => item.carpoolId !== carpoolId),
    ]
    riders.forEach((riderId) => {
      notifications.unshift(makeNotification(
        riderId,
        'address_required',
        '请补充收货地址',
        `「${carpool.title}」已进入国际运输，请尽快填写你的收货地址，便于车主统一打包发货。`,
        carpoolId,
        timestamp,
      ))
    })
  }

  const next: AppData = {
    ...data,
    internationalShipments: [
      shipment,
      ...data.internationalShipments.filter((item) => item.carpoolId !== carpoolId),
    ],
    carpools,
    orderAddresses,
    notifications,
  }
  return done(
    shouldOpenCollection ? '物流状态已更新，地址收集已开启，车员会收到补充地址提醒。' : '国际物流信息已保存。',
    next,
  )
}

export function confirmArrivalCheckOp(data: AppData, ownerId: string, carpoolId: string): OpResult {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以确认到货检查。', data)
  const shipment = data.internationalShipments.find((item) => item.carpoolId === carpoolId)
  if (!shipment) return fail('请先录入国际物流信息。', data)
  if (shipment.status !== 'received') {
    return fail('请先把物流状态更新为「车主已签收」，再确认到货检查完成。', data)
  }
  const timestamp = now()
  const note = '商品已验货完毕，开始国内打包与发货。'
  const next: AppData = {
    ...data,
    internationalShipments: data.internationalShipments.map((item) => item.carpoolId !== carpoolId ? item : {
      ...item,
      status: 'checked' as InternationalStatus,
      note,
      updatedAt: timestamp,
      timeline: [...item.timeline, { id: uid('tl'), status: 'checked' as InternationalStatus, note, at: timestamp }],
    }),
    carpools: data.carpools.map((item) => item.id !== carpoolId ? item : {
      ...item,
      addressCollection: {
        enabled: true,
        startedAt: item.addressCollection?.startedAt ?? timestamp,
        closedAt: timestamp,
      },
    }),
    // 未提交地址的车员标记为逾期，但仍可补交
    orderAddresses: data.orderAddresses.map((item) => (
      item.carpoolId === carpoolId && item.status === 'pending'
        ? { ...item, status: 'overdue' as AddressStatus }
        : item
    )),
    notifications: [
      ...riderIdsOf(carpool).map((riderId) => makeNotification(
        riderId,
        'arrival_checked',
        '到货检查已完成',
        `「${carpool.title}」的商品已验货完毕，车主开始国内打包发货。未提交地址的成员仍可补交地址。`,
        carpoolId,
        timestamp,
      )),
      ...data.notifications,
    ],
  }
  return done('到货检查已完成，进入国内发货阶段。', next)
}

// ---------------------------------------------------------------------------
// 地址收集
// ---------------------------------------------------------------------------

export function urgeAddressOp(data: AppData, ownerId: string, carpoolId: string, userId: string): OpResult {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以催促填写地址。', data)
  const record = data.orderAddresses.find((item) => item.carpoolId === carpoolId && item.userId === userId)
  if (!record) return fail('该成员还没有地址收集记录。', data)
  if (record.status === 'submitted') return fail('该车员已经提交了地址。', data)
  const timestamp = now()
  if (record.urgedAt && Date.now() - new Date(record.urgedAt).getTime() < URGE_COOLDOWN) {
    return fail('刚刚已经催促过，请勿重复发送提醒。', data)
  }
  const user = data.users.find((item) => item.id === userId)
  const next: AppData = {
    ...data,
    orderAddresses: data.orderAddresses.map((item) => (
      item.carpoolId === carpoolId && item.userId === userId
        ? { ...item, urgedAt: timestamp, urgeCount: item.urgeCount + 1 }
        : item
    )),
    notifications: [
      makeNotification(
        userId,
        'address_urge',
        '车主催你填写收货地址',
        `「${carpool.title}」的车主提醒你尽快填写收货地址，否则可能无法赶上本批发货。`,
        carpoolId,
        timestamp,
      ),
      ...data.notifications,
    ],
  }
  return done(`已向 ${user?.nickname ?? '该车员'} 发送催促通知。`, next)
}

// ---------------------------------------------------------------------------
// 国内发货
// ---------------------------------------------------------------------------

export function saveDomesticShipmentOp(
  data: AppData,
  ownerId: string,
  carpoolId: string,
  userId: string,
  input: { carrier: string; trackingNumber: string; shippedAt: string; note: string; status?: DomesticStatus },
): OpResult {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以录入国内发货信息。', data)
  const address = data.orderAddresses.find((item) => item.carpoolId === carpoolId && item.userId === userId)
  const carrier = input.carrier.trim()
  const trackingNumber = input.trackingNumber.trim()
  const note = input.note.trim()
  const existing = data.domesticShipments.find((item) => item.carpoolId === carpoolId && item.userId === userId)
  const timestamp = now()

  let status: DomesticStatus
  if (input.status) {
    status = input.status
  } else if (carrier && trackingNumber) {
    status = 'shipped'
  } else if (carrier) {
    status = 'pending_ship'
  } else {
    status = existing?.status ?? 'pending_pack'
  }
  if ((status === 'shipped' || status === 'received') && (!carrier || !trackingNumber)) {
    return fail('填写快递公司和快递单号后，才能标记为已发货。', data)
  }
  if (status === 'shipped' && address?.status !== 'submitted') {
    return fail('该车员还没有提交有效收货地址，不能标记为已发货。', data)
  }
  if (status === 'received' && existing?.status !== 'shipped') {
    return fail('请先把该车员的订单标记为已发货，再标记签收。', data)
  }

  const shipment: DomesticShipment = {
    id: existing?.id ?? uid('dom'),
    carpoolId,
    userId,
    carrier,
    trackingNumber,
    shippedAt: input.shippedAt || existing?.shippedAt || (status === 'shipped' || status === 'received' ? timestamp : ''),
    note,
    status,
    updatedAt: timestamp,
  }
  const shouldNotify = status === 'shipped' && existing?.status !== 'shipped' && existing?.status !== 'received'
  const user = data.users.find((item) => item.id === userId)

  const next: AppData = {
    ...data,
    domesticShipments: [
      shipment,
      ...data.domesticShipments.filter((item) => !(item.carpoolId === carpoolId && item.userId === userId)),
    ],
    notifications: shouldNotify
      ? [
        makeNotification(
          userId,
          'domestic_shipped',
          '你的包裹已发出',
          `车主已为你在「${carpool.title}」的订单发货，快递公司 ${carrier}，单号 ${trackingNumber}。`,
          carpoolId,
          timestamp,
        ),
        ...data.notifications,
      ]
      : data.notifications,
  }
  return done(`已保存 ${user?.nickname ?? '车员'} 的国内发货信息。`, next)
}
