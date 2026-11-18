import type { AddressStatus, DomesticStatus, InternationalStatus, InternationalTimelineEntry } from '../types'
import { addressStatusText, domesticStatusText, internationalStatusText } from '../utils'
import { cn } from './UI'

export function InternationalStatusBadge({ status }: { status: InternationalStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
      status === 'checked' && 'border-success/20 bg-successSoft text-success',
      status === 'received' && 'border-primary/20 bg-purple-50 text-primaryDark',
      (status === 'waiting' || status === 'in_transit' || status === 'customs' || status === 'domestic_transit') && 'border-amber-200 bg-amber-50 text-amber-700',
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {internationalStatusText[status]}
    </span>
  )
}

export function AddressStatusBadge({ status }: { status: AddressStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
      status === 'submitted' && 'border-success/20 bg-successSoft text-success',
      status === 'pending' && 'border-slate-200 bg-slate-100 text-muted',
      status === 'overdue' && 'border-danger/20 bg-dangerSoft text-danger',
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {addressStatusText[status]}
    </span>
  )
}

export function DomesticStatusBadge({ status }: { status: DomesticStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
      status === 'received' && 'border-success/20 bg-successSoft text-success',
      status === 'shipped' && 'border-primary/20 bg-purple-50 text-primaryDark',
      status === 'pending_ship' && 'border-amber-200 bg-amber-50 text-amber-700',
      (status === 'pending_address' || status === 'pending_pack') && 'border-slate-200 bg-slate-100 text-muted',
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {domesticStatusText[status]}
    </span>
  )
}

/** 国际物流进度时间线 */
export function ShipmentTimeline({ entries }: { entries: InternationalTimelineEntry[] }) {
  if (!entries.length) {
    return <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-muted">还没有物流节点记录。</p>
  }
  return (
    <ol className="relative space-y-4 border-l border-purple-100 pl-5">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative">
          <span
            className={cn(
              'absolute -left-[26px] top-1 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-white',
              index === entries.length - 1 ? 'bg-primary' : 'bg-purple-200',
            )}
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-center gap-2">
            <InternationalStatusBadge status={entry.status} />
            <span className="text-[11px] font-medium text-muted">{new Date(entry.at).toLocaleString('zh-CN', { hour12: false })}</span>
          </div>
          {entry.note && <p className="mt-1.5 text-sm leading-6 text-ink">{entry.note}</p>}
        </li>
      ))}
    </ol>
  )
}

/** 进度条形式的状态概览（6 个状态节点） */
export function StatusSteps({ current, order, labels }: { current: InternationalStatus; order: InternationalStatus[]; labels: Record<InternationalStatus, string> }) {
  const currentIndex = order.indexOf(current)
  return (
    <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {order.map((status, index) => {
        const done = currentIndex >= 0 && index <= currentIndex
        const active = index === currentIndex
        return (
          <li
            key={status}
            className={cn(
              'rounded-xl border px-3 py-2.5',
              active ? 'border-primary bg-purple-50' : done ? 'border-purple-100 bg-white' : 'border-slate-200 bg-slate-50',
            )}
          >
            <span className={cn('block text-[11px] font-bold', active ? 'text-primary' : done ? 'text-primaryDark' : 'text-muted')}>
              {index + 1}. {labels[status]}
            </span>
            <span className={cn('mt-1 block text-[10px]', done ? 'text-muted' : 'text-slate-400')}>
              {done ? '已完成' : '未到达'}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
