import { useMemo, useState } from 'react'
import { Avatar, Button, Card, EmptyState, InfoRow, PageHeader, ProgressBar, StatusBadge } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import type { User } from '../types'
import { formatFullDateTime, internationalStatusText, money, navigate } from '../utils'
import { getInternationalShipment, getOrderAddress } from '../lib/logistics'

export function ManagePage({ carpoolId }: { carpoolId?: string }) {
  const { data, currentUser } = useAppStore()
  const owned = data.carpools.filter((carpool) => carpool.ownerId === currentUser.id)

  if (carpoolId) return <ManageDetail carpoolId={carpoolId} />

  return (
    <>
      <PageHeader
        eyebrow="Owner Console"
        title="车主管理"
        description={`查看“${currentUser.nickname}”发起的车次、成员名单与拼车进度。`}
        action={<Button onClick={() => navigate('/create')}>发起新拼车</Button>}
      />

      {owned.length ? (
        <div className="space-y-4">
          {owned.map((carpool) => {
            const occupied = carpool.positions.filter((slot) => slot.occupantId).length
            const members = new Set(carpool.positions.map((slot) => slot.occupantId).filter(Boolean)).size
            const chat = data.chats.find((item) => item.carpoolId === carpool.id)
            return (
              <Card key={carpool.id} className="p-5 sm:p-6">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={carpool.status} />
                      <span className="text-xs text-muted">{formatFullDateTime(carpool.deadline)} 截单</span>
                    </div>
                    <button className="mt-3 block max-w-full text-left text-lg font-bold leading-7 text-ink transition hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate(`/manage/${carpool.id}`)}>{carpool.title}</button>
                    <p className="mt-1 text-sm text-muted">{carpool.productName} · {money(carpool.price)} / 位置</p>
                  </div>
                  <div>
                    <ProgressBar used={occupied} total={carpool.positions.length} />
                    <p className="mt-2 text-xs text-muted">{members} 位车员已加入</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button variant="secondary" onClick={() => navigate(`/manage/${carpool.id}`)}>管理车次</Button>
                    {carpool.status === 'formed' && <Button variant="secondary" onClick={() => navigate(`/shipping/manage/${carpool.id}`)}>物流管理</Button>}
                    {carpool.status === 'formed' && chat && <Button onClick={() => navigate(`/chat/${chat.id}`)}>进入群聊</Button>}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState title="还没有可管理的拼车" description="发起拼车后，可以在这里查看车员、位置和拼车进度。" action={<Button onClick={() => navigate('/create')}>发起第一辆拼车</Button>} />
      )}
    </>
  )
}

function ManageDetail({ carpoolId }: { carpoolId: string }) {
  const { data, currentUser, confirmFormed, completeOwnerFulfillment } = useAppStore()
  const showToast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const carpool = data.carpools.find((item) => item.id === carpoolId)

  const memberGroups = useMemo(() => {
    if (!carpool) return []
    const grouped = new Map<string, string[]>()
    carpool.positions.forEach((slot) => {
      if (!slot.occupantId) return
      grouped.set(slot.occupantId, [...(grouped.get(slot.occupantId) ?? []), slot.label])
    })
    const result: Array<{ user: User; positions: string[] }> = []
    grouped.forEach((positions, userId) => {
      const user = data.users.find((item) => item.id === userId)
      if (user) result.push({ user, positions })
    })
    return result
  }, [carpool, data.users])

  if (!carpool) {
    return <EmptyState title="没有找到这辆拼车" description="返回管理页查看你发起的其他车次。" action={<Button onClick={() => navigate('/manage')}>返回车主管理</Button>} />
  }
  if (carpool.ownerId !== currentUser.id) {
    return <EmptyState title="你不是这辆车的车主" description="切换到对应的模拟账号后，才可以查看车员名单和确认拼成。" action={<Button onClick={() => navigate(`/detail/${carpool.id}`)}>查看车次详情</Button>} />
  }

  const occupied = carpool.positions.filter((slot) => slot.occupantId).length
  const available = carpool.positions.length - occupied
  const chat = data.chats.find((item) => item.carpoolId === carpool.id)
  const shipment = getInternationalShipment(data, carpool.id)
  const addressSubmitted = memberGroups.filter(({ user }) => getOrderAddress(data, carpool.id, user.id)?.status === 'submitted').length
  const riderOrders = data.orders.filter((order) => order.carpoolId === carpool.id && order.userId !== carpool.ownerId)
  const fulfilledRiders = riderOrders.filter((order) => order.fulfillmentStatus === 'completed').length
  const allRidersFulfilled = riderOrders.length > 0 && fulfilledRiders === riderOrders.length

  const submitConfirm = () => {
    setConfirming(true)
    window.setTimeout(() => {
      const result = confirmFormed(carpool.id)
      setConfirming(false)
      setConfirmOpen(false)
      showToast(result.message, result.ok ? 'success' : 'error')
      if (result.ok && result.data) navigate(`/chat/${result.data.id}`)
    }, 700)
  }

  return (
    <>
      <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate('/manage')}>
        <span aria-hidden="true">←</span> 返回车主管理
      </button>

      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2"><StatusBadge status={carpool.status} /><span className="text-xs text-muted">车次管理</span></div>
          <h1 className="text-balance text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">{carpool.title}</h1>
          <p className="mt-3 text-sm leading-6 text-muted">{carpool.eventName} · {carpool.productName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate(`/detail/${carpool.id}`)}>查看公开详情</Button>
          {carpool.status !== 'recruiting' && <Button variant="secondary" onClick={() => navigate(`/shipping/manage/${carpool.id}`)}>物流管理</Button>}
          {carpool.status === 'formed' && chat && <Button onClick={() => navigate(`/chat/${chat.id}`)}>进入群聊</Button>}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-7">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Members</p>
                <h2 className="mt-2 text-xl font-bold text-ink">车员名单</h2>
              </div>
              <span className="text-sm font-bold text-ink">{memberGroups.length} 人</span>
            </div>

            {memberGroups.length ? (
              <div className="divide-y divide-slate-100">
                {memberGroups.map(({ user, positions }) => (
                  <div key={user.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                    <Avatar user={user} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{user.nickname}</p>
                      <p className="mt-1 truncate text-xs text-muted">{positions.join('、')}</p>
                    </div>
                    <span className="rounded-full bg-successSoft px-2.5 py-1 text-xs font-semibold text-success">已支付</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
                <p className="text-sm font-bold text-ink">还没有车员加入</p>
                <p className="mt-2 text-xs leading-5 text-muted">分享车次或切换模拟账号，从广场完成上车流程。</p>
              </div>
            )}
          </Card>

          <Card className="p-5 sm:p-7">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Positions</p>
                <h2 className="mt-2 text-xl font-bold text-ink">位置占用</h2>
              </div>
              <span className="text-xs font-medium text-muted">{available} 个空余</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {carpool.positions.map((slot) => {
                const user = slot.occupantId ? data.users.find((item) => item.id === slot.occupantId) : undefined
                return (
                  <div key={slot.id} className={`rounded-xl border p-3 ${user ? 'border-purple-200 bg-purple-50' : 'border-slate-200 bg-slate-50'}`}>
                    <p className={`truncate text-sm font-bold ${user ? 'text-primaryDark' : 'text-muted'}`}>{slot.label}</p>
                    <p className="mt-1 truncate text-[11px] text-muted">{user ? user.nickname : '等待上车'}</p>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <Card className="p-5">
            <h2 className="font-bold text-ink">拼车进度</h2>
            <div className="mt-4"><ProgressBar used={occupied} total={carpool.positions.length} /></div>
            <div className="mt-4">
              <InfoRow label="车员人数">{memberGroups.length} 人</InfoRow>
              <InfoRow label="已占位置">{occupied} 个</InfoRow>
              <InfoRow label="空余位置">{available} 个</InfoRow>
              <InfoRow label="位置单价">{money(carpool.price)}</InfoRow>
              <InfoRow label="预计金额">{money(occupied * carpool.price)}</InfoRow>
              <InfoRow label="截单时间">{formatFullDateTime(carpool.deadline)}</InfoRow>
            </div>
          </Card>

          {carpool.status === 'recruiting' && (
            <Card className="border-purple-200 bg-purple-50/60 p-5">
              <h2 className="font-bold text-ink">确认已经拼成？</h2>
              <p className="mt-2 text-sm leading-6 text-muted">确认后会停止招募，并自动为当前车主和所有车员建立群聊。</p>
              <Button size="lg" className="mt-5 w-full" onClick={() => setConfirmOpen(true)} disabled={memberGroups.length === 0}>确认拼成</Button>
              {memberGroups.length === 0 && <p className="mt-2 text-center text-[11px] text-muted">至少需要一位车员加入</p>}
            </Card>
          )}

          {carpool.status === 'formed' && chat && (
            <Card className="border-success/20 bg-successSoft p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-success">群聊已创建</p>
              <h2 className="mt-2 font-bold text-ink">{chat.name}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">所有成员都可以进入群聊查看公告并发送消息。</p>
              <Button className="mt-5 w-full" onClick={() => navigate(`/chat/${chat.id}`)}>进入群聊</Button>
            </Card>
          )}

          {carpool.status !== 'recruiting' && (
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Logistics</p>
              <h2 className="mt-2 font-bold text-ink">物流与地址</h2>
              <div className="mt-3">
                <InfoRow label="国际物流">{shipment ? internationalStatusText[shipment.status] : '未录入'}</InfoRow>
                <InfoRow label="地址收集">{carpool.addressCollection?.enabled ? (carpool.addressCollection.closedAt ? '已结束' : '进行中') : '未开启'}</InfoRow>
                <InfoRow label="地址提交">{addressSubmitted} / {memberGroups.length}</InfoRow>
              </div>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate(`/shipping/manage/${carpool.id}`)}>进入物流管理</Button>
            </Card>
          )}

          {carpool.status !== 'recruiting' && (
            <Card className={carpool.fulfilledAt ? 'border-success/20 bg-successSoft p-5' : 'border-purple-200 bg-purple-50/60 p-5'}>
              <p className={carpool.fulfilledAt ? 'text-xs font-bold uppercase tracking-[0.14em] text-success' : 'text-xs font-bold uppercase tracking-[0.14em] text-primary'}>
                Fulfillment
              </p>
              <h2 className="mt-2 font-bold text-ink">整车履约</h2>
              {carpool.fulfilledAt ? (
                <>
                  <p className="mt-2 text-sm leading-6 text-success">
                    本车已于 {formatFullDateTime(carpool.fulfilledAt)} 完成全部履约，信誉奖励已经发放，重复操作不会重复加分。
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    车员确认收货 {fulfilledRiders} / {riderOrders.length}。所有车员都确认收货后，才能确认整车履约完成并获得信誉加分。
                  </p>
                  <Button
                    size="lg"
                    className="mt-4 w-full"
                    disabled={!allRidersFulfilled}
                    onClick={() => {
                      const result = completeOwnerFulfillment(carpool.id)
                      showToast(result.message, result.ok ? 'success' : 'error')
                    }}
                  >
                    确认本车履约完成
                  </Button>
                  {!allRidersFulfilled && (
                    <p className="mt-2 text-center text-[11px] text-muted">还有车员没有确认收货，暂时不能确认完成</p>
                  )}
                </>
              )}
            </Card>
          )}
        </aside>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <Card className="modal-enter w-full max-w-md p-6 shadow-float">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-purple-50 text-lg font-black text-primary" aria-hidden="true">✓</span>
            <h2 id="confirm-title" className="mt-5 text-xl font-bold text-ink">确认这辆拼车已拼成？</h2>
            <p className="mt-3 text-sm leading-6 text-muted">确认后将锁定当前 {occupied} 个位置、停止继续招募，并自动创建站内群聊。此演示版本不提供撤销操作。</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={confirming}>暂不确认</Button>
              <Button onClick={submitConfirm} loading={confirming}>确认并创建群聊</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
