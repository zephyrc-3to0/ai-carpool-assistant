import { Button, Card, ProgressBar, StatusBadge } from '../UI'
import { useAppStore } from '../../store'
import type { Carpool } from '../../types'
import { formatFullDateTime, money, navigate } from '../../utils'
import { purchaseModeOf, purchaseModeText } from '../../lib/share'

/**
 * V1.3-A.1「我发起的」列表项。
 * 展开后在原地显示车主管理面板，避免跳转到独立的「车主管理」中心。
 */
export function OwnerCarpoolRow({
  carpool,
  expanded,
  onToggle,
}: {
  carpool: Carpool
  expanded: boolean
  onToggle: () => void
}) {
  const { data } = useAppStore()
  const occupied = carpool.positions.filter((slot) => slot.occupantId).length
  const chat = data.chats.find((item) => item.carpoolId === carpool.id)
  const riderCount = new Set(
    carpool.positions.filter((slot) => slot.occupantId && slot.occupantId !== carpool.ownerId).map((slot) => slot.occupantId),
  ).size

  return (
    <Card className="overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={carpool.status} />
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-primaryDark">
                {purchaseModeText[purchaseModeOf(carpool)]}
              </span>
              <span className="text-xs text-muted">{formatFullDateTime(carpool.deadline)} 截单</span>
            </div>
            <button
              className="mt-3 block max-w-full text-left text-lg font-bold leading-7 text-ink transition hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
              onClick={() => navigate(`/detail/${carpool.id}`)}
            >
              {carpool.title}
            </button>
            <p className="mt-1 text-sm text-muted">
              {carpool.productName} · {money(carpool.price)} / 份额 · {riderCount} 位车员
            </p>
          </div>
        </div>

        <div className="mt-5">
          <ProgressBar used={occupied} total={carpool.positions.length} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
        {chat && (
          <Button size="sm" variant="ghost" onClick={() => navigate(`/chat/${chat.id}`)}>进入群聊</Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => navigate(`/detail/${carpool.id}`)}>查看详情</Button>
        <Button size="sm" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? '收起管理面板' : '管理这辆车'}
        </Button>
      </div>
    </Card>
  )
}
