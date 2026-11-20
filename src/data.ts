import type {
  Appeal,
  AppData,
  Carpool,
  Chat,
  Complaint,
  DomesticShipment,
  InternationalShipment,
  Notification,
  Order,
  OrderShippingAddress,
  ReputationEvent,
  SavedAddress,
  User,
  UserReputation,
} from './types'
import { levelOf, scoreFromEvents } from './lib/reputation'
import {
  demoEventProducts,
  demoEvents,
  demoGroups,
  demoV2Carpools,
  demoV2FreightBills,
  demoV2Orders,
  demoV2OwnerPurchases,
  demoV2Participations,
  demoV2Payments,
} from './data.v2'
import {
  buildFeeSnapshot,
  buildItemSnapshot,
  buildRulesSnapshot,
  defaultFeeRules,
  defaultGuarantees,
  fallbackRuleTemplates,
  isLegacyCarpool,
  purchaseModeOf,
} from './lib/share'

export const STORAGE_KEY = 'daban-carpool-mvp-v1'
export const DATA_VERSION = 7

export const initialUsers: User[] = [
  { id: 'u-owner', nickname: '汽水小鹿', initial: '鹿', color: '#7557c8', province: '上海市', joinedAt: '2026-08-12T03:20:00.000Z' },
  { id: 'u-rider', nickname: '椰子青', initial: '椰', color: '#268778', province: '广东省', joinedAt: '2026-08-20T06:10:00.000Z' },
  { id: 'u-third', nickname: '九九云', initial: '九', color: '#bb6b42', province: '北京市', joinedAt: '2026-09-02T01:45:00.000Z' },
  { id: 'u-fourth', nickname: '薄荷糖', initial: '薄', color: '#5676a9', province: '四川省', joinedAt: '2026-09-15T11:30:00.000Z' },
]

/**
 * V1.3-A 演示数据覆盖三种车次形态：
 * - car-dreamscape：整套凑套（bundle）
 * - car-photocard：普通拼邮（single，多商品多版本）
 * - car-plush / car-badge：历史平铺车次（legacy，验证存量兼容）
 */
const demoCarpools: Carpool[] = [
  {
    id: 'car-dreamscape',
    title: 'DREAMSCAPE 快闪店亚克力牌拼车',
    eventName: 'NCT DREAM DREAMSCAPE 快闪店',
    productName: '成员亚克力立牌',
    price: 68,
    ownerId: 'u-owner',
    deadline: '2026-12-18T20:00',
    description: '按成员位置上车，成团后统一购买。到货后会在群内同步验货与发货进度。',
    rules: '每个位置对应 1 件商品；截单前可联系车主说明情况；模拟演示不产生真实交易。',
    status: 'recruiting',
    groupId: 'g-nct',
    eventId: 'evt-dreamscape',
    orderDeadline: '2026-12-18T20:00',
    internationalFreightCents: 12000,
    purchaseMode: 'bundle',
    bundleSets: 1,
    guarantees: { fullSetOrdered: true, memberDesign: true },
    feeRules: { unitPrice: 68, serviceFee: 0, shippingFee: 0 },
    rulesVersion: 1,
    fallbackRule: fallbackRuleTemplates.bundle,
    shareGroups: [
      { id: 'grp-ds-mark', kind: 'bundle', name: 'MARK', version: 'A 版', productId: 'p-ds-agency-a', member: 'MARK', price: 68, quantity: 1, slotIds: ['ds-mark'] },
      { id: 'grp-ds-renjun', kind: 'bundle', name: 'RENJUN', version: 'A 版', productId: 'p-ds-agency-a', member: 'RENJUN', price: 68, quantity: 1, slotIds: ['ds-renjun'] },
      { id: 'grp-ds-jeno', kind: 'bundle', name: 'JENO', version: 'A 版', productId: 'p-ds-agency-a', member: 'JENO', price: 68, quantity: 1, slotIds: ['ds-jeno'] },
      { id: 'grp-ds-haechan', kind: 'bundle', name: 'HAECHAN', version: 'A 版', productId: 'p-ds-agency-a', member: 'HAECHAN', price: 68, quantity: 1, slotIds: ['ds-haechan'] },
      { id: 'grp-ds-jaemin', kind: 'bundle', name: 'JAEMIN', version: 'A 版', productId: 'p-ds-agency-a', member: 'JAEMIN', price: 68, quantity: 1, slotIds: ['ds-jaemin'] },
      { id: 'grp-ds-chenle', kind: 'bundle', name: 'CHENLE', version: 'A 版', productId: 'p-ds-agency-a', member: 'CHENLE', price: 68, quantity: 1, slotIds: ['ds-chenle'] },
      { id: 'grp-ds-jisung', kind: 'bundle', name: 'JISUNG', version: 'A 版', productId: 'p-ds-agency-a', member: 'JISUNG', price: 68, quantity: 1, slotIds: ['ds-jisung'] },
    ],
    positions: [
      { id: 'ds-mark', label: 'MARK', occupantId: 'u-third', orderId: 'order-demo-1', groupId: 'grp-ds-mark', price: 68, setIndex: 0 },
      { id: 'ds-renjun', label: 'RENJUN', groupId: 'grp-ds-renjun', price: 68, setIndex: 0 },
      { id: 'ds-jeno', label: 'JENO', groupId: 'grp-ds-jeno', price: 68, setIndex: 0 },
      { id: 'ds-haechan', label: 'HAECHAN', occupantId: 'u-fourth', orderId: 'order-demo-2', groupId: 'grp-ds-haechan', price: 68, setIndex: 0 },
      { id: 'ds-jaemin', label: 'JAEMIN', groupId: 'grp-ds-jaemin', price: 68, setIndex: 0 },
      { id: 'ds-chenle', label: 'CHENLE', groupId: 'grp-ds-chenle', price: 68, setIndex: 0 },
      { id: 'ds-jisung', label: 'JISUNG', groupId: 'grp-ds-jisung', price: 68, setIndex: 0 },
    ],
    createdAt: '2026-11-12T09:20:00.000Z',
  },
  {
    id: 'car-photocard',
    title: '冬日特典小卡整套拆车',
    eventName: 'NCT DREAM 冬日特典',
    productName: '成员随机小卡',
    price: 32,
    ownerId: 'u-third',
    deadline: '2026-12-08T22:00',
    description: '每个成员开放两个位置，优先按付款顺序锁位。',
    rules: '默认接受轻微厂瑕；本车为课程演示数据，不代表真实活动信息。',
    status: 'recruiting',
    groupId: 'g-nct',
    eventId: 'evt-winter',
    orderDeadline: '2026-12-08T22:00',
    internationalFreightCents: 9000,
    minAmountCents: 60000,
    maxPackageItems: 20,
    purchaseMode: 'single',
    guarantees: { fullSetOrdered: false, memberDesign: false },
    feeRules: { unitPrice: 32, serviceFee: 0, shippingFee: 0 },
    rulesVersion: 1,
    fallbackRule: fallbackRuleTemplates.single,
    shareGroups: [
      { id: 'grp-pc-mark', kind: 'product', name: '成员随机小卡', version: 'MARK', productId: 'p-winter-photocard', member: 'MARK', price: 32, quantity: 2, slotIds: ['pc-mark-1', 'pc-mark-2'] },
      { id: 'grp-pc-renjun', kind: 'product', name: '成员随机小卡', version: 'RENJUN', productId: 'p-winter-photocard', member: 'RENJUN', price: 32, quantity: 2, slotIds: ['pc-renjun-1', 'pc-renjun-2'] },
      { id: 'grp-pc-jeno', kind: 'product', name: '成员随机小卡', version: 'JENO', productId: 'p-winter-photocard', member: 'JENO', price: 32, quantity: 2, slotIds: ['pc-jeno-1', 'pc-jeno-2'] },
      { id: 'grp-pc-jaemin', kind: 'product', name: '成员随机小卡', version: 'JAEMIN', productId: 'p-winter-photocard', member: 'JAEMIN', price: 32, quantity: 2, slotIds: ['pc-jaemin-1', 'pc-jaemin-2'] },
    ],
    positions: [
      { id: 'pc-mark-1', label: 'MARK ①', groupId: 'grp-pc-mark', price: 32 },
      { id: 'pc-mark-2', label: 'MARK ②', occupantId: 'u-rider', orderId: 'order-demo-3', groupId: 'grp-pc-mark', price: 32 },
      { id: 'pc-renjun-1', label: 'RENJUN ①', groupId: 'grp-pc-renjun', price: 32 },
      { id: 'pc-renjun-2', label: 'RENJUN ②', groupId: 'grp-pc-renjun', price: 32 },
      { id: 'pc-jeno-1', label: 'JENO ①', occupantId: 'u-fourth', orderId: 'order-demo-4', groupId: 'grp-pc-jeno', price: 32 },
      { id: 'pc-jeno-2', label: 'JENO ②', groupId: 'grp-pc-jeno', price: 32 },
      { id: 'pc-jaemin-1', label: 'JAEMIN ①', groupId: 'grp-pc-jaemin', price: 32 },
      { id: 'pc-jaemin-2', label: 'JAEMIN ②', groupId: 'grp-pc-jaemin', price: 32 },
    ],
    createdAt: '2026-11-10T12:00:00.000Z',
  },
  {
    id: 'car-plush',
    title: '角色玩偶挂件一起带回家',
    eventName: 'NCT DREAM 角色周边系列',
    productName: '成员角色玩偶挂件',
    price: 89,
    ownerId: 'u-fourth',
    deadline: '2026-11-26T21:00',
    description: '本车已拼成，等待车主在群里更新后续进度。',
    rules: '付款后不支持随意换位；物流费用到货后按实际情况补。',
    status: 'cut',
    groupId: 'g-nct',
    eventId: 'evt-dreamscape',
    orderDeadline: '2026-11-26T21:00',
    internationalFreightCents: 10000,
    positions: [
      { id: 'pl-mark', label: 'MARK', occupantId: 'u-rider', orderId: 'order-demo-5' },
      { id: 'pl-renjun', label: 'RENJUN', occupantId: 'u-owner', orderId: 'order-demo-6' },
      { id: 'pl-jeno', label: 'JENO', occupantId: 'u-third', orderId: 'order-demo-7' },
    ],
    createdAt: '2026-11-01T08:30:00.000Z',
  },
  {
    id: 'car-badge',
    title: '巡演纪念徽章拆车',
    eventName: 'NCT DREAM 巡演纪念周边',
    productName: '成员徽章',
    price: 45,
    ownerId: 'u-rider',
    deadline: '2026-10-29T18:00',
    description: '演示用历史车次。',
    rules: '本车已结束。',
    status: 'completed',
    groupId: 'g-skz',
    eventId: 'evt-rockstar',
    orderDeadline: '2026-10-29T18:00',
    positions: [
      { id: 'bg-mark', label: 'MARK', occupantId: 'u-third', orderId: 'order-demo-8' },
      { id: 'bg-jisung', label: 'JISUNG', occupantId: 'u-fourth', orderId: 'order-demo-9' },
    ],
    createdAt: '2026-10-10T10:00:00.000Z',
    // V1.2：历史车次已完成全部履约，用于演示信誉加分记录
    fulfilledAt: '2026-11-05T09:00:00.000Z',
  },
]

const demoChats: Chat[] = [
  {
    id: 'chat-car-plush',
    carpoolId: 'car-plush',
    name: '角色玩偶挂件拼车群',
    announcement: '拼车已成立。车主会在这里同步下单、到货和发货进度，请大家留意群消息。',
    messages: [
      {
        id: 'msg-system-1',
        userId: 'u-fourth',
        content: '拼车成功，群聊已自动创建。',
        sentAt: '2026-11-16T13:00:00.000Z',
        system: true,
      },
      {
        id: 'msg-demo-1',
        userId: 'u-fourth',
        content: '大家好，位置已经确认完毕，今晚会统一下单。',
        sentAt: '2026-11-16T13:06:00.000Z',
      },
      {
        id: 'msg-demo-2',
        userId: 'u-rider',
        content: '收到，谢谢车主！',
        sentAt: '2026-11-16T13:08:00.000Z',
      },
    ],
    createdAt: '2026-11-16T13:00:00.000Z',
  },
]

/** V1.1 演示数据：均为虚构的姓名、电话与地址，仅用于本地演示 */
const demoSavedAddresses: SavedAddress[] = [
  {
    id: 'addr-seed-1',
    userId: 'u-owner',
    label: '学校',
    receiverName: '林小满',
    phone: '13800001111',
    province: '上海市',
    city: '上海市',
    district: '徐汇区',
    detail: '海州路 168 号 星光楼 3 层 302 室（前台代收）',
    isDefault: true,
    createdAt: '2026-11-10T02:00:00.000Z',
  },
  {
    id: 'addr-seed-2',
    userId: 'u-owner',
    label: '家',
    receiverName: '林小满',
    phone: '13800001111',
    province: '浙江省',
    city: '杭州市',
    district: '西湖区',
    detail: '文三路 259 号 4 单元 501 室',
    isDefault: false,
    createdAt: '2026-11-10T02:05:00.000Z',
  },
  {
    id: 'addr-seed-3',
    userId: 'u-rider',
    label: '宿舍',
    receiverName: '周见宁',
    phone: '13800002222',
    province: '广东省',
    city: '广州市',
    district: '天河区',
    detail: '五山路 100 号 A 座 612 室',
    isDefault: true,
    createdAt: '2026-11-10T03:00:00.000Z',
  },
  {
    id: 'addr-seed-4',
    userId: 'u-third',
    label: '公司',
    receiverName: '许听白',
    phone: '13800003333',
    province: '北京市',
    city: '北京市',
    district: '朝阳区',
    detail: '建国路 88 号 SOHO 现代城 B 座 1801',
    isDefault: true,
    createdAt: '2026-11-10T04:00:00.000Z',
  },
  {
    id: 'addr-seed-5',
    userId: 'u-fourth',
    label: '家',
    receiverName: '苏念',
    phone: '13800004444',
    province: '四川省',
    city: '成都市',
    district: '武侯区',
    detail: '天府大道北段 1 号 6 栋 902 室',
    isDefault: true,
    createdAt: '2026-11-10T05:00:00.000Z',
  },
]

const demoOrderAddresses: OrderShippingAddress[] = [
  {
    id: 'oaddr-seed-1',
    carpoolId: 'car-plush',
    userId: 'u-rider',
    status: 'submitted',
    label: '宿舍',
    receiverName: '周见宁',
    phone: '13800002222',
    province: '广东省',
    city: '广州市',
    district: '天河区',
    detail: '五山路 100 号 A 座 612 室',
    sourceAddressId: 'addr-seed-3',
    submittedAt: '2026-11-18T03:20:00.000Z',
    updatedAt: '2026-11-18T03:20:00.000Z',
    urgeCount: 0,
  },
  {
    id: 'oaddr-seed-2',
    carpoolId: 'car-plush',
    userId: 'u-owner',
    status: 'pending',
    label: '',
    receiverName: '',
    phone: '',
    province: '',
    city: '',
    district: '',
    detail: '',
    urgeCount: 0,
  },
  {
    id: 'oaddr-seed-3',
    carpoolId: 'car-plush',
    userId: 'u-third',
    status: 'pending',
    label: '',
    receiverName: '',
    phone: '',
    province: '',
    city: '',
    district: '',
    detail: '',
    urgeCount: 0,
  },
]

const demoInternationalShipments: InternationalShipment[] = [
  {
    id: 'intl-seed-1',
    carpoolId: 'car-plush',
    carrier: 'DHL Express',
    trackingNumber: 'JD014600008821',
    trackingUrl: 'https://www.dhl.com/cn/zh/home/tracking/tracking-express.html',
    status: 'in_transit',
    note: '包裹已从首尔仓发出，预计 5-7 个工作日抵达国内分拣中心。',
    updatedAt: '2026-11-18T02:30:00.000Z',
    timeline: [
      {
        id: 'tl-seed-1',
        status: 'waiting',
        note: '车主已完成官方下单，等待揽收。',
        at: '2026-11-16T14:00:00.000Z',
      },
      {
        id: 'tl-seed-2',
        status: 'in_transit',
        note: '包裹已从首尔仓发出，预计 5-7 个工作日抵达国内分拣中心。',
        at: '2026-11-18T02:30:00.000Z',
      },
    ],
  },
]

const demoDomesticShipments: DomesticShipment[] = [
  {
    id: 'dom-seed-1',
    carpoolId: 'car-plush',
    userId: 'u-rider',
    carrier: '中通快递',
    trackingNumber: 'ZT7712345678901',
    shippedAt: '2026-11-18T06:20:00.000Z',
    note: '已验货无瑕疵，含活动赠品明信片。',
    status: 'shipped',
    updatedAt: '2026-11-18T06:20:00.000Z',
  },
]

const demoNotifications: Notification[] = [
  {
    id: 'noti-seed-1',
    userId: 'u-owner',
    type: 'address_required',
    title: '请补充收货地址',
    content: '「角色玩偶挂件一起带回家」已进入国际运输，请尽快填写你的收货地址，便于车主统一打包发货。',
    carpoolId: 'car-plush',
    createdAt: '2026-11-18T02:31:00.000Z',
    read: false,
  },
  {
    id: 'noti-seed-2',
    userId: 'u-third',
    type: 'address_required',
    title: '请补充收货地址',
    content: '「角色玩偶挂件一起带回家」已进入国际运输，请尽快填写你的收货地址，便于车主统一打包发货。',
    carpoolId: 'car-plush',
    createdAt: '2026-11-18T02:31:00.000Z',
    read: false,
  },
  {
    id: 'noti-seed-3',
    userId: 'u-rider',
    type: 'domestic_shipped',
    title: '你的包裹已发出',
    content: '车主已为你在「角色玩偶挂件一起带回家」的订单发货，包裹正在路上，请留意查收。',
    carpoolId: 'car-plush',
    createdAt: '2026-11-18T06:21:00.000Z',
    read: false,
  },
]

/**
 * V1.2 演示数据：信誉事件、投诉与申诉。
 * 全部为虚构的历史记录，用于演示加分、扣分、审核与申诉流程。
 */
const demoReputationEvents: ReputationEvent[] = [
  {
    id: 'repevent-seed-1',
    userId: 'u-rider',
    carId: 'car-badge',
    eventType: 'owner_delay',
    scoreChange: -5,
    reason: '核实后确认车主延迟发货且未给出合理说明。',
    createdAt: '2026-10-06T09:00:00.000Z',
    status: 'active',
    complaintId: 'complaint-seed-1',
    reviewNote: '核实后确认车主延迟发货且未给出合理说明。',
  },
  {
    id: 'repevent-seed-2',
    userId: 'u-rider',
    carId: 'car-photocard',
    eventType: 'rider_quit',
    scoreChange: -5,
    reason: '核实后确认车员在成团后擅自退出车次。',
    createdAt: '2026-10-08T09:00:00.000Z',
    status: 'active',
    complaintId: 'complaint-seed-2',
    reviewNote: '核实后确认车员在成团后擅自退出车次。',
  },
  {
    id: 'repevent-seed-3',
    userId: 'u-fourth',
    carId: 'car-plush',
    eventType: 'fake_logistics',
    scoreChange: -15,
    reason: '核实后确认物流单号与实际物流信息不符。',
    createdAt: '2026-10-12T09:00:00.000Z',
    status: 'active',
    complaintId: 'complaint-seed-3',
    reviewNote: '核实后确认物流单号与实际物流信息不符。',
  },
  {
    id: 'repevent-seed-4',
    userId: 'u-third',
    carId: 'car-plush',
    eventType: 'fake_logistics',
    scoreChange: -15,
    reason: '核实后确认物流单号与实际物流信息不符。',
    createdAt: '2026-10-18T09:00:00.000Z',
    status: 'active',
    complaintId: 'complaint-seed-4',
    reviewNote: '核实后确认物流单号与实际物流信息不符。',
  },
  {
    id: 'repevent-seed-5',
    userId: 'u-rider',
    carId: 'car-photocard',
    eventType: 'owner_delay',
    scoreChange: -5,
    reason: '核实后确认车主延迟发货且未给出合理说明。',
    createdAt: '2026-10-20T09:00:00.000Z',
    status: 'active',
    complaintId: 'complaint-seed-5',
    reviewNote: '核实后确认车主延迟发货且未给出合理说明。',
  },
  {
    id: 'repevent-seed-6',
    userId: 'u-third',
    carId: 'car-photocard',
    eventType: 'rider_quit',
    scoreChange: -5,
    reason: '核实后确认车员在成团后擅自退出车次。',
    createdAt: '2026-10-22T09:00:00.000Z',
    status: 'revoked',
    complaintId: 'complaint-seed-6',
    appealId: 'appeal-seed-1',
    revokedAt: '2026-10-25T09:00:00.000Z',
    reviewNote: '核实后认为车员已说明情况，撤销扣分。',
  },
  {
    id: 'repevent-seed-7',
    userId: 'u-third',
    carId: 'car-plush',
    eventType: 'fraud',
    scoreChange: -20,
    reason: '核实后确认存在严重违规行为（骚扰群成员并私自处理他人订单）。',
    createdAt: '2026-10-26T09:00:00.000Z',
    status: 'active',
    complaintId: 'complaint-seed-7',
    reviewNote: '核实后确认存在严重违规行为（骚扰群成员并私自处理他人订单）。',
  },
  {
    id: 'repevent-seed-8',
    userId: 'u-fourth',
    carId: 'car-plush',
    eventType: 'fraud',
    scoreChange: -30,
    reason: '核实后确认存在严重违规行为（多次伪造物流信息并拖延发货）。',
    createdAt: '2026-10-28T09:00:00.000Z',
    status: 'active',
    complaintId: 'complaint-seed-8',
    reviewNote: '核实后确认存在严重违规行为（多次伪造物流信息并拖延发货）。',
  },
  {
    id: 'repevent-seed-9',
    userId: 'u-third',
    carId: 'car-badge',
    eventType: 'rider_complete',
    scoreChange: 1,
    reason: '正常完成一次拼车履约',
    createdAt: '2026-11-02T09:00:00.000Z',
    status: 'active',
  },
  {
    id: 'repevent-seed-10',
    userId: 'u-fourth',
    carId: 'car-badge',
    eventType: 'rider_complete',
    scoreChange: 1,
    reason: '正常完成一次拼车履约',
    createdAt: '2026-11-02T09:00:00.000Z',
    status: 'active',
  },
  {
    id: 'repevent-seed-11',
    userId: 'u-rider',
    carId: 'car-badge',
    eventType: 'owner_complete',
    scoreChange: 2,
    reason: '完成一辆车的全部履约流程',
    createdAt: '2026-11-05T09:00:00.000Z',
    status: 'active',
  },
]

const demoComplaints: Complaint[] = [
  {
    id: 'complaint-seed-1',
    reporterId: 'u-third',
    targetUserId: 'u-rider',
    carId: 'car-badge',
    category: 'owner_delay',
    description: '成团后商品迟迟没有发货，群里也没有任何说明，希望平台核实处理。',
    status: 'confirmed',
    createdAt: '2026-10-05T09:00:00.000Z',
    reviewedAt: '2026-10-06T09:00:00.000Z',
    reviewNote: '核实后确认车主延迟发货且未给出合理说明。',
    deduction: 5,
  },
  {
    id: 'complaint-seed-2',
    reporterId: 'u-fourth',
    targetUserId: 'u-rider',
    carId: 'car-photocard',
    category: 'rider_quit',
    description: '车员在群里表示不想要这个位置，随后直接退出了车次，没有说明理由。',
    status: 'confirmed',
    createdAt: '2026-10-07T09:00:00.000Z',
    reviewedAt: '2026-10-08T09:00:00.000Z',
    reviewNote: '核实后确认车员在成团后擅自退出车次。',
    deduction: 5,
  },
  {
    id: 'complaint-seed-3',
    reporterId: 'u-owner',
    targetUserId: 'u-fourth',
    carId: 'car-plush',
    category: 'fake_logistics',
    description: '车主提供的快递单号在物流平台查不到任何记录，怀疑物流信息是假的。',
    status: 'confirmed',
    createdAt: '2026-10-11T09:00:00.000Z',
    reviewedAt: '2026-10-12T09:00:00.000Z',
    reviewNote: '核实后确认物流单号与实际物流信息不符。',
    deduction: 15,
  },
  {
    id: 'complaint-seed-4',
    reporterId: 'u-rider',
    targetUserId: 'u-third',
    carId: 'car-plush',
    category: 'fake_logistics',
    description: '车主群里发的物流单号和实际收到的包裹对不上，收件人也不是本人。',
    status: 'confirmed',
    createdAt: '2026-10-17T09:00:00.000Z',
    reviewedAt: '2026-10-18T09:00:00.000Z',
    reviewNote: '核实后确认物流单号与实际物流信息不符。',
    deduction: 15,
  },
  {
    id: 'complaint-seed-5',
    reporterId: 'u-fourth',
    targetUserId: 'u-rider',
    carId: 'car-photocard',
    category: 'owner_delay',
    description: '本车成团已经很久，车主一直没有下单，群里也没有解释。',
    status: 'confirmed',
    createdAt: '2026-10-19T09:00:00.000Z',
    reviewedAt: '2026-10-20T09:00:00.000Z',
    reviewNote: '核实后确认车主延迟发货且未给出合理说明。',
    deduction: 5,
  },
  {
    id: 'complaint-seed-6',
    reporterId: 'u-fourth',
    targetUserId: 'u-third',
    carId: 'car-photocard',
    category: 'rider_quit',
    description: '车员说临时有事要退出车次，之后一直没有再回复群消息。',
    status: 'confirmed',
    createdAt: '2026-10-21T09:00:00.000Z',
    reviewedAt: '2026-10-22T09:00:00.000Z',
    reviewNote: '核实后确认车员在成团后擅自退出车次。',
    deduction: 5,
  },
  {
    id: 'complaint-seed-7',
    reporterId: 'u-owner',
    targetUserId: 'u-third',
    carId: 'car-plush',
    category: 'fraud',
    description: '车员在群里多次骚扰其他成员，并擅自处理了别人的订单和地址信息。',
    status: 'confirmed',
    createdAt: '2026-10-25T09:00:00.000Z',
    reviewedAt: '2026-10-26T09:00:00.000Z',
    reviewNote: '核实后确认存在严重违规行为（骚扰群成员并私自处理他人订单）。',
    deduction: 20,
  },
  {
    id: 'complaint-seed-8',
    reporterId: 'u-owner',
    targetUserId: 'u-fourth',
    carId: 'car-plush',
    category: 'fraud',
    description: '车主多次伪造物流信息，并且一直拖延不同意的发货时间。',
    status: 'confirmed',
    createdAt: '2026-10-27T09:00:00.000Z',
    reviewedAt: '2026-10-28T09:00:00.000Z',
    reviewNote: '核实后确认存在严重违规行为（多次伪造物流信息并拖延发货）。',
    deduction: 30,
  },
  {
    id: 'complaint-seed-9',
    reporterId: 'u-rider',
    targetUserId: 'u-third',
    carId: 'car-plush',
    category: 'other',
    description: '车员在群聊中多次表示要退出本次拼车，并且无法提供有效的收货地址，希望平台核实处理。',
    status: 'pending',
    createdAt: '2026-11-16T09:00:00.000Z',
  },
  {
    id: 'complaint-seed-10',
    reporterId: 'u-third',
    targetUserId: 'u-fourth',
    carId: 'car-plush',
    category: 'owner_delay',
    description: '到货检查已经完成很久，车主仍然没有提供任何国内快递单号，也没有说明原因。',
    status: 'pending',
    createdAt: '2026-11-17T09:00:00.000Z',
  },
]

const demoAppeals: Appeal[] = [
  {
    id: 'appeal-seed-1',
    reputationEventId: 'repevent-seed-6',
    userId: 'u-third',
    reason: '当时确有急事，已经在群里说明了情况并申请退款，平台核实后应撤销扣分。',
    status: 'approved',
    createdAt: '2026-10-24T09:00:00.000Z',
    reviewedAt: '2026-10-25T09:00:00.000Z',
    reviewNote: '核实后认为车员已说明情况，撤销扣分。',
  },
  {
    id: 'appeal-seed-2',
    reputationEventId: 'repevent-seed-7',
    userId: 'u-third',
    reason: '当时是帮朋友代收，物流单号由朋友提供，我并不知情，请核实后撤销扣分。',
    status: 'pending',
    createdAt: '2026-11-06T09:00:00.000Z',
  },
]

/** V1.2 站内通知：扣分与申诉结果 */
const demoReputationNotifications: Notification[] = [
  {
    id: 'noti-rep-1',
    userId: 'u-third',
    type: 'reputation_penalty',
    title: '信誉分扣分通知',
    content: '你在「角色玩偶挂件一起带回家」中被核实存在严重违规行为（骚扰群成员并私自处理他人订单），信誉分扣除 20 分，当前 66 分。处理原因：核实后确认存在严重违规行为。如有异议可在「我的信誉」中提交申诉。',
    carpoolId: 'car-plush',
    createdAt: '2026-10-26T09:00:00.000Z',
    read: false,
  },
  {
    id: 'noti-rep-2',
    userId: 'u-fourth',
    type: 'reputation_penalty',
    title: '信誉分扣分通知',
    content: '你在「角色玩偶挂件一起带回家」中被核实存在严重违规行为（多次伪造物流信息并拖延发货），信誉分扣除 30 分，当前 56 分。处理原因：核实后确认存在严重违规行为。如有异议可在「我的信誉」中提交申诉。',
    carpoolId: 'car-plush',
    createdAt: '2026-10-28T09:00:00.000Z',
    read: false,
  },
  {
    id: 'noti-rep-3',
    userId: 'u-third',
    type: 'appeal_result',
    title: '申诉已提交',
    content: '你的申诉已进入待审核状态，管理员审核通过后系统会自动撤销扣分并重新计算信誉分。',
    carpoolId: 'car-plush',
    createdAt: '2026-11-06T09:00:00.000Z',
    read: false,
  },
  {
    id: 'noti-rep-4',
    userId: 'u-rider',
    type: 'complaint_result',
    title: '投诉已核实成立',
    content: '你对「角色玩偶挂件一起带回家」的投诉经核实成立，平台已按规则处理。',
    carpoolId: 'car-plush',
    createdAt: '2026-10-18T09:00:00.000Z',
    read: true,
  },
]

function buildReputations(users: User[], events: ReputationEvent[]): UserReputation[] {
  return users.map((user) => {
    const score = scoreFromEvents(events, user.id)
    return { userId: user.id, score, level: levelOf(score), updatedAt: '2026-11-18T00:00:00.000Z' }
  })
}

/**
 * V1.3-A 兼容层：旧数据没有分组信息，按 legacy 平铺位置处理，
 * 补齐份额单价与保底字段，但不改变原有的平铺结构与既有业务数据。
 */
/**
 * V2.0 状态迁移：旧车次状态映射到新的招募 / 采购生命周期。
 */
function migrateCarpoolStatus(status: string): Carpool['status'] {
  switch (status) {
    case 'pending_confirm': return 'recruiting'
    case 'formed': return 'cut'
    case 'ordered': return 'purchasing'
    case 'closed': return 'completed'
    case 'recruiting':
    case 'expired':
    case 'cut':
    case 'purchasing':
    case 'completed':
    case 'failed':
      return status as Carpool['status']
    default: return 'recruiting'
  }
}

function normalizeCarpool(carpool: Carpool): Carpool {
  const mode = purchaseModeOf(carpool)
  const base = {
    guarantees: carpool.guarantees ?? (isLegacyCarpool(carpool)
      ? { fullSetOrdered: false, memberDesign: true }
      : defaultGuarantees(mode)),
    feeRules: carpool.feeRules ?? defaultFeeRules(carpool.price),
    rulesVersion: carpool.rulesVersion ?? 1,
    fallbackRule: carpool.fallbackRule ?? fallbackRuleTemplates[mode],
  }
  const migrated: Carpool = { ...carpool, status: migrateCarpoolStatus(carpool.status), ...base }
  if (!isLegacyCarpool(carpool)) return migrated
  return {
    ...migrated,
    positions: carpool.positions.map((slot) => ({ ...slot, price: slot.price ?? carpool.price })),
  }
}

/** V1.3-A 兼容层：为存量订单补齐商品 / 费用 / 规则快照（已有快照不覆盖） */
function normalizeOrders(orders: Order[], carpools: Carpool[]): Order[] {
  return orders.map((order) => {
    if (order.itemSnapshot && order.feeSnapshot && order.rulesSnapshot) return order
    const carpool = carpools.find((item) => item.id === order.carpoolId)
    if (!carpool) return order
    return {
      ...order,
      itemSnapshot: order.itemSnapshot ?? buildItemSnapshot(carpool, order.slotIds),
      feeSnapshot: order.feeSnapshot ?? buildFeeSnapshot(carpool, order.slotIds),
      rulesSnapshot: order.rulesSnapshot ?? buildRulesSnapshot(carpool, order.paidAt || carpool.createdAt),
    }
  })
}

export function createInitialData(): AppData {
  const orders: AppData['orders'] = [
    { id: 'order-demo-1', carpoolId: 'car-dreamscape', userId: 'u-third', slotIds: ['ds-mark'], amount: 68, paidAt: '2026-11-12T10:00:00.000Z' },
    { id: 'order-demo-2', carpoolId: 'car-dreamscape', userId: 'u-fourth', slotIds: ['ds-haechan'], amount: 68, paidAt: '2026-11-12T11:00:00.000Z' },
    { id: 'order-demo-3', carpoolId: 'car-photocard', userId: 'u-rider', slotIds: ['pc-mark-2'], amount: 32, paidAt: '2026-11-11T09:00:00.000Z' },
    { id: 'order-demo-4', carpoolId: 'car-photocard', userId: 'u-fourth', slotIds: ['pc-jeno-1'], amount: 32, paidAt: '2026-11-11T09:10:00.000Z' },
    { id: 'order-demo-5', carpoolId: 'car-plush', userId: 'u-rider', slotIds: ['pl-mark'], amount: 89, paidAt: '2026-11-03T09:00:00.000Z' },
    { id: 'order-demo-6', carpoolId: 'car-plush', userId: 'u-owner', slotIds: ['pl-renjun'], amount: 89, paidAt: '2026-11-03T09:15:00.000Z' },
    { id: 'order-demo-7', carpoolId: 'car-plush', userId: 'u-third', slotIds: ['pl-jeno'], amount: 89, paidAt: '2026-11-03T09:30:00.000Z' },
    // V1.2：历史车次 car-badge 的订单已完成履约
    { id: 'order-demo-8', carpoolId: 'car-badge', userId: 'u-third', slotIds: ['bg-mark'], amount: 45, paidAt: '2026-10-10T10:30:00.000Z', fulfillmentStatus: 'completed', fulfilledAt: '2026-11-02T09:00:00.000Z' },
    { id: 'order-demo-9', carpoolId: 'car-badge', userId: 'u-fourth', slotIds: ['bg-jisung'], amount: 45, paidAt: '2026-10-10T10:40:00.000Z', fulfillmentStatus: 'completed', fulfilledAt: '2026-11-02T09:00:00.000Z' },
  ]

  const carpools = [...demoV2Carpools, ...demoCarpools].map((carpool) => (
    carpool.id === 'car-plush'
      ? { ...carpool, addressCollection: { enabled: true, startedAt: '2026-11-18T02:31:00.000Z' } }
      : carpool
  )).map(normalizeCarpool)

  return {
    version: DATA_VERSION,
    users: initialUsers,
    currentUserId: 'u-owner',
    carpools,
    orders: normalizeOrders([...demoV2Orders, ...orders], carpools),
    chats: demoChats,
    savedAddresses: demoSavedAddresses,
    orderAddresses: demoOrderAddresses,
    internationalShipments: demoInternationalShipments,
    domesticShipments: demoDomesticShipments,
    notifications: [...demoNotifications, ...demoReputationNotifications],
    reputations: buildReputations(initialUsers, demoReputationEvents),
    reputationEvents: demoReputationEvents,
    complaints: demoComplaints,
    appeals: demoAppeals,
    adminLogs: [],
    adminMode: false,
    // ---------- V2.0 ----------
    groups: demoGroups,
    events: demoEvents,
    eventProducts: demoEventProducts,
    ownerPurchases: demoV2OwnerPurchases,
    payments: demoV2Payments,
    freightBills: demoV2FreightBills,
    domesticFeeBills: [],
    participations: demoV2Participations,
    purchaseVouchers: [],
    exceptions: [],
    eventSubmissions: [],
    drafts: [],
  }
}

/**
 * 兼容 V1 / V1.1 / V1.2 存量数据：保留原有拼车 / 订单 / 群聊与物流地址数据，
 * 补齐 V1.2 需要的信誉、投诉、申诉集合，并为老用户初始化信誉信息；
 * V1.3-A 额外补齐份额分组、保底规则与订单快照，老车保持 legacy 平铺结构。
 */
export function normalizeData(parsed: Partial<AppData> | null): AppData {
  const base = createInitialData()
  if (!parsed || !Array.isArray(parsed.carpools)) return base
  const carpools = parsed.carpools.map((carpool) => ({
    ...carpool,
    addressCollection: carpool.addressCollection ?? undefined,
  })).map(normalizeCarpool)
  const users = Array.isArray(parsed.users) && parsed.users.length ? parsed.users : base.users
  const reputationEvents = Array.isArray(parsed.reputationEvents) ? parsed.reputationEvents : []
  const reputations = Array.isArray(parsed.reputations) && parsed.reputations.length
    ? parsed.reputations
    : buildReputations(users, reputationEvents)
  const orders = Array.isArray(parsed.orders) ? parsed.orders : base.orders
  const chats = Array.isArray(parsed.chats)
    ? parsed.chats.map((chat) => ({ ...chat, reads: chat.reads ?? {} }))
    : base.chats
  const freightBills = (Array.isArray(parsed.freightBills) ? parsed.freightBills : []).map((bill) => {
    const carpool = carpools.find((item) => item.id === bill.carpoolId)
    return carpool?.ownerId === bill.userId && bill.status === 'pending'
      ? { ...bill, status: 'booked' as const }
      : bill
  })

  return {
    version: DATA_VERSION,
    users: users.map((user) => ({
      ...user,
      province: user.province ?? base.users.find((item) => item.id === user.id)?.province ?? '未知',
      joinedAt: user.joinedAt ?? base.users.find((item) => item.id === user.id)?.joinedAt ?? '',
    })),
    currentUserId: parsed.currentUserId ?? base.currentUserId,
    carpools,
    orders: normalizeOrders(orders, carpools),
    chats,
    savedAddresses: Array.isArray(parsed.savedAddresses) ? parsed.savedAddresses : [],
    orderAddresses: Array.isArray(parsed.orderAddresses) ? parsed.orderAddresses : [],
    internationalShipments: Array.isArray(parsed.internationalShipments) ? parsed.internationalShipments : [],
    domesticShipments: Array.isArray(parsed.domesticShipments) ? parsed.domesticShipments : [],
    notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    reputations,
    reputationEvents,
    complaints: Array.isArray(parsed.complaints) ? parsed.complaints : [],
    appeals: Array.isArray(parsed.appeals) ? parsed.appeals : [],
    adminLogs: Array.isArray(parsed.adminLogs) ? parsed.adminLogs : [],
    adminMode: Boolean(parsed.adminMode),
    // ---------- V2.0 存量兼容 ----------
    groups: Array.isArray(parsed.groups) && parsed.groups.length ? parsed.groups : base.groups,
    events: Array.isArray(parsed.events) && parsed.events.length ? parsed.events : base.events,
    eventProducts: Array.isArray(parsed.eventProducts) && parsed.eventProducts.length ? parsed.eventProducts : base.eventProducts,
    ownerPurchases: Array.isArray(parsed.ownerPurchases) ? parsed.ownerPurchases : [],
    payments: Array.isArray(parsed.payments) ? parsed.payments : [],
    freightBills,
    domesticFeeBills: Array.isArray(parsed.domesticFeeBills) ? parsed.domesticFeeBills : [],
    participations: Array.isArray(parsed.participations) ? parsed.participations : [],
    purchaseVouchers: Array.isArray(parsed.purchaseVouchers) ? parsed.purchaseVouchers : [],
    exceptions: Array.isArray(parsed.exceptions) ? parsed.exceptions : [],
    eventSubmissions: Array.isArray(parsed.eventSubmissions) ? parsed.eventSubmissions : [],
    drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
  }
}
