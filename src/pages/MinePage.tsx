import { useState } from 'react'
import { CarpoolCard } from '../components/CarpoolCard'
import { Button, Card, EmptyState, PageHeader, cn } from '../components/UI'
import { useAppStore } from '../store'
import { navigate } from '../utils'
import { getOrderAddress } from '../lib/logistics'

type Tab = 'joined' | 'created'

export function MinePage() {
  const { data, currentUser } = useAppStore()
  const [tab, setTab] = useState<Tab>('joined')

  const joined = data.carpools.filter((carpool) => carpool.positions.some((slot) => slot.occupantId === currentUser.id))
  const created = data.carpools.filter((carpool) => carpool.ownerId === currentUser.id)
  const list = tab === 'joined' ? joined : created

  return (
    <>
      <PageHeader
        eyebrow="My Carpools"
        title="我的拼车"
        description={`当前以“${currentUser.nickname}”身份查看，切换顶部模拟账号可体验不同成员的数据。`}
        action={<Button onClick={() => navigate('/create')}>发起拼车</Button>}
      />

      <div className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-fit" role="tablist" aria-label="我的拼车分类">
        <button
          role="tab"
          aria-selected={tab === 'joined'}
          onClick={() => setTab('joined')}
          className={cn('min-h-10 flex-1 rounded-lg px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 sm:flex-none', tab === 'joined' ? 'bg-primary text-white shadow-button' : 'text-muted hover:bg-slate-50 hover:text-ink')}
        >
          我加入的 <span className={cn('ml-1 text-xs', tab === 'joined' ? 'text-white/70' : 'text-slate-400')}>{joined.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'created'}
          onClick={() => setTab('created')}
          className={cn('min-h-10 flex-1 rounded-lg px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 sm:flex-none', tab === 'created' ? 'bg-primary text-white shadow-button' : 'text-muted hover:bg-slate-50 hover:text-ink')}
        >
          我发起的 <span className={cn('ml-1 text-xs', tab === 'created' ? 'text-white/70' : 'text-slate-400')}>{created.length}</span>
        </button>
      </div>

      {list.length ? (
        <div className="space-y-5">
          {list.map((carpool) => {
            const chat = data.chats.find((item) => item.carpoolId === carpool.id)
            const isRider = carpool.positions.some((slot) => slot.occupantId === currentUser.id)
            const isOwner = carpool.ownerId === currentUser.id
            const isMember = isOwner || isRider
            const address = isRider ? getOrderAddress(data, carpool.id, currentUser.id) : undefined
            const needAddress = Boolean(isRider && carpool.addressCollection?.enabled && address?.status !== 'submitted')
            const isOverdue = address?.status === 'overdue'

            return (
              <div key={carpool.id} className="space-y-3">
                <CarpoolCard
                  carpool={carpool}
                  compact
                  extraAction={
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {carpool.status === 'formed' && chat && isMember ? (
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/chat/${chat.id}`)}>进入群聊</Button>
                      ) : null}
                      {carpool.status === 'formed' && isOwner ? (
                        <Button size="sm" variant="secondary" onClick={() => navigate(`/shipping/manage/${carpool.id}`)}>物流管理</Button>
                      ) : null}
                      {carpool.status === 'formed' && isRider ? (
                        <Button size="sm" variant="secondary" onClick={() => navigate(`/shipping/${carpool.id}`)}>查看物流</Button>
                      ) : null}
                    </div>
                  }
                />

                {needAddress && (
                  <Card className={cn('flex flex-wrap items-center gap-3 p-4 sm:p-5', isOverdue ? 'border-danger/20 bg-dangerSoft' : 'border-amber-200 bg-amber-50')}>
                    <span className={cn('grid h-10 w-10 flex-none place-items-center rounded-xl text-sm font-black', isOverdue ? 'bg-danger text-white' : 'bg-amber-500 text-white')} aria-hidden="true">
                      {isOverdue ? '!' : '📍'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm font-bold', isOverdue ? 'text-danger' : 'text-amber-800')}>
                        {isOverdue ? '逾期未提交收货地址' : '待补充收货地址'}
                      </p>
                      <p className={cn('mt-1 text-xs leading-5', isOverdue ? 'text-danger/80' : 'text-amber-700')}>
                        「{carpool.title}」已进入国际运输，提交收货地址后车主才能为你打包发货。
                      </p>
                    </div>
                    <Button size="sm" onClick={() => navigate(`/shipping/address/${carpool.id}`)}>
                      {isOverdue ? '逾期补交地址' : '填写收货地址'}
                    </Button>
                  </Card>
                )}

                {isRider && address?.status === 'submitted' && carpool.addressCollection?.enabled && (
                  <Card className="flex flex-wrap items-center gap-3 border-success/20 bg-successSoft p-4 sm:p-5">
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-success text-sm font-black text-white" aria-hidden="true">✓</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-success">收货地址已提交</p>
                      <p className="mt-1 truncate text-xs text-success/80">{address.receiverName} · {address.phone} · {address.province}{address.city}{address.district}{address.detail}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/shipping/${carpool.id}`)}>查看物流</Button>
                  </Card>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title={tab === 'joined' ? '还没有加入拼车' : '还没有发起拼车'}
          description={tab === 'joined' ? '去广场选择喜欢的商品位置，完成模拟支付后会显示在这里。' : '填写商品和开放位置，发布你的第一辆拼车。'}
          action={<Button onClick={() => navigate(tab === 'joined' ? '/' : '/create')}>{tab === 'joined' ? '去拼车广场' : '发起拼车'}</Button>}
        />
      )}
    </>
  )
}
