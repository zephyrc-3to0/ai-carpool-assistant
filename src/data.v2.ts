/**
 * V2.0 演示数据：团体 / 活动 / 活动商品目录，以及 V2.0 车次与交易样例。
 *
 * - car-v2-bundle：整套凑套，招募中，演示自动截团与车主自购
 * - car-v2-single：普通拼邮，招募中，演示最低金额 + 包裹件数规则
 * - car-v2-freight：已截团，演示国际运费 AA 账单与模拟支付
 */
import type {
  AppData,
  ArtistGroup,
  Carpool,
  EventInfo,
  EventProduct,
  FreightBill,
  OwnerPurchase,
  Participation,
  PaymentRecord,
} from './types'

export const demoGroups: ArtistGroup[] = [
  { id: 'g-nct', name: 'NCT DREAM', shortName: 'NCT', color: '#7557c8', description: '来自首尔的七人男子组合，官方周边覆盖专辑、小卡与应援物。', memberCount: 7 },
  { id: 'g-svt', name: 'SEVENTEEN', shortName: 'SVT', color: '#268778', description: '韩国人气男子组合，巡演与专辑周边种类丰富。', memberCount: 13 },
  { id: 'g-skz', name: 'Stray Kids', shortName: 'SKZ', color: '#bb6b42', description: '自作曲风鲜明的男子组合，巡演周边以服饰类为主。', memberCount: 8 },
  { id: 'g-twice', name: 'TWICE', shortName: 'TWICE', color: '#5676a9', description: '女子组合，专辑与演唱会周边常年热销。', memberCount: 9 },
]

export const demoEvents: EventInfo[] = [
  {
    id: 'evt-dreamscape',
    groupId: 'g-nct',
    name: 'DREAMSCAPE 快闪店',
    orderDeadline: '2026-12-18T20:00',
    productIds: ['p-ds-agency-a', 'p-ds-agency-b', 'p-ds-lightstick'],
    bannerTitle: 'DREAMSCAPE 快闪店',
    bannerSubtitle: 'NCT DREAM 新成员立牌首次贩售，凑套与拆车同步开放',
    hot: true,
  },
  {
    id: 'evt-winter',
    groupId: 'g-nct',
    name: '冬日特典',
    orderDeadline: '2026-12-08T22:00',
    productIds: ['p-winter-photocard', 'p-winter-set'],
    bannerTitle: '冬日特典小卡',
    bannerSubtitle: '特典小卡随机发货，按成员位置拼车可提高指定款式到手率',
  },
  {
    id: 'evt-fml',
    groupId: 'g-svt',
    name: 'FML 专辑',
    orderDeadline: '2026-12-25T18:00',
    productIds: ['p-fml-album', 'p-fml-photocard'],
    bannerTitle: 'FML 正版专辑',
    bannerSubtitle: '首周特典随机发货，可选择专辑与特典小卡一起拼车',
    hot: true,
  },
  {
    id: 'evt-rockstar',
    groupId: 'g-skz',
    name: 'ROCK-STAR 巡演',
    orderDeadline: '2027-01-15T20:00',
    productIds: ['p-rs-hoodie', 'p-rs-photocard'],
    bannerTitle: 'ROCK-STAR 巡演周边',
    bannerSubtitle: '巡演卫衣限量发售，整车国际运费到货后统一结算',
  },
  {
    id: 'evt-ready',
    groupId: 'g-twice',
    name: 'READY TO BE 演唱会',
    orderDeadline: '2027-02-10T20:00',
    productIds: ['p-rtb-album', 'p-rtb-lightstick'],
    bannerTitle: 'READY TO BE 演唱会',
    bannerSubtitle: '官方应援棒与专辑同步开售',
  },
]

export const demoEventProducts: EventProduct[] = [
  {
    id: 'p-ds-agency-a', eventId: 'evt-dreamscape', name: '成员亚克力立牌', category: '立牌', spec: 'A 版',
    price: 68, perUserLimit: 2,
    members: ['MARK', 'RENJUN', 'JENO', 'HAECHAN', 'JAEMIN', 'CHENLE', 'JISUNG'],
  },
  {
    id: 'p-ds-agency-b', eventId: 'evt-dreamscape', name: '成员亚克力立牌', category: '立牌', spec: 'B 版',
    price: 78, perUserLimit: 2,
    members: ['MARK', 'RENJUN', 'JENO', 'HAECHAN', 'JAEMIN', 'CHENLE', 'JISUNG'],
  },
  {
    id: 'p-ds-lightstick', eventId: 'evt-dreamscape', name: '应援棒挂件', category: '挂件', spec: '标准版',
    price: 45, perUserLimit: 3, members: [],
  },
  {
    id: 'p-winter-photocard', eventId: 'evt-winter', name: '成员随机小卡', category: '小卡', spec: '冬日特典',
    price: 32, perUserLimit: 4,
    members: ['MARK', 'RENJUN', 'JENO', 'HAECHAN', 'JAEMIN', 'CHENLE', 'JISUNG'],
  },
  {
    id: 'p-winter-set', eventId: 'evt-winter', name: '特典小卡套装', category: '套装', spec: '七人全款',
    price: 210, perUserLimit: 1, members: [],
  },
  {
    id: 'p-fml-album', eventId: 'evt-fml', name: '正版权专辑', category: '专辑', spec: '标准版',
    price: 168, perUserLimit: 2, members: [],
  },
  {
    id: 'p-fml-photocard', eventId: 'evt-fml', name: '首周特典小卡', category: '小卡', spec: '随机版',
    price: 88, perUserLimit: 2, members: [],
  },
  {
    id: 'p-rs-hoodie', eventId: 'evt-rockstar', name: '巡演卫衣', category: '服饰', spec: '巡演限定',
    price: 588, perUserLimit: 1, members: [],
  },
  {
    id: 'p-rs-photocard', eventId: 'evt-rockstar', name: '巡演现场小卡', category: '小卡', spec: '现场版',
    price: 45, perUserLimit: 4, members: [],
  },
  {
    id: 'p-rtb-album', eventId: 'evt-ready', name: '正版权专辑', category: '专辑', spec: '标准版',
    price: 138, perUserLimit: 2, members: [],
  },
  {
    id: 'p-rtb-lightstick', eventId: 'evt-ready', name: '官方应援棒', category: '周边', spec: '官方版',
    price: 268, perUserLimit: 1, members: [],
  },
]

const bundleMembers = ['MARK', 'RENJUN', 'JENO', 'HAECHAN', 'JAEMIN', 'CHENLE', 'JISUNG']

export const demoV2Carpools: Carpool[] = [
  {
    id: 'car-v2-bundle',
    title: 'DREAMSCAPE A 版立牌整套凑套',
    eventName: 'DREAMSCAPE 快闪店',
    productName: '成员亚克力立牌',
    price: 68,
    ownerId: 'u-owner',
    deadline: '2026-12-18T18:00',
    description: '按成员位置凑齐一整套 A 版立牌，全部成员位置被认领后自动截团。',
    rules: '每个成员位置 1 份；车主自购份额不产生付款；截团后按有效份数分摊整车国际运费。',
    status: 'recruiting',
    groupId: 'g-nct',
    eventId: 'evt-dreamscape',
    orderDeadline: '2026-12-18T20:00',
    internationalFreightCents: 12000,
    purchaseMode: 'bundle',
    guarantees: { fullSetOrdered: true, memberDesign: true },
    feeRules: { unitPrice: 68, serviceFee: 0, shippingFee: 0 },
    rulesVersion: 1,
    requiresDomesticFee: true,
    fallbackRule: '未凑齐时车主会补齐缺失的成员位，仍按整套下单；不会未经车员同意分摊额外费用。',
    shareGroups: bundleMembers.map((member) => ({
      id: `grp-v2-${member.toLowerCase()}`,
      kind: 'bundle' as const,
      name: member,
      version: 'A 版',
      productId: 'p-ds-agency-a',
      member,
      price: 68,
      quantity: 1,
      slotIds: [`v2b-${member.toLowerCase()}`],
    })),
    positions: bundleMembers.map((member) => ({
      id: `v2b-${member.toLowerCase()}`,
      label: `A 版 ${member}`,
      groupId: `grp-v2-${member.toLowerCase()}`,
      price: 68,
    })),
    createdAt: '2026-11-18T03:00:00.000Z',
  },
  {
    id: 'car-v2-single',
    title: '冬日特典小卡拼邮车',
    eventName: '冬日特典',
    productName: '成员随机小卡',
    price: 32,
    ownerId: 'u-third',
    deadline: '2026-12-08T20:00',
    description: '按件数拼邮，达到最低金额后车主可以手动截团，包裹装满时系统自动截团。',
    rules: '每人最多购买 4 件；整车国际包裹上限 20 件；整车最低成团金额 600 元。',
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
    requiresDomesticFee: true,
    fallbackRule: '未达最低成团金额时车主按实际数量下单，差价不退；也可以继续招募到截单时间。',
    shareGroups: [{
      id: 'grp-v2-single-card',
      kind: 'product',
      name: '成员随机小卡',
      version: '冬日特典',
      productId: 'p-winter-photocard',
      price: 32,
      quantity: 20,
      slotIds: Array.from({ length: 20 }, (_, index) => `v2s-${index + 1}`),
    }],
    positions: Array.from({ length: 20 }, (_, index) => ({
      id: `v2s-${index + 1}`,
      label: `冬日特典 ${index + 1}`,
      groupId: 'grp-v2-single-card',
      price: 32,
    })),
    createdAt: '2026-11-18T05:00:00.000Z',
  },
  {
    id: 'car-v2-freight',
    title: 'DREAMSCAPE B 版立牌小团',
    eventName: 'DREAMSCAPE 快闪店',
    productName: '成员亚克力立牌',
    price: 78,
    ownerId: 'u-fourth',
    deadline: '2026-11-28T20:00',
    description: '已截团的车次，用于演示国际运费自动 AA 分摊与账单支付。',
    rules: '整车国际运费 100 元在截团后按有效份数均摊；未支付运费不影响车主采购。',
    status: 'cut',
    cutAt: '2026-11-19T06:00:00.000Z',
    groupId: 'g-nct',
    eventId: 'evt-dreamscape',
    orderDeadline: '2026-11-29T20:00',
    internationalFreightCents: 10000,
    purchaseMode: 'bundle',
    guarantees: { fullSetOrdered: true, memberDesign: true },
    feeRules: { unitPrice: 78, serviceFee: 0, shippingFee: 0 },
    rulesVersion: 1,
    requiresDomesticFee: true,
    fallbackRule: '本车已截团，不再接受新的认领。',
    shareGroups: [
      { id: 'grp-v2f-mark', kind: 'bundle', name: 'MARK', version: 'B 版', productId: 'p-ds-agency-b', member: 'MARK', price: 78, quantity: 1, slotIds: ['v2f-mark'] },
      { id: 'grp-v2f-renjun', kind: 'bundle', name: 'RENJUN', version: 'B 版', productId: 'p-ds-agency-b', member: 'RENJUN', price: 78, quantity: 1, slotIds: ['v2f-renjun'] },
      { id: 'grp-v2f-jeno', kind: 'bundle', name: 'JENO', version: 'B 版', productId: 'p-ds-agency-b', member: 'JENO', price: 78, quantity: 1, slotIds: ['v2f-jeno'] },
    ],
    positions: [
      { id: 'v2f-mark', label: 'B 版 MARK', groupId: 'grp-v2f-mark', price: 78, occupantId: 'u-rider', orderId: 'order-v2-1' },
      { id: 'v2f-renjun', label: 'B 版 RENJUN', groupId: 'grp-v2f-renjun', price: 78, occupantId: 'u-third', orderId: 'order-v2-2' },
      { id: 'v2f-jeno', label: 'B 版 JENO', groupId: 'grp-v2f-jeno', price: 78, occupantId: 'u-owner' },
    ],
    createdAt: '2026-11-15T02:00:00.000Z',
  },
]

export const demoV2Orders: AppData['orders'] = [
  {
    id: 'order-v2-1',
    carpoolId: 'car-v2-freight',
    userId: 'u-rider',
    slotIds: ['v2f-mark'],
    amount: 78,
    paidAt: '2026-11-18T06:00:00.000Z',
    itemSnapshot: { groupId: 'grp-v2f-mark', kind: 'bundle', name: 'MARK', version: 'B 版', unitPrice: 78, quantity: 1, slotLabels: ['B 版 MARK'] },
    feeSnapshot: { unitPrice: 78, quantity: 1, serviceFee: 0, shippingFee: 0, total: 78 },
    rulesSnapshot: { rulesVersion: 1, rules: '整车国际运费 100 元在截团后按有效份数均摊。', fallbackRule: '本车已截团，不再接受新的认领。', guarantees: { fullSetOrdered: true, memberDesign: true }, publishedAt: '2026-11-15T02:00:00.000Z' },
  },
  {
    id: 'order-v2-2',
    carpoolId: 'car-v2-freight',
    userId: 'u-third',
    slotIds: ['v2f-renjun'],
    amount: 78,
    paidAt: '2026-11-18T06:05:00.000Z',
    itemSnapshot: { groupId: 'grp-v2f-renjun', kind: 'bundle', name: 'RENJUN', version: 'B 版', unitPrice: 78, quantity: 1, slotLabels: ['B 版 RENJUN'] },
    feeSnapshot: { unitPrice: 78, quantity: 1, serviceFee: 0, shippingFee: 0, total: 78 },
    rulesSnapshot: { rulesVersion: 1, rules: '整车国际运费 100 元在截团后按有效份数均摊。', fallbackRule: '本车已截团，不再接受新的认领。', guarantees: { fullSetOrdered: true, memberDesign: true }, publishedAt: '2026-11-15T02:00:00.000Z' },
  },
]

export const demoV2OwnerPurchases: OwnerPurchase[] = [
  { id: 'ownbuy-seed-1', carpoolId: 'car-v2-freight', productId: 'p-ds-agency-b', member: 'JENO', quantity: 1, unitPrice: 78, confirmedAt: '2026-11-18T06:10:00.000Z' },
]

export const demoV2Payments: PaymentRecord[] = [
  { id: 'pay-seed-1', carpoolId: 'car-v2-freight', userId: 'u-rider', kind: 'goods', amountCents: 7800, status: 'paid', refId: 'order-v2-1', createdAt: '2026-11-18T06:00:00.000Z' },
  { id: 'pay-seed-2', carpoolId: 'car-v2-freight', userId: 'u-third', kind: 'goods', amountCents: 7800, status: 'paid', refId: 'order-v2-2', createdAt: '2026-11-18T06:05:00.000Z' },
]

export const demoV2FreightBills: FreightBill[] = [
  { id: 'freight-seed-1', carpoolId: 'car-v2-freight', userId: 'u-rider', units: 1, amountCents: 3334, ownsRemainder: true, status: 'pending', createdAt: '2026-11-19T06:00:00.000Z' },
  { id: 'freight-seed-2', carpoolId: 'car-v2-freight', userId: 'u-third', units: 1, amountCents: 3333, ownsRemainder: false, status: 'pending', createdAt: '2026-11-19T06:00:00.000Z' },
  { id: 'freight-seed-3', carpoolId: 'car-v2-freight', userId: 'u-owner', units: 1, amountCents: 3333, ownsRemainder: false, status: 'booked', createdAt: '2026-11-19T06:00:00.000Z' },
]

export const demoV2Participations: Participation[] = [
  { id: 'part-seed-1', carpoolId: 'car-v2-freight', userId: 'u-rider', createdAt: '2026-11-18T06:00:00.000Z' },
  { id: 'part-seed-2', carpoolId: 'car-v2-freight', userId: 'u-third', createdAt: '2026-11-18T06:05:00.000Z' },
]
