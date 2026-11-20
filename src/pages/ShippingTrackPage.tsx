import { AddressStatusBadge, DomesticStatusBadge, InternationalStatusBadge, ShipmentTimeline, StatusSteps } from '../components/Logistics'
import { Button, Card, EmptyState, InfoRow, PageHeader } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import {
  formatAddress,
  formatFullDateTime,
  internationalStatusOrder,
  internationalStatusText,
  navigate,
} from '../utils'
import { deriveDomesticStatus, getDomesticShipment, getInternationalShipment, getOrderAddress } from '../lib/logistics'
import { formatCents } from '../lib/money'

export function ShippingTrackPage({ carpoolId }: { carpoolId: string }) {
  const { data, currentUser, payDomesticFee, completeRiderOrder } = useAppStore()
  const showToast = useToast()
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  const shipment = getInternationalShipment(data, carpoolId)
  const address = getOrderAddress(data, carpoolId, currentUser.id)
  const domestic = getDomesticShipment(data, carpoolId, currentUser.id)
  const domesticBill = (data.domesticFeeBills ?? []).find((item) => item.carpoolId === carpoolId && item.userId === currentUser.id)
  const order = data.orders.find((item) => item.carpoolId === carpoolId && item.userId === currentUser.id)
  const fulfilled = order?.fulfillmentStatus === 'completed'

  if (!carpool) {
    return <EmptyState title="没有找到这辆拼车" description="返回我的拼车查看其他车次的物流信息。" action={<Button onClick={() => navigate('/mine')}>返回我的拼车</Button>} />
  }

  const isRider = carpool.positions.some((slot) => slot.occupantId === currentUser.id)
  if (!isRider) {
    return <EmptyState title="你没有加入这辆拼车" description="只有本车车员可以查看物流信息。" action={<Button onClick={() => navigate(`/detail/${carpool.id}`)}>查看车次详情</Button>} />
  }

  const collectionOpen = Boolean(carpool.addressCollection?.enabled)
  const addressStatus = address?.status ?? 'pending'
  const domesticStatus = deriveDomesticStatus(data, carpoolId, currentUser.id)
  const locked = domesticStatus === 'shipped' || domesticStatus === 'received'

  return (
    <>
      <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate('/mine')}>
        <span aria-hidden="true">←</span> 返回我的拼车
      </button>

      <PageHeader
        eyebrow="Logistics Tracking"
        title="查看物流"
        description={`${carpool.title} · ${carpool.productName}`}
        action={<Button variant="secondary" onClick={() => navigate(`/detail/${carpool.id}`)}>查看车次详情</Button>}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">International</p>
                <h2 className="mt-2 text-xl font-bold text-ink">国际物流</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted">整辆车共享同一份运输进度。</p>
              </div>
              {shipment && <InternationalStatusBadge status={shipment.status} />}
            </div>

            {shipment ? (
              <>
                <StatusSteps current={shipment.status} order={internationalStatusOrder} labels={internationalStatusText} />

                <div className="mt-6">
                  <InfoRow label="物流公司">{shipment.carrier}</InfoRow>
                  <InfoRow label="物流单号">{shipment.trackingNumber}</InfoRow>
                  <InfoRow label="物流查询链接">
                    {shipment.trackingUrl ? (
                      <a className="font-semibold text-primary underline underline-offset-2" href={shipment.trackingUrl} target="_blank" rel="noreferrer">打开查询页</a>
                    ) : '未提供'}
                  </InfoRow>
                  <InfoRow label="当前状态">{internationalStatusText[shipment.status]}</InfoRow>
                  <InfoRow label="更新时间">{formatFullDateTime(shipment.updatedAt)}</InfoRow>
                </div>

                {shipment.note && (
                  <p className="mt-4 rounded-xl border border-purple-100 bg-purple-50/60 px-4 py-3 text-sm leading-6 text-primaryDark">{shipment.note}</p>
                )}

                <div className="mt-7 border-t border-slate-100 pt-6">
                  <h3 className="text-sm font-bold text-ink">物流进度时间线</h3>
                  <div className="mt-4">
                    <ShipmentTimeline entries={shipment.timeline} />
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
                <p className="text-sm font-bold text-ink">车主还没有录入国际物流</p>
                <p className="mt-2 text-xs leading-5 text-muted">车主下单后会在群里同步物流公司、单号与运输节点。</p>
              </div>
            )}
          </Card>

          <Card className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">My Address</p>
                <h2 className="mt-2 text-xl font-bold text-ink">我的收货地址</h2>
              </div>
              <AddressStatusBadge status={addressStatus} />
            </div>

            {addressStatus === 'submitted' ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-sm font-bold text-ink">{address?.receiverName} · {address?.phone}</p>
                  <p className="mt-1.5 text-sm leading-6 text-muted">{formatAddress(address ?? { province: '', city: '', district: '', detail: '' })}</p>
                  {address?.submittedAt && <p className="mt-2 text-[11px] text-muted">提交时间：{formatFullDateTime(address.submittedAt)}</p>}
                </div>
                {!locked ? (
                  <Button className="mt-4" variant="secondary" onClick={() => navigate(`/shipping/address/${carpoolId}`)}>修改收货地址</Button>
                ) : (
                  <p className="mt-4 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-xs leading-5 text-muted">包裹已发货，收货地址已锁定，如需修改请联系车主。</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm leading-6 text-muted">
                  {collectionOpen
                    ? addressStatus === 'overdue'
                      ? '地址收集阶段已结束，你还没有提交收货地址。仍然可以补交，车主会一起打包发货。'
                      : '车主已开启地址收集，请尽快填写你的收货地址。'
                    : '车主还没有开启地址收集，开启后就可以填写收货地址。'}
                </p>
                <Button className="mt-4" disabled={!collectionOpen} onClick={() => navigate(`/shipping/address/${carpoolId}`)}>
                  {addressStatus === 'overdue' ? '逾期补交地址' : '填写收货地址'}
                </Button>
              </>
            )}
          </Card>

          <Card className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Domestic Fees</p>
                <h2 className="mt-2 text-xl font-bold text-ink">国内费用</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted">打包费与国内运费按车员分别结算。</p>
              </div>
              {domesticBill && (
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${domesticBill.status === 'paid' ? 'bg-successSoft text-success' : domesticBill.status === 'disputed' ? 'bg-dangerSoft text-danger' : 'bg-amber-50 text-amber-700'}`}>
                  {domesticBill.status === 'paid' ? '已支付' : domesticBill.status === 'disputed' ? '费用异议中' : '待支付'}
                </span>
              )}
            </div>
            {domesticBill ? (
              <>
                <InfoRow label="打包费">{formatCents(domesticBill.packingFeeCents)}</InfoRow>
                <InfoRow label="国内运费">{formatCents(domesticBill.shippingFeeCents)}</InfoRow>
                <InfoRow label="合计">{formatCents(domesticBill.totalCents)}</InfoRow>
                {domesticBill.status === 'pending' && (
                  <Button className="mt-4" onClick={() => {
                    const result = payDomesticFee(carpoolId)
                    showToast(result.message, result.ok ? 'success' : 'error')
                  }}>模拟支付国内费用</Button>
                )}
                {domesticBill.status === 'disputed' && <p className="mt-3 text-xs leading-5 text-danger">费用异议正在处理，处理完成前不能支付或发货。</p>}
              </>
            ) : (
              <p className="text-sm leading-6 text-muted">车主尚未为你登记国内费用。</p>
            )}
          </Card>

          <Card className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Domestic</p>
                <h2 className="mt-2 text-xl font-bold text-ink">我的国内物流</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted">仅显示属于你自己的发货记录。</p>
              </div>
              <DomesticStatusBadge status={domesticStatus} />
            </div>

            {domestic && (domestic.carrier || domestic.trackingNumber) ? (
              <div>
                <InfoRow label="快递公司">{domestic.carrier || '未填写'}</InfoRow>
                <InfoRow label="快递单号">{domestic.trackingNumber || '未填写'}</InfoRow>
                <InfoRow label="发货时间">{domestic.shippedAt ? formatFullDateTime(domestic.shippedAt) : '未填写'}</InfoRow>
                <InfoRow label="当前状态">{domesticStatus === 'received' ? '已签收' : domesticStatus === 'shipped' ? '已发货' : '待发货'}</InfoRow>
                {domestic.note && (
                  <p className="mt-4 rounded-xl border border-purple-100 bg-purple-50/60 px-4 py-3 text-sm leading-6 text-primaryDark">{domestic.note}</p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
                <p className="text-sm font-bold text-ink">还没有发货记录</p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  {domesticStatus === 'pending_address'
                    ? '提交收货地址后，车主才能为你安排打包发货。'
                    : '车主完成到货检查并打包后，会在这里显示你的快递公司与单号。'}
                </p>
              </div>
            )}

            <div className="mt-6 border-t border-slate-100 pt-5">
              <h3 className="text-sm font-bold text-ink">履约确认</h3>
              <p className="mt-1.5 text-xs leading-6 text-muted">
                {fulfilled
                  ? `你已确认收货，本次拼车履约已完成（${order?.fulfilledAt ? formatFullDateTime(order.fulfilledAt) : ''}），信誉奖励已经发放，重复操作不会重复加分。`
                  : '收到商品后请点击下方按钮确认收货。演示版本把「车员确认收货」作为履约完成的依据，不会把车主点击已发货直接视为交易完成。'}
              </p>
              {fulfilled ? (
                <p className="mt-3 inline-flex items-center rounded-full border border-success/20 bg-successSoft px-3 py-1.5 text-xs font-bold text-success">
                  ✓ 履约已完成
                </p>
              ) : (
                <Button
                  className="mt-3"
                  disabled={domesticStatus !== 'shipped' && domesticStatus !== 'received'}
                  onClick={() => {
                    const result = completeRiderOrder(carpoolId)
                    showToast(result.message, result.ok ? 'success' : 'error')
                  }}
                >
                  确认收货并完成履约
                </Button>
              )}
              {domesticStatus !== 'shipped' && domesticStatus !== 'received' && !fulfilled && (
                <p className="mt-2 text-[11px] text-muted">车主发货后才可以确认收货。</p>
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <Card className="p-5">
            <h2 className="font-bold text-ink">本车进度</h2>
            <div className="mt-4">
              <InfoRow label="国际物流">{shipment ? internationalStatusText[shipment.status] : '未录入'}</InfoRow>
              <InfoRow label="地址收集">{collectionOpen ? (carpool.addressCollection?.closedAt ? '已结束' : '进行中') : '未开启'}</InfoRow>
              <InfoRow label="我的地址">{addressStatus === 'submitted' ? '已提交' : addressStatus === 'overdue' ? '逾期未提交' : '待填写'}</InfoRow>
              <InfoRow label="国内物流">{domesticStatus === 'received' ? '已签收' : domesticStatus === 'shipped' ? '已发货' : domesticStatus === 'pending_ship' ? '待发货' : domesticStatus === 'pending_pack' ? '待打包' : '待填写地址'}</InfoRow>
            </div>
          </Card>

          <Card className="border-purple-200 bg-purple-50/60 p-5">
            <h2 className="font-bold text-ink">演示说明</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              物流信息为车主手动录入的模拟数据，未接入真实物流查询接口。你只能查看自己的收货地址与快递单号，看不到其他车员的隐私信息。
            </p>
          </Card>
        </aside>
      </div>
    </>
  )
}
