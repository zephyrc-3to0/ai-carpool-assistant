/**
 * 车次状态（V2.0）：
 * - recruiting 招募中
 * - expired 招募已截止，等待车主处理（可延期到最晚截团时间，或结束流团）
 * - cut 已截团（凑套自动截团 / 拼邮达到条件后手动截团）
 * - purchasing 采购履约中
 * - completed 已完成
 * - failed 已流团
 *
 * 兼容旧的 pending_confirm / formed / ordered / closed，读取时会被迁移。
 */
export type CarpoolStatus = 'recruiting' | 'expired' | 'cut' | 'purchasing' | 'completed' | 'failed'

/** 旧版车次状态（仅用于数据迁移） */
export type LegacyCarpoolStatus = 'pending_confirm' | 'formed' | 'ordered' | 'closed'

/** V1.3-A：购买组织方式 */
export type PurchaseMode = 'single' | 'bundle'

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

/** V1.3-A：付款前的库存预留（原子占位，超时自动释放） */
export interface SlotReservation {
  id: string
  userId: string
  createdAt: string
  expiresAt: string
}

/**
 * V1.3-A：份额分组。
 * - kind = 'product' 普通拼邮：一个商品分组，可售多件
 * - kind = 'bundle' 整套凑套：一个成员位置分组，按套数展开
 */
export interface ShareGroup {
  id: string
  kind: 'product' | 'bundle'
  /** 商品名称 / 成员名称 */
  name: string
  /** 普通拼邮的版本说明 */
  version?: string
  /** V2.0：活动商品目录中的商品 ID */
  productId?: string
  /** V2.0：成员位置（整套凑套） */
  member?: string
  /** 该组内每个份额的单价 */
  price: number
  /** 可售数量（= 该组份额数） */
  quantity: number
  /** 该组包含的份额 ID */
  slotIds: string[]
}

/**
 * V1.3-A：保障语义（两个独立开关，不得混淆）。
 * - fullSetOrdered：实际采购时必须按完整套数购买；不代表未凑齐也必须无条件下单
 * - memberDesign：是否承诺交付指定成员款式
 */
export interface PurchaseGuarantees {
  fullSetOrdered: boolean
  memberDesign: boolean
}

/** V1.3-A：费用规则（进入订单快照） */
export interface FeeRules {
  /** 份额单价 */
  unitPrice: number
  /** 每单服务费 */
  serviceFee: number
  /** 每单国内运费 */
  shippingFee: number
}

/** V1.3-A：待确认的规则变更（影响已有订单权益，需受影响车员逐个确认） */
export interface PendingRuleChange {
  id: string
  createdAt: string
  draft: {
    rules: string
    fallbackRule: string
    guarantees: PurchaseGuarantees
    feeRules: FeeRules
  }
  /** 需要确认的受影响车员 */
  requiredUserIds: string[]
  /** 已确认的车员 */
  confirmedUserIds: string[]
  status: 'pending' | 'applied' | 'rejected'
}

export interface PositionSlot {
  id: string
  label: string
  occupantId?: string
  orderId?: string
  /** V1.3-A：所属分组 ID；旧数据缺失表示 legacy 平铺位置 */
  groupId?: string
  /** V1.3-A：该份额的单价 */
  price?: number
  /** V1.3-A：凑套模式下的套序号（0 起） */
  setIndex?: number
  /** V1.3-A：付款前的库存预留 */
  reservation?: SlotReservation
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
  // ---------- V1.3-A 商品与份额 ----------
  /** 购买组织方式；旧数据缺失按 legacy 平铺位置处理 */
  purchaseMode?: PurchaseMode
  /** 份额分组；旧数据缺失按 legacy 处理 */
  shareGroups?: ShareGroup[]
  /** 整套凑套的购买套数 */
  bundleSets?: number
  /** 保障语义 */
  guarantees?: PurchaseGuarantees
  /** 费用规则 */
  feeRules?: FeeRules
  /** 规则版本号 */
  rulesVersion?: number
  /** 未凑齐处理规则（占位前展示并写入订单快照） */
  fallbackRule?: string
  /** 待确认的规则变更 */
  pendingRuleChange?: PendingRuleChange
  /** 取消时间 */
  cancelledAt?: string
  // ---------- V2.0 ----------
  /** 所属团体 */
  groupId?: string
  /** 所属活动 */
  eventId?: string
  /** 官方下单截止时间 */
  orderDeadline?: string
  /** 整车国际运费总额（分），发布时一次确定 */
  internationalFreightCents?: number
  /** 普通拼邮：最低成团金额（分） */
  minAmountCents?: number
  /** 普通拼邮：整车国际包裹最大商品件数 */
  maxPackageItems?: number
  /** 实际截团时间 */
  cutAt?: string
  /** 延期记录 */
  extensions?: Array<{ at: string; deadline: string }>
  /** 招募截止时间到达后进入「等待车主处理」的时间 */
  expiredAt?: string
  /** 国际运费尾差归属策略 ID */
  freightRemainderStrategy?: string
  /**
   * V2.0 车次：需要走「国内打包费与国内运费 → 车员模拟支付 → 独立发货」流程。
   * 旧车次保持 V1.1 行为（登记发货即可），不因升级而改变已有履约规则。
   */
  requiresDomesticFee?: boolean
}

/** V1.3-A：订单商品快照（已确认订单永不被后续修改覆盖） */
export interface OrderItemSnapshot {
  groupId?: string
  kind: 'product' | 'bundle' | 'legacy'
  name: string
  version?: string
  unitPrice: number
  quantity: number
  slotLabels: string[]
}

/** V1.3-A：订单费用快照 */
export interface OrderFeeSnapshot {
  unitPrice: number
  quantity: number
  serviceFee: number
  shippingFee: number
  total: number
}

/** V1.3-A：订单规则快照 */
export interface OrderRulesSnapshot {
  rulesVersion: number
  rules: string
  fallbackRule: string
  guarantees: PurchaseGuarantees
  publishedAt: string
  /** 规则变更经全体受影响车员确认后的应用时间 */
  consentApprovedAt?: string
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
  // ---------- V1.3-A 快照 ----------
  /** 商品快照 */
  itemSnapshot?: OrderItemSnapshot
  /** 费用快照 */
  feeSnapshot?: OrderFeeSnapshot
  /** 规则快照 */
  rulesSnapshot?: OrderRulesSnapshot
  /**
   * V1.3-A 遗留字段：曾用于标记「承接订单」。
   * V1.3-A.1 起取消独立承接概念，加购与首次购买都是普通购买记录；
   * 该字段仅为兼容历史数据保留，不再写入，界面也不再据此分支。
   */
  isTakeover?: boolean
  /** 是否为车主为自己购买份额的订单（不计入车员人数，也不产生车员信誉奖励） */
  ownerHeld?: boolean
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
  /** V1.3-A.1：各账号的已读时间（userId → lastReadAt ISO），用于群聊列表的未读数 */
  reads?: Record<string, string>
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
  /** V2.0 招募、截团与费用 */
  | 'carpool_cut'
  | 'carpool_expired'
  | 'recruitment_extended'
  | 'carpool_failed'
  | 'freight_bill'
  /** V1.3-A：规则变更待车员确认 */
  | 'rule_change'
  /** V1.3-A：空位承接 / 被承接提醒 */
  | 'slot_takeover'

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
  // ---------- V2.0 ----------
  /** 艺人团体目录 */
  groups: ArtistGroup[]
  /** 活动目录 */
  events: EventInfo[]
  /** 活动商品目录 */
  eventProducts: EventProduct[]
  /** 车主自购记录（不产生模拟付款） */
  ownerPurchases: OwnerPurchase[]
  /** 模拟支付与退款记录 */
  payments: PaymentRecord[]
  /** 国际运费账单 */
  freightBills: FreightBill[]
  /** 国内费用账单 */
  domesticFeeBills: DomesticFeeBill[]
  /** 车次参与关系 */
  participations: Participation[]
  /** 采购凭证 */
  purchaseVouchers: PurchaseVoucher[]
  /** 异常处理记录 */
  exceptions: ExceptionRecord[]
  /** 活动收录申请 */
  eventSubmissions: EventSubmission[]
  /** 拼车草稿 */
  drafts: CarpoolDraft[]
}

export interface PositionDraft {
  id: string
  label: string
  quantity: number
}

// ---------------------------------------------------------------------------
// V2.0 团体、活动与活动商品目录
// ---------------------------------------------------------------------------

/** 艺人团体 */
export interface ArtistGroup {
  id: string
  name: string
  shortName: string
  color: string
  description: string
  /** 团体成员数（演示数据） */
  memberCount: number
}

/** 活动（属于某个团体） */
export interface EventInfo {
  id: string
  groupId: string
  name: string
  /** 官方下单截止时间：最晚允许截团时间 = 该时间 − 最低采购预留时间 */
  orderDeadline: string
  /** 活动商品目录 */
  productIds: string[]
  /** 轮播 Banner 文案 */
  bannerTitle?: string
  bannerSubtitle?: string
  /** 是否为热门活动 */
  hot?: boolean
}

/** 活动商品目录条目 */
export interface EventProduct {
  id: string
  eventId: string
  name: string
  /** 商品类别（用于筛选） */
  category: string
  /** 规格 / 版本，例如「A 版」 */
  spec: string
  /** 单价（元） */
  price: number
  /** 活动限购：同一用户在该活动下的最大购买件数 */
  perUserLimit: number
  /** 整套凑套模式下可开放的成员位置 */
  members: string[]
  /** 成员位置单价（缺省取商品单价） */
  memberPrices?: Record<string, number>
}

// ---------------------------------------------------------------------------
// V2.0 交易与履约
// ---------------------------------------------------------------------------

/**
 * 车主自购记录。
 * 车主优先自购不需要模拟付款，因此独立保存，绝不伪造车主向自己付款的交易。
 */
export interface OwnerPurchase {
  id: string
  carpoolId: string
  /** 活动商品 ID */
  productId: string
  /** 成员位置（整套凑套） */
  member?: string
  quantity: number
  unitPrice: number
  confirmedAt: string
}

/** 模拟支付 / 退款记录（金额统一用「分」存储） */
export interface PaymentRecord {
  id: string
  carpoolId: string
  userId: string
  kind: 'goods' | 'freight' | 'domestic' | 'refund'
  amountCents: number
  status: 'paid' | 'refunded'
  /** 关联订单 / 账单 ID */
  refId?: string
  note?: string
  createdAt: string
}

/** 国际运费账单（截团时按有效份数自动分摊生成） */
export interface FreightBill {
  id: string
  carpoolId: string
  userId: string
  /** 分摊份数：成员位置份数或商品件数 */
  units: number
  /** 应摊金额（分） */
  amountCents: number
  /** 是否承担了尾差 */
  ownsRemainder: boolean
  /** pending 车员待支付；paid 车员已支付；booked 车主自担，仅记账不产生模拟付款 */
  status: 'pending' | 'paid' | 'booked'
  paymentId?: string
  paidAt?: string
  createdAt: string
}

/** 国内费用账单（车主按车员登记打包费与国内运费） */
export interface DomesticFeeBill {
  id: string
  carpoolId: string
  userId: string
  packingFeeCents: number
  shippingFeeCents: number
  totalCents: number
  status: 'pending' | 'paid' | 'disputed'
  paymentId?: string
  paidAt?: string
  createdAt: string
}

/** 车次参与关系：同一用户在同一车次只建立一份 */
export interface Participation {
  id: string
  carpoolId: string
  userId: string
  createdAt: string
}

/** 采购凭证（官方下单凭证） */
export interface PurchaseVoucher {
  id: string
  carpoolId: string
  title: string
  note: string
  status: 'submitted' | 'confirmed'
  createdAt: string
  /** V2.0：车主上传的凭证图片（已压缩的 data URL），可选 */
  imageDataUrl?: string
  /** V2.0：原始图片文件名 */
  imageName?: string
}

/** 异常处理记录（订单 / 采购 / 费用 / 物流） */
export interface ExceptionRecord {
  id: string
  carpoolId: string
  userId: string
  type: 'order' | 'purchase' | 'fee' | 'logistics'
  title: string
  detail: string
  status: 'open' | 'resolved'
  createdAt: string
  resolvedAt?: string
}

/** 活动收录申请（活动未收录时由用户提交） */
export interface EventSubmission {
  id: string
  /** 提交申请的用户 */
  userId: string
  groupId: string
  eventName: string
  orderDeadline: string
  note: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

/** 拼车草稿内容（与发布表单结构一致） */
export interface CarpoolDraftData {
  description: string
  rules: string
  purchaseMode: PurchaseMode
  /** 开放商品：整套凑套时 member 表示成员位置 */
  productGroups: Array<{ productId: string; member?: string; quantity: number; price: number }>
  guarantees: PurchaseGuarantees
  fallbackRule: string
  deadline: string
  /** 整车国际运费总额（元） */
  internationalFreight: number
  /** 普通拼邮：最低成团金额（元） */
  minAmount: number
  /** 普通拼邮：整车国际包裹最大商品件数 */
  maxPackageItems: number
  /** 车主优先自购 */
  ownerHeld: Array<{ productId: string; member?: string; quantity: number }>
}

/** 拼车草稿 */
export interface CarpoolDraft {
  id: string
  ownerId: string
  groupId: string
  eventId: string
  title: string
  savedAt: string
  data: CarpoolDraftData
}
