import { useMemo, useState } from 'react'
import { OwnerConsole } from '../components/owner/OwnerConsole'
import { Avatar, Button, Card, EmptyState, PageHeader, ProgressBar, StatusBadge } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import { formatFullDateTime, money, navigate } from '../utils'
import { groupOf, eventOf } from '../lib/catalog'
import { purchaseModeOf, purchaseModeText } from '../lib/share'
import { recruitmentStateOf } from '../lib/recruitOps'
import { formatCents } from '../lib/money'

type Tab = 'cars' | 'drafts'

/** V2.0 车主管理：我的车次 + 草稿。 */
export function ManagePage({ carpoolId }: { carpoolId?: string }) {
  const { data, currentUser } = useAppStore()
  const [tab, setTab] = useState<Tab>('cars')

  if (carpoolId) return <OwnerSpace carpoolId={carpoolId} />

  const owned = data.carpools.filter((carpool) => carpool.ownerId === currentUser.id)
  const drafts = (data.drafts ?? []).filter((draft) => draft.ownerId === currentUser.id)

  const groups = [
    { key: 'recruiting', label: '招募中' },
    { key: 'expired', label: '招募已截止' },
    { key: 'cut', label: '已截团' },
    { key: 'purchasing', label: '采购履约中' },
    { key: 'completed', label: '已完成' },
    { key: 'failed', label: '已流团' },
  ] as const

  return (
    <>
      <PageHeader
        eyebrow="Owner Console"
        title="车主管理"
        description={`管理“${currentUser.nickname}”发起的全部车次：招募、截团、采购、物流与异常处理。`}
      />

      <div className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-fit" role="tablist" aria-label="车主管理分类">
        {([
          { key: 'cars', label: '我的车次', count: owned.length },
          { key: 'drafts', label: '草稿', count: drafts.length },
        ] as Array<{ key: Tab; label: string; count: number }>).map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`min-h-10 flex-1 rounded-lg px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 sm:flex-none ${
              tab === item.key ? 'bg-primary text-white shadow-button' : 'text-muted hover:bg-slate-50 hover:text-ink'
            }`}
          >
            {item.label} <span className={`ml-1 text-xs ${tab === item.key ? 'text-white/70' : 'text-slate-400'}`}>{item.count}</span>
          </button>
        ))}
      </div>

      {tab === 'cars' ? (
        owned.length ? (
          <div className="space-y-6">
            {groups.map((group) => {
              const list = owned.filter((carpool) => carpool.status === group.key)
              if (!list.length) return null
              return (
                <section key={group.key}>
                  <div className="mb-3 flex items-center gap-2">
                    <h2 className="text-sm font-bold text-ink">{group.label}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-muted">{list.length}</span>
                  </div>
                  <div className="space-y-3">
                    {list.map((carpool) => (
                      <OwnerCarpoolCard key={carpool.id} carpoolId={carpool.id} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <EmptyState
            title="还没有发起的拼车"
            description="在拼车广场选择团体与活动后，就可以为对应活动发起拼车。"
            action={<Button onClick={() => navigate('/')}>去拼车广场</Button>}
          />
        )
      ) : (
        <DraftList />
      )}
    </>
  )
}

function OwnerCarpoolCard({ carpoolId }: { carpoolId: string }) {
  const { data } = useAppStore()
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return null
  const owner = data.users.find((user) => user.id === carpool.ownerId)
  const state = recruitmentStateOf(data, carpool.id)
  const event = eventOf(data, carpool.eventId)
  const group = groupOf(data, carpool.groupId)

  return (
    <Card className="p-5 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={carpool.status} />
            <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-primaryDark">
              {purchaseModeText[purchaseModeOf(carpool)]}
            </span>
            {group && event && <span className="text-[11px] text-muted">{group.shortName} · {event.name}</span>}
          </div>
          <button
            className="mt-3 block max-w-full text-left text-lg font-bold leading-7 text-ink transition hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
            onClick={() => navigate(`/manage/${carpool.id}`)}
          >
            {carpool.title}
          </button>
          <p className="mt-1 text-sm text-muted">
            {carpool.productName} · {money(carpool.price)} / 份 · 国际运费 {formatCents(carpool.internationalFreightCents ?? 0)}
          </p>
          {owner && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
              <Avatar user={owner} size="sm" />
              <span>{owner.nickname}</span>
            </div>
          )}
        </div>
        <div>
          <ProgressBar used={state.occupiedSlots} total={state.openSlots} />
          <p className="mt-2 text-xs text-muted">{state.hint}</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/detail/${carpool.id}`)}>查看详情</Button>
          <Button size="sm" onClick={() => navigate(`/manage/${carpool.id}`)}>进入管理</Button>
        </div>
      </div>
    </Card>
  )
}

function DraftList() {
  const { data, currentUser, deleteDraft } = useAppStore()
  const showToast = useToast()
  const drafts = (data.drafts ?? []).filter((draft) => draft.ownerId === currentUser.id)

  if (!drafts.length) {
    return (
      <EmptyState
        title="还没有草稿"
        description="在发布拼车页面点击「保存草稿」后，可以在这里继续编辑并发布。"
        action={<Button onClick={() => navigate('/')}>去拼车广场</Button>}
      />
    )
  }

  return (
    <div className="space-y-3">
      {drafts.map((draft) => {
        const group = groupOf(data, draft.groupId)
        const event = eventOf(data, draft.eventId)
        return (
          <Card key={draft.id} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-muted">草稿</span>
                  {group && event && <span className="text-[11px] text-muted">{group.shortName} · {event.name}</span>}
                </div>
                <h3 className="mt-2 text-base font-bold text-ink">{draft.title}</h3>
                <p className="mt-1 text-xs text-muted">
                  保存于 {formatFullDateTime(draft.savedAt)} · 开放 {draft.data.productGroups.reduce((sum, item) => sum + item.quantity, 0)} 份
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => navigate(`/create?group=${draft.groupId}&event=${draft.eventId}&draft=${draft.id}`)}>
                  继续编辑
                </Button>
                <Button size="sm" variant="danger" onClick={() => {
                  const result = deleteDraft(draft.id)
                  showToast(result.message, result.ok ? 'success' : 'error')
                }}>删除</Button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/** 单车管理空间 */
function OwnerSpace({ carpoolId }: { carpoolId: string }) {
  const { data } = useAppStore()
  const carpool = data.carpools.find((item) => item.id === carpoolId)

  return (
    <>
      <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate('/manage')}>
        <span aria-hidden="true">←</span> 返回我的车次
      </button>

      {carpool && (
        <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={carpool.status} />
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-primaryDark">
                {purchaseModeText[purchaseModeOf(carpool)]}
              </span>
              <span className="text-xs text-muted">车次管理</span>
            </div>
            <h1 className="text-balance text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">{carpool.title}</h1>
            <p className="mt-3 text-sm leading-6 text-muted">{carpool.eventName} · {carpool.productName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate(`/detail/${carpool.id}`)}>查看公开详情</Button>
          </div>
        </div>
      )}

      <OwnerConsole carpoolId={carpoolId} />
    </>
  )
}
