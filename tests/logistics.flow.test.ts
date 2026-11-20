/**
 * DREAM CAR V1.1 物流与地址模块的验收流程测试。
 * 运行：npm run test
 *
 * 这些用例覆盖补充提示词「十二、功能验收标准」中的 15 条演示流程，
 * 直接驱动 src/lib/logisticsOps.ts 中的纯状态迁移函数。
 */
import { createInitialData, normalizeData } from '../src/data'
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
} from '../src/lib/logisticsOps'
import type { AppData } from '../src/types'

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

const OWNER = 'u-fourth' // car-plush 车主
const RIDER_BOOK = 'u-owner' // 使用地址簿提交
const RIDER_MANUAL = 'u-third' // 填写临时地址并保存到地址簿
const RIDER_OVERDUE = 'u-rider' // 逾期未提交 → 补交

const addressBookInput = (label: string, detail: string) => ({
  label,
  receiverName: '林小满',
  phone: '13800001111',
  province: '上海市',
  city: '上海市',
  district: '徐汇区',
  detail,
})

/** 干净起点：地址收集未开启，车员全部待填写 */
function freshState(): AppData {
  const base = createInitialData()
  return {
    ...base,
    internationalShipments: [],
    domesticShipments: [],
    orderAddresses: [],
    notifications: [],
    carpools: base.carpools.map((carpool) => (
      carpool.id === 'car-plush' ? { ...carpool, addressCollection: undefined } : carpool
    )),
  }
}

let data: AppData = freshState()

section('1. 个人中心新增地址并设置默认地址')
{
  const first = addSavedAddressOp(data, RIDER_MANUAL, addressBookInput('公司', '世纪大道 100 号 A 座'))
  data = first.next
  check('新增第一条地址成功', first.ok)
  const second = addSavedAddressOp(data, RIDER_MANUAL, addressBookInput('学校', '海州路 168 号 3 层'))
  data = second.next
  check('新增第二条地址成功', second.ok)

  const mine = data.savedAddresses.filter((item) => item.userId === RIDER_MANUAL)
  check('同一用户可以保存多个地址', mine.length === 3)
  check('同一用户最多只有一个默认地址', mine.filter((item) => item.isDefault).length === 1)

  const school = mine.find((item) => item.label === '学校')!
  const setDefault = setDefaultSavedAddressOp(data, RIDER_MANUAL, school.id)
  data = setDefault.next
  const mineAfter = data.savedAddresses.filter((item) => item.userId === RIDER_MANUAL)
  check('设置新的默认地址后自动取消原默认地址', mineAfter.filter((item) => item.isDefault).length === 1 && mineAfter.find((item) => item.isDefault)?.id === school.id)

  const cross = updateSavedAddressOp(data, RIDER_BOOK, school.id, addressBookInput('学校', '篡改'))
  check('不能编辑其他账号的地址', !cross.ok)
  const crossDelete = deleteSavedAddressOp(data, RIDER_BOOK, school.id)
  check('不能删除其他账号的地址', !crossDelete.ok)
}

section('2-3. 车主录入国际物流，清关完成后开启地址收集')
{
  const enter = updateInternationalShipmentOp(data, OWNER, 'car-plush', {
    carrier: 'DHL Express',
    trackingNumber: 'JD014600008821',
    trackingUrl: 'https://www.dhl.com/cn/zh/home/tracking',
    status: 'in_transit',
    note: '包裹已从首尔仓发出。',
  })
  data = enter.next
  check('车主可以更新国际物流状态', enter.ok)
  check('国际运输中不开启地址收集', data.carpools.find((c) => c.id === 'car-plush')?.addressCollection?.enabled !== true)
  check('国际运输中不生成待填写记录', data.orderAddresses.filter((a) => a.carpoolId === 'car-plush' && a.status === 'pending').length === 0)

  const notOwner = updateInternationalShipmentOp(data, RIDER_BOOK, 'car-plush', {
    carrier: 'X', trackingNumber: 'Y', trackingUrl: '', status: 'customs', note: '',
  })
  check('车员不能修改国际物流', !notOwner.ok)

  const again = updateInternationalShipmentOp(data, OWNER, 'car-plush', {
    carrier: 'DHL Express',
    trackingNumber: 'JD014600008821',
    trackingUrl: 'https://www.dhl.com/cn/zh/home/tracking',
    status: 'domestic_transit',
    note: '已清关，进入国内运输。',
  })
  data = again.next
  check('清关完成后地址收集被自动开启', data.carpools.find((c) => c.id === 'car-plush')?.addressCollection?.enabled === true)
  const pendingRecords = data.orderAddresses.filter((a) => a.carpoolId === 'car-plush' && a.status === 'pending')
  check('三位车员都生成了待填写记录', pendingRecords.length === 3)

  const repeat = updateInternationalShipmentOp(data, OWNER, 'car-plush', {
    carrier: 'DHL Express',
    trackingNumber: 'JD014600008821',
    trackingUrl: 'https://www.dhl.com/cn/zh/home/tracking',
    status: 'domestic_transit',
    note: '已清关，进入国内运输。',
  })
  data = repeat.next
  check('重复修改状态不会重复创建地址收集任务', data.orderAddresses.filter((a) => a.carpoolId === 'car-plush' && a.status === 'pending').length === 3)
  check('物流时间线记录了状态变化', data.internationalShipments.find((s) => s.carpoolId === 'car-plush')?.timeline.length === 2)
}

section('4. 车员收到补充地址通知')
{
  const notice = data.notifications.find((item) => item.userId === RIDER_OVERDUE && item.type === 'address_required')
  check('未提交地址的车员收到站内提醒', Boolean(notice))
  check('通知包含关联车次', notice?.carpoolId === 'car-plush')
  check('通知默认未读', notice?.read === false)
  check('通知包含标题与内容', Boolean(notice?.title && notice?.content))
}

section('5-6. 车员提交地址（地址簿 / 临时地址 + 保存到地址簿）')
{
  const saved = data.savedAddresses.find((item) => item.userId === RIDER_BOOK && item.isDefault)!
  const useSaved = submitOrderAddressOp(data, RIDER_BOOK, 'car-plush', {
    label: saved.label,
    receiverName: saved.receiverName,
    phone: saved.phone,
    province: saved.province,
    city: saved.city,
    district: saved.district,
    detail: saved.detail,
    saveToBook: false,
    sourceAddressId: saved.id,
  })
  data = useSaved.next
  check('车员可以使用已保存地址提交', useSaved.ok)
  check('地址簿数量没有被重复写入', data.savedAddresses.filter((item) => item.userId === RIDER_BOOK).length === 2)

  const manual = submitOrderAddressOp(data, RIDER_MANUAL, 'car-plush', {
    ...addressBookInput('临时', '南京西路 100 号 5F'),
    saveToBook: true,
  })
  data = manual.next
  check('车员可以填写临时地址提交', manual.ok)
  check('勾选后地址同时保存到个人地址簿', data.savedAddresses.filter((item) => item.userId === RIDER_MANUAL).length === 4)
}

section('7. 车主看到地址收集人数与提交状态')
{
  const records = data.orderAddresses.filter((item) => item.carpoolId === 'car-plush')
  const submitted = records.filter((item) => item.status === 'submitted').length
  check('已提交地址人数为 2', submitted === 2)
  check('未提交地址人数为 1', records.length - submitted === 1)
  check('同一车次同一车员只有一份地址记录', new Set(records.map((item) => item.userId)).size === records.length)
}

section('8. 车主催促未提交地址的车员')
{
  const urge = urgeAddressOp(data, OWNER, 'car-plush', RIDER_OVERDUE)
  data = urge.next
  check('催促成功并生成通知', urge.ok && data.notifications.some((item) => item.userId === RIDER_OVERDUE && item.type === 'address_urge'))
  const record = data.orderAddresses.find((item) => item.userId === RIDER_OVERDUE && item.carpoolId === 'car-plush')!
  check('记录了催促时间与次数', Boolean(record.urgedAt) && record.urgeCount === 1)

  const repeat = urgeAddressOp(data, OWNER, 'car-plush', RIDER_OVERDUE)
  check('连续点击不会产生重复通知', !repeat.ok)
  const submittedUrge = urgeAddressOp(data, OWNER, 'car-plush', RIDER_BOOK)
  check('已提交地址的车员不再需要催促', !submittedUrge.ok)
}

section('9. 车主确认签收并完成到货检查')
{
  const early = confirmArrivalCheckOp(data, OWNER, 'car-plush')
  check('未签收时不能完成到货检查', !early.ok)

  const received = updateInternationalShipmentOp(data, OWNER, 'car-plush', {
    carrier: 'DHL Express',
    trackingNumber: 'JD014600008821',
    trackingUrl: 'https://www.dhl.com/cn/zh/home/tracking',
    status: 'received',
    note: '包裹已收到，开始验货。',
  })
  data = received.next
  const check1 = confirmArrivalCheckOp(data, OWNER, 'car-plush')
  data = check1.next
  check('确认到货检查完成', check1.ok)
  check('未提交地址的车员标记为逾期', data.orderAddresses.find((a) => a.userId === RIDER_OVERDUE)?.status === 'overdue')
  check('已提交地址的车员不受影响', data.orderAddresses.find((a) => a.userId === RIDER_BOOK)?.status === 'submitted')
  check('车员收到到货检查通知', data.notifications.some((item) => item.userId === RIDER_OVERDUE && item.type === 'arrival_checked'))
  check('地址收集阶段结束', Boolean(data.carpools.find((c) => c.id === 'car-plush')?.addressCollection?.closedAt))
}

section('10. 逾期车员仍可补交地址')
{
  const late = submitOrderAddressOp(data, RIDER_OVERDUE, 'car-plush', {
    ...addressBookInput('家', '文三路 259 号 4 单元 501 室'),
    saveToBook: false,
  })
  data = late.next
  check('逾期未提交的车员仍可补交地址', late.ok)
  check('补交后状态变为已提交', data.orderAddresses.find((a) => a.userId === RIDER_OVERDUE)?.status === 'submitted')
}

section('11. 车主为不同车员分别录入国内快递')
{
  const shipOne = saveDomesticShipmentOp(data, OWNER, 'car-plush', RIDER_BOOK, {
    carrier: '中通快递', trackingNumber: 'ZT7712345678901', shippedAt: '', note: '已验货',
  })
  data = shipOne.next
  check('可以标记为已发货', shipOne.ok && data.domesticShipments.find((d) => d.userId === RIDER_BOOK)?.status === 'shipped')

  const shipTwo = saveDomesticShipmentOp(data, OWNER, 'car-plush', RIDER_MANUAL, {
    carrier: '圆通速递', trackingNumber: 'YT8822334455667', shippedAt: '', note: '',
  })
  data = shipTwo.next
  check('不同车员可以录入不同快递公司', data.domesticShipments.find((d) => d.userId === RIDER_MANUAL)?.carrier === '圆通速递')
  check('已发货车员收到站内通知', data.notifications.some((item) => item.userId === RIDER_BOOK && item.type === 'domestic_shipped'))

  const received = saveDomesticShipmentOp(data, OWNER, 'car-plush', RIDER_BOOK, {
    carrier: '中通快递', trackingNumber: 'ZT7712345678901', shippedAt: '', note: '', status: 'received',
  })
  data = received.next
  check('车主可以手动标记已签收', received.ok && data.domesticShipments.find((d) => d.userId === RIDER_BOOK)?.status === 'received')
}

section('12. 车员只能查看自己的国内物流')
{
  const mine = data.domesticShipments.filter((item) => item.carpoolId === 'car-plush' && item.userId === RIDER_BOOK)
  const others = data.domesticShipments.filter((item) => item.carpoolId === 'car-plush' && item.userId !== RIDER_BOOK)
  check('自己的记录只包含自己的快递单号', mine.length === 1 && mine[0].trackingNumber === 'ZT7712345678901')
  check('其他车员的快递单号存放在独立记录中', others.length === 1 && others[0].trackingNumber === 'YT8822334455667')
  check('未提交地址的车员无法被标记为已发货', !saveDomesticShipmentOp(
    { ...data, orderAddresses: data.orderAddresses.map((item) => item.userId === RIDER_OVERDUE ? { ...item, status: 'pending' } : item) },
    OWNER,
    'car-plush',
    RIDER_OVERDUE,
    { carrier: '顺丰', trackingNumber: 'SF123', shippedAt: '', note: '' },
  ).ok)
}

section('13. 修改 / 删除个人地址簿不影响已提交的订单地址')
{
  const orderAddress = data.orderAddresses.find((item) => item.userId === RIDER_BOOK && item.carpoolId === 'car-plush')!
  const before = orderAddress.detail
  const bookAddress = data.savedAddresses.find((item) => item.userId === RIDER_BOOK)!
  const edited = updateSavedAddressOp(data, RIDER_BOOK, bookAddress.id, { ...bookAddress, detail: '改过的地址' })
  data = edited.next
  check('修改地址簿后订单地址快照不变', data.orderAddresses.find((item) => item.id === orderAddress.id)?.detail === before)

  const removed = deleteSavedAddressOp(data, RIDER_BOOK, bookAddress.id)
  data = removed.next
  check('删除地址簿后订单地址快照仍然存在', data.orderAddresses.find((item) => item.id === orderAddress.id)?.detail === before)
  check('地址簿中的记录已被删除', !data.savedAddresses.some((item) => item.id === bookAddress.id))
}

section('14. 刷新页面后数据仍然保留')
{
  const serialized = JSON.stringify(data)
  const restored = normalizeData(JSON.parse(serialized))
  check('序列化后可以完整还原', restored.orderAddresses.length === data.orderAddresses.length)
  check('国际物流记录保留', restored.internationalShipments.length === data.internationalShipments.length)
  check('国内物流记录保留', restored.domesticShipments.length === data.domesticShipments.length)
  check('站内通知保留', restored.notifications.length === data.notifications.length)
  check('个人地址簿保留', restored.savedAddresses.length === data.savedAddresses.length)
}

section('15. 原有拼车、订单、群聊流程不受影响')
{
  const fresh = createInitialData()
  check('预置拼车数量不变（4 辆历史 + 3 辆 V2.0）', fresh.carpools.length === 7)
  check('V1 的 7 笔预置订单仍然存在', fresh.orders.filter((order) => order.id.startsWith('order-demo-') && !['order-demo-8', 'order-demo-9'].includes(order.id)).length === 7)
  check('预置群聊仍然存在', fresh.chats.some((chat) => chat.carpoolId === 'car-plush'))
  check('车次状态仍然正确', fresh.carpools.find((c) => c.id === 'car-plush')?.status === 'cut')

  // 模拟 V1 存量数据：完全没有 V1.1 / V1.2 / V1.3-A 的字段
  const legacy = normalizeData({
    version: 1,
    users: fresh.users,
    currentUserId: 'u-owner',
    carpools: fresh.carpools.map((carpool) => ({
      ...carpool,
      addressCollection: undefined,
      purchaseMode: undefined,
      shareGroups: undefined,
      bundleSets: undefined,
      guarantees: undefined,
      feeRules: undefined,
      rulesVersion: undefined,
      fallbackRule: undefined,
      positions: carpool.positions.map((slot) => ({ id: slot.id, label: slot.label, occupantId: slot.occupantId, orderId: slot.orderId })),
    })),
    orders: fresh.orders.map((order) => ({
      id: order.id,
      carpoolId: order.carpoolId,
      userId: order.userId,
      slotIds: order.slotIds,
      amount: order.amount,
      paidAt: order.paidAt,
    })),
    chats: fresh.chats,
  } as unknown as AppData)
  check('V1 存量数据可以平滑升级', legacy.version === 7 && legacy.carpools.length === 7)
  check('升级后补齐了空的 V1.1 集合', legacy.savedAddresses.length === 0 && legacy.notifications.length === 0)
  check('升级后原有订单与群聊保持不变', legacy.orders.length === fresh.orders.length && legacy.chats.length === fresh.chats.length)
  check('升级后补齐了 V1.2 信誉集合', legacy.reputations.length === fresh.users.length && legacy.reputationEvents.length === 0)
  // V1.3-A：存量数据补齐份额与快照字段，但不改变原有业务数据
  check('旧车保持 legacy 平铺结构', legacy.carpools.every((carpool) => !carpool.shareGroups))
  check('旧车补齐了份额单价', legacy.carpools.every((carpool) => carpool.positions.every((slot) => typeof slot.price === 'number')))
  check('旧车补齐了未凑齐处理规则', legacy.carpools.every((carpool) => Boolean(carpool.fallbackRule)))
  check('存量订单补齐了商品与费用快照', legacy.orders.every((order) => Boolean(order.itemSnapshot && order.feeSnapshot && order.rulesSnapshot)))
  check('存量订单的商品快照不被覆盖', legacy.orders.find((order) => order.id === 'order-demo-5')?.itemSnapshot?.name === '成员角色玩偶挂件')
}

section('16. 预置演示数据自洽')
{
  const seed = createInitialData()
  const seedOrder = seed.orderAddresses.find((item) => item.userId === 'u-rider' && item.carpoolId === 'car-plush')!
  const seedDomestic = seed.domesticShipments.find((item) => item.userId === 'u-rider' && item.carpoolId === 'car-plush')!
  check('已发货车员已经提交了地址', seedOrder.status === 'submitted')
  check('已发货车员的国内物流与地址一致', seedDomestic.status === 'shipped')
  check('预置地址收集已开启', seed.carpools.find((c) => c.id === 'car-plush')?.addressCollection?.enabled === true)
}

console.log(`\n${failures === 0 ? '全部通过' : '存在失败'}：${checks - failures}/${checks} 项检查通过`)
if (failures > 0) process.exit(1)
