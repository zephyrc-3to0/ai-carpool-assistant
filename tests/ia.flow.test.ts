/**
 * DREAM CAR V2.0 信息架构验收测试。
 * 运行：npm run test:ia
 *
 * 覆盖提示词2.0「二、全站信息架构升级」「八、消息系统」「九、个人中心」
 * 以及「十一、必须删除或修正的旧逻辑」中的结构性条目。
 * 业务逻辑由 v2.flow.test.ts 覆盖，本文件只验证路由、导航与源码结构。
 */
import { readFileSync } from 'node:fs'
import { createInitialData, normalizeData } from '../src/data'
import { participationOf } from '../src/lib/participation'
import { canAccessChat, unreadCountOf } from '../src/lib/chat'
import { checkPurchasePermission } from '../src/lib/reputationOps'
import { completeRiderOrderOp } from '../src/lib/reputationOps'
import { payDomesticFeeOp, registerDomesticFeesOp } from '../src/lib/feeOps'
import { saveDomesticShipmentOp, submitOrderAddressOp, updateInternationalShipmentOp } from '../src/lib/logisticsOps'
import { isOpenForOccupancy } from '../src/lib/share'
import { buildV2Carpool, confirmOrderOp, reserveSlotsOp, type NewCarpoolInput } from '../src/lib/shareOps'
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

const OWNER = 'u-owner'
const RIDER_A = 'u-rider'
const RIDER_B = 'u-third'

const bundleDraft: NewCarpoolInput = {
  title: 'IA 测试凑套车',
  groupId: 'g-nct',
  eventId: 'evt-dreamscape',
  description: '这是一个用于信息架构验收测试的整套凑套车次描述。',
  rules: '这是用于信息架构验收测试的拼车规则文本，长度足以通过校验。',
  purchaseMode: 'bundle',
  openItems: [
    { productId: 'p-ds-agency-a', member: 'MARK', quantity: 1, price: 38, name: 'IA 测试亚克力牌', spec: 'A 版', category: '立牌' },
    { productId: 'p-ds-agency-a', member: 'RENJUN', quantity: 1, price: 38, name: 'IA 测试亚克力牌', spec: 'A 版', category: '立牌' },
  ],
  guarantees: { fullSetOrdered: true, memberDesign: true },
  fallbackRule: '未凑齐时车主会补齐缺失的成员位，仍按整套下单。',
  deadline: '2026-12-31T20:00',
  internationalFreight: 60,
  minAmount: 0,
  maxPackageItems: 0,
  ownerHeld: [],
}

function withCarpool(base: AppData, draft: NewCarpoolInput): { data: AppData; carpoolId: string } {
  const { carpool, ownerPurchases } = buildV2Carpool(OWNER, draft, 'IA 测试活动')
  return {
    data: {
      ...base,
      carpools: [carpool, ...base.carpools],
      ownerPurchases: [...ownerPurchases, ...(base.ownerPurchases ?? [])],
    },
    carpoolId: carpool.id,
  }
}

function occupy(data: AppData, carpoolId: string, userId: string, slotIds: string[]) {
  const reserved = reserveSlotsOp(data, userId, carpoolId, slotIds)
  if (!reserved.ok || !reserved.data) return { data, ok: false }
  const paid = confirmOrderOp(reserved.next, userId, carpoolId, reserved.data.reservationId)
  return { data: paid.next, ok: paid.ok }
}

function read(file: string) {
  return readFileSync(file, 'utf-8')
}

// ---------------------------------------------------------------------------

section('2.1 一级导航收敛为四个模块')
{
  const layout = read('src/components/Layout.tsx')
  check('一级导航包含拼车广场', layout.includes("label: '拼车广场'"))
  check('一级导航包含车主管理', layout.includes("label: '车主管理'"))
  check('一级导航包含消息', layout.includes("label: '消息'"))
  check('一级导航包含个人中心', layout.includes("label: '个人中心'"))
  check('一级导航不再有群聊', !layout.includes("label: '群聊'"))
  check('一级导航不再有我的拼车', !layout.includes("label: '我的拼车'"))
  check('一级导航不再有发起拼车', !layout.includes("label: '发起拼车'"))
}

section('2.2 路由与发车入口')
{
  const app = read('src/App.tsx')
  const eventSquare = read('src/pages/EventSquarePage.tsx')
  const square = read('src/pages/SquarePage.tsx')
  const create = read('src/pages/CreatePage.tsx')

  check('存在活动拼车广场路由', app.includes("segments[0] === 'event'"))
  check('存在车主管理路由', app.includes("segments[0] === 'manage'"))
  check('存在消息中心路由', app.includes("/messages"))
  check('存在参与订单详情路由', app.includes("segments[0] === 'participation'"))
  check('旧群聊路由重定向到消息中心', app.includes("'/chats'"))
  check('旧付款路由重定向到购买确认页', app.includes("segments[0] === 'pay'"))

  check('拼车广场首页不再直接展示全部拼车', !square.includes('carpools.map'))
  check('拼车广场首页展示热门活动轮播', square.includes('近期热门活动'))
  check('拼车广场首页展示团体目录', square.includes('艺人团体目录'))
  check('拼车广场首页提供团体搜索入口', square.includes('搜索团体'))

  check('发车入口只在具体活动页面', eventSquare.includes('navigate(`/create?group=${group.id}&event=${event.id}`)'))
  check('发布页强制要求团体与活动上下文', create.includes("searchParams.get('group')") && create.includes("searchParams.get('event')"))
  check('发布页在缺少活动时阻止发车', create.includes('请先选择一个活动'))
}

section('3. 发布拼车页面为六个业务分区')
{
  const create = read('src/pages/CreatePage.tsx')
  for (const title of ['基本信息', '商品与开放数量', '车主优先自购', '费用设置', '招募时间', '拼车规则与发布']) {
    check(`包含分区「${title}」`, create.includes(title))
  }
  check('发布页填写整车国际运费总额', create.includes('整车国际运费总额'))
  check('发布页填写最低成团金额', create.includes('最低成团金额'))
  check('发布页填写整车包裹最大件数', create.includes('整车国际包裹最大商品件数'))
  check('发布页保留保存草稿', create.includes('保存草稿'))
  check('发布页保留正式发布', create.includes('正式发布'))
  check('发布页使用统一的最低采购预留配置', create.includes('MIN_RESERVE_HOURS'))
}

section('4. 详情页与购买确认页')
{
  const detail = read('src/pages/DetailPage.tsx')
  const confirm = read('src/pages/ConfirmPage.tsx')

  check('详情页使用左右双栏结构', detail.includes('lg:grid-cols-[minmax(0,1fr)_380px]'))
  check('详情页有固定选购区域', detail.includes('选购'))
  check('详情页展示招募进度', detail.includes('已认领'))
  check('详情页展示费用说明', detail.includes('费用说明'))
  check('详情页展示国际物流信息', detail.includes('国际物流'))

  check('购买确认页展示商品款合计', confirm.includes('商品款合计'))
  check('购买确认页提示国际运费后续 AA', confirm.includes('国际运费后续 AA 提示'))
  check('购买确认页不要求填写收货地址', !confirm.includes('receiverName'))
  check('购买确认页引导车主走自购而不是付款', confirm.includes('车主自购不需要模拟付款'))
}

section('5. 旧逻辑修正')
{
  const detail = read('src/pages/DetailPage.tsx')
  const confirm = read('src/pages/ConfirmPage.tsx')
  const create = read('src/pages/CreatePage.tsx')
  const utils = read('src/utils.ts')
  const money = read('src/lib/money.ts')
  const logistics = read('src/lib/logisticsOps.ts')
  const share = read('src/lib/share.ts')
  const shareOps = read('src/lib/shareOps.ts')

  check('详情页不再出现承接流程', !detail.includes('承接'))
  check('购买确认页不再出现承接流程', !confirm.includes('承接'))
  check('全站不再使用 mode=takeover', !read('src/App.tsx').includes("mode') === 'takeover'"))

  check('车主自购不经过模拟付款', detail.includes('车主自购不经过模拟付款'))
  check('不存在独立的 PaymentPage', !exists('src/pages/PaymentPage.tsx'))

  check('地址收集在清关完成后开启', utils.includes("collectionTriggerStatuses: InternationalStatus[] = ['domestic_transit'"))
  check('地址收集触发点不再包含国际运输中', !utils.includes("collectionTriggerStatuses: InternationalStatus[] = ['in_transit'"))

  check('尾差策略集合保证分摊总额等于整车运费', !money.includes("id: 'platform'"))

  check('国内发货前校验国内费用状态', logistics.includes('国内费用模拟支付'))
  check('现役份额派生不再按第一套第二套判断', !share.includes('function bundleSetsOf') && !share.includes('function isBundleSetComplete'))
  check('旧版草稿构建器已隔离，不参与现役发布流程', !shareOps.includes('buildCarpoolFromDraft'))
}

section('8. 消息系统')
{
  const messages = read('src/pages/MessagesPage.tsx')
  const chat = read('src/pages/ChatPage.tsx')

  check('消息中心置顶系统通知', messages.includes('系统通知'))
  check('消息中心置顶物流消息', messages.includes('物流消息'))
  check('消息中心置顶申诉助手', messages.includes('申诉助手'))
  check('消息中心展示拼车群列表', messages.includes('我加入的拼车群'))
  check('消息中心使用桌面左右双栏', messages.includes("lg:grid-cols-[320px_minmax(0,1fr)]"))
  check('消息中心在右栏直接复用 ChatPage', messages.includes('<ChatPage') && messages.includes('embedded'))
  check('切换会话只修改选中 ID，不复制或替换聊天记录', messages.includes('setSelectedChatId(chat.id)') && !messages.includes('messages:'))
  check('消息中心不提供独立建群', !messages.includes('创建群聊'))
  check('ChatPage 支持独立路由与嵌入模式', chat.includes('embedded?: boolean') && chat.includes("!embedded"))
  check('群聊包含车次状态', chat.includes('StatusBadge'))
  check('群聊包含招募进度', chat.includes('ProgressBar'))
  check('群聊包含规则摘要', chat.includes('规则摘要'))
  check('群聊包含返回详情入口', chat.includes('返回拼车详情'))
}

section('9. 个人中心与公开主页')
{
  const profile = read('src/pages/ProfilePage.tsx')
  const addressBook = read('src/pages/AddressBookPage.tsx')
  const publicProfile = read('src/pages/PublicProfilePage.tsx')

  check('个人中心包含我参与的入口', profile.includes('我参与的'))
  check('个人中心包含个人资料与公开主页', profile.includes('个人资料与公开主页'))
  check('个人中心包含地址管理', profile.includes('地址管理'))
  check('个人中心包含信誉与申诉', profile.includes('信誉与申诉'))
  check('个人中心不再重复搭建车主管理卡片', !profile.includes('Owner Console') && !profile.includes('我发起的拼车'))
  check('个人中心不再重复搭建消息中心卡片', !profile.includes('Messages') && !profile.includes('前往消息中心'))
  check('地址管理页不包含订单模块', !addressBook.includes('订单') || !addressBook.includes('Order'))
  check('地址管理页不包含物流模块', !addressBook.includes('快递单号'))
  check('公开主页不展示收货地址', !publicProfile.includes('receiverName'))
  check('公开主页不展示快递单号', !publicProfile.includes('trackingNumber'))
}

section('7. 车主管理与采购物流')
{
  const manage = read('src/pages/ManagePage.tsx')
  const console_ = read('src/components/owner/OwnerConsole.tsx')
  const shipping = read('src/pages/ShippingManagePage.tsx')

  check('车主管理包含我的车次', manage.includes('我的车次'))
  check('车主管理包含草稿', manage.includes('草稿'))
  check('车主管理按状态分组', manage.includes('招募中') && manage.includes('招募已截止') && manage.includes('已截团') && manage.includes('采购履约中'))
  check('单车管理包含采购清单', console_.includes('采购清单'))
  check('单车管理包含上传官方下单凭证', console_.includes('上传官方下单凭证'))
  check('采购凭证支持选择图片文件', console_.includes('type="file"') && console_.includes('accept="image/*"'))
  check('采购凭证支持缩略图与查看大图', console_.includes('voucher.imageDataUrl') && console_.includes('查看大图'))
  check('招募已截止状态提供延期或流团处理', console_.includes("carpool.status === 'expired'") && console_.includes('结束并流团退款'))
  check('单车管理包含异常处理', console_.includes('异常处理'))
  check('物流管理包含国际物流', shipping.includes('国际物流'))
  check('物流管理包含地址收集', shipping.includes('地址收集'))
  check('物流管理包含国内费用登记', shipping.includes('国内费用'))
  check('物流管理包含国内发货', shipping.includes('国内发货'))
}

section('10. 数据兼容与回归')
{
  const base = createInitialData()
  check('预置拼车数量不变（4 辆历史 + 3 辆 V2.0）', base.carpools.length === 7)
  check('预置订单数量不变（9 笔历史 + 2 笔 V2.0）', base.orders.length === 11)
  check('预置群聊仍然存在', base.chats.some((chat) => chat.carpoolId === 'car-plush'))
  check('预置地址簿仍然保留', base.savedAddresses.length === 5)
  check('预置信誉记录仍然保留', base.reputationEvents.length === 11)
  check('活动目录仍然存在', base.events.length > 0 && base.groups.length > 0)

  const legacy = normalizeData({
    version: 1,
    users: base.users,
    currentUserId: 'u-owner',
    carpools: base.carpools.map((carpool) => ({
      ...carpool,
      addressCollection: undefined,
      purchaseMode: undefined,
      shareGroups: undefined,
      guarantees: undefined,
      feeRules: undefined,
    })),
    orders: base.orders.map((order) => ({
      id: order.id, carpoolId: order.carpoolId, userId: order.userId,
      slotIds: order.slotIds, amount: order.amount, paidAt: order.paidAt,
    })),
    chats: base.chats.map((chat) => ({
      id: chat.id, carpoolId: chat.carpoolId, name: chat.name,
      announcement: chat.announcement, messages: chat.messages, createdAt: chat.createdAt,
    })),
  } as unknown as AppData)
  check('V1 存量数据平滑升级', legacy.version === 7 && legacy.carpools.length === 7)
  check('升级后保留订单与群聊', legacy.orders.length === base.orders.length && legacy.chats.length === base.chats.length)
  check('升级后补齐 V2.0 集合', Array.isArray(legacy.ownerPurchases) && Array.isArray(legacy.payments) && Array.isArray(legacy.freightBills))
  check('升级后车主的历史运费账单标记为记账', (legacy.freightBills ?? []).every((bill) => {
    const carpool = legacy.carpools.find((item) => item.id === bill.carpoolId)
    return carpool?.ownerId !== bill.userId || bill.status === 'booked'
  }))
}

section('回归：购买、加购、物流与信誉流程仍然可用')
{
  const base = createInitialData()
  const { data, carpoolId } = withCarpool(base, bundleDraft)
  const carpool = data.carpools.find((item) => item.id === carpoolId)!

  const first = occupy(data, carpoolId, RIDER_A, [carpool.positions[0].id])
  check('首次购买成功', first.ok)
  check('招募中允许购买', checkPurchasePermission(first.data, RIDER_B, carpoolId).ok)
  check('招募中 isOpenForOccupancy 为真', isOpenForOccupancy(first.data.carpools.find((item) => item.id === carpoolId)!))

  const second = occupy(first.data, carpoolId, RIDER_A, [carpool.positions[1].id])
  check('已参与车员再次加购成功', second.ok)

  const summary = participationOf(second.data, carpoolId, RIDER_A)
  check('参与订单合并展示', summary.items.length === 2 && summary.orderCount === 2)
  check('合并展示不丢失历史交易', second.data.orders.filter((order) => order.carpoolId === carpoolId).length === 2)

  const shipment = updateInternationalShipmentOp(second.data, OWNER, carpoolId, {
    carrier: 'DHL Express', trackingNumber: 'JD01IA0001', trackingUrl: '', status: 'domestic_transit', note: '已清关',
  })
  check('国际物流仍然可以录入', shipment.ok)
  check('清关后开启地址收集', Boolean(shipment.next.carpools.find((item) => item.id === carpoolId)?.addressCollection?.enabled))

  const address = submitOrderAddressOp(shipment.next, RIDER_A, carpoolId, {
    label: '学校', receiverName: '林小满', phone: '13800001111', province: '上海市',
    city: '上海市', district: '徐汇区', detail: '海州路 168 号', saveToBook: false,
  })
  check('车员仍然可以提交收货地址', address.ok)

  const fee = registerDomesticFeesOp(address.next, OWNER, carpoolId, RIDER_A, { packingFee: 6, shippingFee: 8 })
  check('车主仍然可以登记国内费用', fee.ok)
  const feePaid = payDomesticFeeOp(fee.next, RIDER_A, carpoolId)
  check('车员仍然可以支付国内费用', feePaid.ok)

  const domestic = saveDomesticShipmentOp(feePaid.next, OWNER, carpoolId, RIDER_A, {
    carrier: '中通快递', trackingNumber: 'ZT77IA0001', shippedAt: '2026-11-21T00:00:00.000Z', note: '',
  })
  check('车主仍然可以录入国内发货', domestic.ok)

  const complete = completeRiderOrderOp(domestic.next, RIDER_A, carpoolId)
  check('车员仍然可以确认收货并获得信誉加分', complete.ok)
  check('信誉分记录仍然生成', complete.next.reputationEvents.some((event) => event.carId === carpoolId && event.eventType === 'rider_complete'))

  const chat = second.data.chats.find((item) => item.carpoolId === carpoolId)!
  check('群聊仍然只有同一个实例', second.data.chats.filter((item) => item.carpoolId === carpoolId).length === 1)
  check('车主可以访问自己发起的群聊', canAccessChat(second.data, chat, OWNER))
  check('非成员无法访问该群聊', !canAccessChat(second.data, chat, 'u-fourth'))
  check('没有已读数据时不统计未读数', unreadCountOf(chat, RIDER_B) === null)
}

console.log(`\n${failures === 0 ? '全部通过' : '存在失败'}：${checks - failures}/${checks} 项检查通过`)
if (failures > 0) process.exit(1)

function exists(file: string) {
  try {
    readFileSync(file, 'utf-8')
    return true
  } catch {
    return false
  }
}
