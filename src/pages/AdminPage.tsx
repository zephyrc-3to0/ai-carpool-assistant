import { useState } from 'react'
import { Avatar, Button, Card, EmptyState, PageHeader, inputClass, textareaClass } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import { ADMIN_NAME, complaintCategoryMeta, reputationEventText } from '../lib/reputationOps'
import type { Complaint, ComplaintCategory } from '../types'
import { formatFullDateTime, navigate } from '../utils'
import { cn } from '../components/UI'

type AdminTab = 'complaints' | 'violations' | 'appeals' | 'scores' | 'logs'

const complaintStatusText = {
  pending: '待审核',
  confirmed: '违规成立',
  rejected: '已驳回',
} as const

const appealStatusText = {
  pending: '待审核',
  approved: '申诉通过',
  rejected: '申诉驳回',
} as const

export function AdminPage() {
  const { data, currentUser, reviewComplaint, reviewAppeal, setAdminMode } = useAppStore()
  const showToast = useToast()
  const [tab, setTab] = useState<AdminTab>('complaints')
  const [active, setActive] = useState<Complaint | null>(null)
  const [deduction, setDeduction] = useState(0)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const pendingComplaints = data.complaints.filter((item) => item.status === 'pending')
  const pendingAppeals = data.appeals.filter((item) => item.status === 'pending')
  const violationEvents = data.reputationEvents.filter((event) => event.scoreChange < 0)

  const tabs: Array<{ key: AdminTab; label: string; count: number }> = [
    { key: 'complaints', label: '待审核投诉', count: pendingComplaints.length },
    { key: 'violations', label: '违规事件', count: violationEvents.length },
    { key: 'appeals', label: '申诉审核', count: pendingAppeals.length },
    { key: 'scores', label: '信誉变动记录', count: data.reputationEvents.length },
    { key: 'logs', label: '操作日志', count: data.adminLogs.length },
  ]

  const openComplaint = (complaint: Complaint) => {
    setActive(complaint)
    setDeduction(complaintCategoryMeta[complaint.category].defaultDeduction)
    setNote('')
  }

  const decide = (decision: 'confirm' | 'reject') => {
    if (!active) return
    setBusy(true)
    window.setTimeout(() => {
      const result = reviewComplaint(active.id, decision, { deduction, note })
      setBusy(false)
      if (result.ok) {
        setActive(null)
        setNote('')
      }
      showToast(result.message, result.ok ? 'success' : 'error')
    }, 400)
  }

  const quickReject = (complaintId: string) => {
    const result = reviewComplaint(complaintId, 'reject', { note: '经核实未发现违规行为。' })
    showToast(result.message, result.ok ? 'success' : 'error')
  }

  const decideAppeal = (appealId: string, decision: 'approve' | 'reject') => {
    const result = reviewAppeal(appealId, decision, decision === 'approve' ? '核实后认为申诉理由成立，撤销本次扣分。' : '经核实，原扣分记录成立。')
    showToast(result.message, result.ok ? 'success' : 'error')
  }

  if (!data.adminMode) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <Card className="border-ink/20 bg-ink p-8 text-white shadow-float">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Admin Demo</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight">模拟管理员后台</h1>
          <p className="mt-3 text-sm leading-7 text-white/75">
            管理员模式尚未开启。开启后可以查看待审核投诉、违规事件与申诉，并执行确认违规、驳回与通过申诉等演示操作。
            该模式仅用于课程演示，所有操作都会留下处理记录。
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => { setAdminMode(true); showToast('已进入模拟管理员模式。', 'success') }}>开启管理员模式</Button>
            <Button variant="ghost" className="text-white/80 hover:bg-white/10 hover:text-white" onClick={() => navigate('/profile')}>返回个人中心</Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin Console"
        title="模拟管理员后台"
        description={`当前身份：${ADMIN_NAME}。仅用于演示投诉核实、违规扣分与申诉审核，不对应任何真实平台权限体系。`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate(`/user/${currentUser.id}`)}>我的公开主页</Button>
            <Button variant="ghost" onClick={() => { setAdminMode(false); navigate('/profile') }}>退出演示管理员模式</Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-ink/20 bg-ink px-4 py-3 text-white">
        <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold">模拟管理员模式</span>
        <span className="text-xs text-white/70">当前操作身份：{ADMIN_NAME}；所有处理结果都会写入操作日志。</span>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="管理员分类">
        {tabs.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              'min-h-10 flex-none rounded-lg px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200',
              tab === item.key ? 'bg-ink text-white shadow-button' : 'text-muted hover:bg-slate-50 hover:text-ink',
            )}
          >
            {item.label}
            {item.count > 0 && <span className={cn('ml-1 text-xs', tab === item.key ? 'text-white/70' : 'text-slate-400')}>{item.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'complaints' && (
        <div className="space-y-4">
          {pendingComplaints.length ? pendingComplaints.map((complaint) => {
            const carpool = data.carpools.find((item) => item.id === complaint.carId)
            const reporter = data.users.find((user) => user.id === complaint.reporterId)
            const target = data.users.find((user) => user.id === complaint.targetUserId)
            const meta = complaintCategoryMeta[complaint.category]
            return (
              <Card key={complaint.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{complaintStatusText[complaint.status]}</span>
                  <span className="text-sm font-bold text-ink">{meta.label}</span>
                  <span className="text-xs text-muted">{formatFullDateTime(complaint.createdAt)}</span>
                </div>
                <p className="mt-3 text-sm font-semibold text-ink">关联车次：{carpool?.title ?? '已删除的车次'}</p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {reporter && <Avatar user={reporter} size="sm" />} 投诉人：{reporter?.nickname ?? '未知'}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {target && <Avatar user={target} size="sm" />} 被投诉人：{target?.nickname ?? '未知'}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{complaint.description}</p>
                <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-muted">
                  规则参考：{meta.description.replace(/。$/, '')}
                  {meta.minDeduction === meta.maxDeduction
                    ? `，确认后扣除 ${meta.minDeduction} 分。`
                    : `，确认后扣除 ${meta.minDeduction}–${meta.maxDeduction} 分。`}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openComplaint(complaint)}>核实并处理</Button>
                  <Button size="sm" variant="ghost" onClick={() => quickReject(complaint.id)}>快速驳回</Button>
                </div>
              </Card>
            )
          }) : (
            <EmptyState title="没有待审核的投诉" description="用户提交的投诉会出现在这里，核实前不会影响任何信誉分。" />
          )}
        </div>
      )}

      {tab === 'violations' && (
        <div className="space-y-4">
          <Card className="p-5 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-ink">违规事件</h2>
            <p className="mt-2 text-sm leading-6 text-muted">每条违规事件对应一条独立的扣分记录，同一违规事件只会扣分一次。</p>
            <div className="mt-5 space-y-3">
              {violationEvents.length ? violationEvents.map((event) => {
                const user = data.users.find((item) => item.id === event.userId)
                const carpool = data.carpools.find((item) => item.id === event.carId)
                return (
                  <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', event.status === 'revoked' ? 'bg-slate-100 text-muted' : 'bg-dangerSoft text-danger')}>
                        {event.status === 'revoked' ? '已撤销' : event.scoreChange}
                      </span>
                      <span className="text-sm font-bold text-ink">{reputationEventText[event.eventType]}</span>
                      <span className="text-xs text-muted">{formatFullDateTime(event.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted">用户：{user?.nickname ?? '未知'} · 车次：{carpool?.title ?? '已删除'}</p>
                    <p className="mt-1.5 text-xs leading-6 text-muted">处理原因：{event.reason}</p>
                  </div>
                )
              }) : (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-muted">暂无违规事件。</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === 'appeals' && (
        <div className="space-y-4">
          {pendingAppeals.length ? pendingAppeals.map((appeal) => {
            const event = data.reputationEvents.find((item) => item.id === appeal.reputationEventId)
            const user = data.users.find((item) => item.id === appeal.userId)
            const carpool = event ? data.carpools.find((item) => item.id === event.carId) : undefined
            return (
              <Card key={appeal.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{appealStatusText[appeal.status]}</span>
                  <span className="text-sm font-bold text-ink">{carpool?.title ?? '相关车次'}</span>
                  <span className="text-xs text-muted">{formatFullDateTime(appeal.createdAt)}</span>
                </div>
                <p className="mt-3 text-xs text-muted">申诉人：{user?.nickname ?? '未知'} · 原扣分：{event?.scoreChange ?? 0} 分</p>
                <p className="mt-2 text-xs leading-6 text-muted">原处理原因：{event?.reason ?? '—'}</p>
                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-purple-50/70 px-4 py-3 text-sm leading-6 text-primaryDark">{appeal.reason}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => decideAppeal(appeal.id, 'approve')}>通过并撤销扣分</Button>
                  <Button size="sm" variant="secondary" onClick={() => decideAppeal(appeal.id, 'reject')}>驳回申诉</Button>
                </div>
              </Card>
            )
          }) : (
            <EmptyState title="没有待审核的申诉" description="用户对扣分记录提交申诉后会出现在这里。" />
          )}
        </div>
      )}

      {tab === 'scores' && (
        <Card className="p-5 sm:p-7">
          <h2 className="text-xl font-bold tracking-tight text-ink">信誉分变动记录</h2>
          <p className="mt-2 text-sm leading-6 text-muted">包含履约加分与核实后的扣分，已撤销的记录不计入当前分数。</p>
          <div className="mt-5 space-y-3">
            {data.reputationEvents.length ? [...data.reputationEvents]
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
              .map((event) => {
                const user = data.users.find((item) => item.id === event.userId)
                const carpool = data.carpools.find((item) => item.id === event.carId)
                return (
                  <div key={event.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold',
                      event.status === 'revoked' ? 'bg-slate-100 text-muted' : event.scoreChange > 0 ? 'bg-successSoft text-success' : event.scoreChange < 0 ? 'bg-dangerSoft text-danger' : 'bg-slate-100 text-muted')}>
                      {event.status === 'revoked' ? '已撤销' : event.scoreChange > 0 ? `+${event.scoreChange}` : event.scoreChange}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{user?.nickname ?? '未知用户'} · {reputationEventText[event.eventType]}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{carpool?.title ?? '已删除车次'} · {formatFullDateTime(event.createdAt)}</p>
                    </div>
                  </div>
                )
              }) : (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-muted">暂无信誉分变动记录。</p>
              )}
          </div>
        </Card>
      )}

      {tab === 'logs' && (
        <Card className="p-5 sm:p-7">
          <h2 className="text-xl font-bold tracking-tight text-ink">管理员操作日志</h2>
          <p className="mt-2 text-sm leading-6 text-muted">所有管理员操作都会记录在这里，便于演示时回溯处理过程。</p>
          <div className="mt-5 space-y-3">
            {data.adminLogs.length ? [...data.adminLogs]
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
              .map((log) => (
                <div key={log.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-white">{log.action}</span>
                    <span className="text-xs text-muted">{formatFullDateTime(log.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-muted">{log.detail}</p>
                </div>
              )) : (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-muted">暂无操作记录，处理一条投诉或申诉后会自动生成。</p>
              )}
          </div>
        </Card>
      )}

      {active && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="admin-complaint-title">
          <Card className="modal-enter w-full max-w-lg p-6 shadow-float">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-lg font-black text-white" aria-hidden="true">⚖</span>
            <h2 id="admin-complaint-title" className="mt-5 text-xl font-bold text-ink">核实投诉</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {complaintCategoryMeta[active.category as ComplaintCategory].label}
              ：{active.description}
            </p>

            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-bold text-ink">扣分数值</span>
              <input
                className={inputClass}
                type="number"
                value={deduction}
                min={complaintCategoryMeta[active.category as ComplaintCategory].minDeduction}
                max={complaintCategoryMeta[active.category as ComplaintCategory].maxDeduction}
                onChange={(event) => setDeduction(Number(event.target.value))}
              />
              <span className="mt-2 block text-xs leading-5 text-muted">
                该类型允许 {complaintCategoryMeta[active.category as ComplaintCategory].minDeduction}–
                {complaintCategoryMeta[active.category as ComplaintCategory].maxDeduction} 分，确认后才会真正扣分。
              </span>
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-bold text-ink">处理原因（会展示给被处理用户）</span>
              <textarea
                className={`${textareaClass} min-h-24`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：核实后确认物流单号与实际不符。"
                maxLength={200}
              />
            </label>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setActive(null)} disabled={busy}>取消</Button>
              <Button variant="secondary" onClick={() => decide('reject')} loading={busy}>驳回投诉</Button>
              <Button onClick={() => decide('confirm')} loading={busy}>确认违规并扣分</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
