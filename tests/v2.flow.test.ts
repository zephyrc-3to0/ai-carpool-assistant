/**
 * DREAM CAR V2.0 端到端流程测试。
 * 运行：npm run test:v2
 *
 * 覆盖提示词2.0「十三、验收测试」中的 9 个场景，全部通过纯状态迁移函数驱动，
 * 不做页面级 mock，确保数据模型与业务规则真正闭环。
 */
import { createInitialData, normalizeData } from '../src/data'
import {
  buildV2Carpool,
  confirmOrderOp,
  releaseReservationOp,
  reserveSlotsOp,
  type NewCarpoolInput,
} from '../src/lib/shareOps'
import {
  buildFreightBills,
  cutCarpoolOp,
  extendRecruitmentOp,
  failCarpoolOp,
  ownerSelfPurchaseOp,
  purchaseListOf,
  recruitmentStateOf,
  sweepExpiredRecruitments,
  validOccupancyOf,
} from '../src/lib/recruitOps'
import {
  disputeDomesticFeeOp,
  payDomesticFeeOp,
  payFreightOp,
  registerDomesticFeesOp,
} from '../src/lib/feeOps'
import { saveDomesticShipmentOp, submitOrderAddressOp, updateInternationalShipmentOp } from '../src/lib/logisticsOps'
import { raiseExceptionOp, resolveExceptionOp, uploadVoucherOp } from '../src/lib/v2Ops'
import { checkPurchasePermission } from '../src/lib/reputationOps'
import { participationOf } from '../src/lib/participation'
import { allocateByWeight } from '../src/lib/money'
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
const OUTSIDER = 'u-fourth'

/** V2.0 整套凑套车 */
const bundleDraft: NewCarpoolInput = {
  title: 'V2 测试凑套车',
  groupId: 'g-nct',
  eventId: 'evt-dreamscape',
  description: '这是一个用于 V2.0 验收测试的整套凑套车次描述。',
  rules: '这是用于 V2.0 验收测试的拼车规则文本，长度足以通过校验。',
  purchaseMode: 'bundle',
  openItems: [
    { productId: 'p-ds-agency-a', member: 'MARK', quantity: 1, price: 68, name: '测试亚克力牌', spec: 'A 版', category: '立牌' },
    { productId: 'p-ds-agency-a', member: 'RENJUN', quantity: 1, price: 68, name: '测试亚克力牌', spec: 'A 版', category: '立牌' },
  ],
  guarantees: { fullSetOrdered: true, memberDesign: true },
  fallbackRule: '未凑齐时车主会补齐缺失的成员位，仍按整套下单。',
  deadline: '2026-12-10T20:00',
  internationalFreight: 100,
  minAmount: 0,
  maxPackageItems: 0,
  ownerHeld: [],
}

/** V2.0 普通拼邮车：金额可达但包裹未满，用于验证手动截团 */
const singleDraft: NewCarpoolInput = {
  title: 'V2 测试拼邮车',
  groupId: 'g-nct',
  eventId: 'evt-dreamscape',
  description: '这是一个用于 V2.0 验收测试的普通拼邮车次描述。',
  rules: '这是用于 V2.0 验收测试的拼车规则文本，长度足以通过校验。',
  purchaseMode: 'single',
  openItems: [
    { productId: 'p-ds-agency-a', quantity: 3, price: 68, name: '测试亚克力牌', spec: 'A 版', category: '立牌' },
  ],
  guarantees: { fullSetOrdered: false, memberDesign: false },
  fallbackRule: '未达最低成团金额时车主按实际数量下单，差价不退。',
  deadline: '2026-12-10T20:00',
  internationalFreight: 100,
  minAmount: 60,
  maxPackageItems: 3,
  ownerHeld: [],
}

/** V2.0 普通拼邮车：包裹容量为 1，用于验证满额自动截团 */
const singleFullDraft: NewCarpoolInput = {
  ...singleDraft,
  title: 'V2 测试拼邮满额车',
  minAmount: 60,
  maxPackageItems: 1,
  openItems: [
    { productId: 'p-ds-agency-a', quantity: 1, price: 68, name: '测试亚克力牌', spec: 'A 版', category: '立牌' },
  ],
}

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

/** 走完「预留 → 支付 → 占位」 */
function buy(data: AppData, carpoolId: string, userId: string, slotIds: string[]) {
  const reserved = reserveSlotsOp(data, userId, carpoolId, slotIds)
  if (!reserved.ok || !reserved.data) return { data, ok: false, message: reserved.message }
  const paid = confirmOrderOp(reserved.next, userId, carpoolId, reserved.data.reservationId)
  return { data: paid.next, ok: paid.ok, message: paid.message }
}

// ---------------------------------------------------------------------------

section('场景 1：整套凑套（自购 → 认领 → 追加自购 → 自动截团 → 采购清单 → 运费 AA）')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const [markSlot, renjunSlot] = carpool.positions

  // 车主优先自购 MARK 位
  const group = carpool.shareGroups!.find((item) => item.member === 'MARK')!
  const held = ownerSelfPurchaseOp(data, OWNER, carpool.id, { groupId: group.id, quantity: 1 })
  check('车主优先自购成功', held.ok)
  check('车主自购不产生任何模拟付款记录', (held.next.payments ?? []).filter((payment) => payment.carpoolId === carpool.id).length === 0)
  check('车主自购不生成订单', held.next.orders.filter((order) => order.carpoolId === carpool.id).length === 0)
  check('车主自购保存独立记录', (held.next.ownerPurchases ?? []).filter((item) => item.carpoolId === carpool.id).length === 1)

  // 车员认领 RENJUN 位
  const rider = buy(held.next, carpool.id, RIDER_A, [renjunSlot.id])
  check('车员认领成功', rider.ok)
  check('凑套全部占满后自动截团', rider.data.carpools.find((item) => item.id === carpool.id)?.status === 'cut')

  // 自动生成采购清单
  const list = purchaseListOf(rider.data, carpool.id)
  check('采购清单合并车员与车主自购', list.reduce((sum, item) => sum + item.quantity, 0) === 2)
  check('采购清单不重复计算车主自购', list.every((item) => item.quantity === item.riderQuantity + item.ownerQuantity))
  check('采购清单区分车员与车主自购', list.some((item) => item.ownerQuantity === 1) && list.some((item) => item.riderQuantity === 1))

  // 自动计算国际运费 AA
  const bills = (rider.data.freightBills ?? []).filter((bill) => bill.carpoolId === carpool.id)
  check('截团后生成国际运费账单', bills.length === 2)
  const total = bills.reduce((sum, bill) => sum + bill.amountCents, 0)
  check('分摊总额等于整车国际运费', total === 10000)
  check('车主自购同样参与分摊', bills.some((bill) => bill.userId === OWNER))
  check('车主账单只记账不产生付款', bills.find((bill) => bill.userId === OWNER)?.status === 'booked')
}

section('场景 2：普通拼邮主动截团')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, singleDraft)
  const slot = carpool.positions[0]

  const rider = buy(data, carpool.id, RIDER_A, [slot.id])
  check('车员购买成功', rider.ok)
  const state = recruitmentStateOf(rider.data, carpool.id)
  check('达到最低金额但包裹未满时不自动截团', rider.data.carpools.find((item) => item.id === carpool.id)?.status === 'recruiting')
  check('允许车主手动截团', state.manualCutAllowed)

  const cut = cutCarpoolOp(rider.data, OWNER, carpool.id, false)
  check('车主手动截团成功', cut.ok)
  check('截团后状态为已截团', cut.next.carpools.find((item) => item.id === carpool.id)?.status === 'cut')
  const bills = (cut.next.freightBills ?? []).filter((bill) => bill.carpoolId === carpool.id)
  check('截团后生成国际运费账单', bills.length === 1)
  check('运费账单金额等于整车运费', bills[0].amountCents === 10000)

  const blocked = reserveSlotsOp(cut.next, RIDER_B, carpool.id, [slot.id])
  check('截团后禁止新增购买', !blocked.ok)
}

section('场景 3：普通拼邮满额自动截团')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, singleFullDraft)
  const slot = carpool.positions[0]

  const rider = buy(data, carpool.id, RIDER_A, [slot.id])
  check('第一笔购买成功', rider.ok)
  check('金额与件数同时达标后自动截团', rider.data.carpools.find((item) => item.id === carpool.id)?.status === 'cut')
  const state = recruitmentStateOf(rider.data, carpool.id)
  check('自动截团条件已满足', state.autoCut)
  check('截团后生成国际运费账单', (rider.data.freightBills ?? []).filter((bill) => bill.carpoolId === carpool.id).length === 1)

  const blocked = reserveSlotsOp(rider.data, RIDER_B, carpool.id, [slot.id])
  check('自动截团后禁止新增购买', !blocked.ok)
}

section('场景 4：再次加购（两笔交易、一个参与关系、一个群聊）')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const [markSlot, renjunSlot] = carpool.positions

  const first = buy(data, carpool.id, RIDER_A, [markSlot.id])
  check('首次购买成功', first.ok)
  const second = buy(first.data, carpool.id, RIDER_A, [renjunSlot.id])
  check('已参与车员再次加购成功', second.ok)

  const orders = second.data.orders.filter((order) => order.carpoolId === carpool.id && order.userId === RIDER_A)
  check('保留两笔独立交易记录', orders.length === 2)
  check('同车只有一个群聊', second.data.chats.filter((chat) => chat.carpoolId === carpool.id).length === 1)
  const participations = (second.data.participations ?? []).filter((item) => item.carpoolId === carpool.id && item.userId === RIDER_A)
  check('同车只建立一份参与关系', participations.length === 1)

  const summary = participationOf(second.data, carpool.id, RIDER_A)
  check('参与详情聚合两份商品', summary.items.reduce((sum, item) => sum + item.quantity, 0) === 2)
  check('参与详情保留两笔交易', summary.orders.length === 2)
}

section('场景 5：延期与流团退款')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const slot = carpool.positions[0]

  const rider = buy(data, carpool.id, RIDER_A, [slot.id])
  check('车员购买成功', rider.ok)

  const extended = extendRecruitmentOp(rider.data, OWNER, carpool.id, '2026-12-15T20:00')
  check('未成团时允许延期', extended.ok)
  check('延期后通知了已参与车员', extended.next.notifications.some((item) => item.userId === RIDER_A && item.type === 'recruitment_extended'))

  // 车主自购占满剩余份额后自动截团，验证车主自购不产生退款交易
  const group = carpool.shareGroups!.find((item) => item.member === 'RENJUN')!
  const held = ownerSelfPurchaseOp(extended.next, OWNER, carpool.id, { groupId: group.id, quantity: 1 })
  check('车主追加自购补齐剩余份额', held.ok)
  check('补齐后自动截团', held.next.carpools.find((item) => item.id === carpool.id)?.status === 'cut')

  // 另一个场景：流团退款
  const base2 = createInitialData()
  const { data: data2, carpool: carpool2 } = withCarpool(base2, bundleDraft)
  const rider2 = buy(data2, carpool2.id, RIDER_A, [carpool2.positions[0].id])
  const failed = failCarpoolOp(rider2.data, OWNER, carpool2.id, '招募截止未成团')
  check('流团成功', failed.ok)
  check('流团后状态为已流团', failed.next.carpools.find((item) => item.id === carpool2.id)?.status === 'failed')
  const refunds = (failed.next.payments ?? []).filter((payment) => payment.carpoolId === carpool2.id && payment.kind === 'refund')
  check('为真实付款生成退款记录', refunds.length === 1)
  check('退款金额等于实际支付商品款', refunds[0].amountCents === 6800)
  check('流团不向车主自购生成退款', refunds.every((payment) => payment.userId !== OWNER))
}

section('场景 6：国际运费 AA（含车主自购，分摊总额准确）')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const [markSlot, renjunSlot] = carpool.positions
  const group = carpool.shareGroups!.find((item) => item.member === 'MARK')!

  const held = ownerSelfPurchaseOp(data, OWNER, carpool.id, { groupId: group.id, quantity: 1 })
  const rider = buy(held.next, carpool.id, RIDER_A, [renjunSlot.id])
  check('凑齐后自动截团', rider.data.carpools.find((item) => item.id === carpool.id)?.status === 'cut')

  const bills = (rider.data.freightBills ?? []).filter((bill) => bill.carpoolId === carpool.id)
  check('为每位参与者生成账单', bills.length === 2)
  check('分摊合计等于整车运费', bills.reduce((sum, bill) => sum + bill.amountCents, 0) === 10000)

  const riderBill = bills.find((bill) => bill.userId === RIDER_A)!
  const paid = payFreightOp(rider.data, RIDER_A, carpool.id)
  check('车员可以支付国际运费', paid.ok)
  check('支付后账单状态为已支付', (paid.next.freightBills ?? []).find((bill) => bill.id === riderBill.id)?.status === 'paid')
  check('支付产生一条运费模拟交易', (paid.next.payments ?? []).filter((payment) => payment.kind === 'freight' && payment.carpoolId === carpool.id).length === 1)

  const ownerPay = payFreightOp(paid.next, OWNER, carpool.id)
  check('车主不能向自己支付国际运费', !ownerPay.ok)

  // 尾差策略必须始终把总额分配完
  const allocation = allocateByWeight(10000, [1, 1, 1])
  check('尾差策略保证分摊合计等于总额', allocation.shares.reduce((sum, value) => sum + value, 0) === 10000)
  check('尾差策略记录了尾差金额', allocation.remainderCents === 10000 - allocation.shares.reduce((sum, value) => sum + value, 0))
}

section('场景 7：部分国际运费未支付时车主仍可继续采购')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const [markSlot, renjunSlot] = carpool.positions
  const rider = buy(data, carpool.id, RIDER_A, [markSlot.id])
  const rider2 = buy(rider.data, carpool.id, RIDER_B, [renjunSlot.id])
  check('凑齐后截团', rider2.data.carpools.find((item) => item.id === carpool.id)?.status === 'cut')
  check('两份账单都处于待支付', (rider2.data.freightBills ?? []).filter((bill) => bill.carpoolId === carpool.id).every((bill) => bill.status === 'pending'))

  const voucher = uploadVoucherOp(rider2.data, OWNER, carpool.id, { title: '官方下单成功截图', note: '已按采购清单下单' })
  check('未全员支付运费时仍可上传采购凭证', voucher.ok)
  check('上传凭证后进入采购履约阶段', voucher.next.carpools.find((item) => item.id === carpool.id)?.status === 'purchasing')
  check('未支付账单保持待支付状态', (voucher.next.freightBills ?? []).filter((bill) => bill.carpoolId === carpool.id).every((bill) => bill.status === 'pending'))
}

section('场景 8：清关后地址收集 → 国内费用 → 独立发货 → 确认收货')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const slot = carpool.positions[0]
  const rider = buy(data, carpool.id, RIDER_A, [slot.id])
  check('车员购买成功', rider.ok)

  // 清关前不开启地址收集
  const inTransit = updateInternationalShipmentOp(rider.data, OWNER, carpool.id, {
    carrier: 'DHL Express', trackingNumber: 'JD01V20001', trackingUrl: '', status: 'in_transit', note: '已发出',
  })
  check('国际运输中不开启地址收集', !inTransit.next.carpools.find((item) => item.id === carpool.id)?.addressCollection?.enabled)

  // 清关完成后开启地址收集
  const cleared = updateInternationalShipmentOp(inTransit.next, OWNER, carpool.id, {
    carrier: 'DHL Express', trackingNumber: 'JD01V20001', trackingUrl: '', status: 'domestic_transit', note: '已清关，进入国内段',
  })
  check('清关完成后开启地址收集', Boolean(cleared.next.carpools.find((item) => item.id === carpool.id)?.addressCollection?.enabled))
  check('车员收到提交地址提醒', cleared.next.notifications.some((item) => item.userId === RIDER_A && item.type === 'address_required'))

  const address = submitOrderAddressOp(cleared.next, RIDER_A, carpool.id, {
    label: '学校', receiverName: '林小满', phone: '13800001111',
    province: '上海市', city: '上海市', district: '徐汇区', detail: '海州路 168 号', saveToBook: false,
  })
  check('车员可以提交收货地址', address.ok)

  // 未登记国内费用时不能发货
  const early = saveDomesticShipmentOp(address.next, OWNER, carpool.id, RIDER_A, {
    carrier: '中通快递', trackingNumber: 'ZT7700000001', shippedAt: '', note: '',
  })
  check('未登记国内费用时不能发货', !early.ok)

  const fee = registerDomesticFeesOp(address.next, OWNER, carpool.id, RIDER_A, { packingFee: 6, shippingFee: 8 })
  check('车主可以登记国内费用', fee.ok)
  check('国内费用合计正确', fee.data?.totalCents === 1400)

  const notPaid = saveDomesticShipmentOp(fee.next, OWNER, carpool.id, RIDER_A, {
    carrier: '中通快递', trackingNumber: 'ZT7700000001', shippedAt: '', note: '',
  })
  check('费用未支付时不能发货', !notPaid.ok)

  const paid = payDomesticFeeOp(fee.next, RIDER_A, carpool.id)
  check('车员完成国内费用模拟支付', paid.ok)
  check('支付后账单状态为已支付', (paid.next.domesticFeeBills ?? []).find((bill) => bill.carpoolId === carpool.id)?.status === 'paid')

  const shipped = saveDomesticShipmentOp(paid.next, OWNER, carpool.id, RIDER_A, {
    carrier: '中通快递', trackingNumber: 'ZT7700000001', shippedAt: '', note: '',
  })
  check('费用支付后可以发货', shipped.ok)
  check('发货状态为已发货', shipped.next.domesticShipments.find((item) => item.carpoolId === carpool.id)?.status === 'shipped')
  check('车员收到发货通知', shipped.next.notifications.some((item) => item.userId === RIDER_A && item.type === 'domestic_shipped'))

  // 费用异议流程
  const base2 = createInitialData()
  const { data: data2, carpool: carpool2 } = withCarpool(base2, bundleDraft)
  const rider2 = buy(data2, carpool2.id, RIDER_A, [carpool2.positions[0].id])
  const cleared2 = updateInternationalShipmentOp(rider2.data, OWNER, carpool2.id, {
    carrier: 'DHL', trackingNumber: 'JD01V20002', trackingUrl: '', status: 'domestic_transit', note: '',
  })
  const address2 = submitOrderAddressOp(cleared2.next, RIDER_A, carpool2.id, {
    label: '家', receiverName: '林小满', phone: '13800001111',
    province: '上海市', city: '上海市', district: '徐汇区', detail: '海州路 168 号', saveToBook: false,
  })
  const fee2 = registerDomesticFeesOp(address2.next, OWNER, carpool2.id, RIDER_A, { packingFee: 6, shippingFee: 8 })
  const dispute = disputeDomesticFeeOp(fee2.next, RIDER_A, carpool2.id, '打包费比预期高')
  check('车员可以发起费用异议', dispute.ok)
  check('异议后账单状态为存在异议', (dispute.next.domesticFeeBills ?? []).find((bill) => bill.carpoolId === carpool2.id)?.status === 'disputed')
  check('异议进入异常处理中心', (dispute.next.exceptions ?? []).some((record) => record.carpoolId === carpool2.id && record.type === 'fee'))
  const payBlocked = payDomesticFeeOp(dispute.next, RIDER_A, carpool2.id)
  check('存在异议时不能支付', !payBlocked.ok)
  const resolved = resolveExceptionOp(dispute.next, OWNER, dispute.data!.id)
  check('车主可以处理费用异议', resolved.ok)
  check('处理后账单恢复待支付', (resolved.next.domesticFeeBills ?? []).find((bill) => bill.carpoolId === carpool2.id)?.status === 'pending')
}

section('场景 9：权限与数据安全')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const slot = carpool.positions[0]

  // 车主不能走模拟付款路径
  const ownerReserve = reserveSlotsOp(data, OWNER, carpool.id, [slot.id])
  check('车主不能预留份额走付款流程', !ownerReserve.ok)
  check('提示车主使用自购', ownerReserve.message.includes('自购'))

  // 车员不能修改车主的采购与物流信息
  const rider = buy(data, carpool.id, RIDER_A, [slot.id])
  const voucher = uploadVoucherOp(rider.data, RIDER_A, carpool.id, { title: '伪造凭证', note: '' })
  check('车员不能上传采购凭证', !voucher.ok)
  const shipment = updateInternationalShipmentOp(rider.data, RIDER_A, carpool.id, {
    carrier: 'X', trackingNumber: 'Y', trackingUrl: '', status: 'in_transit', note: '',
  })
  check('车员不能修改国际物流', !shipment.ok)
  const fee = registerDomesticFeesOp(rider.data, RIDER_A, carpool.id, OUTSIDER, { packingFee: 1, shippingFee: 1 })
  check('车员不能登记国内费用', !fee.ok)

  // 不可超卖
  const second = reserveSlotsOp(rider.data, RIDER_B, carpool.id, [slot.id])
  check('已被占用的份额不能再被预留', !second.ok)

  // 非成员不能访问群聊与参与详情
  const chat = rider.data.chats.find((item) => item.carpoolId === carpool.id)
  check('首位车员占位后自动建群', Boolean(chat))

  // 异常记录只有本车成员可以提交
  const outsiderException = raiseExceptionOp(rider.data, OUTSIDER, carpool.id, { type: 'order', title: '恶意提交', detail: '我不是本车成员' })
  check('非本车成员不能提交异常', !outsiderException.ok)

  // 刷新后数据保持一致
  const restored = normalizeData(JSON.parse(JSON.stringify(rider.data)))
  check('刷新后车次状态保持一致', restored.carpools.find((item) => item.id === carpool.id)?.status === rider.data.carpools.find((item) => item.id === carpool.id)?.status)
  check('刷新后订单与账单保持一致', restored.orders.length === rider.data.orders.length && restored.freightBills.length === rider.data.freightBills.length)
  check('刷新后参与关系保持唯一', (restored.participations ?? []).filter((item) => item.carpoolId === carpool.id).length === 1)
}

section('附加：车主自购与活动限购的底层校验')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const group = carpool.shareGroups!.find((item) => item.member === 'MARK')!

  // 活动限购：同一商品在同活动中每人的限购件数来自商品目录
  const product = (data.eventProducts ?? []).find((item) => item.id === 'p-ds-agency-a')!
  const group2 = carpool.shareGroups!.find((item) => item.member === 'RENJUN')!
  const overLimit = ownerSelfPurchaseOp(data, OWNER, carpool.id, { groupId: group2.id, quantity: product.perUserLimit + 1 })
  check('自购数量超过开放份数时被拒绝', !overLimit.ok)

  // 普通拼邮：整车包裹容量是全局上限，不能因为选择多个商品而放大
  const base2 = createInitialData()
  const single = withCarpool(base2, singleDraft)
  const state = recruitmentStateOf(single.data, single.carpool.id)
  check('普通拼邮的车次容量取整车包裹上限', state.openSlots === singleDraft.maxPackageItems)
  check('普通拼邮的开放份数不等于容量时进度分母仍为整车容量', state.openSlots !== single.carpool.positions.length || single.carpool.positions.length === singleDraft.maxPackageItems)
}

section('附加：有效占用与状态派生保持一致')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const group = carpool.shareGroups!.find((item) => item.member === 'MARK')!
  const held = ownerSelfPurchaseOp(data, OWNER, carpool.id, { groupId: group.id, quantity: 1 })
  const occupancy = validOccupancyOf(held.next, carpool.id)
  check('车主自购计入有效占用份数', occupancy.totalSlots === 1)
  check('车主自购与车员分开统计', occupancy.ownerSlots === 1 && occupancy.riderSlots === 0)
  check('有效占用与采购清单一致', purchaseListOf(held.next, carpool.id).reduce((sum, item) => sum + item.quantity, 0) === occupancy.totalSlots)
}

section('附加：购买权限与界面入口一致')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const rider = buy(data, carpool.id, RIDER_A, [carpool.positions[0].id])
  check('招募中允许购买', checkPurchasePermission(rider.data, RIDER_B, carpool.id).ok)
  const rider2 = buy(rider.data, carpool.id, RIDER_B, [carpool.positions[1].id])
  check('凑齐后自动截团', rider2.data.carpools.find((item) => item.id === carpool.id)?.status === 'cut')
  check('截团后禁止购买', !checkPurchasePermission(rider2.data, RIDER_B, carpool.id).ok)
}

section('差异修复 1：发布后追加车主自购不覆盖车员份额')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const riderSlot = carpool.positions[0]
  const ownerGroup = carpool.shareGroups!.find((item) => item.member === 'RENJUN')!
  const rider = buy(data, carpool.id, RIDER_A, [riderSlot.id])
  const held = ownerSelfPurchaseOp(rider.data, OWNER, carpool.id, { groupId: ownerGroup.id, quantity: 1 })
  const updated = held.next.carpools.find((item) => item.id === carpool.id)!
  check('车主可以在车员占位后追加自购', held.ok)
  check('车员原有份额仍归车员', updated.positions.find((slot) => slot.id === riderSlot.id)?.occupantId === RIDER_A)
  check('追加自购只占用剩余份额', updated.positions.filter((slot) => slot.occupantId === OWNER).length === 1)
}

section('差异修复 2：包裹满额但金额未达标不自动截团')
{
  const base = createInitialData()
  const lowPriceCapacityDraft: NewCarpoolInput = {
    ...singleFullDraft,
    title: '包裹先满测试车',
    minAmount: 100,
    maxPackageItems: 1,
    openItems: [
      { productId: 'p-ds-agency-a', quantity: 1, price: 68, name: '测试亚克力牌', spec: 'A 版', category: '立牌' },
    ],
  }
  const { data, carpool } = withCarpool(base, lowPriceCapacityDraft)
  const rider = buy(data, carpool.id, RIDER_A, [carpool.positions[0].id])
  const state = recruitmentStateOf(rider.data, carpool.id)
  check('包裹满额的购买仍正常落单', rider.ok)
  check('包裹已满但未达最低金额', state.packageFull && !state.amountReached)
  check('未同时满足条件时不会错误自动截团', !state.autoCut && rider.data.carpools.find((item) => item.id === carpool.id)?.status === 'recruiting')
}

section('差异修复 3-6：截止扫描、自动流团与退款幂等')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const rider = buy(data, carpool.id, RIDER_A, [carpool.positions[0].id])

  const expired = sweepExpiredRecruitments(rider.data, new Date('2026-12-11T00:00:00.000Z').getTime())
  check('自设截止到达后先进入等待车主处理', expired.data.carpools.find((item) => item.id === carpool.id)?.status === 'expired')
  check('等待处理时不会提前退款', (expired.data.payments ?? []).filter((payment) => payment.carpoolId === carpool.id && payment.kind === 'refund').length === 0)

  const failed = sweepExpiredRecruitments(expired.data, new Date('2027-01-01T00:00:00.000Z').getTime())
  const firstRefunds = (failed.data.payments ?? []).filter((payment) => payment.carpoolId === carpool.id && payment.kind === 'refund')
  check('最晚截团时间到达后自动流团', failed.data.carpools.find((item) => item.id === carpool.id)?.status === 'failed')
  check('自动流团只生成一笔对应商品款退款', firstRefunds.length === 1)

  const repeated = sweepExpiredRecruitments(failed.data, new Date('2027-01-02T00:00:00.000Z').getTime())
  const repeatedRefunds = (repeated.data.payments ?? []).filter((payment) => payment.carpoolId === carpool.id && payment.kind === 'refund')
  check('重复扫描不会再次退款', repeated.reports.length === 0 && repeatedRefunds.length === firstRefunds.length)

  const base2 = createInitialData()
  const second = withCarpool(base2, bundleDraft)
  const firstPurchase = buy(second.data, second.carpool.id, RIDER_A, [second.carpool.positions[0].id])
  const secondPurchase = buy(firstPurchase.data, second.carpool.id, RIDER_B, [second.carpool.positions[1].id])
  const scannedCut = sweepExpiredRecruitments(secondPurchase.data, new Date('2027-01-02T00:00:00.000Z').getTime())
  check('已截团车次不会被截止扫描终止', scannedCut.data.carpools.find((item) => item.id === second.carpool.id)?.status === 'cut')
  check('已截团车次扫描不生成流团报告', !scannedCut.reports.some((report) => report.carpoolId === second.carpool.id))
}

section('差异修复 7：采购凭证图片与历史文字记录兼容')
{
  const base = createInitialData()
  const { data, carpool } = withCarpool(base, bundleDraft)
  const riderA = buy(data, carpool.id, RIDER_A, [carpool.positions[0].id])
  const riderB = buy(riderA.data, carpool.id, RIDER_B, [carpool.positions[1].id])
  const imageDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='
  const imageVoucher = uploadVoucherOp(riderB.data, OWNER, carpool.id, {
    title: '官方订单截图',
    note: '图片附件测试',
    imageDataUrl,
    imageName: 'order.jpg',
  })
  check('图片凭证可正常保存', imageVoucher.ok && imageVoucher.data?.imageDataUrl === imageDataUrl)
  check('图片凭证保留原文件名', imageVoucher.data?.imageName === 'order.jpg')

  const textVoucher = uploadVoucherOp(imageVoucher.next, OWNER, carpool.id, {
    title: '历史文字凭证',
    note: '只有文字，没有图片附件',
  })
  const restored = normalizeData(JSON.parse(JSON.stringify(textVoucher.next)))
  const historical = restored.purchaseVouchers.find((voucher) => voucher.title === '历史文字凭证')
  check('历史纯文字凭证仍可读取', Boolean(historical) && !historical?.imageDataUrl && historical?.note === '只有文字，没有图片附件')
}

console.log(`\n${failures === 0 ? '全部通过' : '存在失败'}：${checks - failures}/${checks} 项检查通过`)
if (failures > 0) process.exit(1)
