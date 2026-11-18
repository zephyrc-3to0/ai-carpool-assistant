import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createInitialData, normalizeData, STORAGE_KEY } from './data'
import {
  addSavedAddressOp,
  confirmArrivalCheckOp,
  deleteSavedAddressOp,
  saveDomesticShipmentOp,
  setDefaultSavedAddressOp,
  submitOrderAddressOp,
  updateInternationalShipmentOp,
  updateSavedAddressOp,
  urgeAddressOp,
  type AddressInput,
} from './lib/logisticsOps'
import {
  checkCreatePermission,
  checkJoinPermission,
  completeOwnerFulfillmentOp,
  completeRiderOrderOp,
  reviewAppealOp,
  reviewComplaintOp,
  submitAppealOp,
  submitComplaintOp,
  type ComplaintInput,
} from './lib/reputationOps'
import { permissionsOf, reputationOf, type ReputationPermissions } from './lib/reputation'
import type {
  Appeal,
  AppData,
  Carpool,
  Chat,
  Complaint,
  ComplaintCategory,
  DomesticStatus,
  InternationalStatus,
  OrderShippingAddress,
  PositionSlot,
  SavedAddress,
  UserReputation,
} from './types'
import { uid } from './utils'

export interface NewCarpoolInput {
  title: string
  eventName: string
  productName: string
  price: number
  deadline: string
  description: string
  rules: string
  positionGroups: Array<{ label: string; quantity: number }>
}

export type { AddressInput }

export interface InternationalShipmentInput {
  carrier: string
  trackingNumber: string
  trackingUrl: string
  status: InternationalStatus
  note: string
}

export interface DomesticShipmentInput {
  carrier: string
  trackingNumber: string
  shippedAt: string
  note: string
  status?: DomesticStatus
}

interface ActionResult<T = undefined> {
  ok: boolean
  message: string
  data?: T
}

interface AppStoreValue {
  data: AppData
  currentUser: AppData['users'][number]
  switchUser: (userId: string) => void
  createCarpool: (input: NewCarpoolInput) => ActionResult<Carpool>
  joinCarpool: (carpoolId: string, slotIds: string[]) => ActionResult
  confirmFormed: (carpoolId: string) => ActionResult<Chat>
  updateChat: (chatId: string, changes: Pick<Chat, 'name' | 'announcement'>) => ActionResult
  sendMessage: (chatId: string, content: string) => ActionResult
  // V1.1 个人地址簿
  addSavedAddress: (input: AddressInput & { asDefault?: boolean }) => ActionResult<SavedAddress>
  updateSavedAddress: (addressId: string, input: AddressInput) => ActionResult
  deleteSavedAddress: (addressId: string) => ActionResult
  setDefaultSavedAddress: (addressId: string) => ActionResult
  // V1.1 订单收货地址快照
  submitOrderAddress: (
    carpoolId: string,
    input: AddressInput & { saveToBook: boolean; sourceAddressId?: string },
  ) => ActionResult<OrderShippingAddress>
  // V1.1 国际物流
  updateInternationalShipment: (carpoolId: string, input: InternationalShipmentInput) => ActionResult
  confirmArrivalCheck: (carpoolId: string) => ActionResult
  // V1.1 地址收集
  urgeAddress: (carpoolId: string, userId: string) => ActionResult
  // V1.1 国内发货
  saveDomesticShipment: (carpoolId: string, userId: string, input: DomesticShipmentInput) => ActionResult
  // V1.1 站内通知
  markNotificationRead: (notificationId: string) => void
  markAllNotificationsRead: () => void
  // V1.2 信誉
  reputationOf: (userId: string) => UserReputation
  permissions: ReputationPermissions
  completeRiderOrder: (carpoolId: string) => ActionResult
  completeOwnerFulfillment: (carpoolId: string) => ActionResult
  submitComplaint: (input: ComplaintInput) => ActionResult<Complaint>
  submitAppeal: (reputationEventId: string, reason: string) => ActionResult<Appeal>
  reviewComplaint: (
    complaintId: string,
    decision: 'confirm' | 'reject',
    input?: { deduction?: number; note?: string },
  ) => ActionResult
  reviewAppeal: (appealId: string, decision: 'approve' | 'reject', note?: string) => ActionResult
  setAdminMode: (on: boolean) => void
}

const AppStoreContext = createContext<AppStoreValue | null>(null)

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return createInitialData()
    const parsed = JSON.parse(saved) as AppData
    if (!parsed || !Array.isArray(parsed.carpools)) return createInitialData()
    // V1 存量数据会被补齐 V1.1 需要的字段与集合，原有拼车 / 订单 / 群聊保持不变
    return normalizeData(parsed)
  } catch {
    return createInitialData()
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  const currentUser = data.users.find((user) => user.id === data.currentUserId) ?? data.users[0]

  const value = useMemo<AppStoreValue>(() => ({
    data,
    currentUser,
    switchUser(userId) {
      if (!data.users.some((user) => user.id === userId)) return
      setData((current) => ({ ...current, currentUserId: userId }))
    },
    createCarpool(input) {
      // V1.2 权限校验：信誉分不足 70 时不能发起新的拼车
      const permission = checkCreatePermission(data, currentUser.id)
      if (!permission.ok) {
        return { ok: false, message: permission.message }
      }
      const carpoolId = uid('car')
      const positions: PositionSlot[] = input.positionGroups.flatMap((group) =>
        Array.from({ length: group.quantity }, (_, index) => ({
          id: uid('slot'),
          label: group.quantity > 1 ? `${group.label} ${index + 1}` : group.label,
        })),
      )
      const carpool: Carpool = {
        id: carpoolId,
        title: input.title,
        eventName: input.eventName,
        productName: input.productName,
        price: input.price,
        deadline: input.deadline,
        description: input.description,
        rules: input.rules,
        ownerId: currentUser.id,
        status: 'recruiting',
        positions,
        createdAt: new Date().toISOString(),
      }
      setData((current) => ({ ...current, carpools: [carpool, ...current.carpools] }))
      return { ok: true, message: '拼车已发布。', data: carpool }
    },
    joinCarpool(carpoolId, slotIds) {
      // V1.2 权限校验：信誉分不足 60 时不能加入新的拼车
      const permission = checkJoinPermission(data, currentUser.id, carpoolId)
      if (!permission.ok) {
        return { ok: false, message: permission.message }
      }
      const carpool = data.carpools.find((item) => item.id === carpoolId)
      if (!carpool) return { ok: false, message: '没有找到这辆拼车，请返回广场重试。' }
      if (slotIds.length === 0) return { ok: false, message: '请至少选择一个空余位置。' }
      const selected = carpool.positions.filter((slot) => slotIds.includes(slot.id))
      if (selected.length !== slotIds.length || selected.some((slot) => slot.occupantId)) {
        return { ok: false, message: '所选位置已发生变化，请重新选择。' }
      }
      const orderId = uid('order')
      setData((current) => ({
        ...current,
        carpools: current.carpools.map((item) => item.id !== carpoolId ? item : {
          ...item,
          positions: item.positions.map((slot) => slotIds.includes(slot.id)
            ? { ...slot, occupantId: currentUser.id, orderId }
            : slot),
        }),
        orders: [{
          id: orderId,
          carpoolId,
          userId: currentUser.id,
          slotIds,
          amount: carpool.price * slotIds.length,
          paidAt: new Date().toISOString(),
        }, ...current.orders],
      }))
      return { ok: true, message: '模拟支付成功，位置已为你锁定。' }
    },
    confirmFormed(carpoolId) {
      const carpool = data.carpools.find((item) => item.id === carpoolId)
      if (!carpool) return { ok: false, message: '没有找到这辆拼车。' }
      if (carpool.ownerId !== currentUser.id) return { ok: false, message: '只有车主可以确认拼成。' }
      if (carpool.status === 'formed') {
        const existing = data.chats.find((chat) => chat.carpoolId === carpoolId)
        return existing
          ? { ok: true, message: '这辆拼车已经拼成。', data: existing }
          : { ok: false, message: '群聊数据缺失，请刷新页面重试。' }
      }
      if (carpool.status !== 'recruiting') return { ok: false, message: '当前状态不能确认拼成。' }
      if (!carpool.positions.some((slot) => slot.occupantId)) {
        return { ok: false, message: '还没有车员加入，暂时不能确认拼成。' }
      }
      const chat: Chat = {
        id: uid('chat'),
        carpoolId,
        name: `${carpool.productName}拼车群`,
        announcement: '拼车已成立。车主会在这里同步下单、到货和发货进度，请大家留意群消息。',
        createdAt: new Date().toISOString(),
        messages: [{
          id: uid('msg'),
          userId: currentUser.id,
          content: '拼车成功，群聊已自动创建。',
          sentAt: new Date().toISOString(),
          system: true,
        }],
      }
      setData((current) => ({
        ...current,
        carpools: current.carpools.map((item) => item.id === carpoolId ? { ...item, status: 'formed' } : item),
        chats: [chat, ...current.chats.filter((item) => item.carpoolId !== carpoolId)],
      }))
      return { ok: true, message: '已确认拼成，并自动创建群聊。', data: chat }
    },
    updateChat(chatId, changes) {
      const chat = data.chats.find((item) => item.id === chatId)
      if (!chat) return { ok: false, message: '群聊不存在。' }
      const carpool = data.carpools.find((item) => item.id === chat.carpoolId)
      if (!carpool || carpool.ownerId !== currentUser.id) {
        return { ok: false, message: '只有车主可以修改群资料。' }
      }
      const name = changes.name.trim()
      const announcement = changes.announcement.trim()
      if (!name || !announcement) return { ok: false, message: '群名称和群公告不能为空。' }
      setData((current) => ({
        ...current,
        chats: current.chats.map((item) => item.id === chatId ? { ...item, name, announcement } : item),
      }))
      return { ok: true, message: '群资料已保存。' }
    },
    sendMessage(chatId, content) {
      const message = content.trim()
      if (!message) return { ok: false, message: '消息内容不能为空。' }
      const chat = data.chats.find((item) => item.id === chatId)
      if (!chat) return { ok: false, message: '群聊不存在。' }
      const carpool = data.carpools.find((item) => item.id === chat.carpoolId)
      const isMember = carpool && (carpool.ownerId === currentUser.id || carpool.positions.some((slot) => slot.occupantId === currentUser.id))
      if (!isMember) return { ok: false, message: '你不是该群成员，不能发送消息。' }
      setData((current) => ({
        ...current,
        chats: current.chats.map((item) => item.id !== chatId ? item : {
          ...item,
          messages: [...item.messages, {
            id: uid('msg'),
            userId: currentUser.id,
            content: message,
            sentAt: new Date().toISOString(),
          }],
        }),
      }))
      return { ok: true, message: '消息已发送。' }
    },

    // ---------- V1.1 个人地址簿 ----------
    addSavedAddress(input) {
      const result = addSavedAddressOp(data, currentUser.id, input)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message, data: result.data }
    },
    updateSavedAddress(addressId, input) {
      const result = updateSavedAddressOp(data, currentUser.id, addressId, input)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    deleteSavedAddress(addressId) {
      const result = deleteSavedAddressOp(data, currentUser.id, addressId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    setDefaultSavedAddress(addressId) {
      const result = setDefaultSavedAddressOp(data, currentUser.id, addressId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },

    // ---------- V1.1 订单收货地址快照 ----------
    submitOrderAddress(carpoolId, input) {
      const result = submitOrderAddressOp(data, currentUser.id, carpoolId, input)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message, data: result.data }
    },

    // ---------- V1.1 国际物流 ----------
    updateInternationalShipment(carpoolId, input) {
      const result = updateInternationalShipmentOp(data, currentUser.id, carpoolId, input)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    confirmArrivalCheck(carpoolId) {
      const result = confirmArrivalCheckOp(data, currentUser.id, carpoolId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },

    // ---------- V1.1 地址收集 ----------
    urgeAddress(carpoolId, userId) {
      const result = urgeAddressOp(data, currentUser.id, carpoolId, userId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },

    // ---------- V1.1 国内发货 ----------
    saveDomesticShipment(carpoolId, userId, input) {
      const result = saveDomesticShipmentOp(data, currentUser.id, carpoolId, userId, input)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },

    // ---------- V1.1 站内通知 ----------
    markNotificationRead(notificationId) {
      setData((current) => ({
        ...current,
        notifications: current.notifications.map((item) => (
          item.id === notificationId ? { ...item, read: true } : item
        )),
      }))
    },
    markAllNotificationsRead() {
      setData((current) => ({
        ...current,
        notifications: current.notifications.map((item) => (
          item.userId === currentUser.id ? { ...item, read: true } : item
        )),
      }))
    },

    // ---------- V1.2 信誉 ----------
    reputationOf(userId) {
      return reputationOf(data, userId)
    },
    permissions: permissionsOf(reputationOf(data, currentUser.id).score),
    completeRiderOrder(carpoolId) {
      const result = completeRiderOrderOp(data, currentUser.id, carpoolId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    completeOwnerFulfillment(carpoolId) {
      const result = completeOwnerFulfillmentOp(data, currentUser.id, carpoolId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    submitComplaint(input) {
      const result = submitComplaintOp(data, currentUser.id, input)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message, data: result.data }
    },
    submitAppeal(reputationEventId, reason) {
      const result = submitAppealOp(data, currentUser.id, reputationEventId, reason)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message, data: result.data }
    },
    reviewComplaint(complaintId, decision, input) {
      const result = reviewComplaintOp(data, complaintId, decision, input)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    reviewAppeal(appealId, decision, note) {
      const result = reviewAppealOp(data, appealId, decision, note)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    setAdminMode(on) {
      setData((current) => ({ ...current, adminMode: on }))
    },
  }), [currentUser, data])

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

function findCarpool(carpools: Carpool[], carpoolId: string) {
  return carpools.find((item) => item.id === carpoolId)
}

export function useAppStore() {
  const value = useContext(AppStoreContext)
  if (!value) throw new Error('useAppStore must be used inside AppStoreProvider')
  return value
}
