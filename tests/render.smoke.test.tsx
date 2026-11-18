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

const wrap = (children: ReactNode) => createElement(
  ToastProvider,
  null,
  createElement(AppStoreProvider, null, children),
)

const cases: Array<{ name: string; currentUserId: string; element: ReactNode; expect: string; adminMode?: boolean }> = [
  { name: '个人中心', currentUserId: 'u-owner', element: createElement(ProfilePage), expect: '我的信誉' },
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
]

let failures = 0
for (const item of cases) {
  store[STORAGE_KEY] = JSON.stringify({ ...createInitialData(), currentUserId: item.currentUserId, adminMode: item.adminMode ?? false })
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
