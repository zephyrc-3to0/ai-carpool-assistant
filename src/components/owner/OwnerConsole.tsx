import { useMemo, useState } from 'react'
import { Avatar, Button, Card, EmptyState, InfoRow, ProgressBar, StatusBadge } from '../UI'
import { useToast } from '../Toast'
import { useAppStore } from '../../store'
import type { User } from '../../types'
import { formatFullDateTime, internationalStatusText, money, navigate } from '../../utils'
import { getInternationalShipment, getOrderAddress } from '../../lib/logistics'
import { guaranteeText, isFulfilledPhase, purchaseModeOf, purchaseModeText, shareGroupsOf } from '../../lib/share'
import { purchaseListOf, recruitmentStateOf, validOccupancyOf } from '../../lib/recruitOps'
import { ImageUploadError, prepareVoucherImage } from '../../lib/imageUpload'
import { formatCents } from '../../lib/money'
import { latestCutDeadline } from '../../lib/catalog'

/**
 * V2.0 车主管理面板（单车管理空间）。
 * 覆盖车次概况、招募与截团、采购清单、国际运费结算、异常处理等入口。
 */
export function OwnerConsole({ carpoolId }: { carpoolId: string }) {
  const {
    data, currentUser, cutCarpool, extendRecruitment, failCarpool, markOrdered,
    completeOwnerFulfillment, proposeRuleChange, uploadVoucher, resolveException,
  } = useAppStore()
  const showToast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [extendOpen, setExtendOpen] = useState(false)
  const [extendDeadline, setExtendDeadline] = useState('')
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [voucherDraft, setVoucherDraft] = useState({ title: '', note: '' })
  const [voucherImage, setVoucherImage] = useState<{ dataUrl: string; name: string } | undefined>(undefined)
  const [voucherImageBusy, setVoucherImageBusy] = useState(false)
  const [ruleDraft, setRuleDraft] = useState({ rules: '', fallbackRule: '', fullSetOrdered: false, memberDesign: false })
  const carpool = data.carpools.find((item) => item.id === carpoolId)

  const state = useMemo(() => recruitmentStateOf(data, carpoolId), [data, carpoolId])
  const occupancy = useMemo(() => validOccupancyOf(data, carpoolId), [data, carpoolId])
  const purchaseList = useMemo(() => purchaseListOf(data, carpoolId), [data, carpoolId])

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
    return <EmptyState title="没有找到这辆拼车" description="返回我的车次查看你发起的其他车次。" action={<Button onClick={() => navigate('/manage')}>返回车主管理</Button>} />
  }
  if (carpool.ownerId !== currentUser.id) {
    return <EmptyState title="你不是这辆车的车主" description="切换到对应的模拟账号后，才可以管理车次。" action={<Button onClick={() => navigate(`/detail/${carpool.id}`)}>查看车次详情</Button>} />
  }

  const chat = data.chats.find((item) => item.carpoolId === carpool.id)
  const shipment = getInternationalShipment(data, carpool.id)
  const riderOrders = data.orders.filter((order) => order.carpoolId === carpool.id && order.userId !== carpool.ownerId)
  const fulfilledRiders = riderOrders.filter((order) => order.fulfillmentStatus === 'completed').length
  const allRidersFulfilled = riderOrders.length > 0 && fulfilledRiders === riderOrders.length
  const mode = purchaseModeOf(carpool)
  const groups = shareGroupsOf(carpool)
  const pendingChange = carpool.pendingRuleChange
  const ownerHeldCount = carpool.positions.filter((slot) => slot.occupantId === carpool.ownerId).length
  const myOrders = data.orders.filter((order) => order.carpoolId === carpool.id && order.userId === carpool.ownerId)
  const freightBills = (data.freightBills ?? []).filter((bill) => bill.carpoolId === carpool.id)
  const freightSettled = freightBills.filter((bill) => bill.status === 'paid' || bill.status === 'booked').length
  const vouchers = (data.purchaseVouchers ?? []).filter((voucher) => voucher.carpoolId === carpool.id)
  const exceptions = (data.exceptions ?? []).filter((record) => record.carpoolId === carpool.id)
  const openExceptions = exceptions.filter((record) => record.status === 'open')
  const latestCut = latestCutDeadline(data.events?.find((event) => event.id === carpool.eventId))

  const openRuleEditor = () => {
    setRuleDraft({
      rules: carpool.rules,
      fallbackRule: carpool.fallbackRule ?? '',
      fullSetOrdered: Boolean(carpool.guarantees?.fullSetOrdered),
      memberDesign: Boolean(carpool.guarantees?.memberDesign),
    })
    setRuleOpen(true)
  }

  const submitRuleChange = () => {
    const result = proposeRuleChange(carpool.id, {
      rules: ruleDraft.rules.trim(),
      fallbackRule: ruleDraft.fallbackRule.trim(),
      guarantees: { fullSetOrdered: mode === 'bundle' ? true : ruleDraft.fullSetOrdered, memberDesign: ruleDraft.memberDesign },
      feeRules: { unitPrice: carpool.price, serviceFee: 0, shippingFee: 0 },
    })
    showToast(result.message, result.ok ? 'success' : 'error')
    if (result.ok) setRuleOpen(false)
  }

  const doCut = (automatic: boolean) => {
    const result = cutCarpool(carpool.id, automatic)
    showToast(result.message, result.ok ? 'success' : 'error')
    setConfirmOpen(false)
  }

  const doExtend = () => {
    const result = extendRecruitment(carpool.id, new Date(extendDeadline).toISOString())
    showToast(result.message, result.ok ? 'success' : 'error')
    if (result.ok) setExtendOpen(false)
  }

  const doFail = () => {
    const result = failCarpool(carpool.id, '招募截止时未能成团')
    showToast(result.message, result.ok ? 'success' : 'error')
  }

  const doUploadVoucher = () => {
    const result = uploadVoucher(carpool.id, {
      ...voucherDraft,
      imageDataUrl: voucherImage?.dataUrl,
      imageName: voucherImage?.name,
    })
    showToast(result.message, result.ok ? 'success' : 'error')
    if (result.ok) {
      setVoucherOpen(false)
      setVoucherDraft({ title: '', note: '' })
      setVoucherImage(undefined)
    }
  }

  const pickVoucherImage = async (file: File | undefined) => {
    if (!file) return
    setVoucherImageBusy(true)
    try {
      const prepared = await prepareVoucherImage(file)
      setVoucherImage({ dataUrl: prepared.dataUrl, name: prepared.name })
      showToast('图片已压缩，可以继续上传凭证。', 'success')
    } catch (error) {
      showToast(error instanceof ImageUploadError ? error.message : '图片处理失败，请重试。', 'error')
    } finally {
      setVoucherImageBusy(false)
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        {/* 车次概况 */}
        <Card className="p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Overview</p>
              <h3 className="mt-2 text-xl font-bold text-ink">车次概况</h3>
            </div>
            <StatusBadge status={carpool.status} />
          </div>
          <div className="mb-4">
            <ProgressBar used={state.occupiedSlots} total={state.openSlots} />
          </div>
          <div className="space-y-2">
            <InfoRow label="购买方式">{purchaseModeText[mode]}</InfoRow>
            <InfoRow label="已认领">{state.occupiedSlots} / {state.openSlots} 份</InfoRow>
            <InfoRow label="车员认领">{occupancy.riderSlots} 份（{money(occupancy.riderAmountCents / 100)}）</InfoRow>
            <InfoRow label="车主自购">{ownerHeldCount} 份（{money(occupancy.ownerAmountCents / 100)}）</InfoRow>
            <InfoRow label="有效金额">{money(state.amountCents / 100)}</InfoRow>
            <InfoRow label="整车国际运费">{formatCents(carpool.internationalFreightCents ?? 0)}</InfoRow>
            <InfoRow label="截团时间">{formatFullDateTime(carpool.deadline)}</InfoRow>
            {carpool.cutAt && <InfoRow label="实际截团">{formatFullDateTime(carpool.cutAt)}</InfoRow>}
          </div>
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-muted">{state.hint}</p>
        </Card>

        {/* 参与车员与订单 */}
        <Card className="p-5 sm:p-7">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Members</p>
              <h3 className="mt-2 text-xl font-bold text-ink">车员与订单</h3>
            </div>
            <span className="text-sm font-bold text-ink">{memberGroups.length} 人</span>
          </div>
          {memberGroups.length ? (
            <div className="divide-y divide-slate-100">
              {memberGroups.map(({ user, positions }) => {
                const isOwner = user.id === carpool.ownerId
                const order = riderOrders.find((item) => item.userId === user.id)
                const bill = freightBills.find((item) => item.userId === user.id)
                return (
                  <div key={user.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0">
                    <Avatar user={user} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{user.nickname}</p>
                      <p className="mt-1 truncate text-xs text-muted">{positions.join('、')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className={`rounded-full px-2.5 py-1 font-semibold ${isOwner ? 'bg-purple-50 text-primaryDark' : 'bg-successSoft text-success'}`}>
                        {isOwner ? '车主自购' : '已支付'}
                      </span>
                      {!isOwner && bill && (
                        <span className={`rounded-full px-2.5 py-1 font-semibold ${bill.status === 'paid' ? 'bg-successSoft text-success' : 'bg-amber-50 text-amber-700'}`}>
                          国际运费{bill.status === 'paid' ? '已付' : '待付'}
                        </span>
                      )}
                      {!isOwner && order && (
                        <span className="rounded-full px-2.5 py-1 font-semibold bg-slate-100 text-muted">
                          {order.fulfillmentStatus === 'completed' ? '已收货' : '履约中'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
              <p className="text-sm font-bold text-ink">还没有车员加入</p>
              <p className="mt-2 text-xs leading-5 text-muted">首位车员付款占位后会自动创建群聊。</p>
            </div>
          )}
        </Card>

        {/* 采购清单 */}
        <Card className="p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Purchase</p>
              <h3 className="mt-2 text-xl font-bold text-ink">采购清单</h3>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setVoucherOpen(true)} disabled={carpool.status !== 'cut' && carpool.status !== 'purchasing'}>
              上传官方下单凭证
            </Button>
          </div>
          {purchaseList.length ? (
            <div className="divide-y divide-slate-100">
              {purchaseList.map((item) => (
                <div key={item.productId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{item.name} · {item.spec}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {item.category} · 车员 {item.riderQuantity} 份 + 车主自购 {item.ownerQuantity} 份
                    </p>
                  </div>
                  <span className="text-sm font-black text-primaryDark">共 {item.quantity} 件</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-muted">还没有有效购买，截团后自动生成采购清单。</p>
          )}
          {vouchers.length > 0 && (
            <div className="mt-4 space-y-3">
              {vouchers.map((voucher) => (
                <div key={voucher.id} className="rounded-xl bg-slate-50 px-3.5 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    {voucher.imageDataUrl && (
                      <img
                        src={voucher.imageDataUrl}
                        alt={`${voucher.title} 凭证图片`}
                        className="h-20 w-20 flex-none rounded-lg border border-slate-200 bg-white object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-ink">{voucher.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {voucher.note || '官方下单凭证'} · {voucher.status === 'confirmed' ? '已确认' : '待确认'}
                        {voucher.imageName ? ` · 附件：${voucher.imageName}` : ''}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">上传于 {formatFullDateTime(voucher.createdAt)}</p>
                    </div>
                  </div>
                  {voucher.imageDataUrl && (
                    <a
                      href={voucher.imageDataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-[11px] font-semibold text-primary underline underline-offset-2"
                    >
                      查看大图
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 规则与保障 */}
        <Card className="p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Rules</p>
              <h3 className="mt-2 text-xl font-bold text-ink">规则与保障</h3>
            </div>
            <Button size="sm" variant="secondary" onClick={openRuleEditor} disabled={carpool.status === 'completed' || carpool.status === 'failed'}>修改规则</Button>
          </div>
          <div className="space-y-2">
            <InfoRow label="规则版本">v{carpool.rulesVersion ?? 1}</InfoRow>
            <InfoRow label={guaranteeText.fullSetOrdered.label}>{carpool.guarantees?.fullSetOrdered ? '已承诺' : '未承诺'}</InfoRow>
            <InfoRow label={guaranteeText.memberDesign.label}>{carpool.guarantees?.memberDesign ? '已承诺' : '未承诺'}</InfoRow>
            <InfoRow label="未凑齐处理">{carpool.fallbackRule}</InfoRow>
          </div>
          {pendingChange && pendingChange.status === 'pending' && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-bold text-amber-800">待车员确认的规则变更</p>
              <p className="mt-1.5 text-xs leading-6 text-amber-900/85">
                已确认 {pendingChange.confirmedUserIds.length} / {pendingChange.requiredUserIds.length} 位车员；全部确认后才会生效。
              </p>
            </div>
          )}
        </Card>

        {/* 异常处理中心 */}
        <Card className="p-5 sm:p-7">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Exceptions</p>
            <h3 className="mt-2 text-xl font-bold text-ink">异常处理</h3>
          </div>
          {exceptions.length ? (
            <div className="divide-y divide-slate-100">
              {exceptions.map((record) => (
                <div key={record.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{record.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {data.users.find((user) => user.id === record.userId)?.nickname ?? '成员'} · {record.detail}
                    </p>
                  </div>
                  {record.status === 'open' ? (
                    <Button size="sm" variant="secondary" onClick={() => {
                      const result = resolveException(record.id)
                      showToast(result.message, result.ok ? 'success' : 'error')
                    }}>标记已处理</Button>
                  ) : (
                    <span className="rounded-full bg-successSoft px-2.5 py-1 text-[11px] font-semibold text-success">已处理</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-muted">
              暂无异常。异常处理是辅助功能，不会成为正常履约的必经阶段。
            </p>
          )}
        </Card>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-24">
        <Card className="border-purple-200 bg-purple-50/60 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Recruitment</p>
          <h3 className="mt-2 font-bold text-ink">招募与截团</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{state.hint}</p>

          {carpool.status === 'recruiting' && (
            <>
              {state.manualCutAllowed && (
                <Button size="lg" className="mt-5 w-full" onClick={() => setConfirmOpen(true)}>手动截团</Button>
              )}
              {state.autoCut && (
                <p className="mt-4 rounded-xl bg-white px-3 py-2.5 text-xs leading-5 text-success">
                  已满足自动截团条件，最后一笔付款成功时会自动截团。
                </p>
              )}
              {state.mustFail && (
                <p className="mt-4 rounded-xl bg-dangerSoft px-3 py-2.5 text-xs leading-5 text-danger">
                  包裹已装满但未达最低成团金额，按未成团规则处理。
                </p>
              )}
              <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => {
                const suggested = new Date(Date.now() + 24 * 3600 * 1000)
                setExtendDeadline(suggested.toISOString().slice(0, 16))
                setExtendOpen(true)
              }}>延期招募</Button>
              <Button variant="danger" size="sm" className="mt-2 w-full" onClick={doFail}>结束招募并流团</Button>
              {latestCut && <p className="mt-3 text-[11px] leading-4 text-muted">最晚允许截团时间：{formatFullDateTime(latestCut)}</p>}
            </>
          )}

          {carpool.status === 'expired' && (
            <>
              <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-xs leading-5 text-amber-800">
                招募截止时间已到但尚未成团，正在等待你处理：可以在最晚允许截团时间之前延期，或结束本次拼车并为已付款车员生成模拟退款。
              </p>
              <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => {
                const suggested = new Date(Date.now() + 24 * 3600 * 1000)
                setExtendDeadline(suggested.toISOString().slice(0, 16))
                setExtendOpen(true)
              }}>延期招募</Button>
              <Button variant="danger" size="sm" className="mt-2 w-full" onClick={doFail}>结束并流团退款</Button>
              {latestCut && <p className="mt-3 text-[11px] leading-4 text-muted">最晚允许截团时间：{formatFullDateTime(latestCut)}（到达后系统会自动流团）</p>}
            </>
          )}

          {carpool.status === 'cut' && (
            <>
              <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-xs leading-5 text-primaryDark">
                已截团，国际运费账单已按有效份数生成。车员未支付运费不会阻止你开始采购。
              </p>
              <Button size="lg" className="mt-4 w-full" onClick={() => {
                const result = markOrdered(carpool.id)
                showToast(result.message, result.ok ? 'success' : 'error')
              }}>确认已下单</Button>
            </>
          )}

          {carpool.status === 'purchasing' && (
            <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-xs leading-5 text-success">已进入采购履约阶段，可在下方管理物流与发货。</p>
          )}

          {carpool.status === 'completed' && (
            <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-xs leading-5 text-muted">本车已完成全部履约。</p>
          )}

          {carpool.status === 'failed' && (
            <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-xs leading-5 text-danger">本车已流团，已为实际付款的车员生成模拟退款记录。</p>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-ink">国际运费结算</h3>
          <div className="mt-4 space-y-2">
            <InfoRow label="整车国际运费">{formatCents(carpool.internationalFreightCents ?? 0)}</InfoRow>
            <InfoRow label="分摊方式">{mode === 'bundle' ? '按成员位置份数' : '按商品件数'}</InfoRow>
            <InfoRow label="账单状态">{freightBills.length ? `${freightSettled} / ${freightBills.length} 已结算或记账` : '尚未生成'}</InfoRow>
          </div>
          {freightBills.length > 0 && (
            <div className="mt-4 space-y-2">
              {freightBills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                  <span className="min-w-0 truncate text-xs font-semibold text-ink">
                    {data.users.find((user) => user.id === bill.userId)?.nickname ?? '成员'}
                    <span className="ml-1 text-muted">{bill.units} 份</span>
                  </span>
                  <span className="flex-none text-right">
                    <span className="block text-xs font-bold text-ink">{formatCents(bill.amountCents)}</span>
                    <span className={`mt-0.5 block text-[10px] font-semibold ${bill.status === 'paid' || bill.status === 'booked' ? 'text-success' : 'text-amber-700'}`}>
                      {bill.status === 'booked' ? '车主自担 · 已记账' : bill.status === 'paid' ? '已支付' : '待支付'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {chat && (
          <Card className="border-success/20 bg-successSoft p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-success">群聊已创建</p>
            <h3 className="mt-2 font-bold text-ink">{chat.name}</h3>
            <Button className="mt-4 w-full" onClick={() => navigate(`/chat/${chat.id}`)}>进入群聊</Button>
          </Card>
        )}

        {isFulfilledPhase(carpool) && (
          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Logistics</p>
            <h3 className="mt-2 font-bold text-ink">物流与发货</h3>
            <div className="mt-3 space-y-2">
              <InfoRow label="国际物流">{shipment ? internationalStatusText[shipment.status] : '未录入'}</InfoRow>
              <InfoRow label="地址收集">{carpool.addressCollection?.enabled ? (carpool.addressCollection.closedAt ? '已结束' : '进行中') : '未开启'}</InfoRow>
              <InfoRow label="地址提交">{memberGroups.filter(({ user }) => getOrderAddress(data, carpool.id, user.id)?.status === 'submitted').length} / {memberGroups.length}</InfoRow>
            </div>
            <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate(`/shipping/manage/${carpool.id}`)}>管理物流与发货</Button>
          </Card>
        )}

        {carpool.status !== 'recruiting' && (
          <Card className={carpool.fulfilledAt ? 'border-success/20 bg-successSoft p-5' : 'border-purple-200 bg-purple-50/60 p-5'}>
            <p className={carpool.fulfilledAt ? 'text-xs font-bold uppercase tracking-[0.14em] text-success' : 'text-xs font-bold uppercase tracking-[0.14em] text-primary'}>Fulfillment</p>
            <h3 className="mt-2 font-bold text-ink">整车履约</h3>
            {carpool.fulfilledAt ? (
              <p className="mt-2 text-sm leading-6 text-success">
                本车已于 {formatFullDateTime(carpool.fulfilledAt)} 完成全部履约，信誉奖励已经发放，重复操作不会重复加分。
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm leading-6 text-muted">
                  车员确认收货 {fulfilledRiders} / {riderOrders.length}。所有车员都确认收货后，才能确认整车履约完成。
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
              </>
            )}
          </Card>
        )}
      </aside>

      {confirmOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cut-title">
          <Card className="modal-enter w-full max-w-md p-6 shadow-float">
            <h2 id="cut-title" className="text-xl font-bold text-ink">确认手动截团？</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              截团后锁定当前 {state.occupiedSlots} 个份额，停止新增购买，并按有效份数生成国际运费账单。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>暂不截团</Button>
              <Button onClick={() => doCut(false)}>确认截团</Button>
            </div>
          </Card>
        </div>
      )}

      {extendOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="extend-title">
          <Card className="modal-enter w-full max-w-md p-6 shadow-float">
            <h2 id="extend-title" className="text-xl font-bold text-ink">延期招募</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              延期会通知已参与的车员，且不得超过平台最晚允许截团时间{latestCut ? `（${formatFullDateTime(latestCut)}）` : ''}。
            </p>
            <input
              className="mt-4 min-h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-4 focus:ring-purple-100"
              value={extendDeadline}
              onChange={(event) => setExtendDeadline(event.target.value)}
              type="datetime-local"
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setExtendOpen(false)}>取消</Button>
              <Button onClick={doExtend}>确认延期</Button>
            </div>
          </Card>
        </div>
      )}

      {voucherOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="voucher-title">
          <Card className="modal-enter w-full max-w-md p-6 shadow-float">
            <h2 id="voucher-title" className="text-xl font-bold text-ink">上传官方下单凭证</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              记录采购状态并可附上一张凭证截图。图片会先在本地压缩后再保存，不会调用任何上传接口。
            </p>
            <div className="mt-4 space-y-3">
              <input
                className="min-h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-4 focus:ring-purple-100"
                value={voucherDraft.title}
                onChange={(event) => setVoucherDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="凭证名称，例如「官方下单成功截图」"
              />
              <textarea
                className="min-h-24 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm leading-6 text-ink outline-none focus:border-primary focus:ring-4 focus:ring-purple-100"
                value={voucherDraft.note}
                onChange={(event) => setVoucherDraft((current) => ({ ...current, note: event.target.value }))}
                placeholder="采购说明（可选）"
              />
              <div>
                <p className="mb-1.5 text-xs font-bold text-ink">凭证图片（可选）</p>
                <input
                  type="file"
                  accept="image/*"
                  className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-purple-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primaryDark hover:file:bg-purple-100"
                  onChange={(event) => { void pickVoucherImage(event.target.files?.[0]); event.target.value = '' }}
                />
                <p className="mt-1.5 text-[11px] leading-5 text-muted">
                  支持 JPG / PNG 等图片，上传前会压缩到 1024px 以内并转成 JPEG，避免占满浏览器本地存储。
                </p>
                {voucherImageBusy && <p className="mt-1 text-[11px] text-muted">正在压缩图片…</p>}
                {voucherImage && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
                    <img src={voucherImage.dataUrl} alt="凭证预览" className="h-16 w-16 flex-none rounded-lg border border-slate-200 object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-ink">{voucherImage.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted">已压缩，可直接上传</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setVoucherImage(undefined)}>移除</Button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setVoucherOpen(false)}>取消</Button>
              <Button onClick={doUploadVoucher}>上传</Button>
            </div>
          </Card>
        </div>
      )}

      {ruleOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="rule-title">
          <Card className="modal-enter max-h-[90vh] w-full max-w-xl overflow-y-auto p-6 shadow-float">
            <h2 id="rule-title" className="text-xl font-bold text-ink">修改拼车规则</h2>
            <p className="mt-2 text-xs leading-5 text-muted">
              如果本车已经有车员下单，这次修改会影响他们的权益，需要经过每位受影响车员确认后才会生效；已确认订单的商品与价格不会被覆盖。
            </p>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">拼车规则</span>
                <textarea className="min-h-24 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm leading-6 text-ink outline-none focus:border-primary focus:ring-4 focus:ring-purple-100" value={ruleDraft.rules} onChange={(event) => setRuleDraft((current) => ({ ...current, rules: event.target.value }))} maxLength={300} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">未凑齐处理规则</span>
                <textarea className="min-h-24 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm leading-6 text-ink outline-none focus:border-primary focus:ring-4 focus:ring-purple-100" value={ruleDraft.fallbackRule} onChange={(event) => setRuleDraft((current) => ({ ...current, fallbackRule: event.target.value }))} maxLength={300} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-purple-200" checked={mode === 'bundle' ? true : ruleDraft.fullSetOrdered} disabled={mode === 'bundle'} onChange={(event) => setRuleDraft((current) => ({ ...current, fullSetOrdered: event.target.checked }))} />
                  <span className="text-xs leading-5 text-ink">{guaranteeText.fullSetOrdered.label}{mode === 'bundle' ? '（凑套模式固定开启）' : ''}</span>
                </label>
                <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-purple-200" checked={ruleDraft.memberDesign} onChange={(event) => setRuleDraft((current) => ({ ...current, memberDesign: event.target.checked }))} />
                  <span className="text-xs leading-5 text-ink">{guaranteeText.memberDesign.label}</span>
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRuleOpen(false)}>取消</Button>
              <Button onClick={submitRuleChange}>提交修改</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
