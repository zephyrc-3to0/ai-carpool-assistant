export type CarpoolStatus = 'recruiting' | 'formed' | 'closed'

export interface User {
  id: string
  nickname: string
  initial: string
  color: string
  /** V1.2：所在省份，公开主页展示 */
  province?: string
  /** V1.2：加入平台时间 */
  joinedAt?: string
}

export interface PositionSlot {
  id: string
  label: string
  occupantId?: string
  orderId?: string
}

export interface Carpool {
  id: string
  title: string
  eventName: string
  productName: string
  price: number
  ownerId: string
  deadline: string
  description: string
  rules: string
  status: CarpoolStatus
  positions: PositionSlot[]
  createdAt: string
  /** V1.1：地址收集开关，老数据缺失时按未开启处理 */
  addressCollection?: AddressCollection
  /** V1.2：整车履约完成时间（由车主在车次管理中确认） */
  fulfilledAt?: string
}

export interface Order {
  id: string
  carpoolId: string
  userId: string
  slotIds: string[]
  amount: number
  paidAt: string
  /** V1.2：订单履约状态，需由车员确认收货后才算完成 */
  fulfillmentStatus?: 'pending' | 'completed'
  /** V1.2：订单履约完成时间 */
  fulfilledAt?: string
}

export interface ChatMessage {
  id: string
  userId: string
  content: string
  sentAt: string
  system?: boolean
}

export interface Chat {
  id: string
  carpoolId: string
  name: string
  announcement: string
  messages: ChatMessage[]
  createdAt: string
}

/** V1.1 物流与地址相关类型 */

export type InternationalStatus =
  | 'waiting'
  | 'in_transit'
  | 'customs'
  | 'domestic_transit'
  | 'received'
  | 'checked'

export interface InternationalTimelineEntry {
  id: string
  status: InternationalStatus
  note: string
  at: string
}

/** 一辆拼车共享一份国际物流 */
export interface InternationalShipment {
  id: string
  carpoolId: string
  carrier: string
  trackingNumber: string
  trackingUrl: string
  status: InternationalStatus
  note: string
  updatedAt: string
  timeline: InternationalTimelineEntry[]
}

/** 车次的地址收集状态 */
export interface AddressCollection {
  enabled: boolean
  startedAt: string
  closedAt?: string
}

export type AddressStatus = 'pending' | 'submitted' | 'overdue'

/** 订单收货地址快照，与个人地址簿相互独立 */
export interface OrderShippingAddress {
  id: string
  carpoolId: string
  userId: string
  status: AddressStatus
  label: string
  receiverName: string
  phone: string
  province: string
  city: string
  district: string
  detail: string
  sourceAddressId?: string
  submittedAt?: string
  updatedAt?: string
  urgedAt?: string
  urgeCount: number
}

/** 用户个人地址簿 */
export interface SavedAddress {
  id: string
  userId: string
  label: string
  receiverName: string
  phone: string
  province: string
  city: string
  district: string
  detail: string
  isDefault: boolean
  createdAt: string
}

export type DomesticStatus = 'pending_address' | 'pending_pack' | 'pending_ship' | 'shipped' | 'received'

/** 车员个人国内物流，各车员相互独立 */
export interface DomesticShipment {
  id: string
  carpoolId: string
  userId: string
  carrier: string
  trackingNumber: string
  shippedAt: string
  note: string
  status: DomesticStatus
  updatedAt: string
}

export type NotificationType = 'address_required' | 'address_urge' | 'arrival_checked' | 'domestic_shipped'
  | 'reputation_penalty' | 'appeal_result' | 'complaint_result'

/** 站内通知 */
export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  content: string
  carpoolId: string
  createdAt: string
  read: boolean
}

/** V1.2 信誉体系 */

/** 信誉等级：excellent 90-100 / good 70-89 / caution 60-69 / restricted 0-59 */
export type ReputationLevel = 'excellent' | 'good' | 'caution' | 'restricted'

/** 用户当前信誉分与等级 */
export interface UserReputation {
  userId: string
  score: number
  level: ReputationLevel
  updatedAt: string
}

/** 信誉事件类型：履约加分与违规扣分 */
export type ReputationEventType =
  | 'owner_complete'
  | 'rider_complete'
  | 'owner_cancel'
  | 'owner_delay'
  | 'rider_quit'
  | 'fake_logistics'
  | 'fraud'
  | 'other_violation'

/** 信誉事件状态：active 已生效 / revoked 申诉通过后已撤销 */
export type ReputationEventStatus = 'active' | 'revoked'

/** 每一次信誉分变动都会留下一条记录 */
export interface ReputationEvent {
  id: string
  userId: string
  carId: string
  eventType: ReputationEventType
  /** 实际生效的分数变化（受上限 / 月度上限限制时可能小于预期） */
  scoreChange: number
  reason: string
  createdAt: string
  status: ReputationEventStatus
  /** 关联投诉（扣分来自投诉核实时写入） */
  complaintId?: string
  /** 关联申诉 */
  appealId?: string
  /** 撤销时间（申诉通过时写入） */
  revokedAt?: string
  /** 审核备注 */
  reviewNote?: string
}

/** 投诉类型 */
export type ComplaintCategory =
  | 'owner_cancel'
  | 'owner_delay'
  | 'rider_quit'
  | 'fake_logistics'
  | 'fraud'
  | 'other'

/** 投诉状态：pending 待审核 / confirmed 违规成立 / rejected 已驳回 */
export type ComplaintStatus = 'pending' | 'confirmed' | 'rejected'

/** 用户投诉 */
export interface Complaint {
  id: string
  reporterId: string
  targetUserId: string
  carId: string
  category: ComplaintCategory
  description: string
  status: ComplaintStatus
  createdAt: string
  /** 审核时间 */
  reviewedAt?: string
  /** 审核备注 / 处理原因 */
  reviewNote?: string
  /** 确认违规时实际扣除的分数 */
  deduction?: number
}

/** 申诉状态：pending 待审核 / approved 已通过（扣分撤销）/ rejected 已驳回 */
export type AppealStatus = 'pending' | 'approved' | 'rejected'

/** 针对扣分记录提交的申诉 */
export interface Appeal {
  id: string
  reputationEventId: string
  userId: string
  reason: string
  status: AppealStatus
  createdAt: string
  reviewedAt?: string
  reviewNote?: string
}

/** 管理员操作日志 */
export interface AdminActionLog {
  id: string
  adminId: string
  action: string
  targetType: 'complaint' | 'appeal' | 'reputation'
  targetId: string
  detail: string
  createdAt: string
}

export interface AppData {
  version: number
  users: User[]
  currentUserId: string
  carpools: Carpool[]
  orders: Order[]
  chats: Chat[]
  savedAddresses: SavedAddress[]
  orderAddresses: OrderShippingAddress[]
  internationalShipments: InternationalShipment[]
  domesticShipments: DomesticShipment[]
  notifications: Notification[]
  /** V1.2：用户信誉档案 */
  reputations: UserReputation[]
  /** V1.2：信誉分变动记录 */
  reputationEvents: ReputationEvent[]
  /** V1.2：投诉记录 */
  complaints: Complaint[]
  /** V1.2：申诉记录 */
  appeals: Appeal[]
  /** V1.2：模拟管理员操作日志 */
  adminLogs: AdminActionLog[]
  /** V1.2：是否处于模拟管理员模式（与普通用户界面明确区分） */
  adminMode: boolean
}

export interface PositionDraft {
  id: string
  label: string
  quantity: number
}
