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
  checkPurchasePermission,
  completeOwnerFulfillmentOp,
  completeRiderOrderOp,
  reviewAppealOp,
  reviewComplaintOp,
  submitAppealOp,
  submitComplaintOp,
  type ComplaintInput,
} from './lib/reputationOps'
import { permissionsOf, reputationOf, type ReputationPermissions } from './lib/reputation'
import {
  buildV2Carpool,
  cancelCarpoolOp,
  confirmOrderOp,
  confirmRuleChangeOp,
  markOrderedOp,
  proposeRuleChangeOp,
  purchaseSharesOp,
  purgeExpiredReservations,
  releaseReservationOp,
  reserveSlotsOp,
  type ConfirmOrderOptions,
  type NewCarpoolInput,
  type ReservationInfo,
  type RuleChangeDraft,
} from './lib/shareOps'
import {
  cancelOwnerSelfPurchaseOp,
  cutCarpoolOp,
  extendRecruitmentOp,
  failCarpoolOp,
  ownerSelfPurchaseOp,
  recruitmentStateOf,
  sweepExpiredRecruitments,
} from './lib/recruitOps'
import { purchasedProductUnitsOf } from './lib/purchaseRules'
import { PACKAGE_ITEMS_RANGE } from './config'
import { disputeDomesticFeeOp, registerDomesticFeesOp, payDomesticFeeOp, payFreightOp, type DomesticFeeInput } from './lib/feeOps'
import {
  deleteDraftOp,
  raiseExceptionOp,
  resolveExceptionOp,
  saveDraftOp,
  submitEventRequestOp,
  uploadVoucherOp,
} from './lib/v2Ops'
import { eventOf, latestCutDeadline } from './lib/catalog'
import type {
  Appeal,
  AppData,
  Carpool,
  CarpoolDraft,
  Chat,
  Complaint,
  ComplaintCategory,
  DomesticStatus,
  EventSubmission,
  ExceptionRecord,
  FeeRules,
  InternationalStatus,
  Order,
  OrderShippingAddress,
  PositionSlot,
  PurchaseGuarantees,
  PurchaseMode,
  SavedAddress,
  UserReputation,
} from './types'
import { uid } from './utils'

export type { NewCarpoolInput }

export type { AddressInput }

export interface SaveDraftInput {
  id?: string
  groupId: string
  eventId: string
  title: string
  data: CarpoolDraft['data']
}

export interface EventRequestInput {
  groupId: string
  eventName: string
  orderDeadline: string
  note: string
}

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
  // V2.0 草稿与活动收录
  saveDraft: (draft: SaveDraftInput) => ActionResult<CarpoolDraft>
  deleteDraft: (draftId: string) => ActionResult
  submitEventRequest: (input: EventRequestInput) => ActionResult<EventSubmission>
  // V1.3-A 份额、占位与成团状态机
  reserveShares: (carpoolId: string, slotIds: string[]) => ActionResult<ReservationInfo>
  releaseReservation: (carpoolId: string, reservationId: string) => ActionResult
  confirmPayment: (carpoolId: string, reservationId: string, options?: ConfirmOrderOptions) => ActionResult<Order>
  /** ConfirmPage 专用：同一次状态迁移内完成预留与付款，避免读取预留前的状态 */
  purchaseShares: (carpoolId: string, slotIds: string[], options?: ConfirmOrderOptions) => ActionResult<Order>
  // V2.0 招募与截团
  ownerSelfPurchase: (carpoolId: string, groupId: string, quantity: number) => ActionResult
  cancelOwnerSelfPurchase: (carpoolId: string, purchaseId: string) => ActionResult
  cutCarpool: (carpoolId: string, automatic?: boolean) => ActionResult
  extendRecruitment: (carpoolId: string, deadline: string) => ActionResult
  failCarpool: (carpoolId: string, reason?: string) => ActionResult
  markOrdered: (carpoolId: string) => ActionResult
  cancelCarpool: (carpoolId: string, reason?: string) => ActionResult
  // V2.0 费用
  payFreight: (carpoolId: string) => ActionResult
  registerDomesticFees: (carpoolId: string, userId: string, input: DomesticFeeInput) => ActionResult
  payDomesticFee: (carpoolId: string) => ActionResult
  disputeDomesticFee: (carpoolId: string, detail: string) => ActionResult
  // V2.0 采购与异常
  uploadVoucher: (carpoolId: string, input: { title: string; note: string; imageDataUrl?: string; imageName?: string }) => ActionResult
  raiseException: (carpoolId: string, input: { type: ExceptionRecord['type']; title: string; detail: string }) => ActionResult
  resolveException: (exceptionId: string) => ActionResult
  proposeRuleChange: (carpoolId: string, draft: RuleChangeDraft) => ActionResult
  confirmRuleChange: (carpoolId: string, approve: boolean) => ActionResult
  updateChat: (chatId: string, changes: Pick<Chat, 'name' | 'announcement'>) => ActionResult
  sendMessage: (chatId: string, content: string) => ActionResult
  /** V1.3-A.1：记录当前账号的群聊已读时间，用于群聊列表的未读数 */
  markChatRead: (chatId: string) => void
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
    // V1.3-A：加载时顺手清理已经超时的份额预留
    // V2.0：加载时检查招募截止，已过期的车次不会无限停留在招募中
    return sweepExpiredRecruitments(purgeExpiredReservations(normalizeData(parsed))).data
  } catch {
    return createInitialData()
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // 本地存储容量不足（例如采购凭证图片过大）时不阻断界面，
      // 页面仍然使用内存中的数据继续工作。
      console.warn('[DREAM CAR] 本地存储写入失败，本次修改可能不会被保留。')
    }
  }, [data])

  // V2.0：定时检查招募截止，避免页面长时间打开时过期车次一直停留在招募中。
  useEffect(() => {
    const timer = window.setInterval(() => {
      setData((current) => {
        const swept = sweepExpiredRecruitments(current)
        return swept.reports.length ? swept.data : current
      })
    }, 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

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
      // V2.0：团体与活动来自当前活动上下文，不允许绕过活动直接发车
      const event = eventOf(data, input.eventId)
      if (!event || event.groupId !== input.groupId) return { ok: false, message: '请先在活动页面选择有效的团体与活动。' }
      if (!input.openItems?.length) return { ok: false, message: '请至少开放一个商品。' }

      const itemKeys = new Set<string>()
      for (const item of input.openItems) {
        const product = data.eventProducts.find((entry) => entry.id === item.productId && entry.eventId === event.id)
        if (!product) return { ok: false, message: '开放商品必须来自当前活动的商品目录。' }
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) return { ok: false, message: '开放数量必须是大于 0 的整数。' }
        if (input.purchaseMode === 'bundle' && (!item.member || !product.members.includes(item.member))) {
          return { ok: false, message: '整套凑套的成员位置必须来自活动商品目录。' }
        }
        const key = `${item.productId}::${item.member ?? ''}`
        if (itemKeys.has(key)) return { ok: false, message: '同一商品与成员位置不能重复开放。' }
        itemKeys.add(key)
      }
      if (!Number.isFinite(input.internationalFreight) || input.internationalFreight < 0) {
        return { ok: false, message: '整车国际运费不能为负数。' }
      }
      if (input.purchaseMode === 'single') {
        if (!Number.isFinite(input.minAmount) || input.minAmount <= 0) return { ok: false, message: '普通拼邮的最低成团金额需要大于 0。' }
        if (!Number.isInteger(input.maxPackageItems) || input.maxPackageItems < PACKAGE_ITEMS_RANGE.min || input.maxPackageItems > PACKAGE_ITEMS_RANGE.max) {
          return { ok: false, message: `整车包裹件数需要在 ${PACKAGE_ITEMS_RANGE.min}–${PACKAGE_ITEMS_RANGE.max} 件之间。` }
        }
      }

      const heldByProduct = new Map<string, number>()
      let heldTotal = 0
      for (const held of input.ownerHeld ?? []) {
        if (!Number.isInteger(held.quantity) || held.quantity <= 0) return { ok: false, message: '车主自购数量必须是大于 0 的整数。' }
        const open = input.openItems.find((item) => item.productId === held.productId && (item.member ?? undefined) === (held.member ?? undefined))
        if (!open || held.quantity > open.quantity) return { ok: false, message: '车主自购数量不能超过对应商品的开放份数。' }
        heldTotal += held.quantity
        heldByProduct.set(held.productId, (heldByProduct.get(held.productId) ?? 0) + held.quantity)
      }
      if (input.purchaseMode === 'single' && heldTotal > input.maxPackageItems) {
        return { ok: false, message: '车主自购总件数不能超过整车包裹上限。' }
      }
      for (const [productId, quantity] of heldByProduct) {
        const product = data.eventProducts.find((item) => item.id === productId && item.eventId === event.id)
        const alreadyPurchased = purchasedProductUnitsOf(data, event.id, currentUser.id, productId)
        if (product && alreadyPurchased + quantity > product.perUserLimit) {
          return { ok: false, message: `「${product.name} · ${product.spec}」每人限购 ${product.perUserLimit} 件。` }
        }
      }

      // 招募截止时间不得超过平台最晚允许截团时间
      const latest = latestCutDeadline(event)
      if (latest && new Date(input.deadline).getTime() > new Date(latest).getTime()) {
        return {
          ok: false,
          message: `招募截止时间不能晚于平台最晚允许截团时间（${new Date(latest).toLocaleString('zh-CN')}）。`,
        }
      }

      const { carpool, ownerPurchases } = buildV2Carpool(currentUser.id, input, event.name)
      carpool.orderDeadline = event.orderDeadline
      const created: AppData = {
        ...data,
        carpools: [carpool, ...data.carpools],
        ownerPurchases: [...ownerPurchases, ...(data.ownerPurchases ?? [])],
        drafts: (data.drafts ?? []).filter((draft) => (
          !input.sourceDraftId || draft.id !== input.sourceDraftId || draft.ownerId !== currentUser.id
        )),
      }
      const state = recruitmentStateOf(created, carpool.id)
      const next = state.autoCut
        ? cutCarpoolOp(created, currentUser.id, carpool.id, true).next
        : created
      setData(next)
      const published = next.carpools.find((item) => item.id === carpool.id) ?? carpool
      return {
        ok: true,
        message: state.autoCut
          ? '拼车已发布；车主自购已占满开放份额，本车已自动截团。'
          : '拼车已发布，已出现在对应活动广场。',
        data: published,
      }
    },

    // ---------- V2.0 草稿与活动收录 ----------
    saveDraft(draft) {
      const result = saveDraftOp(data, currentUser.id, draft)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message, data: result.data }
    },
    deleteDraft(draftId) {
      const result = deleteDraftOp(data, currentUser.id, draftId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    submitEventRequest(input) {
      const result = submitEventRequestOp(data, currentUser.id, input)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message, data: result.data }
    },

    // ---------- V1.3-A 份额预留与占位 ----------
    reserveShares(carpoolId, slotIds) {
      const carpool = data.carpools.find((item) => item.id === carpoolId)
      if (!carpool) return { ok: false, message: '没有找到这辆拼车。' }
      if (carpool.ownerId === currentUser.id) {
        return { ok: false, message: '车主自购不经过模拟付款，请在车次详情使用“确认自购”。' }
      }
      // V1.3-A.1：首次购买与加购使用同一套权限与库存校验
      const permission = checkPurchasePermission(data, currentUser.id, carpoolId)
      if (!permission.ok) return { ok: false, message: permission.message }
      const result = reserveSlotsOp(data, currentUser.id, carpoolId, slotIds)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message, data: result.data }
    },
    releaseReservation(carpoolId, reservationId) {
      const result = releaseReservationOp(data, currentUser.id, carpoolId, reservationId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    confirmPayment(carpoolId, reservationId, options = {}) {
      const carpool = data.carpools.find((item) => item.id === carpoolId)
      if (!carpool) return { ok: false, message: '没有找到这辆拼车。' }
      if (carpool.ownerId === currentUser.id) {
        return { ok: false, message: '车主自购不产生模拟付款，请返回车次详情直接确认自购。' }
      }
      const permission = checkPurchasePermission(data, currentUser.id, carpoolId)
      if (!permission.ok) return { ok: false, message: permission.message }
      const result = confirmOrderOp(data, currentUser.id, carpoolId, reservationId, options)
      // 失败路径同样需要落库（例如模拟支付失败时释放预留），因此统一写入
      setData(result.next)
      return { ok: result.ok, message: result.message, data: result.data }
    },
    purchaseShares(carpoolId, slotIds, options = {}) {
      const carpool = data.carpools.find((item) => item.id === carpoolId)
      if (!carpool) return { ok: false, message: '没有找到这辆拼车。' }
      if (carpool.ownerId === currentUser.id) {
        return { ok: false, message: '车主自购不产生模拟付款，请返回车次详情直接确认自购。' }
      }
      const permission = checkPurchasePermission(data, currentUser.id, carpoolId)
      if (!permission.ok) return { ok: false, message: permission.message }
      const result = purchaseSharesOp(data, currentUser.id, carpoolId, slotIds, options)
      // 成功、失败与超时都提交同一次事务的最终状态，确保失败路径释放预留。
      setData(result.next)
      return { ok: result.ok, message: result.message, data: result.data }
    },

    // ---------- V1.3-A 成团状态机 ----------
    // ---------- V2.0 招募与截团 ----------
    ownerSelfPurchase(carpoolId, groupId, quantity) {
      const permission = checkPurchasePermission(data, currentUser.id, carpoolId)
      if (!permission.ok) return { ok: false, message: permission.message }
      const result = ownerSelfPurchaseOp(data, currentUser.id, carpoolId, { groupId, quantity })
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    cancelOwnerSelfPurchase(carpoolId, purchaseId) {
      const result = cancelOwnerSelfPurchaseOp(data, currentUser.id, carpoolId, purchaseId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    cutCarpool(carpoolId, automatic = false) {
      const result = cutCarpoolOp(data, currentUser.id, carpoolId, automatic)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    extendRecruitment(carpoolId, deadline) {
      const result = extendRecruitmentOp(data, currentUser.id, carpoolId, deadline)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    failCarpool(carpoolId, reason = '') {
      const result = failCarpoolOp(data, currentUser.id, carpoolId, reason)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    markOrdered(carpoolId) {
      const result = markOrderedOp(data, currentUser.id, carpoolId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    cancelCarpool(carpoolId, reason = '') {
      const result = cancelCarpoolOp(data, currentUser.id, carpoolId, reason)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },

    // ---------- V1.3-A 规则变更 ----------
    proposeRuleChange(carpoolId, draft) {
      const result = proposeRuleChangeOp(data, currentUser.id, carpoolId, draft)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    confirmRuleChange(carpoolId, approve) {
      const result = confirmRuleChangeOp(data, currentUser.id, carpoolId, approve)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
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

    // ---------- V2.0 费用 ----------
    payFreight(carpoolId) {
      const result = payFreightOp(data, currentUser.id, carpoolId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    registerDomesticFees(carpoolId, userId, input) {
      const result = registerDomesticFeesOp(data, currentUser.id, carpoolId, userId, input)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    payDomesticFee(carpoolId) {
      const result = payDomesticFeeOp(data, currentUser.id, carpoolId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    disputeDomesticFee(carpoolId, detail) {
      const result = disputeDomesticFeeOp(data, currentUser.id, carpoolId, detail)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },

    // ---------- V2.0 采购与异常 ----------
    uploadVoucher(carpoolId, input) {
      const result = uploadVoucherOp(data, currentUser.id, carpoolId, input)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    raiseException(carpoolId, input) {
      const result = raiseExceptionOp(data, currentUser.id, carpoolId, input)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },
    resolveException(exceptionId) {
      const result = resolveExceptionOp(data, currentUser.id, exceptionId)
      if (result.ok) setData(result.next)
      return { ok: result.ok, message: result.message }
    },

    markChatRead(chatId) {
      const chat = data.chats.find((item) => item.id === chatId)
      if (!chat) return
      const at = new Date().toISOString()
      if (chat.reads?.[currentUser.id] === at) return
      setData((current) => ({
        ...current,
        chats: current.chats.map((item) => (item.id === chatId ? {
          ...item,
          reads: { ...(item.reads ?? {}), [currentUser.id]: at },
        } : item)),
      }))
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
