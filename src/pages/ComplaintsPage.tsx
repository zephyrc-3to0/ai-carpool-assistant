import { useMemo, useState } from 'react'
import { Button, Card, EmptyState, PageHeader, inputClass, textareaClass } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import { complaintCategoryMeta } from '../lib/reputationOps'
import type { ComplaintCategory } from '../types'
import { formatFullDateTime, navigate } from '../utils'

type Tab = 'new' | 'complaints' | 'appeals'

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

export function ComplaintsPage({ initialTab = 'new', initialCarId }: { initialTab?: Tab; initialCarId?: string }) {
  const { data, currentUser, submitComplaint, submitAppeal } = useAppStore()
  const showToast = useToast()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [carId, setCarId] = useState(initialCarId ?? '')
  const [targetUserId, setTargetUserId] = useState('')
  const [category, setCategory] = useState<ComplaintCategory>('owner_delay')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [appealEventId, setAppealEventId] = useState<string | null>(null)
  const [appealReason, setAppealReason] = useState('')

  const myCarpools = useMemo(() => data.carpools.filter((carpool) =>
    carpool.ownerId === currentUser.id || carpool.positions.some((slot) => slot.occupantId === currentUser.id)
  ), [data.carpools, currentUser.id])

  const activeCarId = carId || myCarpools[0]?.id || ''
  const candidates = useMemo(() => {
    const carpool = data.carpools.find((item) => item.id === activeCarId)
    if (!carpool) return []
    const ids = new Set<string>()
    if (carpool.ownerId !== currentUser.id) ids.add(carpool.ownerId)
    carpool.positions.forEach((slot) => {
      if (slot.occupantId && slot.occupantId !== currentUser.id) ids.add(slot.occupantId)
    })
    return [...ids].map((id) => data.users.find((user) => user.id === id)).filter(Boolean)
  }, [data.carpools, data.users, activeCarId, currentUser.id])

  const myComplaints = data.complaints.filter((item) => item.reporterId === currentUser.id)
  const myAppeals = data.appeals.filter((item) => item.userId === currentUser.id)
  const appealedEventIds = myAppeals.map((appeal) => appeal.reputationEventId)
  const myEvents = data.reputationEvents
    .filter((event) => event.userId === currentUser.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const appealableEvents = myEvents.filter((event) => event.scoreChange < 0 && event.status === 'active' && !appealedEventIds.includes(event.id))

  const submitComplaintForm = () => {
    if (!activeCarId) {
      showToast('请先选择关联的车次。', 'error')
      return
    }
    if (!targetUserId) {
      showToast('请选择被投诉的用户。', 'error')
      return
    }
    setSubmitting(true)
    window.setTimeout(() => {
      const result = submitComplaint({ carId: activeCarId, targetUserId, category, description })
      setSubmitting(false)
      if (result.ok) {
        setDescription('')
        setTargetUserId('')
        setTab('complaints')
      }
      showToast(result.message, result.ok ? 'success' : 'error')
    }, 400)
  }

  const submitAppealForm = () => {
    if (!appealEventId) return
    setSubmitting(true)
    window.setTimeout(() => {
      const result = submitAppeal(appealEventId, appealReason)
      setSubmitting(false)
      if (result.ok) {
        setAppealEventId(null)
        setAppealReason('')
      }
      showToast(result.message, result.ok ? 'success' : 'error')
    }, 400)
  }

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'new', label: '发起投诉', count: 0 },
    { key: 'complaints', label: '我的投诉', count: myComplaints.length },
    { key: 'appeals', label: '我的申诉', count: myAppeals.length },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Complaints & Appeals"
        title="投诉与申诉"
        description="投诉提交后进入待审核状态，信誉分不会立即变化；扣分生效后可以查看原因并提交申诉。"
        action={<Button variant="secondary" onClick={() => navigate('/reputation')}>我的信誉</Button>}
      />

      <div className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-fit" role="tablist" aria-label="投诉与申诉分类">
        {tabs.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`min-h-10 flex-1 rounded-lg px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 sm:flex-none ${
              tab === item.key ? 'bg-primary text-white shadow-button' : 'text-muted hover:bg-slate-50 hover:text-ink'
            }`}
          >
            {item.label}
            {item.count > 0 && <span className={`ml-1 text-xs ${tab === item.key ? 'text-white/70' : 'text-slate-400'}`}>{item.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'new' && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="p-5 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-ink">提交投诉</h2>
            <p className="mt-2 text-sm leading-6 text-muted">只能针对你参与过的车次提交投诉，被投诉人必须是本车成员。</p>

            {myCarpools.length ? (
              <div className="mt-6 space-y-5">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-ink">关联车次 *</span>
                  <select className={inputClass} value={activeCarId} onChange={(event) => { setCarId(event.target.value); setTargetUserId('') }}>
                    {myCarpools.map((carpool) => (
                      <option key={carpool.id} value={carpool.id}>{carpool.title}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-ink">被投诉用户 *</span>
                  <select className={inputClass} value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}>
                    <option value="">请选择被投诉的成员</option>
                    {candidates.map((user) => (
                      <option key={user!.id} value={user!.id}>{user!.nickname}</option>
                    ))}
                  </select>
                  {!candidates.length && (
                    <span className="mt-2 block text-xs text-muted">本车没有其他成员可以投诉。</span>
                  )}
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-ink">投诉类型 *</span>
                  <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value as ComplaintCategory)}>
                    {(Object.keys(complaintCategoryMeta) as ComplaintCategory[]).map((key) => (
                      <option key={key} value={key}>{complaintCategoryMeta[key].label}</option>
                    ))}
                  </select>
                  <span className="mt-2 block text-xs leading-5 text-muted">{complaintCategoryMeta[category].description}</span>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-ink">具体说明 *</span>
                  <textarea
                    className={textareaClass}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="请描述发生了什么，例如时间、车次、聊天记录或物流信息（至少 10 个字）"
                    maxLength={300}
                  />
                </label>

                <Button onClick={submitComplaintForm} loading={submitting}>提交投诉</Button>
                <p className="mt-3 text-xs leading-5 text-muted">提交后投诉进入「待审核」，在管理员核实之前不会扣除任何人的信誉分。</p>
              </div>
            ) : (
              <EmptyState title="你还没有参与任何拼车" description="加入或发起拼车后，才能针对车次成员提交投诉。" action={<Button onClick={() => navigate('/')}>去拼车广场</Button>} />
            )}
          </Card>

          <aside className="space-y-5 lg:sticky lg:top-24">
            <Card className="p-5">
              <h2 className="font-bold text-ink">处理流程</h2>
              <ol className="mt-3 space-y-2.5 text-xs leading-5 text-muted">
                <li>1. 提交投诉 → 进入待审核</li>
                <li>2. 模拟管理员核实 → 确认或驳回违规</li>
                <li>3. 确认违规才会生成扣分记录</li>
                <li>4. 被扣分用户可在「我的信誉」中申诉</li>
              </ol>
            </Card>
          </aside>
        </div>
      )}

      {tab === 'complaints' && (
        <div className="space-y-4">
          {myComplaints.length ? myComplaints.map((complaint) => {
            const carpool = data.carpools.find((item) => item.id === complaint.carId)
            const target = data.users.find((user) => user.id === complaint.targetUserId)
            return (
              <Card key={complaint.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    complaint.status === 'pending'
                      ? 'bg-amber-50 text-amber-700'
                      : complaint.status === 'confirmed'
                        ? 'bg-dangerSoft text-danger'
                        : 'bg-slate-100 text-muted'
                  }`}>
                    {complaintStatusText[complaint.status]}
                  </span>
                  <span className="text-sm font-bold text-ink">{complaintCategoryMeta[complaint.category].label}</span>
                  <span className="text-xs text-muted">{formatFullDateTime(complaint.createdAt)}</span>
                </div>
                <p className="mt-3 text-sm font-semibold text-ink">
                  关联车次：{carpool?.title ?? '已删除的车次'}
                </p>
                <p className="mt-1 text-xs text-muted">被投诉人：{target?.nickname ?? '未知用户'}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{complaint.description}</p>
                {complaint.reviewNote && (
                  <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-muted">
                    平台处理说明：{complaint.reviewNote}
                    {complaint.status === 'confirmed' && complaint.deduction ? `（扣除 ${complaint.deduction} 分）` : ''}
                  </p>
                )}
              </Card>
            )
          }) : (
            <EmptyState title="还没有提交过投诉" description="如果遇到违规行为，可以在「发起投诉」中提交，平台会核实处理。" action={<Button onClick={() => setTab('new')}>发起投诉</Button>} />
          )}
        </div>
      )}

      {tab === 'appeals' && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <Card className="p-5 sm:p-7">
              <h2 className="text-xl font-bold tracking-tight text-ink">可申诉的扣分记录</h2>
              <p className="mt-2 text-sm leading-6 text-muted">只有被扣分且仍然生效的记录可以申诉，每条记录只能提交一次申诉。</p>

              {appealEventId && (
                <div className="mt-5 rounded-2xl border border-purple-200 bg-purple-50/60 p-4 sm:p-5">
                  <p className="text-sm font-bold text-primaryDark">申诉说明</p>
                  <textarea
                    className={`${textareaClass} mt-3 bg-white`}
                    value={appealReason}
                    onChange={(event) => setAppealReason(event.target.value)}
                    placeholder="请说明申诉理由（至少 10 个字）"
                    maxLength={300}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={submitAppealForm} loading={submitting}>提交申诉</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAppealEventId(null); setAppealReason('') }}>取消</Button>
                  </div>
                </div>
              )}

              <div className="mt-5 space-y-3">
                {appealableEvents.length ? appealableEvents.map((event) => {
                  const carpool = data.carpools.find((item) => item.id === event.carId)
                  return (
                    <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-dangerSoft px-2.5 py-1 text-xs font-bold text-danger">{event.scoreChange} 分</span>
                        <span className="text-sm font-bold text-ink">{carpool?.title ?? '相关车次'}</span>
                        <span className="text-[11px] text-muted">{formatFullDateTime(event.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-xs leading-6 text-muted">扣分原因：{event.reason}</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-3"
                        onClick={() => { setAppealEventId(event.id); setAppealReason('') }}
                      >
                        提交申诉
                      </Button>
                    </div>
                  )
                }) : (
                  <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-muted">
                    当前没有可以申诉的扣分记录。
                  </p>
                )}
              </div>
            </Card>

            <Card className="p-5 sm:p-7">
              <h2 className="text-xl font-bold tracking-tight text-ink">我的申诉记录</h2>
              <div className="mt-4 space-y-3">
                {myAppeals.length ? myAppeals.map((appeal) => {
                  const event = data.reputationEvents.find((item) => item.id === appeal.reputationEventId)
                  const carpool = event ? data.carpools.find((item) => item.id === event.carId) : undefined
                  return (
                    <div key={appeal.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          appeal.status === 'pending'
                            ? 'bg-amber-50 text-amber-700'
                            : appeal.status === 'approved'
                              ? 'bg-successSoft text-success'
                              : 'bg-slate-100 text-muted'
                        }`}>
                          {appealStatusText[appeal.status]}
                        </span>
                        <span className="text-sm font-bold text-ink">{carpool?.title ?? '相关车次'}</span>
                        <span className="text-[11px] text-muted">提交于 {formatFullDateTime(appeal.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-muted">申诉说明：{appeal.reason}</p>
                      {appeal.reviewNote && (
                        <p className="mt-2 text-xs leading-6 text-muted">平台回复：{appeal.reviewNote}</p>
                      )}
                      {appeal.reviewedAt && (
                        <p className="mt-1 text-[11px] text-muted">审核时间：{formatFullDateTime(appeal.reviewedAt)}</p>
                      )}
                    </div>
                  )
                }) : (
                  <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-muted">还没有提交过申诉。</p>
                )}
              </div>
            </Card>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24">
            <Card className="p-5">
              <h2 className="font-bold text-ink">规则说明</h2>
              <p className="mt-2 text-xs leading-6 text-muted">
                申诉通过后，平台会撤销对应扣分并重新计算信誉分与可用权限，同一条记录不会重复恢复。
              </p>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate('/reputation/rules')}>查看信誉规则</Button>
            </Card>
          </aside>
        </div>
      )}
    </>
  )
}
