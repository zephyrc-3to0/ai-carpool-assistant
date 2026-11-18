import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAppStore } from '../store'
import { navigate } from '../utils'
import { Avatar, Button, cn } from './UI'
import { useToast } from './Toast'

const baseNavItems = [
  { label: '拼车广场', path: '/' },
  { label: '发起拼车', path: '/create' },
  { label: '我的拼车', path: '/mine' },
  { label: '车主管理', path: '/manage' },
  { label: '个人中心', path: '/profile' },
]

function isActive(pathname: string, itemPath: string) {
  if (itemPath === '/') return pathname === '/' || pathname.startsWith('/detail/')
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
}

export function Layout({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { data, currentUser, switchUser, setAdminMode } = useAppStore()
  const showToast = useToast()
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const unreadCount = data.notifications.filter((item) => item.userId === currentUser.id && !item.read).length
  const adminMode = Boolean(data.adminMode)
  const navItems = adminMode
    ? [...baseNavItems, { label: '管理员后台', path: '/admin' }]
    : baseNavItems

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const chooseAccount = (userId: string) => {
    const user = data.users.find((item) => item.id === userId)
    if (!user || user.id === currentUser.id) {
      setAccountOpen(false)
      return
    }
    switchUser(userId)
    setAccountOpen(false)
    showToast(`已切换为 ${user.nickname}，现在可以体验另一身份。`, 'success')
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {adminMode && (
        <div className="bg-ink px-4 py-2 text-white sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold tracking-wide">模拟管理员模式</span>
            <span className="text-xs text-white/70">正在演示平台审核界面，处理结果仅用于课程演示。</span>
            <button
              className="ml-auto text-xs font-bold text-white underline underline-offset-2 transition hover:text-white/80"
              onClick={() => {
                setAdminMode(false)
                showToast('已退出演示管理员模式。', 'info')
                navigate('/profile')
              }}
            >
              退出演示管理员模式
            </button>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 sm:px-6 lg:px-8">
          <button className="group flex flex-none items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate('/')} aria-label="返回拼车广场">
            <span className="logo-mark relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-primary text-white shadow-button" aria-hidden="true">
              <span className="h-3.5 w-4 rounded-sm border-2 border-white" />
              <span className="absolute bottom-2.5 left-2 h-1 w-1 rounded-full bg-white" />
              <span className="absolute bottom-2.5 right-2 h-1 w-1 rounded-full bg-white" />
            </span>
            <span className="hidden text-base font-black tracking-tight text-ink sm:inline">搭伴</span>
          </button>

          <nav className="hidden min-w-0 flex-1 items-center gap-1 md:flex" aria-label="主导航">
            {navItems.map((item) => (
              <button
                key={item.path}
                className={cn(
                  'relative min-h-10 rounded-lg px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200',
                  isActive(pathname, item.path) ? 'bg-white text-primary shadow-sm' : 'text-muted hover:bg-white/70 hover:text-ink',
                )}
                onClick={() => navigate(item.path)}
                aria-current={isActive(pathname, item.path) ? 'page' : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div ref={accountRef} className="relative ml-auto flex items-center gap-2">
            <button
              className="relative grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-muted shadow-sm transition hover:border-purple-200 hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
              onClick={() => { setAccountOpen(false); navigate('/notifications') }}
              aria-label={`站内通知${unreadCount > 0 ? `，${unreadCount} 条未读` : ''}`}
            >
              <span className="text-base leading-none" aria-hidden="true">🔔</span>
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <button
              className="flex min-h-11 items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-2.5 text-left shadow-sm transition hover:border-purple-200 hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
              onClick={() => setAccountOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
            >
              <Avatar user={currentUser} />
              <span className="hidden sm:block">
                <span className="block max-w-24 truncate text-xs font-bold text-ink">{currentUser.nickname}</span>
                <span className="block text-[10px] text-muted">模拟账号</span>
              </span>
              <span className={cn('ml-0.5 text-xs text-muted transition-transform', accountOpen && 'rotate-180')} aria-hidden="true">⌄</span>
            </button>

            {accountOpen && (
              <div className="account-menu absolute right-0 top-[calc(100%+10px)] w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-float" role="menu">
                <div className="px-3 py-2">
                  <p className="text-xs font-bold text-ink">切换模拟账号</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted">用于体验车主与车员的完整流程</p>
                </div>
                <div className="mt-1 space-y-1">
                  {data.users.map((user) => (
                    <button
                      key={user.id}
                      role="menuitemradio"
                      aria-checked={user.id === currentUser.id}
                      onClick={() => chooseAccount(user.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-100',
                        user.id === currentUser.id && 'bg-purple-50',
                      )}
                    >
                      <Avatar user={user} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{user.nickname}</span>
                      {user.id === currentUser.id && <span className="text-xs font-bold text-primary">当前</span>}
                    </button>
                  ))}
                </div>
                <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                  <button
                    role="menuitem"
                    onClick={() => { setAccountOpen(false); navigate('/notifications') }}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-ink transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-100"
                  >
                    站内通知
                    {unreadCount > 0 && <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">{unreadCount}</span>}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setAccountOpen(false); navigate('/reputation') }}
                    className="flex w-full items-center rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-ink transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-100"
                  >
                    我的信誉
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setAccountOpen(false); navigate('/addresses') }}
                    className="flex w-full items-center rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-ink transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-100"
                  >
                    我的地址
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false)
                      setAdminMode(!adminMode)
                      showToast(adminMode ? '已退出演示管理员模式。' : '已进入演示管理员模式。', 'info')
                      if (!adminMode) navigate('/admin')
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-ink transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-100"
                  >
                    演示管理员模式
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${adminMode ? 'bg-ink text-white' : 'bg-slate-100 text-muted'}`}>
                      {adminMode ? '已开启' : '未开启'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="no-scrollbar flex gap-1 overflow-x-auto border-t border-slate-200/70 px-3 py-2 md:hidden" aria-label="移动端主导航">
          {navItems.map((item) => (
            <button
              key={item.path}
              className={cn(
                'min-h-9 flex-none rounded-lg px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200',
                isActive(pathname, item.path) ? 'bg-white text-primary shadow-sm' : 'text-muted',
              )}
              onClick={() => navigate(item.path)}
              aria-current={isActive(pathname, item.path) ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        {children}
      </main>

      <footer className="mx-auto mt-6 max-w-7xl border-t border-slate-200 px-4 py-8 text-center text-xs leading-5 text-muted sm:px-6 lg:px-8">
        课程演示项目 · 所有拼车与支付数据均为本地模拟，不代表真实活动信息
      </footer>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center text-center">
      <span className="mb-5 text-6xl font-black tracking-tighter text-purple-200">404</span>
      <h1 className="text-2xl font-bold text-ink">页面走丢了</h1>
      <p className="mt-3 text-sm leading-6 text-muted">这个地址不存在，返回拼车广场继续看看吧。</p>
      <Button className="mt-6" onClick={() => navigate('/')}>返回广场</Button>
    </div>
  )
}
