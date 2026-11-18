import { useState } from 'react'
import { PermissionList, ReputationLevelBadge, ReputationTimeline } from '../components/Reputation'
import { Button, Card, InfoRow, PageHeader, textareaClass } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import { hasFulfillmentRecord, levelMeta } from '../lib/reputation'
import { formatFullDateTime, navigate } from '../utils'

export function ReputationPage() {
  const { data, currentUser, permissions, submitAppeal } = useAppStore()
  const showToast = useToast()
  const [appealEventId, setAppealEventId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reputation = data.reputations.find((item) => item.userId === currentUser.id)
    ?? { userId: currentUser.id, score: permissions.score, level: permissions.level, updatedAt: '' }
  const events = data.reputationEvents
    .filter((event) => event.userId === currentUser.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const appealedIds = data.appeals.filter((appeal) => appeal.userId === currentUser.id).map((appeal) => appeal.reputationEventId)
  const appealable = events
    .filter((event) => event.scoreChange < 0 && event.status === 'active' && !appealedIds.includes(event.id))
    .map((event) => event.id)
  const hasRecord = hasFulfillmentRecord(data, currentUser.id)
  const deductions = events.filter((event) => event.scoreChange < 0 && event.status === 'active')

  const submit = () => {
    if (!appealEventId) return
    setSubmitting(true)
    window.setTimeout(() => {
      const result = submitAppeal(appealEventId, reason)
      setSubmitting(false)
      if (result.ok) {
        setAppealEventId(null)
        setReason('')
      }
      showToast(result.message, result.ok ? 'success' : 'error')
    }, 400)
  }

  return (
    <>
      <PageHeader
        eyebrow="My Reputation"
        title="我的信誉"
        description={`当前模拟身份为“${currentUser.nickname}”。信誉分由实际履约情况与平台核实的违规记录共同决定。`}
        action={<Button variant="secondary" onClick={() => navigate('/reputation/rules')}>信誉规则说明</Button>}
      />

      {permissions.reason && (
        <Card className="mb-5 border-danger/20 bg-dangerSoft p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-danger text-sm font-black text-white" aria-hidden="true">!</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-danger">当前功能受限</p>
              <p className="mt-1 text-sm leading-6 text-danger/85">{permissions.reason}</p>
              <p className="mt-1 text-xs leading-5 text-danger/70">{permissions.hint}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/complaints?tab=appeals')}>提交申诉</Button>
          </div>
        </Card>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Current Score</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-3">
                  <span className="text-4xl font-black tracking-tight text-ink">{reputation.score}</span>
                  <span className="text-sm text-muted">/ 100 分</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ReputationLevelBadge level={reputation.level} />
                  {!hasRecord && (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-muted">
                      暂无履约记录
                    </span>
                  )}
                </div>
                <p className="mt-3 text-xs leading-6 text-muted">{levelMeta[reputation.level].description}</p>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <h3 className="text-sm font-bold text-ink">当前可使用权限</h3>
              <div className="mt-3">
                <PermissionList permissions={permissions} />
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Score History</p>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-ink">信誉分变动历史</h2>
              </div>
              <span className="text-xs text-muted">共 {events.length} 条记录</span>
            </div>

            {appealEventId && (
              <div className="mb-5 rounded-2xl border border-purple-200 bg-purple-50/60 p-4 sm:p-5">
                <p className="text-sm font-bold text-primaryDark">提交申诉说明</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  申诉将提交给模拟管理员审核。审核通过后，系统会撤销对应扣分并重新计算信誉分与权限。
                </p>
                <textarea
                  className={`${textareaClass} mt-3 bg-white`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="请说明申诉理由，例如当时的情况、可以提供的证据等（至少 10 个字）"
                  maxLength={300}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={submit} loading={submitting}>提交申诉</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAppealEventId(null); setReason('') }}>取消</Button>
                </div>
              </div>
            )}

            <ReputationTimeline
              events={events}
              appealableIds={appealable}
              onAppeal={(event) => {
                setAppealEventId(event.id)
                setReason('')
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          </Card>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <Card className="p-5">
            <h2 className="font-bold text-ink">信誉概览</h2>
            <div className="mt-3">
              <InfoRow label="当前信誉分">{reputation.score} 分</InfoRow>
              <InfoRow label="信誉等级">{levelMeta[reputation.level].label}</InfoRow>
              <InfoRow label="可发起拼车">{permissions.canCreate ? '可以' : '不可以'}</InfoRow>
              <InfoRow label="可加入拼车">{permissions.canJoin ? '可以' : '不可以'}</InfoRow>
              <InfoRow label="有效扣分记录">{deductions.length} 条</InfoRow>
              <InfoRow label="最后更新时间">{reputation.updatedAt ? formatFullDateTime(reputation.updatedAt) : '—'}</InfoRow>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-bold text-ink">申诉与投诉</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {deductions.length
                ? `你有 ${deductions.length} 条生效中的扣分记录，可以查看原因并提交申诉。`
                : '当前没有需要申诉的扣分记录，你也可以查看历史记录与投诉进度。'}
            </p>
            <Button className="mt-4 w-full" onClick={() => navigate('/complaints?tab=appeals')}>前往投诉与申诉</Button>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => navigate('/reputation/rules')}>信誉规则说明</Button>
          </Card>

          <Card className="border-slate-200 bg-slate-50/70 p-5">
            <h2 className="font-bold text-ink">演示说明</h2>
            <p className="mt-2 text-xs leading-6 text-muted">
              信誉分、等级与权限均为本地演示逻辑，不接入真实平台的安全认证；扣分需要经过模拟管理员核实，申诉结果同样由模拟管理员处理。
            </p>
          </Card>
        </aside>
      </div>
    </>
  )
}
