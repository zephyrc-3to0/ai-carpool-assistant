import type { ReactNode } from 'react'
import { useAppStore } from '../store'
import type { Carpool } from '../types'
import { formatDateTime, money, navigate } from '../utils'
import { Avatar, Button, Card, ProgressBar, StatusBadge } from './UI'

export function CarpoolCard({ carpool, compact = false, extraAction }: { carpool: Carpool; compact?: boolean; extraAction?: ReactNode }) {
  const { data } = useAppStore()
  const owner = data.users.find((user) => user.id === carpool.ownerId) ?? data.users[0]
  const used = carpool.positions.filter((slot) => slot.occupantId).length
  const remaining = carpool.positions.length - used
  const visiblePositions = carpool.positions.slice(0, compact ? 4 : 6)

  return (
    <Card className="carpool-card group flex h-full flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-purple-200 hover:shadow-hover">
      <button className="flex flex-1 flex-col p-5 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-purple-100 sm:p-6" onClick={() => navigate(`/detail/${carpool.id}`)}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar user={owner} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-ink">{owner.nickname}</p>
              <p className="text-[11px] text-muted">车主</p>
            </div>
          </div>
          <StatusBadge status={carpool.status} />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-primary">{carpool.eventName}</p>
          <h2 className="line-clamp-2 text-lg font-bold leading-7 tracking-tight text-ink transition group-hover:text-primaryDark">{carpool.title}</h2>
          <p className="mt-2 line-clamp-1 text-sm text-muted">{carpool.productName}</p>
        </div>

        <div className="my-5 flex flex-wrap gap-2">
          {visiblePositions.map((slot) => (
            <span key={slot.id} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${slot.occupantId ? 'border-slate-200 bg-slate-100 text-slate-400 line-through' : 'border-purple-200 bg-purple-50 text-primaryDark'}`}>
              {slot.label}
            </span>
          ))}
          {carpool.positions.length > visiblePositions.length && (
            <span className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-muted">+{carpool.positions.length - visiblePositions.length}</span>
          )}
        </div>

        <div className="mt-auto">
          <ProgressBar used={used} total={carpool.positions.length} />
        </div>
      </button>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
        <div>
          <p className="text-lg font-black tracking-tight text-ink">{money(carpool.price)}<span className="ml-1 text-xs font-medium text-muted">/ 位置</span></p>
          <p className="mt-0.5 text-[11px] text-muted">{formatDateTime(carpool.deadline)} 截单</p>
        </div>
        <div className="flex items-center gap-3">
          {carpool.status === 'recruiting' && <span className="hidden text-xs font-semibold text-success sm:inline">剩 {remaining} 位</span>}
          {extraAction}
          <Button size="sm" variant={carpool.status === 'recruiting' ? 'secondary' : 'ghost'} onClick={() => navigate(`/detail/${carpool.id}`)}>
            查看详情 <span aria-hidden="true">→</span>
          </Button>
        </div>
      </div>
    </Card>
  )
}
