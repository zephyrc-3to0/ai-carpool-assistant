import { useMemo, useState } from 'react'
import { ReputationChip, ReputationLevelBadge } from '../components/Reputation'
import { Avatar, Button, Card, EmptyState, StatusBadge } from '../components/UI'
import { useAppStore } from '../store'
import type { Carpool } from '../types'
import { completedOwnerCount, completedRiderCount, hasFulfillmentRecord } from '../lib/reputation'
import { formatFullDateTime, navigate } from '../utils'
import { cn } from '../components/UI'

type Tab = 'owner' | 'rider'

export function PublicProfilePage({ userId }: { userId: string }) {
  const { data, currentUser } = useAppStore()
  const [tab, setTab] = useState<Tab>('owner')
  const user = data.users.find((item) => item.id === userId)

  const history = useMemo(() => {
    if (!user) return { owner: [] as Carpool[], rider: [] as Carpool[] }
    const owner = data.carpools.filter((carpool) => carpool.ownerId === user.id)
    const rider = data.carpools.filter((carpool) =>
      carpool.ownerId !== user.id && carpool.positions.some((slot) => slot.occupantId === user.id))
    return { owner, rider }
  }, [data.carpools, user])

  if (!user) {
    return (
      <EmptyState
        title="没有找到这位用户"
        description="他可能已经注销或更换了昵称，返回广场看看其他车次。"
        action={<Button onClick={() => navigate('/')}>返回广场</Button>}
      />
    )
  }

  const reputation = data.reputations.find((item) => item.userId === user.id)
    ?? { userId: user.id, score: 100, level: 'excellent' as const, updatedAt: '' }
  const ownerCount = completedOwnerCount(data, user.id)
  const riderCount = completedRiderCount(data, user.id)
  const hasRecord = hasFulfillmentRecord(data, user.id)
  const isSelf = user.id === currentUser.id
  const list = tab === 'owner' ? history.owner : history.rider

  return (
    <>
      <button
        className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
        onClick={() => window.history.back()}
      >
        <span aria-hidden="true">←</span> 返回
      </button>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar user={user} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-ink">{user.nickname}</h1>
                  <ReputationLevelBadge level={reputation.level} size="sm" />
                </div>
                <p className="mt-2 text-sm text-muted">
                  {user.province ? `${user.province} · ` : ''}
                  {user.joinedAt ? `加入平台于 ${formatFullDateTime(user.joinedAt)}` : '加入平台时间未知'}
                </p>
                {!hasRecord && (
                  <p className="mt-3 inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-muted">
                    暂无履约记录
                  </p>
                )}
              </div>
              {isSelf && (
                <Button variant="secondary" size="sm" onClick={() => navigate('/reputation')}>我的信誉</Button>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="已完成发车" value={`${ownerCount} 次`} />
              <Stat label="已完成参团" value={`${riderCount} 次`} />
              <Stat label="信誉状态" value={levelLabel(reputation.level)} />
            </div>
          </Card>

          <Card className="p-5 sm:p-7">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">History</p>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-ink">历史拼车记录</h2>
              </div>
              <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="拼车记录角色">
                <button
                  role="tab"
                  aria-selected={tab === 'owner'}
                  onClick={() => setTab('owner')}
                  className={cn('min-h-9 rounded-lg px-3 text-xs font-bold transition', tab === 'owner' ? 'bg-primary text-white shadow-button' : 'text-muted hover:bg-slate-50')}
                >
                  作为车主 {history.owner.length}
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'rider'}
                  onClick={() => setTab('rider')}
                  className={cn('min-h-9 rounded-lg px-3 text-xs font-bold transition', tab === 'rider' ? 'bg-primary text-white shadow-button' : 'text-muted hover:bg-slate-50')}
                >
                  作为车员 {history.rider.length}
                </button>
              </div>
            </div>

            {list.length ? (
              <div className="space-y-3">
                {list.map((carpool) => (
                  <HistoryRow key={carpool.id} carpool={carpool} role={tab} userId={user.id} data={data} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={tab === 'owner' ? '还没有作为车主的拼车记录' : '还没有作为车员的拼车记录'}
                description={tab === 'owner' ? '发起拼车后会在这里展示公开的车次信息。' : '加入拼车后会在这里展示公开的车次信息。'}
              />
            )}
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <Card className="p-5">
            <h2 className="font-bold text-ink">信誉状态</h2>
            <div className="mt-3">
              <ReputationChip reputation={reputation} />
            </div>
            <p className="mt-3 text-xs leading-6 text-muted">
              信誉分由平台根据实际履约情况与核实后的违规记录计算，初始 100 分，分数区间 0–100。
            </p>
            <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate('/reputation/rules')}>查看信誉规则</Button>
          </Card>

          <Card className="border-slate-200 bg-slate-50/70 p-5">
            <h2 className="font-bold text-ink">公开信息说明</h2>
            <p className="mt-2 text-xs leading-6 text-muted">
              本主页只展示头像、昵称、所在省份、加入时间、信誉状态与公开的拼车记录，不包含真实姓名、手机号、详细地址、支付信息与个人国内物流单号。
            </p>
          </Card>
        </aside>
      </div>
    </>
  )
}

function levelLabel(level: string) {
  if (level === 'excellent') return '信誉优秀'
  if (level === 'good') return '信誉良好'
  if (level === 'caution') return '信誉观察'
  return '信誉受限'
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-lg font-black tracking-tight text-ink">{value}</p>
    </div>
  )
}

function HistoryRow({ carpool, role, userId, data }: {
  carpool: Carpool
  role: Tab
  userId: string
  data: ReturnType<typeof useAppStore>['data']
}) {
  const completedAt = role === 'owner'
    ? carpool.fulfilledAt
    : data.orders.find((item) => item.carpoolId === carpool.id && item.userId === userId)?.fulfilledAt

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-primary">{carpool.eventName}</p>
        <p className="mt-1 truncate font-bold text-ink">{carpool.title}</p>
        <p className="mt-1 text-xs text-muted">
          {role === 'owner' ? '作为车主' : '作为车员'} · 完成时间：{completedAt ? formatFullDateTime(completedAt) : '尚未完成'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={carpool.status} />
        <Button size="sm" variant="ghost" onClick={() => navigate(`/detail/${carpool.id}`)}>查看车次</Button>
      </div>
    </div>
  )
}
