/**
 * DREAM CAR V1.2 用户主页与信誉管理系统的验收流程测试。
 * 运行：npm run test:reputation
 *
 * 这些用例覆盖 V1.2 提示词「十一、验收标准」中的 14 条演示流程，
 * 直接驱动 src/lib/reputationOps.ts 中的纯状态迁移函数。
 */
import { createInitialData, normalizeData } from '../src/data'
import {
  checkCreatePermission,
  checkJoinPermission,
  completeOwnerFulfillmentOp,
  completeRiderOrderOp,
  reviewAppealOp,
  reviewComplaintOp,
  recordReputationEvent,
  submitAppealOp,
  submitComplaintOp,
} from '../src/lib/reputationOps'
import { completedOwnerCount, completedRiderCount, hasFulfillmentRecord, levelOf, scoreFromEvents } from '../src/lib/reputation'
import { saveDomesticShipmentOp, submitOrderAddressOp, updateInternationalShipmentOp } from '../src/lib/logisticsOps'
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

const score = (data: AppData, userId: string) => scoreFromEvents(data.reputationEvents, userId)

let data: AppData = createInitialData()

section('0. 预置演示数据的信誉状态')
{
  check('初始信誉分为 100 分上限', score(data, 'u-owner') === 100)
  check('新用户没有履约记录', !hasFulfillmentRecord(data, 'u-owner'))
  check('有扣分的用户分数低于 100', score(data, 'u-third') === 66 && score(data, 'u-fourth') === 56)
  check('信誉等级随分数变化', levelOf(66) === 'caution' && levelOf(56) === 'restricted')
  check('信誉档案与事件记录一致', data.reputations.find((item) => item.userId === 'u-fourth')?.score === 56)
  check('预置投诉包含待审核记录', data.complaints.filter((item) => item.status === 'pending').length === 2)
  check('预置申诉包含待审核记录', data.appeals.some((item) => item.status === 'pending'))
}

section('1-2. 公开主页：履约经历与历史拼车记录')
{
  check('车主可以统计已完成发车次数', completedOwnerCount(data, 'u-rider') === 1)
  check('车员可以统计已完成参团次数', completedRiderCount(data, 'u-third') === 1 && completedRiderCount(data, 'u-fourth') === 1)
  check('作为车主的历史车次可以查询', data.carpools.some((carpool) => carpool.ownerId === 'u-rider'))
  check('作为车员的历史车次可以查询', data.carpools.some((carpool) => carpool.positions.some((slot) => slot.occupantId === 'u-third')))
  check('用户带有所在省份与加入时间', Boolean(data.users[0].province && data.users[0].joinedAt))
}

section('3. 个人中心可以查看自己的信誉分')
{
  check('当前用户可以读取信誉档案', data.reputations.some((item) => item.userId === 'u-owner'))
  check('信誉档案包含分数与等级', data.reputations.every((item) => typeof item.score === 'number' && Boolean(item.level)))
}

section('4. 完成一笔模拟拼车履约后获得加分')
{
  const before = score(data, 'u-rider')
  const result = completeRiderOrderOp(data, 'u-rider', 'car-plush')
  data = result.next
  check('车员确认收货后履约成功', result.ok)
  check('信誉分 +1', score(data, 'u-rider') === before + 1)
  check('订单被标记为已完成', data.orders.find((order) => order.id === 'order-demo-5')?.fulfillmentStatus === 'completed')
  check('产生了对应的信誉记录', data.reputationEvents.some((event) => event.userId === 'u-rider' && event.carId === 'car-plush' && event.eventType === 'rider_complete'))
}

section('5. 同一订单重复操作不会重复加分')
{
  const before = score(data, 'u-rider')
  const again = completeRiderOrderOp(data, 'u-rider', 'car-plush')
  check('重复确认收货被拒绝', !again.ok)
  check('信誉分没有变化', score(data, 'u-rider') === before)
  check('没有产生第二条奖励记录', data.reputationEvents.filter((event) => event.userId === 'u-rider' && event.carId === 'car-plush' && event.eventType === 'rider_complete').length === 1)
}

section('5b. 正常履约奖励每个自然月最多累计 +5 分')
{
  let scenario = createInitialData()
  // u-third 在 2026-11 已有 +1 分履约奖励；再尝试结算 6 个不同车次。
  for (let index = 0; index < 6; index += 1) {
    scenario = recordReputationEvent(scenario, {
      userId: 'u-third',
      carId: `car-cap-${index}`,
      eventType: 'rider_complete',
      scoreChange: 1,
      reason: '正常完成一次拼车履约',
      at: `2026-11-${String(10 + index).padStart(2, '0')}T09:00:00.000Z`,
    }).data
  }
  const monthlyEvents = scenario.reputationEvents.filter((event) =>
    event.userId === 'u-third'
    && event.scoreChange >= 0
    && event.createdAt.startsWith('2026-11'))
  const monthlyGain = monthlyEvents.reduce((total, event) => total + event.scoreChange, 0)
  check('同一自然月的履约奖励被限制在 +5 分以内', monthlyGain === 5)
  check('超出上限的奖励仍然留下记录（分数变化为 0）', monthlyEvents.some((event) => event.scoreChange === 0))
}

section('6. 提交投诉后信誉分不会立即变化')
{
  const before = score(data, 'u-third')
  const result = submitComplaintOp(data, 'u-owner', {
    carId: 'car-plush',
    targetUserId: 'u-third',
    category: 'owner_delay',
    description: '车员迟迟没有确认收货，希望平台核实处理。',
  })
  data = result.next
  check('投诉提交成功', result.ok)
  check('投诉进入待审核状态', data.complaints.find((item) => item.id === result.data?.id)?.status === 'pending')
  check('被投诉人的信誉分没有立即变化', score(data, 'u-third') === before)
  check('同一成员重复投诉被拦截', !submitComplaintOp(data, 'u-owner', {
    carId: 'car-plush',
    targetUserId: 'u-third',
    category: 'owner_delay',
    description: '重复提交的投诉内容测试。',
  }).ok)
}

section('7. 模拟管理员确认违规后执行扣分')
{
  const complaint = data.complaints.find((item) => item.status === 'pending')!
  const before = score(data, complaint.targetUserId)
  const result = reviewComplaintOp(data, complaint.id, 'confirm', { deduction: 10, note: '核实后确认存在违规行为。' })
  data = result.next
  const penalty = data.reputationEvents.find((event) => event.complaintId === complaint.id)
  check('管理员确认违规成功', result.ok)
  check('投诉状态变为违规成立', data.complaints.find((item) => item.id === complaint.id)?.status === 'confirmed')
  check('信誉分按该违规类型的规则扣除', Boolean(penalty) && score(data, complaint.targetUserId) === before + (penalty?.scoreChange ?? 0))
  check('生成了独立的扣分记录', Boolean(penalty && penalty.scoreChange < 0))
  check('管理员操作留下日志', data.adminLogs.some((log) => log.targetId === complaint.id))
  check('被处理用户收到扣分通知', data.notifications.some((item) => item.userId === complaint.targetUserId && item.type === 'reputation_penalty'))
  check('同一违规事件不会重复扣分', !reviewComplaintOp(data, complaint.id, 'confirm', { deduction: 10 }).ok)
}

section('8. 信誉分低于 70 时无法发布新拼车')
{
  const low = data.carpools.length
  check('发起拼车被权限拦截', !checkCreatePermission(data, 'u-third').ok)
  check('拦截原因说明了限制规则', checkCreatePermission(data, 'u-third').message.includes('70'))
  check('信誉分充足的用户可以发起拼车', checkCreatePermission(data, 'u-owner').ok)
  check('原有拼车数量不变', data.carpools.length === low)
}

section('9. 信誉分低于 60 时无法加入新拼车')
{
  const result = checkJoinPermission(data, 'u-fourth', 'car-dreamscape')
  check('加入拼车被权限拦截', !result.ok)
  check('拦截原因说明了限制规则', result.message.includes('60'))
  check('信誉分充足的用户可以加入拼车', checkJoinPermission(data, 'u-owner', 'car-photocard').ok)
}

section('10. 被限制用户仍然可以处理已有订单和物流')
{
  // u-fourth 信誉低于 60，但仍是 car-plush 车主；u-third 信誉低于 70，但仍是该车车员。
  const shipment = updateInternationalShipmentOp(data, 'u-fourth', 'car-plush', {
    carrier: 'DHL Express',
    trackingNumber: 'JD014600008821',
    trackingUrl: '',
    status: 'received',
    note: '包裹已收到，开始验货。',
  })
  check('信誉受限车主仍可更新国际物流', shipment.ok)
  data = shipment.next

  const address = submitOrderAddressOp(data, 'u-third', 'car-plush', {
    label: '公司',
    receiverName: '许听白',
    phone: '13800003333',
    province: '北京市',
    city: '北京市',
    district: '朝阳区',
    detail: '建国路 88 号 SOHO 现代城 B 座 1801',
    saveToBook: false,
  })
  check('信誉受限车员仍可提交收货地址', address.ok)
  data = address.next

  const domestic = saveDomesticShipmentOp(data, 'u-fourth', 'car-plush', 'u-third', {
    carrier: '顺丰快递',
    trackingNumber: 'SF1234567890',
    shippedAt: '2026-11-18T08:00:00.000Z',
    note: '已发货',
  })
  check('信誉受限车主仍可处理已有订单的发货信息', domestic.ok)
  data = domestic.next
}

section('11. 用户可以针对处罚提交申诉')
{
  const penalty = data.reputationEvents.find((event) => event.userId === 'u-third' && event.scoreChange < 0 && event.status === 'active')!
  const before = score(data, 'u-third')
  const result = submitAppealOp(data, 'u-third', penalty.id, '当时是帮朋友代收，物流单号由朋友提供，请核实后撤销扣分。')
  data = result.next
  check('申诉提交成功', result.ok)
  check('申诉进入待审核状态', data.appeals.find((item) => item.id === result.data?.id)?.status === 'pending')
  check('提交申诉时信誉分不会立即恢复', score(data, 'u-third') === before)
  check('同一条扣分记录不能重复申诉', !submitAppealOp(data, 'u-third', penalty.id, '重复提交的申诉内容测试。').ok)
  check('不能对他人的扣分记录申诉', !submitAppealOp(data, 'u-owner', penalty.id, '尝试申诉别人的扣分记录测试。').ok)
}

section('12. 管理员通过申诉后撤销扣分并重新计算权限')
{
  const appeal = data.appeals.find((item) => item.status === 'pending' && item.userId === 'u-third')!
  const event = data.reputationEvents.find((item) => item.id === appeal.reputationEventId)!
  const before = score(data, 'u-third')

  const result = reviewAppealOp(data, appeal.id, 'approve', '核实后认为申诉理由成立，撤销本次扣分。')
  data = result.next
  check('申诉审核通过', result.ok)
  check('扣分记录被撤销', data.reputationEvents.find((item) => item.id === event.id)?.status === 'revoked')
  check('信誉分被恢复', score(data, 'u-third') === before - event.scoreChange)
  check('申诉状态变为已通过', data.appeals.find((item) => item.id === appeal.id)?.status === 'approved')
  check('权限随分数重新计算', checkCreatePermission(data, 'u-third').ok === (score(data, 'u-third') >= 70))
  check('用户收到申诉结果通知', data.notifications.some((item) => item.userId === 'u-third' && item.type === 'appeal_result'))
  check('不会重复恢复信誉分', !reviewAppealOp(data, appeal.id, 'approve').ok)
}

section('12b. 车主完成整车履约获得 +2 分')
{
  // 让所有车员都完成履约后，车主确认整车完成
  let scenario = createInitialData()
  const carpoolId = 'car-plush'
  const riderOrders = scenario.orders.filter((order) => order.carpoolId === carpoolId && order.userId !== 'u-fourth')
  scenario = {
    ...scenario,
    orders: scenario.orders.map((order) => (
      order.carpoolId === carpoolId && order.userId !== 'u-fourth'
        ? { ...order, fulfillmentStatus: 'completed' as const, fulfilledAt: '2026-11-18T08:00:00.000Z' }
        : order
    )),
  }
  const before = score(scenario, 'u-fourth')
  const result = completeOwnerFulfillmentOp(scenario, 'u-fourth', carpoolId)
  scenario = result.next
  check('所有车员确认后可以确认整车履约完成', result.ok)
  check('车主信誉分 +2', score(scenario, 'u-fourth') === before + 2)
  check('车次被记录为已完成', Boolean(scenario.carpools.find((carpool) => carpool.id === carpoolId)?.fulfilledAt))
  check('重复确认不会重复加分', !completeOwnerFulfillmentOp(scenario, 'u-fourth', carpoolId).ok)
  check('车员数量校验有效', riderOrders.length === 3)
}

section('12c. 车员未确认时车主不能确认整车履约完成')
{
  const result = completeOwnerFulfillmentOp(data, 'u-fourth', 'car-plush')
  check('还有车员未确认收货时无法完成整车履约', !result.ok)
}

section('13. 刷新网页后信誉记录和处理状态仍然存在')
{
  const serialized = JSON.stringify(data)
  const restored = normalizeData(JSON.parse(serialized))
  check('信誉分变动记录保留', restored.reputationEvents.length === data.reputationEvents.length)
  check('投诉记录保留', restored.complaints.length === data.complaints.length)
  check('申诉记录保留', restored.appeals.length === data.appeals.length)
  check('管理员操作日志保留', restored.adminLogs.length === data.adminLogs.length)
  check('信誉档案分数一致', restored.reputations.find((item) => item.userId === 'u-third')?.score === score(data, 'u-third'))
  check('申诉处理状态保留', restored.appeals.some((item) => item.status === 'approved'))
}

section('14. 原有拼车、群聊、物流与地址功能仍然可用')
{
  const fresh = createInitialData()
  check('预置拼车数量不变', fresh.carpools.length === 4)
  check('预置群聊仍然存在', fresh.chats.some((chat) => chat.carpoolId === 'car-plush'))
  check('国际物流仍然可以查看', fresh.internationalShipments.some((item) => item.carpoolId === 'car-plush'))
  check('地址簿仍然保留', fresh.savedAddresses.length === 5)
  check('信誉档案为每位用户初始化', fresh.reputations.length === fresh.users.length)
}

console.log(`\n${failures === 0 ? '全部通过' : '存在失败'}：${checks - failures}/${checks} 项检查通过`)
if (failures > 0) process.exit(1)
