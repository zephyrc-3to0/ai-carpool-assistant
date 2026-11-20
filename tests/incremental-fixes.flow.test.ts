/**
 * 本轮增量修复的定向回归：模拟支付、流团退款、位置编号、国内首次发货。
 * 运行：npm run test:incremental
 */
import { createElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { createInitialData, STORAGE_KEY } from '../src/data'
import { ToastProvider } from '../src/components/Toast'
import { AppStoreProvider } from '../src/store'
import { ConfirmPage } from '../src/pages/ConfirmPage'
import { ParticipationPage } from '../src/pages/ParticipationPage'
import { ShippingManagePage } from '../src/pages/ShippingManagePage'
import { participationOf } from '../src/lib/participation'
import { failCarpoolOp } from '../src/lib/recruitOps'
import { buildV2Carpool, purchaseSharesOp, type NewCarpoolInput } from '../src/lib/shareOps'
import { saveDomesticShipmentOp } from '../src/lib/logisticsOps'
import type { AppData, Carpool, DomesticFeeBill, Order, OrderShippingAddress } from '../src/types'

let failures = 0
let checks = 0

function check(label: string, condition: boolean) {
  checks += 1
  if (condition) console.log(`  ✓ ${label}`)
  else {
    failures += 1
    console.log(`  ✗ ${label}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

const OWNER = 'u-owner'
const RIDER = 'u-rider'

const localStore: Record<string, string> = {}
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => localStore[key] ?? null,
    setItem: (key: string, value: string) => { localStore[key] = value },
    removeItem: (key: string) => { delete localStore[key] },
  },
  configurable: true,
})

function renderPage(data: AppData, element: ReactNode) {
  localStore[STORAGE_KEY] = JSON.stringify(data)
  return renderToString(createElement(
    ToastProvider,
    null,
    createElement(AppStoreProvider, null, element),
  ))
}

function withCarpool(base: AppData, draft: NewCarpoolInput): { data: AppData; carpool: Carpool } {
  const { carpool, ownerPurchases } = buildV2Carpool(OWNER, draft, '定向回归活动')
  return {
    data: {
      ...base,
      carpools: [carpool, ...base.carpools],
      ownerPurchases: [...ownerPurchases, ...(base.ownerPurchases ?? [])],
    },
    carpool,
  }
}

const draftBase: Omit<NewCarpoolInput, 'title' | 'openItems'> = {
  groupId: 'g-nct',
  eventId: 'evt-dreamscape',
  description: '用于本轮增量修复定向回归的拼车描述。',
  rules: '用于本轮增量修复定向回归的拼车规则，付款成功后才正式占位。',
  purchaseMode: 'bundle',
  guarantees: { fullSetOrdered: true, memberDesign: true },
  fallbackRule: '未凑齐时结束流团并按每笔已付款车员订单退款。',
  deadline: '2026-12-15T20:00:00.000Z',
  internationalFreight: 0,
  minAmount: 0,
  maxPackageItems: 0,
  ownerHeld: [],
}

section('1. 预留后立即模拟付款与多选金额')
{
  const { data, carpool } = withCarpool(createInitialData(), {
    ...draftBase,
    title: '混合价格多选车',
    openItems: [
      { productId: 'p-ds-agency-a', member: 'RENJUN', quantity: 1, price: 68, name: '成员亚克力立牌', spec: 'A 版', category: '立牌' },
      { productId: 'p-ds-agency-b', member: 'MARK', quantity: 1, price: 78, name: '成员亚克力立牌', spec: 'B 版', category: '立牌' },
    ],
  })
  const slotIds = carpool.positions.map((slot) => slot.id)
  const confirmHtml = renderPage(
    { ...data, currentUserId: RIDER },
    createElement(ConfirmPage, { carpoolId: carpool.id, slotIds }),
  )
  check('购买确认页展示选购页的完整位置名称', carpool.positions.every((slot) => confirmHtml.includes(slot.label)))
  const paid = purchaseSharesOp(data, RIDER, carpool.id, slotIds)
  const orders = paid.next.orders.filter((order) => order.carpoolId === carpool.id && order.userId === RIDER)
  const goodsPayments = paid.next.payments.filter((payment) => payment.carpoolId === carpool.id && payment.kind === 'goods')
  const updatedCarpool = paid.next.carpools.find((item) => item.id === carpool.id)!

  check('付款读取本次预留后的状态并成功', paid.ok)
  check('成功时只生成一笔订单', orders.length === 1)
  check('成功时只生成一笔商品支付流水', goodsPayments.length === 1)
  check('全部所选份额正式占位且预留已清除', updatedCarpool.positions.every((slot) => slot.occupantId === RIDER && !slot.reservation))
  check('多选订单按每份实际价格加总', orders[0]?.amount === 146 && orders[0]?.feeSnapshot?.goodsTotal === 146)
  check('确认金额、订单金额与支付流水一致', goodsPayments[0]?.amountCents === Math.round((orders[0]?.amount ?? 0) * 100))
  check('首位车员只创建一个群聊', paid.next.chats.filter((chat) => chat.carpoolId === carpool.id).length === 1)
  check('占满后沿用原规则自动截团', updatedCarpool.status === 'cut')

  const failureSetup = withCarpool(createInitialData(), {
    ...draftBase,
    title: '支付失败车',
    openItems: [
      { productId: 'p-ds-agency-a', member: 'RENJUN', quantity: 1, price: 68, name: '成员亚克力立牌', spec: 'A 版', category: '立牌' },
    ],
  })
  const failed = purchaseSharesOp(failureSetup.data, RIDER, failureSetup.carpool.id, [failureSetup.carpool.positions[0].id], { simulateFailure: true })
  const failedSlot = failed.next.carpools.find((item) => item.id === failureSetup.carpool.id)!.positions[0]
  check('支付失败给出独立提示', !failed.ok && failed.message.includes('支付失败'))
  check('支付失败释放份额且不生成订单', !failedSlot.reservation && !failedSlot.occupantId && !failed.next.orders.some((order) => order.carpoolId === failureSetup.carpool.id))

  const timeoutSetup = withCarpool(createInitialData(), {
    ...draftBase,
    title: '支付超时车',
    openItems: [
      { productId: 'p-ds-agency-a', member: 'RENJUN', quantity: 1, price: 68, name: '成员亚克力立牌', spec: 'A 版', category: '立牌' },
    ],
  })
  const timedOut = purchaseSharesOp(timeoutSetup.data, RIDER, timeoutSetup.carpool.id, [timeoutSetup.carpool.positions[0].id], { simulateTimeout: true })
  const timeoutSlot = timedOut.next.carpools.find((item) => item.id === timeoutSetup.carpool.id)!.positions[0]
  check('预留超时给出独立提示', !timedOut.ok && timedOut.message.includes('超时'))
  check('预留超时释放份额且不生成订单', !timeoutSlot.reservation && !timeoutSlot.occupantId && !timedOut.next.orders.some((order) => order.carpoolId === timeoutSetup.carpool.id))
}

section('2. 流团按车员订单逐笔退款并兼容旧订单')
{
  const setup = withCarpool(createInitialData(), {
    ...draftBase,
    title: '逐笔退款车',
    purchaseMode: 'single',
    guarantees: { fullSetOrdered: false, memberDesign: false },
    minAmount: 999,
    maxPackageItems: 4,
    openItems: [
      { productId: 'p-ds-agency-a', quantity: 1, price: 68, name: '成员亚克力立牌', spec: 'A 版', category: '立牌' },
      { productId: 'p-ds-agency-b', quantity: 1, price: 78, name: '成员亚克力立牌', spec: 'B 版', category: '立牌' },
    ],
  })
  const first = purchaseSharesOp(setup.data, RIDER, setup.carpool.id, [setup.carpool.positions[0].id])
  const secondCarpool = first.next.carpools.find((item) => item.id === setup.carpool.id)!
  const second = purchaseSharesOp(first.next, RIDER, setup.carpool.id, [secondCarpool.positions[1].id])
  const riderOrders = second.next.orders.filter((order) => order.carpoolId === setup.carpool.id && order.userId === RIDER)
  const firstOrder = riderOrders.find((order) => order.slotIds.includes(setup.carpool.positions[0].id))!
  const legacyOrder = riderOrders.find((order) => order.id !== firstOrder.id)!
  const ownerOrder: Order = {
    id: 'legacy-owner-order',
    carpoolId: setup.carpool.id,
    userId: OWNER,
    slotIds: [],
    amount: 999,
    paidAt: '2026-11-20T00:00:00.000Z',
    ownerHeld: true,
  }
  const refundInput: AppData = {
    ...second.next,
    orders: [ownerOrder, ...second.next.orders],
    payments: second.next.payments
      .filter((payment) => !(payment.kind === 'goods' && payment.refId === legacyOrder.id))
      .map((payment) => payment.kind === 'goods' && payment.refId === firstOrder.id
        ? { ...payment, amountCents: 4321 }
        : payment),
  }

  const failed = failCarpoolOp(refundInput, OWNER, setup.carpool.id, '定向回归流团')
  const refunds = failed.next.payments.filter((payment) => payment.carpoolId === setup.carpool.id && payment.kind === 'refund')
  check('每笔已付款车员订单各生成一笔退款', refunds.length === 2 && riderOrders.every((order) => refunds.some((refund) => refund.refId === order.id)))
  check('有支付流水时优先使用流水金额', refunds.find((refund) => refund.refId === firstOrder.id)?.amountCents === 4321)
  check('旧订单缺少流水时回退原订单实付金额', refunds.find((refund) => refund.refId === legacyOrder.id)?.amountCents === Math.round(legacyOrder.amount * 100))
  check('退款记录明确关联原订单', refunds.every((refund) => riderOrders.some((order) => order.id === refund.refId)))
  check('车主自购/车主订单不生成退款', !refunds.some((refund) => refund.userId === OWNER || refund.refId === ownerOrder.id))
  const participationHtml = renderPage(
    { ...failed.next, currentUserId: RIDER },
    createElement(ParticipationPage, { carpoolId: setup.carpool.id }),
  )
  const participationText = participationHtml.replaceAll('<!-- -->', '')
  check('车员订单页逐笔显示退款结果', refunds.every((refund) => participationText.includes(`已生成模拟退款 ¥${(refund.amountCents / 100).toFixed(2)}`)))

  const partiallyRefunded: AppData = {
    ...refundInput,
    payments: [
      ...refundInput.payments,
      {
        id: 'existing-refund',
        carpoolId: setup.carpool.id,
        userId: firstOrder.userId,
        kind: 'refund',
        amountCents: 4321,
        status: 'refunded',
        refId: firstOrder.id,
        createdAt: '2026-11-20T00:01:00.000Z',
      },
    ],
  }
  const resumed = failCarpoolOp(partiallyRefunded, OWNER, setup.carpool.id, '部分退款后重试')
  const resumedRefunds = resumed.next.payments.filter((payment) => payment.kind === 'refund' && payment.carpoolId === setup.carpool.id)
  check('已有订单退款时只补齐缺失退款', resumed.ok && resumedRefunds.length === 2 && resumedRefunds.filter((refund) => refund.refId === firstOrder.id).length === 1)

  const repeated = failCarpoolOp(failed.next, OWNER, setup.carpool.id, '重复操作')
  check('重复流团不会生成第二笔退款', !repeated.ok && repeated.next.payments.filter((payment) => payment.kind === 'refund' && payment.carpoolId === setup.carpool.id).length === 2)
}

section('3. 完整位置编号进入订单快照与订单聚合')
{
  const setup = withCarpool(createInitialData(), {
    ...draftBase,
    title: '位置编号车',
    openItems: [
      { productId: 'p-ds-agency-a', member: 'RENJUN', quantity: 2, price: 68, name: '成员亚克力立牌', spec: 'A 版', category: '立牌' },
    ],
  })
  const expectedLabels = ['A 版 RENJUN 1', 'A 版 RENJUN 2']
  check('选购页份额保留完整编号', setup.carpool.positions.map((slot) => slot.label).join('|') === expectedLabels.join('|'))
  const paid = purchaseSharesOp(setup.data, RIDER, setup.carpool.id, setup.carpool.positions.map((slot) => slot.id))
  const order = paid.data!
  const summary = participationOf(paid.next, setup.carpool.id, RIDER)
  check('订单快照保留完整位置名称', order.itemSnapshot?.slotLabels.join('|') === expectedLabels.join('|'))
  check('订单详情聚合继续使用完整位置名称', summary.items[0]?.labels.join('|') === expectedLabels.join('|'))
  check('位置编号不改变按成员位置自动截团规则', paid.next.carpools.find((item) => item.id === setup.carpool.id)?.status === 'cut')
}

section('4. 国内费用结清前拦截首次发货，历史发货保持可查')
{
  const setup = withCarpool(createInitialData(), {
    ...draftBase,
    title: '国内首次发货车',
    openItems: [
      { productId: 'p-ds-agency-a', member: 'RENJUN', quantity: 1, price: 68, name: '成员亚克力立牌', spec: 'A 版', category: '立牌' },
    ],
  })
  const purchased = purchaseSharesOp(setup.data, RIDER, setup.carpool.id, [setup.carpool.positions[0].id])
  const address: OrderShippingAddress = {
    id: 'regression-address',
    carpoolId: setup.carpool.id,
    userId: RIDER,
    status: 'submitted',
    label: '测试地址',
    receiverName: '测试用户',
    phone: '13800000000',
    province: '上海市',
    city: '上海市',
    district: '徐汇区',
    detail: '测试路 1 号',
    submittedAt: '2026-11-20T00:00:00.000Z',
    urgeCount: 0,
  }
  const bill: DomesticFeeBill = {
    id: 'regression-domestic-bill',
    carpoolId: setup.carpool.id,
    userId: RIDER,
    packingFeeCents: 500,
    shippingFeeCents: 800,
    totalCents: 1300,
    status: 'pending',
    createdAt: '2026-11-20T00:00:00.000Z',
  }
  const dataWithPendingBill: AppData = {
    ...purchased.next,
    // 模拟旧车：即使 requiresDomesticFee 为 false，只要已登记费用也必须结清后首次发货。
    carpools: purchased.next.carpools.map((item) => item.id === setup.carpool.id ? { ...item, requiresDomesticFee: false } : item),
    orderAddresses: [address, ...purchased.next.orderAddresses],
    domesticFeeBills: [bill, ...purchased.next.domesticFeeBills],
  }
  const shipmentInput = { carrier: '中通快递', trackingNumber: 'ZT123456789', shippedAt: '', note: '定向回归' }
  const pending = saveDomesticShipmentOp(dataWithPendingBill, OWNER, setup.carpool.id, RIDER, shipmentInput)
  check('国内费用待支付时拦截首次发货', !pending.ok && pending.message.includes('没有完成'))
  const shippingHtml = renderPage(
    { ...dataWithPendingBill, currentUserId: OWNER },
    createElement(ShippingManagePage, { carpoolId: setup.carpool.id }),
  )
  check('国内发货界面提示与业务拦截一致', shippingHtml.includes('尚未完成国内费用模拟支付，结清后才能首次发货'))

  const disputedData: AppData = {
    ...dataWithPendingBill,
    domesticFeeBills: dataWithPendingBill.domesticFeeBills.map((item) => item.id === bill.id ? { ...item, status: 'disputed' } : item),
  }
  const disputed = saveDomesticShipmentOp(disputedData, OWNER, setup.carpool.id, RIDER, shipmentInput)
  check('国内费用有异议时拦截首次发货', !disputed.ok && disputed.message.includes('异议'))

  const paidData: AppData = {
    ...dataWithPendingBill,
    domesticFeeBills: dataWithPendingBill.domesticFeeBills.map((item) => item.id === bill.id ? { ...item, status: 'paid' } : item),
  }
  const shipped = saveDomesticShipmentOp(paidData, OWNER, setup.carpool.id, RIDER, shipmentInput)
  check('国内费用结清后允许首次发货', shipped.ok && shipped.next.domesticShipments.find((item) => item.carpoolId === setup.carpool.id && item.userId === RIDER)?.status === 'shipped')

  const historicalData: AppData = {
    ...shipped.next,
    domesticFeeBills: shipped.next.domesticFeeBills.map((item) => item.id === bill.id ? { ...item, status: 'pending' } : item),
  }
  const historical = saveDomesticShipmentOp(historicalData, OWNER, setup.carpool.id, RIDER, { ...shipmentInput, note: '更新历史备注' })
  const historicalShipment = historical.next.domesticShipments.find((item) => item.carpoolId === setup.carpool.id && item.userId === RIDER)
  check('已发货历史记录不因账单状态被隐藏或阻断', historical.ok && historicalShipment?.status === 'shipped' && historicalShipment.note === '更新历史备注')
}

if (failures > 0) {
  console.error(`\n失败：${failures}/${checks} 项检查未通过`)
  process.exit(1)
}

console.log(`\n全部通过：${checks}/${checks} 项定向检查通过`)
