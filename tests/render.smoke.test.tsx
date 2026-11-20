/**
 * 页面渲染冒烟测试：确保 V1.1 / V1.2 新增页面在真实数据下可以正常渲染，不抛异常。
 * 运行：npm run test:render
 */
import { renderToString } from 'react-dom/server'
import { createElement, type ReactNode } from 'react'
import { AppStoreProvider } from '../src/store'
import { ToastProvider } from '../src/components/Toast'
import { AddressBookPage } from '../src/pages/AddressBookPage'
import { AdminPage } from '../src/pages/AdminPage'
import { ComplaintsPage } from '../src/pages/ComplaintsPage'
import { CreatePage } from '../src/pages/CreatePage'
import { MessagesPage } from '../src/pages/MessagesPage'
import { ConfirmPage } from '../src/pages/ConfirmPage'
import { MinePage } from '../src/pages/MinePage'
import { EventSquarePage } from '../src/pages/EventSquarePage'
import { ParticipationPage } from '../src/pages/ParticipationPage'
import { ManagePage } from '../src/pages/ManagePage'
import { NotificationsPage } from '../src/pages/NotificationsPage'
import { ProfilePage } from '../src/pages/ProfilePage'
import { PublicProfilePage } from '../src/pages/PublicProfilePage'
import { ReputationPage } from '../src/pages/ReputationPage'
import { ReputationRulesPage } from '../src/pages/ReputationRulesPage'
import { ShippingAddressPage } from '../src/pages/ShippingAddressPage'
import { ShippingManagePage } from '../src/pages/ShippingManagePage'
import { ShippingTrackPage } from '../src/pages/ShippingTrackPage'
import { createInitialData, STORAGE_KEY } from '../src/data'

const store: Record<string, string> = {}
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
  },
  configurable: true,
})

// V2.0 的发布页依赖 hash 路由参数（团体 / 活动），冒烟测试需要提供最小 window 模拟
let currentHash = '#/'
Object.defineProperty(globalThis, 'window', {
  value: {
    get location() {
      return { hash: currentHash, pathname: '/', search: '' }
    },
    set location(value: { hash: string; pathname?: string; search?: string }) {
      currentHash = value.hash
    },
  },
  configurable: true,
})

const wrap = (children: ReactNode) => createElement(
  ToastProvider,
  null,
  createElement(AppStoreProvider, null, children),
)

const cases: Array<{ name: string; currentUserId: string; element: ReactNode; expect: string; adminMode?: boolean; hash?: string }> = [
  { name: '个人中心', currentUserId: 'u-owner', element: createElement(ProfilePage), expect: '信誉与申诉' },
  { name: '我的地址', currentUserId: 'u-owner', element: createElement(AddressBookPage), expect: '地址簿' },
  { name: '站内通知', currentUserId: 'u-owner', element: createElement(NotificationsPage), expect: '请补充收货地址' },
  { name: '车主物流管理', currentUserId: 'u-fourth', element: createElement(ShippingManagePage, { carpoolId: 'car-plush' }), expect: '国际物流' },
  { name: '车员查看物流', currentUserId: 'u-owner', element: createElement(ShippingTrackPage, { carpoolId: 'car-plush' }), expect: '履约确认' },
  { name: '车员填写地址', currentUserId: 'u-owner', element: createElement(ShippingAddressPage, { carpoolId: 'car-plush' }), expect: '使用已保存地址' },
  { name: '公开用户主页', currentUserId: 'u-owner', element: createElement(PublicProfilePage, { userId: 'u-rider' }), expect: '历史拼车记录' },
  { name: '我的信誉', currentUserId: 'u-third', element: createElement(ReputationPage), expect: '当前功能受限' },
  { name: '信誉规则', currentUserId: 'u-owner', element: createElement(ReputationRulesPage), expect: '信誉等级与可用权限' },
  { name: '投诉与申诉', currentUserId: 'u-owner', element: createElement(ComplaintsPage), expect: '提交投诉' },
  { name: '模拟管理员后台', currentUserId: 'u-owner', element: createElement(AdminPage), expect: '待审核投诉', adminMode: true },
  { name: '占位确认页（普通拼邮）', currentUserId: 'u-rider', element: createElement(ConfirmPage, { carpoolId: 'car-photocard', slotIds: ['pc-renjun-1'] }), expect: '未凑齐 / 未成团时的处理' },
  { name: '占位确认页（整套凑套）', currentUserId: 'u-rider', element: createElement(ConfirmPage, { carpoolId: 'car-dreamscape', slotIds: ['ds-renjun'] }), expect: '款式保障与交易规则' },
  { name: '发起拼车（普通拼邮）', currentUserId: 'u-owner', element: createElement(CreatePage), expect: '拼车模式', hash: '#/create?group=g-nct&event=evt-dreamscape' },
  { name: '消息中心', currentUserId: 'u-rider', element: createElement(MessagesPage), expect: '我加入的拼车群' },
  { name: '我参与的', currentUserId: 'u-rider', element: createElement(MinePage), expect: '我参与的' },
  { name: '我参与的（车主视角）', currentUserId: 'u-fourth', element: createElement(MinePage), expect: '我参与的' },
  { name: '活动拼车广场', currentUserId: 'u-rider', element: createElement(EventSquarePage, { groupId: 'g-nct', eventId: 'evt-dreamscape' }), expect: '筛选与排序' },
  { name: '参与订单详情', currentUserId: 'u-rider', element: createElement(ParticipationPage, { carpoolId: 'car-v2-freight' }), expect: '国际运费账单' },
  { name: '车主管理（我的车次）', currentUserId: 'u-fourth', element: createElement(ManagePage), expect: '我的车次' },
]

let failures = 0
for (const item of cases) {
  store[STORAGE_KEY] = JSON.stringify({ ...createInitialData(), currentUserId: item.currentUserId, adminMode: item.adminMode ?? false })
  currentHash = item.hash ?? '#/'
  try {
    const html = renderToString(wrap(item.element))
    const ok = html.includes(item.expect)
    console.log(`  ${ok ? '✓' : '✗'} ${item.name}`)
    if (!ok) {
      failures += 1
      console.log(`      未在渲染结果中找到「${item.expect}」`)
    }
  } catch (error) {
    failures += 1
    console.log(`  ✗ ${item.name}：${(error as Error).message}`)
  }
}

console.log(`\n${failures === 0 ? '全部通过' : '存在失败'}：${cases.length - failures}/${cases.length} 个页面渲染正常`)
if (failures > 0) process.exit(1)
