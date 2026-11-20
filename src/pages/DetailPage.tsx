import { useEffect, useMemo, useState } from 'react'
import { Avatar, Button, Card, EmptyState, InfoRow, ProgressBar, StatusBadge } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import { formatFullDateTime, internationalStatusText, money, navigate } from '../utils'
import { getInternationalShipment } from '../lib/logistics'
import { eventOf, groupOf, productsOf } from '../lib/catalog'
import { guaranteeText, isFulfilledPhase, purchaseModeOf, purchaseModeText } from '../lib/share'
import { recruitmentStateOf } from '../lib/recruitOps'
import { remainingProductQuotaOf } from '../lib/purchaseRules'
import { formatCents } from '../lib/money'

/**
 * V2.0 拼车详情：左右双栏。
 * 左侧展示车主信息、车次进度、商品列表、招募规则、费用说明与物流信息；
 * 右侧为固定的选购区域。
 */
export function DetailPage({ carpoolId }: { carpoolId: string }) {
  const { data, currentUser, permissions, confirmRuleChange, ownerSelfPurchase } = useAppStore()
  const showToast = useToast()
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  const [selected, setSelected] = useState<string[]>([])
  const perm = permissions

  useEffect(() => setSelected([]), [carpoolId, currentUser.id])

  const owner = carpool ? data.users.find((user) => user.id === carpool.ownerId) : undefined
  const event = eventOf(data, carpool?.eventId)
  const group = groupOf(data, carpool?.groupId)
  const state = useMemo(() => recruitmentStateOf(data, carpoolId), [data, carpoolId])
  const chat = data.chats.find((item) => item.carpoolId === carpoolId)
  const shipment = getInternationalShipment(data, carpoolId)
  const isOwner = carpool?.ownerId === currentUser.id
  const userSlots = carpool?.positions.filter((slot) => slot.occupantId === currentUser.id) ?? []
  const isParticipant = userSlots.length > 0 && !isOwner
  const mode = purchaseModeOf(carpool)
  const pendingChange = carpool?.pendingRuleChange
  const needsRuleConsent = Boolean(
    pendingChange
    && pendingChange.status === 'pending'
    && pendingChange.requiredUserIds.includes(currentUser.id)
    && !pendingChange.confirmedUserIds.includes(currentUser.id),
  )

  const groups = carpool?.shareGroups ?? []
  const selectedSlots = useMemo(
    () => carpool ? carpool.positions.filter((slot) => selected.includes(slot.id)) : [],
    [carpool, selected],
  )
  const selectedTotal = selectedSlots.reduce((sum, slot) => sum + (slot.price ?? carpool?.price ?? 0), 0)

  if (!carpool || !owner) {
    return <EmptyState title="没有找到这辆拼车" description="它可能已经被移除，返回活动广场查看其他正在招募的车次。" action={<Button onClick={() => navigate('/')}>返回拼车广场</Button>} />
  }

  const recruiting = carpool.status === 'recruiting' && !state.mustFail

  const toggleSlot = (slotId: string) => {
    const slot = carpool.positions.find((item) => item.id === slotId)
    if (!slot || slot.occupantId || !recruiting) return
    if (slot.reservation && slot.reservation.userId !== currentUser.id) return
    if (slot.reservation && isReservationAlive(slot)) {
      setSelected((current) => current.filter((id) => id !== slotId))
      return
    }
    if (isOwner) {
      showToast('车主自购不经过模拟付款，请使用商品下方的“确认自购”。', 'error')
      return
    }
    if (mode === 'single' && selected.length >= Math.max(0, (carpool.maxPackageItems ?? 0) - state.occupiedSlots)) {
      showToast('本车剩余包裹容量不足，请减少选择数量。', 'error')
      return
    }
    const groupItem = groups.find((item) => item.slotIds.includes(slotId))
    if (groupItem?.productId) {
      const remainingQuota = remainingProductQuotaOf(data, carpool.eventId, currentUser.id, groupItem.productId)
      const selectedForProduct = selected.filter((id) => groups.find((item) => item.slotIds.includes(id))?.productId === groupItem.productId).length
      if (selectedForProduct >= remainingQuota) {
        const product = productsOf(data, carpool.eventId).find((item) => item.id === groupItem.productId)
        showToast(`「${product?.name ?? '该商品'}」本次还可以购买 ${remainingQuota} 件。`, 'error')
        return
      }
    }
    setSelected((current) => current.includes(slotId) ? current.filter((id) => id !== slotId) : [...current, slotId])
  }

  const goToConfirm = () => {
    if (!selected.length) {
      showToast('请先选择需要购买的份额。', 'error')
      return
    }
    navigate(`/confirm/${carpool.id}?slots=${encodeURIComponent(selected.join(','))}`)
  }

  const handleRuleConsent = (approve: boolean) => {
    const result = confirmRuleChange(carpool.id, approve)
    showToast(result.message, result.ok ? 'success' : 'error')
  }

  const handleSelfPurchase = (groupId: string, quantity: number) => {
    const result = ownerSelfPurchase(carpool.id, groupId, quantity)
    showToast(result.message, result.ok ? 'success' : 'error')
  }

  const memberList = carpool.positions.filter((slot) => slot.occupantId && slot.occupantId !== carpool.ownerId)
  const riders = [...new Set(memberList.map((slot) => slot.occupantId!))]

  return (
    <>
      <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate(carpool.eventId ? `/event/${carpool.groupId}/${carpool.eventId}` : '/')}>
        <span aria-hidden="true">←</span> 返回活动广场
      </button>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="relative border-b border-purple-100 bg-detail px-5 py-7 sm:px-8 sm:py-9">
              <div className="hero-grid absolute inset-0 opacity-30" aria-hidden="true" />
              <div className="relative">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={carpool.status} />
                    <span className="rounded-full border border-purple-200 bg-white px-2.5 py-1 text-xs font-semibold text-primaryDark">
                      {purchaseModeText[mode]}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-muted">{formatFullDateTime(carpool.deadline)} 截团</p>
                </div>
                {group && <p className="text-sm font-bold text-primary">{group.name} · {event?.name ?? carpool.eventName}</p>}
                <h1 className="mt-3 max-w-3xl text-balance text-3xl font-black leading-tight tracking-[-0.03em] text-ink sm:text-4xl">{carpool.title}</h1>
                <p className="mt-4 text-base text-muted">{carpool.productName}</p>
                <div className="mt-7 flex items-center gap-3 border-t border-purple-100/80 pt-5">
                  <Avatar user={owner} />
                  <button
                    onClick={() => navigate(`/user/${owner.id}`)}
                    className="rounded-lg text-left transition hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
                  >
                    <p className="text-sm font-bold text-ink">{owner.nickname}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      本车车主{owner.province ? ` · ${owner.province}` : ''} · 点击查看公开主页
                    </p>
                  </button>
                </div>
              </div>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-7">
              <Metric label="已认领" value={`${state.occupiedSlots} / ${state.openSlots} 份`} />
              <Metric label="有效金额" value={money(state.amountCents / 100)} />
              <Metric label="当前状态" value={state.hint} small />
            </div>
            <div className="px-5 pb-5 sm:px-7 sm:pb-7">
              <ProgressBar used={state.occupiedSlots} total={state.openSlots} />
            </div>
          </Card>

          {needsRuleConsent && pendingChange && (
            <Card className="border-amber-200 bg-amber-50 p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">规则变更待确认</p>
              <h2 className="mt-2 font-bold text-ink">车主修改了本车的拼车规则</h2>
              <p className="mt-2 text-sm leading-6 text-amber-900/85">
                这次修改会影响你已有订单的权益、价格或退款安排，需要你确认后才会生效。已下单的商品与价格不会被覆盖。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => handleRuleConsent(true)}>确认这次变更</Button>
                <Button variant="danger" onClick={() => handleRuleConsent(false)}>驳回</Button>
              </div>
            </Card>
          )}

          <Card className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Products</p>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-ink">商品与份额</h2>
              </div>
              <p className="text-xs text-muted">
                {mode === 'bundle' ? '按成员位置认领' : '按商品件数认领'}
                {mode === 'single' ? ` · 包裹上限 ${carpool.maxPackageItems ?? 0} 件` : ''}
              </p>
            </div>

            <div className="space-y-5">
              {groups.map((groupItem) => {
                const product = productsOf(data, carpool.eventId).find((item) => item.id === groupItem.productId)
                const slots = carpool.positions.filter((slot) => groupItem.slotIds.includes(slot.id))
                const occupied = slots.filter((slot) => slot.occupantId).length
                return (
                  <div key={groupItem.id}>
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-ink">
                          {product ? `${product.name} · ${product.spec}` : groupItem.name}
                          {groupItem.member ? ` · ${groupItem.member}` : ''}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {product?.category ?? '周边'} · {money(groupItem.price)} / 份
                          {product ? ` · 每人限购 ${product.perUserLimit} 件` : ''}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-muted">已认领 {occupied} / {slots.length} 份</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      {slots.map((slot) => {
                        const occupant = slot.occupantId ? data.users.find((user) => user.id === slot.occupantId) : undefined
                        const isSelected = selected.includes(slot.id)
                        const isMine = slot.occupantId === currentUser.id
                        const reservedByOther = Boolean(slot.reservation && slot.reservation.userId !== currentUser.id && isReservationAlive(slot))
                        const disabled = Boolean(slot.occupantId || !recruiting || reservedByOther || isOwner)
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleSlot(slot.id)}
                            className={`relative min-h-[84px] rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 ${
                              isSelected
                                ? 'border-primary bg-primary text-white shadow-button'
                                : slot.occupantId
                                  ? isMine
                                    ? 'border-purple-200 bg-purple-50 text-primaryDark'
                                    : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                                  : reservedByOther
                                    ? 'cursor-not-allowed border-amber-200 bg-amber-50 text-amber-700'
                                    : disabled
                                      ? 'cursor-not-allowed border-slate-200 bg-white text-slate-400'
                                      : 'border-slate-200 bg-white text-ink hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-card'
                            }`}
                          >
                            <span className="block truncate text-sm font-bold">{slot.label}</span>
                            <span className={`mt-2 block truncate text-[11px] ${isSelected ? 'text-white/75' : isMine ? 'text-primary' : 'text-muted'}`}>
                              {isSelected ? '已选择' : isMine ? '我的份额' : occupant ? `${occupant.nickname} 已占` : reservedByOther ? '他人预留中' : money(groupItem.price)}
                            </span>
                            {isSelected && <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[10px]">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                    {isOwner && recruiting && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5">
                        <span className="text-[11px] font-semibold text-muted">车主优先自购</span>
                        <input
                          className="h-8 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm text-ink outline-none focus:border-primary focus:ring-4 focus:ring-purple-100"
                          defaultValue={0}
                          min="0"
                          max={slots.filter((slot) => !slot.occupantId).length}
                          type="number"
                          id={`held-${groupItem.id}`}
                          title="自购份数"
                        />
                        <Button size="sm" variant="secondary" onClick={() => {
                          const input = document.getElementById(`held-${groupItem.id}`) as HTMLInputElement | null
                          const quantity = Number(input?.value) || 0
                          if (quantity > 0) handleSelfPurchase(groupItem.id, quantity)
                        }}>确认自购</Button>
                        <span className="text-[11px] text-muted">不需要模拟付款，直接占位并参与运费分摊</span>
                      </div>
                    )}
                  </div>
                )
              })}
              {!groups.length && (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-muted">
                  本车为历史车次，没有开放商品分组。
                </p>
              )}
            </div>
          </Card>

          <Card className="p-5 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-ink">拼车说明</h2>
            <p className="mt-4 whitespace-pre-wrap text-pretty text-sm leading-7 text-muted">{carpool.description}</p>
            <div className="my-6 h-px bg-slate-100" />
            <h3 className="font-bold text-ink">招募规则</h3>
            <p className="mt-3 whitespace-pre-wrap text-pretty text-sm leading-7 text-muted">{carpool.rules}</p>
            <div className="my-6 h-px bg-slate-100" />
            <h3 className="font-bold text-ink">未凑齐处理规则</h3>
            <p className="mt-3 whitespace-pre-wrap text-pretty text-sm leading-7 text-muted">{carpool.fallbackRule}</p>
          </Card>

          <Card className="p-5 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-ink">费用说明</h2>
            <div className="mt-4 space-y-2">
              <InfoRow label="整车国际运费">{formatCents(carpool.internationalFreightCents ?? 0)}</InfoRow>
              <InfoRow label="分摊方式">{mode === 'bundle' ? '按成员位置份数均摊' : '按商品件数均摊'}</InfoRow>
              <InfoRow label={guaranteeText.fullSetOrdered.label}>{carpool.guarantees?.fullSetOrdered ? '已承诺' : '未承诺'}</InfoRow>
              <InfoRow label={guaranteeText.memberDesign.label}>{carpool.guarantees?.memberDesign ? '已承诺' : '未承诺'}</InfoRow>
              {mode === 'single' && (
                <>
                  <InfoRow label="最低成团金额">{formatCents(carpool.minAmountCents ?? 0)}</InfoRow>
                  <InfoRow label="包裹最大件数">{carpool.maxPackageItems ?? 0} 件</InfoRow>
                </>
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">
              首次购买只支付商品款；国际运费在截团后按有效份数自动分摊并生成账单；国内打包费与国内运费在到货后另行结算。
            </p>
          </Card>

          {isFulfilledPhase(carpool) && (
            <Card className="p-5 sm:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Logistics</p>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-ink">国际物流</h2>
              <div className="mt-4 space-y-2">
                <InfoRow label="物流公司">{shipment?.carrier || '未录入'}</InfoRow>
                <InfoRow label="物流单号">{shipment?.trackingNumber || '未录入'}</InfoRow>
                <InfoRow label="当前状态">{shipment ? internationalStatusText[shipment.status] : '未录入'}</InfoRow>
              </div>
              <Button variant="secondary" className="mt-4" onClick={() => navigate(isOwner ? `/shipping/manage/${carpool.id}` : `/shipping/${carpool.id}`)}>
                {isOwner ? '管理物流' : '查看物流'}
              </Button>
            </Card>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <Card className="p-5">
            <h2 className="text-base font-bold text-ink">选购</h2>
            {recruiting ? (
              <>
                {isOwner ? (
                  <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
                    <p className="text-sm font-bold text-primaryDark">车主自购不经过模拟付款</p>
                    <p className="mt-1.5 text-xs leading-5 text-primaryDark/80">
                      请在左侧每个商品分组中填写数量并点击“确认自购”。确认后直接占位，计入招募进度、采购清单与国际运费分摊。
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-xs leading-5 text-muted">
                      {isParticipant
                        ? '你可以在截团前继续加购；每次付款保留一笔独立交易记录。'
                        : '选择商品或成员位置后进入购买确认页，模拟付款成功后才正式占位。'}
                    </p>
                    <div className="mt-4 rounded-xl bg-slate-50 p-4">
                      <p className="text-xs text-muted">已选 {selected.length} 份</p>
                      <p className="mt-1 text-xl font-black tracking-tight text-ink">合计 {money(selectedTotal)}</p>
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-muted">
                      活动限购按每种商品分别校验；{mode === 'single'
                        ? `整车还可容纳 ${Math.max(0, (carpool.maxPackageItems ?? state.openSlots) - state.occupiedSlots)} 件。`
                        : `当前还有 ${Math.max(0, state.openSlots - state.occupiedSlots)} 个成员位置可认领。`}
                    </p>
                    <Button size="lg" className="mt-4 w-full" onClick={goToConfirm} disabled={!selected.length || !perm.canJoin}>
                      {perm.canJoin ? '进入购买确认' : '信誉分不足，暂时无法购买'}
                    </Button>
                    {!perm.canJoin && (
                      <div className="mt-3 rounded-xl border border-danger/20 bg-dangerSoft px-3.5 py-3">
                        <p className="text-xs font-bold text-danger">当前无法购买</p>
                        <p className="mt-1 text-[11px] leading-5 text-danger/85">{perm.reason}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => navigate('/reputation')}>查看我的信誉</Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="mt-3 rounded-xl bg-slate-100 px-4 py-3 text-sm leading-6 text-muted">
                {carpool.status === 'expired' && '招募截止时间已到但尚未成团，正在等待车主选择延期或流团。'}
                {carpool.status === 'cut' && '本车已截团，不再接受新的购买。'}
                {carpool.status === 'purchasing' && '本车已进入采购履约阶段。'}
                {carpool.status === 'completed' && '本车已完成履约。'}
                {carpool.status === 'failed' && '本车已流团，购买的商品款会生成模拟退款记录。'}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-bold text-ink">车次概览</h2>
            <div className="mt-4 space-y-2">
              <InfoRow label="购买方式">{purchaseModeText[mode]}</InfoRow>
              <InfoRow label="已认领">{state.occupiedSlots} / {state.openSlots} 份</InfoRow>
              <InfoRow label="有效金额">{money(state.amountCents / 100)}</InfoRow>
              <InfoRow label="国际运费">{formatCents(carpool.internationalFreightCents ?? 0)}</InfoRow>
              <InfoRow label="截团时间">{formatFullDateTime(carpool.deadline)}</InfoRow>
              {carpool.expiredAt && <InfoRow label="招募截止于">{formatFullDateTime(carpool.expiredAt)}</InfoRow>}
              {carpool.cutAt && <InfoRow label="实际截团">{formatFullDateTime(carpool.cutAt)}</InfoRow>}
            </div>
          </Card>

          {riders.length > 0 && (
            <Card className="p-5">
              <h2 className="text-base font-bold text-ink">本车成员 <span className="text-muted">{riders.length}</span></h2>
              <div className="mt-3 space-y-2">
                {riders.map((userId) => {
                  const user = data.users.find((item) => item.id === userId)
                  if (!user) return null
                  const positions = carpool.positions.filter((slot) => slot.occupantId === userId).map((slot) => slot.label)
                  return (
                    <button
                      key={userId}
                      onClick={() => navigate(`/user/${user.id}`)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-100"
                    >
                      <Avatar user={user} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink">{user.nickname}</span>
                        <span className="block truncate text-[11px] text-muted">{positions.join('、')}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </Card>
          )}

          {chat && (
            <Button size="lg" className="w-full" onClick={() => navigate(`/chat/${chat.id}`)}>进入拼车群聊 <span aria-hidden="true">→</span></Button>
          )}
          {isOwner && (
            <Button variant="secondary" size="lg" className="w-full" onClick={() => navigate(`/manage/${carpool.id}`)}>管理我的车次</Button>
          )}
        </aside>
      </div>
    </>
  )
}

/** 预留是否仍然有效 */
function isReservationAlive(slot: { reservation?: { expiresAt: string } }) {
  if (!slot.reservation) return false
  const expires = new Date(slot.reservation.expiresAt).getTime()
  return Number.isFinite(expires) && expires > Date.now()
}

function Metric({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className={`mt-1 font-black tracking-tight text-ink ${small ? 'text-xs leading-5' : 'text-lg'}`}>{value}</p>
    </div>
  )
}
