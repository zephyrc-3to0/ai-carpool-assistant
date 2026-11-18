import { useEffect, useState } from 'react'
import { Avatar, Button, Card, EmptyState, InfoRow, ProgressBar, StatusBadge } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import { formatFullDateTime, internationalStatusText, money, navigate } from '../utils'
import { getInternationalShipment } from '../lib/logistics'

export function DetailPage({ carpoolId }: { carpoolId: string }) {
  const { data, currentUser, permissions } = useAppStore()
  const showToast = useToast()
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  const [selected, setSelected] = useState<string[]>([])
  const perm = permissions

  useEffect(() => setSelected([]), [carpoolId, currentUser.id])

  const owner = carpool ? data.users.find((user) => user.id === carpool.ownerId) : undefined
  const occupied = carpool?.positions.filter((slot) => slot.occupantId).length ?? 0
  const available = carpool?.positions.filter((slot) => !slot.occupantId).length ?? 0
  const userSlots = carpool?.positions.filter((slot) => slot.occupantId === currentUser.id) ?? []
  const chat = data.chats.find((item) => item.carpoolId === carpoolId)
  const shipment = getInternationalShipment(data, carpoolId)
  const isOwner = carpool?.ownerId === currentUser.id
  const isMember = Boolean(isOwner || userSlots.length)
  const selectedTotal = selected.length * (carpool?.price ?? 0)
  const memberList = carpool
    ? [
        ...(owner ? [{ user: owner, role: 'owner' as const, positions: [] as string[] }] : []),
        ...Array.from(new Set(carpool.positions.filter((slot) => slot.occupantId).map((slot) => slot.occupantId!)))
          .filter((id) => id !== carpool.ownerId)
          .map((id) => ({
            user: data.users.find((item) => item.id === id),
            role: 'rider' as const,
            positions: carpool.positions.filter((slot) => slot.occupantId === id).map((slot) => slot.label),
          }))
          .filter((item): item is { user: NonNullable<typeof item.user>; role: 'rider'; positions: string[] } => Boolean(item.user)),
      ]
    : []

  if (!carpool || !owner) {
    return <EmptyState title="没有找到这辆拼车" description="它可能已经被移除，返回广场查看其他正在招募的车次。" action={<Button onClick={() => navigate('/')}>返回广场</Button>} />
  }

  const toggleSlot = (slotId: string) => {
    const slot = carpool.positions.find((item) => item.id === slotId)
    if (!slot || slot.occupantId || carpool.status !== 'recruiting' || isOwner) return
    setSelected((current) => current.includes(slotId) ? current.filter((id) => id !== slotId) : [...current, slotId])
  }

  const goToPayment = () => {
    if (!selected.length) {
      showToast('请先选择至少一个空余位置。', 'error')
      return
    }
    navigate(`/pay/${carpool.id}?slots=${encodeURIComponent(selected.join(','))}`)
  }

  return (
    <>
      <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate('/')}>
        <span aria-hidden="true">←</span> 返回拼车广场
      </button>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="relative border-b border-purple-100 bg-detail px-5 py-7 sm:px-8 sm:py-9">
              <div className="hero-grid absolute inset-0 opacity-30" aria-hidden="true" />
              <div className="relative">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <StatusBadge status={carpool.status} />
                  <p className="text-xs font-medium text-muted">{formatFullDateTime(carpool.deadline)} 截单</p>
                </div>
                <p className="text-sm font-bold text-primary">{carpool.eventName}</p>
                <h1 className="mt-3 max-w-3xl text-balance text-3xl font-black leading-tight tracking-[-0.03em] text-ink sm:text-4xl">{carpool.title}</h1>
                <p className="mt-4 text-base text-muted">{carpool.productName}</p>
                <div className="mt-7 flex items-center gap-3 border-t border-purple-100/80 pt-5">
                  <Avatar user={owner} />
                  <button
                    onClick={() => navigate(`/user/${owner.id}`)}
                    className="rounded-lg text-left transition hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
                  >
                    <p className="text-sm font-bold text-ink">{owner.nickname}</p>
                    <p className="mt-0.5 text-xs text-muted">本车车主 · 点击查看公开主页</p>
                  </button>
                </div>
              </div>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-7">
              <Metric label="单个位置" value={money(carpool.price)} />
              <Metric label="剩余位置" value={`${available} / ${carpool.positions.length}`} />
              <Metric label="当前进度" value={`${Math.round((occupied / carpool.positions.length) * 100)}%`} />
            </div>
          </Card>

          <Card className="p-5 sm:p-7">
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Choose a Position</p>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-ink">选择商品位置</h2>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-medium text-muted">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-purple-300 bg-white" />可选</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-slate-200 bg-slate-100" />已占</span>
              </div>
            </div>

            {isOwner && carpool.status === 'recruiting' && (
              <div className="mb-5 rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 text-sm leading-6 text-primaryDark">
                你是这辆车的车主。切换到其他模拟账号后，可以体验选择位置和上车流程。
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {carpool.positions.map((slot) => {
                const occupant = slot.occupantId ? data.users.find((user) => user.id === slot.occupantId) : undefined
                const isSelected = selected.includes(slot.id)
                const isMine = slot.occupantId === currentUser.id
                const disabled = Boolean(slot.occupantId || carpool.status !== 'recruiting' || isOwner)
                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleSlot(slot.id)}
                    className={`position-button relative min-h-[88px] rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 ${
                      isSelected
                        ? 'border-primary bg-primary text-white shadow-button'
                        : slot.occupantId
                          ? isMine
                            ? 'border-purple-200 bg-purple-50 text-primaryDark'
                            : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                          : disabled
                            ? 'cursor-not-allowed border-slate-200 bg-white text-slate-400'
                            : 'border-slate-200 bg-white text-ink hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-card'
                    }`}
                  >
                    <span className="block truncate text-sm font-bold">{slot.label}</span>
                    <span className={`mt-2 block truncate text-[11px] ${isSelected ? 'text-white/75' : isMine ? 'text-primary' : 'text-muted'}`}>
                      {isSelected ? '已选择' : isMine ? '我的位置' : occupant ? `${occupant.nickname} 已占` : money(carpool.price)}
                    </span>
                    {isSelected && <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[10px]">✓</span>}
                  </button>
                )
              })}
            </div>

            {carpool.status === 'recruiting' && !isOwner && (
              <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-muted">已选 {selected.length} 个位置</p>
                  <p className="mt-1 text-xl font-black tracking-tight text-ink">合计 {money(selectedTotal)}</p>
                </div>
                <Button size="lg" onClick={goToPayment} disabled={!selected.length || !perm.canJoin} className="w-full sm:w-auto">
                  {perm.canJoin ? '加入拼车并支付' : '信誉分不足，暂时无法加入'} <span aria-hidden="true">→</span>
                </Button>
              </div>
            )}

            {carpool.status === 'recruiting' && !isOwner && !perm.canJoin && (
              <div className="mt-4 rounded-xl border border-danger/20 bg-dangerSoft px-4 py-3 text-sm leading-6 text-danger">
                <p className="font-bold">当前无法加入新的拼车</p>
                <p className="mt-1 text-xs leading-5 text-danger/85">{perm.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => navigate('/reputation')}>查看我的信誉</Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate('/complaints?tab=appeals')}>提交申诉</Button>
                </div>
              </div>
            )}

            {carpool.status !== 'recruiting' && (
              <div className="mt-6 rounded-xl bg-slate-100 px-4 py-3 text-sm text-muted">这辆拼车已停止选择新位置。</div>
            )}
          </Card>

          <Card className="p-5 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-ink">拼车说明</h2>
            <p className="mt-4 whitespace-pre-wrap text-pretty text-sm leading-7 text-muted">{carpool.description}</p>
            <div className="my-6 h-px bg-slate-100" />
            <h3 className="font-bold text-ink">拼车规则</h3>
            <p className="mt-3 whitespace-pre-wrap text-pretty text-sm leading-7 text-muted">{carpool.rules}</p>
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <Card className="p-5">
            <h2 className="text-base font-bold text-ink">车次概览</h2>
            <div className="mt-3">
              <ProgressBar used={occupied} total={carpool.positions.length} />
            </div>
            <div className="mt-4">
              <InfoRow label="商品">{carpool.productName}</InfoRow>
              <InfoRow label="位置单价">{money(carpool.price)}</InfoRow>
              <InfoRow label="已占位置">{occupied} 个</InfoRow>
              <InfoRow label="剩余位置">{available} 个</InfoRow>
              <InfoRow label="截单时间">{formatFullDateTime(carpool.deadline)}</InfoRow>
            </div>
          </Card>

          {memberList.length > 0 && (
            <Card className="p-5">
              <h2 className="text-base font-bold text-ink">本车成员</h2>
              <p className="mt-1 text-xs text-muted">点击昵称可以查看公开主页</p>
              <div className="mt-3 space-y-2">
                {memberList.map((member) => (
                  <button
                    key={member.user.id}
                    onClick={() => navigate(`/user/${member.user.id}`)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-100"
                  >
                    <Avatar user={member.user} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{member.user.nickname}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {member.role === 'owner' ? '车主' : member.positions.join('、')}
                      </span>
                    </span>
                    {member.user.id === currentUser.id && <span className="text-[11px] font-bold text-primary">我</span>}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {userSlots.length > 0 && (
            <Card className="border-purple-200 bg-purple-50/60 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">你已在车上</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-ink">{userSlots.map((slot) => slot.label).join('、')}</p>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate('/mine')}>查看我的拼车</Button>
            </Card>
          )}

          {isMember && (
            <Card className="p-5">
              <h2 className="text-base font-bold text-ink">需要帮助？</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                如果本车成员存在违规行为，可以提交投诉，平台核实后才会处理。
              </p>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate(`/complaints?car=${carpool.id}`)}>
                投诉本车成员
              </Button>
            </Card>
          )}

          {isOwner && (
            <Button variant="secondary" size="lg" className="w-full" onClick={() => navigate(`/manage/${carpool.id}`)}>进入车主管理</Button>
          )}

          {carpool.status === 'formed' && chat && isMember && (
            <Button size="lg" className="w-full" onClick={() => navigate(`/chat/${chat.id}`)}>进入拼车群聊 <span aria-hidden="true">→</span></Button>
          )}

          {carpool.status !== 'recruiting' && isMember && (
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Logistics</p>
              <h2 className="mt-2 font-bold text-ink">国际物流</h2>
              <div className="mt-3">
                <InfoRow label="物流公司">{shipment?.carrier || '未录入'}</InfoRow>
                <InfoRow label="物流单号">{shipment?.trackingNumber || '未录入'}</InfoRow>
                <InfoRow label="当前状态">{shipment ? internationalStatusText[shipment.status] : '未录入'}</InfoRow>
              </div>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate(isOwner ? `/shipping/manage/${carpool.id}` : `/shipping/${carpool.id}`)}>
                {isOwner ? '进入物流管理' : '查看物流'}
              </Button>
            </Card>
          )}

          {carpool.status === 'formed' && !isMember && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-muted">仅本车车主和已上车成员可以进入群聊。</div>
          )}
        </aside>
      </div>
    </>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-lg font-black tracking-tight text-ink">{value}</p>
    </div>
  )
}
