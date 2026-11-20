import { useMemo, useState } from 'react'
import { Avatar, Button, Card, EmptyState, StatusBadge, cn, inputClass } from '../components/UI'
import { useAppStore } from '../store'
import { formatDateTime, formatFullDateTime, money, navigate } from '../utils'
import { eventOf, eventsOf, groupOf, memberPriceOf, productCategoriesOf, productsOf } from '../lib/catalog'
import { purchaseModeOf, purchaseModeText } from '../lib/share'
import { recruitmentStateOf } from '../lib/recruitOps'

type SortKey = 'latest' | 'progress'

/**
 * V2.0 团体与活动页面。
 * 左侧为当前团体的活动列表，右侧为当前选中活动的拼车广场。
 * 「发起拼车」只能从具体活动页面进入，不允许绕过活动选择。
 */
export function EventSquarePage({ groupId, eventId }: { groupId: string; eventId: string }) {
  const { data } = useAppStore()
  const group = groupOf(data, groupId)
  const event = eventOf(data, eventId)
  const groupEvents = eventsOf(data, groupId)

  const [sort, setSort] = useState<SortKey>('latest')
  const [provinces, setProvinces] = useState<string[]>([])
  const [members, setMembers] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])

  const products = productsOf(data, eventId)
  const categoryOptions = productCategoriesOf(data, eventId)
  const memberOptions = useMemo(() => {
    const set = new Set<string>()
    products.forEach((product) => product.members.forEach((member) => set.add(member)))
    return [...set]
  }, [products])

  const provinceOptions = useMemo(() => {
    const set = new Set<string>()
    data.carpools
      .filter((carpool) => carpool.eventId === eventId)
      .forEach((carpool) => {
        const owner = data.users.find((user) => user.id === carpool.ownerId)
        if (owner?.province) set.add(owner.province)
      })
    return [...set].sort()
  }, [data, eventId])

  const listed = useMemo(
    () => data.carpools.filter((carpool) => carpool.eventId === eventId),
    [data.carpools, eventId],
  )

  const filtered = useMemo(() => {
    const result = listed.filter((carpool) => {
      const owner = data.users.find((user) => user.id === carpool.ownerId)
      // 省份多选：同维度 OR
      if (provinces.length && (!owner?.province || !provinces.includes(owner.province))) return false
      // 成员位置多选：同维度 OR
      if (members.length) {
        const carpoolMembers = (carpool.shareGroups ?? [])
          .map((group) => group.member)
          .filter((member): member is string => Boolean(member))
        if (!carpoolMembers.some((member) => members.includes(member))) return false
      }
      // 商品类别多选：同维度 OR
      if (categories.length) {
        const carpoolCategories = (carpool.shareGroups ?? [])
          .map((group) => products.find((product) => product.id === group.productId)?.category)
          .filter((category): category is string => Boolean(category))
        if (!carpoolCategories.some((category) => categories.includes(category))) return false
      }
      return true
    })
    return [...result].sort((a, b) => {
      if (sort === 'progress') {
        const sa = recruitmentStateOf(data, a.id)
        const sb = recruitmentStateOf(data, b.id)
        const pa = sa.occupiedSlots / Math.max(1, sa.openSlots)
        const pb = sb.occupiedSlots / Math.max(1, sb.openSlots)
        if (pa !== pb) return pb - pa
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [listed, data, provinces, members, categories, sort])

  if (!group || !event) {
    return (
      <EmptyState
        title="没有找到这个活动"
        description="活动可能已被移除，返回广场选择其他活动。"
        action={<Button onClick={() => navigate('/')}>返回拼车广场</Button>}
      />
    )
  }

  const toggle = (list: string[], value: string, setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  }

  const hasFilter = provinces.length > 0 || members.length > 0 || categories.length > 0

  return (
    <>
      <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate('/')}>
        <span aria-hidden="true">←</span> 返回拼车广场
      </button>

      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl text-xs font-black text-white" style={{ backgroundColor: group.color }} aria-hidden="true">
              {group.shortName.slice(0, 2)}
            </span>
            <span className="text-sm font-bold text-muted">{group.name}</span>
          </div>
          <h1 className="text-balance text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">{event.name}</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            {event.bannerSubtitle ?? group.description}
          </p>
          <p className="mt-2 text-xs text-muted">官方下单截止时间：{formatFullDateTime(event.orderDeadline)}</p>
        </div>
        <Button size="lg" onClick={() => navigate(`/create?group=${group.id}&event=${event.id}`)}>
          在「{event.name}」发起拼车 <span aria-hidden="true">＋</span>
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card className="p-4">
            <h2 className="text-sm font-bold text-ink">{group.name} 的活动</h2>
            <div className="mt-3 space-y-1.5">
              {groupEvents.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/event/${group.id}/${item.id}`)}
                  className={cn(
                    'block w-full rounded-xl px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200',
                    item.id === event.id ? 'bg-purple-50 text-primaryDark' : 'text-ink hover:bg-slate-50',
                  )}
                >
                  <span className="block truncate text-sm font-bold">{item.name}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">{formatDateTime(item.orderDeadline)} 官方截止</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-bold text-ink">活动商品</h2>
            <div className="mt-3 space-y-2">
              {products.map((product) => (
                <div key={product.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <p className="truncate text-sm font-bold text-ink">{product.name} · {product.spec}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{product.category} · {money(product.price)} · 每人限购 {product.perUserLimit} 件</p>
                </div>
              ))}
            </div>
          </Card>
        </aside>

        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-ink">筛选与排序</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSort('latest')}
                  className={cn('min-h-9 rounded-lg px-3 text-xs font-bold transition', sort === 'latest' ? 'bg-primary text-white' : 'bg-slate-100 text-muted hover:bg-slate-200')}
                >
                  按发布时间
                </button>
                <button
                  onClick={() => setSort('progress')}
                  className={cn('min-h-9 rounded-lg px-3 text-xs font-bold transition', sort === 'progress' ? 'bg-primary text-white' : 'bg-slate-100 text-muted hover:bg-slate-200')}
                >
                  按招募进度
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FilterGroup label="省份" options={provinceOptions} selected={provinces} onToggle={(value) => toggle(provinces, value, setProvinces)} />
              <FilterGroup label="成员位置" options={memberOptions} selected={members} onToggle={(value) => toggle(members, value, setMembers)} />
              <FilterGroup label="商品类别" options={categoryOptions} selected={categories} onToggle={(value) => toggle(categories, value, setCategories)} />
            </div>

            {hasFilter && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <p className="text-xs text-muted">筛选结果 {filtered.length} / {listed.length} 辆（同维度取并集，跨维度取交集）</p>
                <Button size="sm" variant="ghost" onClick={() => { setProvinces([]); setMembers([]); setCategories([]) }}>清除筛选</Button>
              </div>
            )}
          </Card>

          {filtered.length ? (
            <div className="space-y-4">
              {filtered.map((carpool) => {
                const owner = data.users.find((user) => user.id === carpool.ownerId)
                const state = recruitmentStateOf(data, carpool.id)
                const percent = state.openSlots ? Math.round((state.occupiedSlots / state.openSlots) * 100) : 0
                return (
                  <Card key={carpool.id} className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={carpool.status} />
                          <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-primaryDark">
                            {purchaseModeText[purchaseModeOf(carpool)]}
                          </span>
                          <span className="text-[11px] text-muted">{formatDateTime(carpool.deadline)} 截团</span>
                        </div>
                        <button
                          className="mt-3 block max-w-full text-left text-lg font-bold leading-7 tracking-tight text-ink transition hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
                          onClick={() => navigate(`/detail/${carpool.id}`)}
                        >
                          {carpool.title}
                        </button>
                        <p className="mt-1 text-sm text-muted">{carpool.productName}</p>
                        {owner && (
                          <div className="mt-3 flex items-center gap-2">
                            <Avatar user={owner} size="sm" />
                            <span className="text-xs text-muted">
                              {owner.nickname}
                              {owner.province ? ` · ${owner.province}` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="w-full sm:w-52">
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span>招募进度</span>
                          <span className="font-bold text-ink">{state.occupiedSlots} / {state.openSlots} 份（{percent}%）</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${percent}%` }} />
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-muted">{state.hint}</p>
                        <Button size="sm" className="mt-3 w-full" onClick={() => navigate(`/detail/${carpool.id}`)}>查看详情</Button>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          ) : (
            <EmptyState
              title="该活动下暂时没有匹配的拼车"
              description="可以调整筛选条件，或者直接为这个活动发起一辆拼车。"
              action={<div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={() => { setProvinces([]); setMembers([]); setCategories([]) }}>清除筛选</Button>
                <Button onClick={() => navigate(`/create?group=${group.id}&event=${event.id}`)}>发起拼车</Button>
              </div>}
            />
          )}
        </div>
      </div>
    </>
  )
}

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  if (!options.length) return null
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-ink">{label}（多选）</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option)
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              aria-pressed={active}
              className={cn(
                'min-h-8 rounded-lg border px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200',
                active ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-muted hover:border-purple-300 hover:text-ink',
              )}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
