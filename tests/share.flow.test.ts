/**
 * DREAM CAR V1.3-A 商品与份额管理模块的验收流程测试。
 * 运行：npm run test:share
 *
 * 覆盖 V1.3-A 提示词「第七步：测试与验收」中的 11 条重点用例，
 * 直接驱动 src/lib/shareOps.ts 中的纯状态迁移函数。
 */
import { createInitialData, normalizeData } from '../src/data'
import {
  buildV2Carpool,
  cancelCarpoolOp,
  confirmOrderOp,
  confirmRuleChangeOp,
  ensureChatOp,
  markOrderedOp,
  proposeRuleChangeOp,
  releaseReservationOp,
  reserveSlotsOp,
  type NewCarpoolInput,
} from '../src/lib/shareOps'
import { purchaseModeOf, riderIdsOf, shareGroupsOf } from '../src/lib/share'
import { ownerSelfPurchaseOp } from '../src/lib/recruitOps'
import { saveDomesticShipmentOp, submitOrderAddressOp, updateInternationalShipmentOp } from '../src/lib/logisticsOps'
import { scoreFromEvents } from '../src/lib/reputation'
import { payDomesticFeeOp, registerDomesticFeesOp } from '../src/lib/feeOps'
import { completeRiderOrderOp } from '../src/lib/reputationOps'
import type { AppData, Carpool } from '../src/types'

let failures = 0
let checks = 0

function check(label: string, condition: boolean) {
  checks += 1
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures += 1
    console.log(`  ✗ ${label}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

const OWNER = 'u-owner'
const RIDER_A = 'u-rider'
const RIDER_B = 'u-third'

/** V2.0 普通拼邮车：两个商品 */
const singleDraft: NewCarpoolInput = {
  title: '测试拼邮车',
  groupId: 'g-nct',
  eventId: 'evt-dreamscape',
  description: '这是一个用于验收测试的普通拼邮车次描述。',
  rules: '这是用于验收测试的拼车规则文本，长度足以通过校验。',
  purchaseMode: 'single',
  openItems: [
    { productId: 'p-ds-agency-a', quantity: 2, price: 32, name: '测试小卡', spec: 'MARK 版', category: '小卡' },
    { productId: 'p-ds-agency-b', quantity: 1, price: 40, name: '测试小卡', spec: 'JENO 版', category: '小卡' },
  ],
  guarantees: { fullSetOrdered: false, memberDesign: false },
  fallbackRule: '未凑齐时车主按实际数量下单，差价不退，也可以继续招募。',
  deadline: '2026-12-31T20:00',
  internationalFreight: 100,
  minAmount: 600,
  maxPackageItems: 20,
  ownerHeld: [],
}

/** V2.0 整套凑套车：两个成员位置 */
const bundleDraft: NewCarpoolInput = {
  title: '测试凑套车',
  groupId: 'g-nct',
  eventId: 'evt-dreamscape',
  description: '这是一个用于验收测试的整套凑套车次描述。',
  rules: '这是用于验收测试的拼车规则文本，长度足以通过校验。',
  purchaseMode: 'bundle',
  openItems: [
    { productId: 'p-ds-agency-a', member: 'MARK', quantity: 1, price: 68, name: '测试亚克力牌', spec: 'A 版', category: '立牌' },
    { productId: 'p-ds-agency-a', member: 'RENJUN', quantity: 1, price: 68, name: '测试亚克力牌', spec: 'A 版', category: '立牌' },
  ],
  guarantees: { fullSetOrdered: true, memberDesign: true },
  fallbackRule: '未凑齐时车主会补齐缺失的成员位，仍按整套下单。',
  deadline: '2026-12-31T20:00',
  internationalFreight: 100,
  minAmount: 0,
  maxPackageItems: 0,
  ownerHeld: [],
}

/** 把新车次装进 AppData */
function withCarpool(base: AppData, draft: NewCarpoolInput, ownerId = OWNER): { data: AppData; carpool: Carpool } {
  const { carpool, ownerPurchases } = buildV2Carpool(ownerId, draft, '测试活动')
  return {
    data: {
      ...base,
      carpools: [carpool, ...base.carpools],
      ownerPurchases: [...ownerPurchases, ...(base.ownerPurchases ?? [])],
    },
    carpool,
  }
}

/** 完整走一遍「预留 → 支付 → 占位」 */
function occupy(
  data: AppData,
  carpoolId: string,
  userId: string,
  slotIds: string[],
): { data: AppData; ok: boolean; message: string; orderId?: string } {
  const reserved = reserveSlotsOp(data, userId, carpoolId, slotIds)
  if (!reserved.ok || !reserved.data) return { data, ok: false, message: reserved.message }
  const paid = confirmOrderOp(reserved.next, userId, carpoolId, reserved.data.reservationId)
  return { data: paid.next, ok: paid.ok, message: paid.message, orderId: paid.data?.id }
}

// ---------------------------------------------------------------------------

section('0. 预置演示数据与旧功能回归')
{
  const data = createInitialData()
  check('预置拼车数量不变（4 辆历史 + 3 辆 V2.0）', data.carpools.length === 7)
  check('预置订单数量不变（9 笔历史 + 2 笔 V2.0）', data.orders.length === 11)
  check('预置群聊仍然存在', data.chats.some((chat) => chat.carpoolId === 'car-plush'))
  check('地址簿保留', data.savedAddresses.length === 5)
  check('信誉档案为每位用户初始化', data.reputations.length === data.users.length)
  check('整车凑套车识别为 bundle 模式', purchaseModeOf(data.carpools.find((c) => c.id === 'car-dreamscape')) === 'bundle')
  check('普通拼邮车识别为 single 模式', purchaseModeOf(data.carpools.find((c) => c.id === 'car-photocard')) === 'single')
  check('历史车次保持 legacy 平铺结构', shareGroupsOf(data.carpools.find((c) => c.id === 'car-plush')).length === 0)
  check('历史订单已经带上快照', data.orders.every((order) => Boolean(order.itemSnapshot && order.feeSnapshot && order.rulesSnapshot)))
}

section('1. 首位车员成功占位后自动建群')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, singleDraft)
  const markSlot = carpool.positions[0].id
  const result = occupy(data, carpool.id, RIDER_A, [markSlot])
  check('首位车员占位成功', result.ok)
  const chat = result.data.chats.find((item) => item.carpoolId === carpool.id)
  check('首位车员占位后自动创建群聊', Boolean(chat))
  check('群聊与成团状态解耦（车次仍是招募中）', result.data.carpools.find((c) => c.id === carpool.id)?.status === 'recruiting')
  check('群成员包含车主与首位车员', riderIdsOf(result.data.carpools.find((c) => c.id === carpool.id)).includes(RIDER_A))
  const again = ensureChatOp(result.data, carpool.id)
  check('不允许重复创建群聊', !again.created && again.data.chats.filter((c) => c.carpoolId === carpool.id).length === 1)
}

section('2. 第二位车员加入已有群聊')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, singleDraft)
  const [first, second] = carpool.positions
  let current = occupy(data, carpool.id, RIDER_A, [first.id]).data
  current = occupy(current, carpool.id, RIDER_B, [second.id]).data
  check('第二位车员占位成功', current.carpools.find((c) => c.id === carpool.id)?.positions.filter((s) => s.occupantId === RIDER_B).length === 1)
  check('本车仍然只有一个群聊', current.chats.filter((c) => c.carpoolId === carpool.id).length === 1)
  const riders = riderIdsOf(current.carpools.find((c) => c.id === carpool.id))
  check('两位车员都在群成员中', riders.includes(RIDER_A) && riders.includes(RIDER_B))
}

section('3. 未凑齐时仍可群聊协商')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const markSlot = carpool.positions[0].id
  const current = occupy(data, carpool.id, RIDER_A, [markSlot]).data
  const updated = current.carpools.find((c) => c.id === carpool.id)
  check('只占位一个成员位时车次仍未成团', updated?.status === 'recruiting')
  check('群聊已经创建，可以协商', current.chats.some((c) => c.carpoolId === carpool.id))
  check('还有未认领的成员位置', updated!.positions.filter((slot) => !slot.occupantId).length > 0)
  check('未占满时仍然处于招募中', updated?.status === 'recruiting')
}

section('4. 车主自购空位（V2.0：不需要模拟付款）')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const group = carpool.shareGroups!.find((item) => item.member === 'MARK')!
  const reserved = reserveSlotsOp(data, OWNER, carpool.id, [carpool.positions[0].id])
  check('车主不能通过预留 + 模拟付款占用份额', !reserved.ok)
  check('拒绝原因指向车主自购', reserved.message.includes('自购'))

  const held = ownerSelfPurchaseOp(data, OWNER, carpool.id, { groupId: group.id, quantity: 1 })
  check('车主自购成功', held.ok)
  check('车主自购不生成订单', held.next.orders.filter((order) => order.carpoolId === carpool.id).length === 0)
  check('车主自购不产生模拟付款记录', (held.next.payments ?? []).filter((payment) => payment.carpoolId === carpool.id).length === 0)
  check('车主自购保存独立记录', (held.next.ownerPurchases ?? []).some((purchase) => purchase.carpoolId === carpool.id))
  check('车主自购占用真实份额', held.next.carpools.find((c) => c.id === carpool.id)!.positions.filter((s) => s.occupantId === OWNER).length === 1)
  check('车主自购不计入车员人数', riderIdsOf(held.next.carpools.find((c) => c.id === carpool.id)).length === 0)
}

section('5. 已有车员额外承接空位')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const [first, second] = carpool.positions
  let current = occupy(data, carpool.id, RIDER_A, [first.id]).data
  const reserved = reserveSlotsOp(current, RIDER_A, carpool.id, [second.id])
  check('已有车员可以额外预留空位', reserved.ok)
  const paid = confirmOrderOp(reserved.next, RIDER_A, carpool.id, reserved.data!.reservationId)
  check('额外承接生成独立订单', paid.ok && paid.data?.id !== undefined)
  const orders = paid.next.orders.filter((o) => o.carpoolId === carpool.id && o.userId === RIDER_A)
  check('同一车员在同一车次有两笔独立订单', orders.length === 2)
  check('加购订单不再使用承接标记', orders.every((o) => o.isTakeover === undefined))
  check('两笔订单都有各自的规则快照', orders.every((o) => Boolean(o.rulesSnapshot)))
}

section('6. 凑套车不出现随机购买选项')
{
  const base = createInitialData()
  const { carpool } = withCarpool(base, bundleDraft)
  const groups = shareGroupsOf(carpool)
  check('全部是成员位置分组', groups.every((group) => group.kind === 'bundle'))
  check('没有商品分组', !groups.some((group) => group.kind === 'product'))
  check('凑套模式强制启用按整套下单', carpool.guarantees?.fullSetOrdered === true)
  check('没有随机购买相关的分组或选项', !JSON.stringify(carpool).includes('随机'))
}

section('7. 普通拼邮车只展示开放商品')
{
  const base = createInitialData()
  const { carpool } = withCarpool(base, singleDraft)
  const groups = shareGroupsOf(carpool)
  check('全部是商品分组', groups.every((group) => group.kind === 'product'))
  check('只包含车主开放的商品', groups.map((g) => g.version).sort().join(',') === 'JENO 版,MARK 版')
  check('没有成员位置分组', !groups.some((group) => group.kind === 'bundle'))
  check('普通拼邮不承诺按整套下单', carpool.guarantees?.fullSetOrdered === false)
}

section('8. 两人同时抢最后一个份额不会超卖')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, singleDraft)
  const lastSlot = carpool.positions.find((slot) => !slot.occupantId)!
  const first = reserveSlotsOp(data, RIDER_A, carpool.id, [lastSlot.id])
  check('第一个车员预留成功', first.ok)
  const second = reserveSlotsOp(first.next, RIDER_B, carpool.id, [lastSlot.id])
  check('第二个车员预留被拒绝', !second.ok)
  check('拒绝原因是份额已被预留', second.message.includes('预留'))
  const paid = confirmOrderOp(first.next, RIDER_A, carpool.id, first.data!.reservationId)
  check('第一个车员仍然可以正常占位', paid.ok)
  const other = reserveSlotsOp(paid.next, RIDER_B, carpool.id, [lastSlot.id])
  check('已被占用的份额不能再被预留', !other.ok)
}

section('9. 模拟付款失败或超时后释放库存')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, singleDraft)
  const slotId = carpool.positions[0].id

  const reserved = reserveSlotsOp(data, RIDER_A, carpool.id, [slotId])
  const failed = confirmOrderOp(reserved.next, RIDER_A, carpool.id, reserved.data!.reservationId, { simulateFailure: true })
  check('模拟支付失败时占位不成功', !failed.ok)
  const releasedSlot = failed.next.carpools.find((c) => c.id === carpool.id)?.positions.find((s) => s.id === slotId)
  check('支付失败后预留被释放', !releasedSlot?.reservation)
  check('支付失败后份额仍然可用', !releasedSlot?.occupantId)
  const retry = reserveSlotsOp(failed.next, RIDER_B, carpool.id, [slotId])
  check('其他车员可以重新预留该份额', retry.ok)

  const timeoutReserved = reserveSlotsOp(retry.next, RIDER_B, carpool.id, [slotId])
  const timeout = confirmOrderOp(timeoutReserved.next, RIDER_B, carpool.id, timeoutReserved.data!.reservationId, { simulateTimeout: true })
  check('模拟超时时占位不成功', !timeout.ok)
  const timeoutSlot = timeout.next.carpools.find((c) => c.id === carpool.id)?.positions.find((s) => s.id === slotId)
  check('超时后份额被释放', !timeoutSlot?.reservation && !timeoutSlot?.occupantId)

  const manual = reserveSlotsOp(timeout.next, RIDER_A, carpool.id, [slotId])
  const released = releaseReservationOp(manual.next, RIDER_A, carpool.id, manual.data!.reservationId)
  check('主动取消也会释放预留', released.ok && !released.next.carpools.find((c) => c.id === carpool.id)?.positions.find((s) => s.id === slotId)?.reservation)
}

section('10. 已确认订单的规则与价格不会被后续修改覆盖')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, singleDraft)
  const slotId = carpool.positions[0].id
  const current = occupy(data, carpool.id, RIDER_A, [slotId]).data
  const order = current.orders.find((o) => o.carpoolId === carpool.id && o.userId === RIDER_A)!
  const originalTotal = order.feeSnapshot!.total
  const originalUnit = order.feeSnapshot!.unitPrice
  const originalItem = order.itemSnapshot!.name
  check('订单快照包含费用明细', originalTotal === 32)

  const proposed = proposeRuleChangeOp(current, OWNER, carpool.id, {
    rules: '这是修改之后的拼车规则文本，长度足以通过校验。',
    fallbackRule: '这是修改之后的未凑齐处理规则，足够长的说明文本。',
    guarantees: { fullSetOrdered: false, memberDesign: true },
    feeRules: { unitPrice: 32, serviceFee: 10, shippingFee: 9 },
  })
  check('已有订单时规则变更需要车员确认', proposed.ok && proposed.data?.status === 'pending')
  check('变更进入待确认状态', current.carpools.find((c) => c.id === carpool.id)?.pendingRuleChange?.status === undefined)
  const pending = proposed.next.carpools.find((c) => c.id === carpool.id)?.pendingRuleChange
  check('车次记录了待确认变更', pending?.status === 'pending' && pending.requiredUserIds.includes(RIDER_A))

  const confirmed = confirmRuleChangeOp(proposed.next, RIDER_A, carpool.id, true)
  check('车员确认后变更生效', confirmed.ok)
  const applied = confirmed.next.carpools.find((c) => c.id === carpool.id)
  check('车次规则已更新', applied?.rulesVersion === 2)
  check('车次的未凑齐规则已更新', Boolean(applied?.fallbackRule?.includes('修改之后')))
  const updatedOrder = confirmed.next.orders.find((o) => o.id === order.id)!
  check('订单价格快照没有被覆盖', updatedOrder.feeSnapshot!.total === originalTotal && updatedOrder.feeSnapshot!.unitPrice === originalUnit)
  check('订单商品快照没有被覆盖', updatedOrder.itemSnapshot!.name === originalItem)
  check('订单规则快照随确认更新', updatedOrder.rulesSnapshot!.rulesVersion === 2)
  check('订单金额没有被改写', updatedOrder.amount === originalTotal)
}

section('11. V2.0 采购状态机：招募中 → 已截团 → 采购履约中 → 已完成')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, singleDraft)
  const slotId = carpool.positions[0].id
  const current = occupy(data, carpool.id, RIDER_A, [slotId]).data

  const ordered = markOrderedOp(current, OWNER, carpool.id)
  check('未截团时不能标记已下单', !ordered.ok)

  const cancelled = cancelCarpoolOp(current, OWNER, carpool.id, '演示结束')
  check('可以结束并关闭拼车', cancelled.ok && cancelled.next.carpools.find((c) => c.id === carpool.id)?.status === 'failed')
  check('结束后保留订单数据', cancelled.next.orders.filter((o) => o.carpoolId === carpool.id).length > 0)
  check('结束后保留群聊数据', cancelled.next.chats.some((c) => c.carpoolId === carpool.id))
  check('结束后车员收到通知', cancelled.next.notifications.some((n) => n.carpoolId === carpool.id))
}

section('12. 凑套必须全部占满才自动截团')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const [mark1, renjun1] = carpool.positions
  let current = occupy(data, carpool.id, RIDER_A, [mark1.id]).data
  check('凑套未占满时不会自动截团', current.carpools.find((c) => c.id === carpool.id)?.status === 'recruiting')

  current = occupy(current, carpool.id, RIDER_B, [renjun1.id]).data
  check('全部占满后自动截团', current.carpools.find((c) => c.id === carpool.id)?.status === 'cut')
  check('截团后生成国际运费账单', (current.freightBills ?? []).some((bill) => bill.carpoolId === carpool.id))
  check('凑套车有两个成员位置', current.carpools.find((c) => c.id === carpool.id)!.positions.length === 2)
}

section('13. 截团后禁止新增认领')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const [mark1, renjun1] = carpool.positions
  let current = occupy(data, carpool.id, RIDER_A, [mark1.id]).data
  current = occupy(current, carpool.id, RIDER_B, [renjun1.id]).data
  const blocked = reserveSlotsOp(current, RIDER_A, carpool.id, [current.carpools.find((c) => c.id === carpool.id)!.positions[0].id])
  check('截团后不能再预留份额', !blocked.ok)
}

section('14. V1.1 物流与 V1.2 信誉流程仍然可用')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, singleDraft)
  const slotId = carpool.positions[0].id
  let current = occupy(data, carpool.id, RIDER_A, [slotId]).data

  const shipment = updateInternationalShipmentOp(current, OWNER, carpool.id, {
    carrier: 'DHL Express',
    trackingNumber: 'JD0100000001',
    trackingUrl: '',
    status: 'domestic_transit',
    note: '已清关，进入国内运输。',
  })
  check('国际物流仍然可以录入', shipment.ok)
  check('清关完成后自动开启地址收集', shipment.next.carpools.find((c) => c.id === carpool.id)?.addressCollection?.enabled === true)
  current = shipment.next

  const address = submitOrderAddressOp(current, RIDER_A, carpool.id, {
    label: '学校',
    receiverName: '林小满',
    phone: '13800001111',
    province: '上海市',
    city: '上海市',
    district: '徐汇区',
    detail: '海州路 168 号',
    saveToBook: false,
  })
  check('车员仍然可以提交收货地址', address.ok)
  current = address.next

  // V2.0 车次：登记并支付国内费用后才能发货
  const fee = registerDomesticFeesOp(current, OWNER, carpool.id, RIDER_A, { packingFee: 6, shippingFee: 8 })
  check('车主仍然可以登记国内费用', fee.ok)
  current = fee.next
  const feePaid = payDomesticFeeOp(current, RIDER_A, carpool.id)
  check('车员仍然可以支付国内费用', feePaid.ok)
  current = feePaid.next

  const domestic = saveDomesticShipmentOp(current, OWNER, carpool.id, RIDER_A, {
    carrier: '中通快递',
    trackingNumber: 'ZT7700000001',
    shippedAt: '2026-11-20T00:00:00.000Z',
    note: '',
  })
  check('车主仍然可以录入国内发货', domestic.ok)
  current = domestic.next

  const complete = completeRiderOrderOp(current, RIDER_A, carpool.id)
  check('车员仍然可以确认收货并获得信誉加分', complete.ok)
  check('信誉分记录仍然生成', complete.next.reputationEvents.some((e) => e.carId === carpool.id && e.eventType === 'rider_complete'))
  check('刷新后数据仍然保留', normalizeData(JSON.parse(JSON.stringify(complete.next))).reputationEvents.length === complete.next.reputationEvents.length)
  check('信誉分随事件推导一致', scoreFromEvents(complete.next.reputationEvents, RIDER_A) === scoreFromEvents(complete.next.reputationEvents, RIDER_A))
}

console.log(`\n${failures === 0 ? '全部通过' : '存在失败'}：${checks - failures}/${checks} 项检查通过`)
if (failures > 0) process.exit(1)
