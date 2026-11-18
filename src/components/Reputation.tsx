import type { ReputationEvent, ReputationLevel, UserReputation } from '../types'
import { levelMeta, type ReputationPermissions } from '../lib/reputation'
import { reputationEventText } from '../lib/reputationOps'
import { formatFullDateTime } from '../utils'
import { cn } from './UI'

/** 信誉等级徽标 */
export function ReputationLevelBadge({ level, size = 'md' }: { level: ReputationLevel; size?: 'sm' | 'md' }) {
  const meta = levelMeta[level]
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border font-semibold',
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      meta.badge,
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {meta.label}
    </span>
  )
}

/** 紧凑信誉标签：分数 + 等级，用于公开主页等不希望分数喧宾夺主的位置 */
export function ReputationChip({ reputation }: { reputation: UserReputation }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
      levelMeta[reputation.level].badge,
    )}>
      信誉 {reputation.score} 分 · {levelMeta[reputation.level].label}
    </span>
  )
}

/** 当前可用权限清单 */
export function PermissionList({ permissions }: { permissions: ReputationPermissions }) {
  const items = [
    { label: '发起新的拼车', ok: permissions.canCreate },
    { label: '加入新的拼车', ok: permissions.canJoin },
    { label: '查看并处理已有订单、群聊与物流', ok: true },
    { label: '查看信誉记录并提交申诉', ok: true },
  ]
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2.5 text-sm">
          <span
            className={cn(
              'mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-bold',
              item.ok ? 'bg-successSoft text-success' : 'bg-dangerSoft text-danger',
            )}
            aria-hidden="true"
          >
            {item.ok ? '✓' : '×'}
          </span>
          <span className={item.ok ? 'text-ink' : 'font-semibold text-danger'}>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

/** 信誉分变动时间线 */
export function ReputationTimeline({
  events,
  onAppeal,
  appealableIds = [],
}: {
  events: ReputationEvent[]
  onAppeal?: (event: ReputationEvent) => void
  appealableIds?: string[]
}) {
  if (!events.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-muted">
        暂无履约记录，信誉分变动历史为空。
      </p>
    )
  }

  return (
    <ol className="relative space-y-4 border-l border-purple-100 pl-5">
      {events.map((event, index) => {
        const positive = event.scoreChange > 0
        const neutral = event.scoreChange === 0
        return (
          <li key={event.id} className="relative">
            <span
              className={cn(
                'absolute -left-[26px] top-1 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-white',
                event.status === 'revoked' ? 'bg-slate-300' : positive ? 'bg-success' : neutral ? 'bg-slate-400' : 'bg-danger',
              )}
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-bold',
                event.status === 'revoked'
                  ? 'bg-slate-100 text-muted'
                  : positive
                    ? 'bg-successSoft text-success'
                    : neutral
                      ? 'bg-slate-100 text-muted'
                      : 'bg-dangerSoft text-danger',
              )}>
                {event.status === 'revoked'
                  ? '已撤销'
                  : positive
                    ? `+${event.scoreChange}`
                    : neutral
                      ? '±0'
                      : event.scoreChange}
              </span>
              <span className="text-xs font-semibold text-ink">{reputationEventText[event.eventType]}</span>
              <span className="text-[11px] text-muted">{formatFullDateTime(event.createdAt)}</span>
            </div>
            <p className="mt-1.5 text-sm leading-6 text-muted">{event.reason}</p>
            {event.reviewNote && event.reviewNote !== event.reason && (
              <p className="mt-1 text-xs leading-5 text-muted">审核说明：{event.reviewNote}</p>
            )}
            {event.status === 'revoked' && (
              <p className="mt-1 text-xs leading-5 text-muted">撤销时间：{event.revokedAt ? formatFullDateTime(event.revokedAt) : '—'}</p>
            )}
            {onAppeal && appealableIds.includes(event.id) && event.status === 'active' && (
              <button
                type="button"
                onClick={() => onAppeal(event)}
                className="mt-2 min-h-9 rounded-lg border border-purple-200 bg-purple-50 px-3 text-xs font-bold text-primaryDark transition hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
              >
                针对这次扣分提交申诉
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}
