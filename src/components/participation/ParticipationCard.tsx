import { Button, Card, ProgressBar, StatusBadge } from '../UI'
import { useAppStore } from '../../store'
import { domesticStatusText, internationalStatusText, money, navigate } from '../../utils'
import { getDomesticShipment, getInternationalShipment } from '../../lib/logistics'
import { isOpenForOccupancy, purchaseModeOf, purchaseModeText } from '../../lib/share'
import { participationItemLabel, type ParticipationSummary } from '../../lib/participation'

/**
 * V1.3-A.1「我参与的」聚合卡片。
 * 同一车次的多次购买合并为一张参与订单，金额与商品全部来自历史购买记录。
 */
export function ParticipationCard({ summary, focusCarId }: { summary: ParticipationSummary; focusCarId?: string }) {
  const { data, currentUser, permissions } = useAppStore()
  const carpool = data.carpools.find((item) => item.id === summary.carpoolId)
  if (!carpool) return null

  const chat = data.chats.find((item) => item.carpoolId === carpool.id)
  const shipment = getInternationalShipment(data, carpool.id)
  const domestic = getDomesticShipment(data, carpool.id, currentUser.id)
  const occupied = carpool.positions.filter((slot) => slot.occupantId).length
  const canPurchase = isOpenForOccupancy(carpool) && permissions.canJoin

  return (
    <Card className="overflow-hidden">
      <button
        className="block w-full p-5 text-left transition hover:bg-slate-50/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-purple-100 sm:p-6"
        onClick={() => navigate(`/detail/${carpool.id}`)}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-primary">{carpool.eventName}</p>
            <h3 className="mt-1.5 text-lg font-bold leading-7 tracking-tight text-ink">{carpool.title}</h3>
            <p className="mt-1 text-sm text-muted">
              {carpool.productName} · {purchaseModeText[purchaseModeOf(carpool)]}
            </p>
          </div>
          <StatusBadge status={carpool.status} />
        </div>

        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">已购商品</p>
          {summary.items.length ? (
            <ul className="mt-2 space-y-1.5">
              {summary.items.map((item) => (
                <li key={`${item.groupId ?? 'legacy'}-${item.name}-${item.version ?? ''}`} className="flex items-center justify-between gap-4 rounded-lg bg-purple-50/70 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-primaryDark">
                      {participationItemLabel(item)} ×{item.quantity}
                    </span>
                    {item.labels.length > 0 && (
                      <span className="mt-0.5 block truncate text-[11px] text-primary/75">{item.labels.join('、')}</span>
                    )}
                  </span>
                  <span className="flex-none text-sm font-semibold text-ink">{money(item.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">尚未生成购买记录。</p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="累计商品金额" value={money(summary.goodsAmount)} />
          <Metric label="服务费" value={money(summary.serviceFee)} />
          <Metric label="国内运费" value={money(summary.shippingFee)} />
          <Metric label="累计已支付" value={money(summary.paidAmount)} highlight />
        </div>

        {summary.unpaidAmount > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            还有 {money(summary.unpaidAmount)} 的预留份额尚未支付，请尽快完成。
          </p>
        )}

        <div className="mt-5">
          <ProgressBar used={occupied} total={carpool.positions.length} />
        </div>
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
        <div className="min-w-0 text-[11px] leading-5 text-muted">
          <p>物流：{shipment ? internationalStatusText[shipment.status] : '尚未开始'}</p>
          <p>我的包裹：{domestic ? domesticStatusText[domestic.status] : '尚未发货'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPurchase && (
            <Button size="sm" variant="secondary" onClick={() => navigate(`/detail/${carpool.id}`)}>继续加购</Button>
          )}
          {chat && (
            <Button size="sm" variant="ghost" onClick={() => navigate(`/chat/${chat.id}`)}>进入群聊</Button>
          )}
          <Button size="sm" onClick={() => navigate(`/participation/${carpool.id}`)}>参与订单详情</Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/detail/${carpool.id}`)}>查看车次详情</Button>
        </div>
      </div>
    </Card>
  )
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-3.5 py-3 ${highlight ? 'bg-purple-50' : 'bg-slate-50'}`}>
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className={`mt-1 font-black tracking-tight ${highlight ? 'text-primaryDark' : 'text-ink'}`}>{value}</p>
    </div>
  )
}
