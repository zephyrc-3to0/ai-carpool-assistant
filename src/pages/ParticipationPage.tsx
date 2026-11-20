import { useMemo, useState } from 'react'
import { Avatar, Button, Card, EmptyState, InfoRow, StatusBadge } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import { domesticStatusText, formatDateTime, formatFullDateTime, internationalStatusText, money, navigate } from '../utils'
import { getDomesticShipment, getInternationalShipment, getOrderAddress } from '../lib/logistics'
import { participationItemLabel } from '../lib/participation'
import { formatCents } from '../lib/money'
import { participationOf } from '../lib/participation'

/**
 * V2.0 参与订单详情。
 * 以车次为单位展示已购商品聚合、每笔购买记录、商品款支付、国际运费账单、
 * 地址提交、国内费用、物流进度、确认收货与异常记录。
 */
export function ParticipationPage({ carpoolId }: { carpoolId: string }) {
  const { data, currentUser, payFreight, payDomesticFee, disputeDomesticFee, completeRiderOrder } = useAppStore()
  const showToast = useToast()
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [disputeDetail, setDisputeDetail] = useState('')
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  const summary = useMemo(
    () => participationOf(data, carpoolId, currentUser.id),
    [data, carpoolId, currentUser.id],
  )

  if (!carpool) {
    return <EmptyState title="没有找到这个车次" description="参与记录可能已被移除。" action={<Button onClick={() => navigate('/profile')}>返回个人中心</Button>} />
  }

  const owner = data.users.find((user) => user.id === carpool.ownerId)
  const chat = data.chats.find((item) => item.carpoolId === carpoolId)
  const shipment = getInternationalShipment(data, carpoolId)
  const domestic = getDomesticShipment(data, carpoolId, currentUser.id)
  const address = getOrderAddress(data, carpoolId, currentUser.id)
  const freightBill = (data.freightBills ?? []).find((bill) => bill.carpoolId === carpoolId && bill.userId === currentUser.id)
  const domesticBill = (data.domesticFeeBills ?? []).find((bill) => bill.carpoolId === carpoolId && bill.userId === currentUser.id)
  const goodsPayments = (data.payments ?? []).filter((payment) => payment.carpoolId === carpoolId && payment.userId === currentUser.id && payment.kind === 'goods')
  const refunds = (data.payments ?? []).filter((payment) => payment.carpoolId === carpoolId && payment.userId === currentUser.id && payment.kind === 'refund')
  const exceptions = (data.exceptions ?? []).filter((record) => record.carpoolId === carpoolId && record.userId === currentUser.id)
  const isOwner = carpool.ownerId === currentUser.id
  const allOrders = summary.orders
  const fulfilled = allOrders.length > 0 && allOrders.every((order) => order.fulfillmentStatus === 'completed')

  return (
    <div className="mx-auto max-w-5xl">
      <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate('/profile')}>
        <span aria-hidden="true">←</span> 返回个人中心
      </button>

      <Card className="overflow-hidden">
        <div className="relative border-b border-purple-100 bg-detail px-5 py-6 sm:px-8 sm:py-8">
          <div className="hero-grid absolute inset-0 opacity-30" aria-hidden="true" />
          <div className="relative">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <StatusBadge status={carpool.status} />
              <span className="rounded-full border border-purple-200 bg-white px-2.5 py-1 text-xs font-semibold text-primaryDark">参与订单</span>
            </div>
            <h1 className="text-balance text-2xl font-black tracking-tight text-ink sm:text-3xl">{carpool.title}</h1>
            <p className="mt-2 text-sm text-muted">{carpool.eventName} · {carpool.productName}</p>
            {owner && (
              <div className="mt-4 flex items-center gap-2.5">
                <Avatar user={owner} size="sm" />
                <span className="text-xs text-muted">车主 {owner.nickname}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-5 py-4 sm:px-8">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/detail/${carpool.id}`)}>返回拼车详情</Button>
          {chat && <Button size="sm" variant="ghost" onClick={() => navigate(`/chat/${chat.id}`)}>进入群聊</Button>}
        </div>
      </Card>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* 已购商品聚合 */}
          <Card className="p-5 sm:p-6">
            <h2 className="text-base font-bold text-ink">已购商品</h2>
            {summary.items.length ? (
              <ul className="mt-4 space-y-2">
                {summary.items.map((item) => (
                  <li key={`${item.groupId ?? 'legacy'}-${item.name}-${item.version ?? ''}`} className="flex items-center justify-between gap-3 rounded-xl bg-purple-50/70 px-3.5 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-primaryDark">{participationItemLabel(item)} ×{item.quantity}</span>
                      {item.labels.length > 0 && <span className="mt-0.5 block truncate text-[11px] text-primary/75">{item.labels.join('、')}</span>}
                    </span>
                    <span className="flex-none text-sm font-semibold text-ink">{money(item.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">还没有购买记录。</p>
            )}
            <div className="mt-4 space-y-2">
              <InfoRow label="累计商品金额">{money(summary.goodsAmount)}</InfoRow>
              <InfoRow label="累计已支付">{money(summary.paidAmount)}</InfoRow>
              <InfoRow label="购买笔数">{summary.orderCount} 笔</InfoRow>
            </div>
          </Card>

          {/* 每笔购买交易记录 */}
          <Card className="p-5 sm:p-6">
            <h2 className="text-base font-bold text-ink">购买交易记录</h2>
            {allOrders.length ? (
              <div className="mt-4 divide-y divide-slate-100">
                {allOrders.map((order) => {
                  const payment = goodsPayments.find((item) => item.refId === order.id)
                  const refund = refunds.find((item) => item.refId === order.id)
                  const positionLabels = order.itemSnapshot?.slotLabels?.length
                    ? order.itemSnapshot.slotLabels
                    : carpool.positions.filter((slot) => order.slotIds.includes(slot.id)).map((slot) => slot.label)
                  return (
                    <div key={order.id} className="py-3 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-ink">{order.itemSnapshot ? participationItemLabel({ ...order.itemSnapshot, quantity: order.itemSnapshot.quantity, unitPrice: order.itemSnapshot.unitPrice, amount: 0, labels: [] }) : '商品款'} ×{order.itemSnapshot?.quantity ?? order.slotIds.length}</span>
                        <span className="text-sm font-semibold text-ink">{money(order.amount)}</span>
                      </div>
                      {positionLabels.length > 0 && (
                        <p className="mt-1 text-[11px] text-primary/75">成员位置：{positionLabels.join('、')}</p>
                      )}
                      <p className="mt-1 text-[11px] text-muted">
                        {formatFullDateTime(order.paidAt)} 下单
                        {payment ? ` · 商品款模拟支付 ${formatCents(payment.amountCents)}` : ''}
                        {order.fulfillmentStatus === 'completed' ? ' · 已确认收货' : ''}
                      </p>
                      {refund && (
                        <p className="mt-1.5 rounded-lg bg-successSoft px-2.5 py-1.5 text-[11px] font-semibold text-success">
                          退款结果：已生成模拟退款 {formatCents(refund.amountCents)}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">还没有购买记录。</p>
            )}
          </Card>

          {/* 异常记录 */}
          <Card className="p-5 sm:p-6">
            <h2 className="text-base font-bold text-ink">异常记录</h2>
            {exceptions.length ? (
              <div className="mt-4 space-y-2">
                {exceptions.map((record) => (
                  <div key={record.id} className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                    <p className="text-sm font-bold text-ink">{record.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{record.detail} · {record.status === 'open' ? '待处理' : '已处理'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">本车暂无异常记录。</p>
            )}
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          {/* 国际运费账单 */}
          <Card className="p-5">
            <h2 className="text-base font-bold text-ink">国际运费账单</h2>
            {freightBill ? (
              <>
                <div className="mt-3 space-y-2">
                  <InfoRow label="分摊份数">{freightBill.units} 份</InfoRow>
                  <InfoRow label="应付金额">{formatCents(freightBill.amountCents)}</InfoRow>
                  <InfoRow label="状态">{freightBill.status === 'booked' ? '车主自担 · 已记账' : freightBill.status === 'paid' ? '已支付' : '待支付'}</InfoRow>
                </div>
                {!isOwner && freightBill.status !== 'paid' && (
                  <Button size="lg" className="mt-4 w-full" onClick={() => {
                    const result = payFreight(carpoolId)
                    showToast(result.message, result.ok ? 'success' : 'error')
                  }}>模拟支付国际运费</Button>
                )}
                {isOwner && <p className="mt-3 text-[11px] leading-5 text-muted">车主本人的分摊只做记账，不产生向自己的付款。</p>}
              </>
            ) : (
              <p className="mt-3 text-xs leading-5 text-muted">整车截团后才会生成国际运费账单并按有效份数自动分摊。</p>
            )}
          </Card>

          {/* 收货地址 */}
          <Card className="p-5">
            <h2 className="text-base font-bold text-ink">收货地址</h2>
            {address && address.status === 'submitted' ? (
              <div className="mt-3 space-y-2">
                <InfoRow label="收件人">{address.receiverName}</InfoRow>
                <InfoRow label="电话">{address.phone}</InfoRow>
                <InfoRow label="地址">{`${address.province}${address.city}${address.district}${address.detail}`}</InfoRow>
              </div>
            ) : carpool.addressCollection?.enabled ? (
              <>
                <p className="mt-3 text-xs leading-5 text-muted">本车已进入地址收集阶段，请提交你的收货地址。</p>
                <Button size="sm" className="mt-3 w-full" onClick={() => navigate(`/shipping/address/${carpool.id}`)}>
                  {address?.status === 'overdue' ? '逾期补交地址' : '填写收货地址'}
                </Button>
              </>
            ) : (
              <p className="mt-3 text-xs leading-5 text-muted">国际包裹清关完成后会开启地址收集。</p>
            )}
          </Card>

          {/* 国内费用 */}
          <Card className="p-5">
            <h2 className="text-base font-bold text-ink">国内费用</h2>
            {domesticBill ? (
              <>
                <div className="mt-3 space-y-2">
                  <InfoRow label="打包费">{formatCents(domesticBill.packingFeeCents)}</InfoRow>
                  <InfoRow label="国内运费">{formatCents(domesticBill.shippingFeeCents)}</InfoRow>
                  <InfoRow label="合计">{formatCents(domesticBill.totalCents)}</InfoRow>
                  <InfoRow label="状态">{domesticBill.status === 'paid' ? '已支付' : domesticBill.status === 'disputed' ? '存在异议' : '待支付'}</InfoRow>
                </div>
                {domesticBill.status === 'pending' && (
                  <>
                    <Button size="lg" className="mt-4 w-full" onClick={() => {
                      const result = payDomesticFee(carpoolId)
                      showToast(result.message, result.ok ? 'success' : 'error')
                    }}>模拟支付国内费用</Button>
                    <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setDisputeOpen(true)}>费用有异议</Button>
                  </>
                )}
                {domesticBill.status === 'disputed' && (
                  <p className="mt-3 text-[11px] leading-5 text-danger">已发起费用异议，等待车主处理。</p>
                )}
              </>
            ) : (
              <p className="mt-3 text-xs leading-5 text-muted">到货后车主会按车员登记打包费与国内运费。</p>
            )}
          </Card>

          {/* 物流进度 */}
          <Card className="p-5">
            <h2 className="text-base font-bold text-ink">物流进度</h2>
            <div className="mt-3 space-y-2">
              <InfoRow label="国际物流">{shipment ? internationalStatusText[shipment.status] : '未开始'}</InfoRow>
              <InfoRow label="国内物流">{domestic ? domesticStatusText[domestic.status] : '未发货'}</InfoRow>
              {domestic?.trackingNumber && <InfoRow label="国内快递单号">{domestic.trackingNumber}</InfoRow>}
            </div>
            <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => navigate(`/shipping/${carpool.id}`)}>查看完整物流</Button>
            {!fulfilled && domestic && (domestic.status === 'shipped' || domestic.status === 'received') && (
              <Button size="sm" className="mt-2 w-full" onClick={() => {
                const result = completeRiderOrder(carpoolId)
                showToast(result.message, result.ok ? 'success' : 'error')
              }}>确认收货</Button>
            )}
          </Card>

          <p className="px-1 text-[11px] leading-5 text-muted">
            最近更新：{formatDateTime(summary.orders[summary.orders.length - 1]?.paidAt ?? carpool.createdAt)}
          </p>
        </aside>
      </div>

      {disputeOpen && domesticBill?.status === 'pending' && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="fee-dispute-title">
          <Card className="modal-enter w-full max-w-md p-6 shadow-float">
            <h2 id="fee-dispute-title" className="text-xl font-bold text-ink">发起费用异议</h2>
            <p className="mt-2 text-sm leading-6 text-muted">请说明对打包费或国内运费的疑问。提交后账单会暂停支付，并进入本车异常处理中心。</p>
            <textarea
              className="mt-4 min-h-28 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm leading-6 text-ink outline-none focus:border-primary focus:ring-4 focus:ring-purple-100"
              value={disputeDetail}
              onChange={(event) => setDisputeDetail(event.target.value)}
              placeholder="至少填写 5 个字"
              maxLength={300}
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDisputeOpen(false)}>取消</Button>
              <Button onClick={() => {
                const result = disputeDomesticFee(carpoolId, disputeDetail)
                showToast(result.message, result.ok ? 'success' : 'error')
                if (result.ok) {
                  setDisputeOpen(false)
                  setDisputeDetail('')
                }
              }}>提交异议</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
