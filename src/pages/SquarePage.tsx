import { useMemo, useState } from 'react'
import { Button, Card, EmptyState, PageHeader, inputClass } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import { navigate } from '../utils'
import { eventsOf, groupOf, groupsOf, productCategoriesOf, productsOf } from '../lib/catalog'
import { formatDateTime } from '../utils'

/**
 * V2.0 拼车广场首页。
 * 承担两件事：发现热门活动与团体目录；提供团体搜索入口。
 * 真正的拼车列表在「团体与活动页面」中按活动展示。
 */
export function SquarePage() {
  const { data, submitEventRequest } = useAppStore()
  const showToast = useToast()
  const [query, setQuery] = useState('')
  const [requestOpen, setRequestOpen] = useState(false)
  const [request, setRequest] = useState({ groupId: '', eventName: '', orderDeadline: '', note: '' })

  const groups = groupsOf(data)
  const events = eventsOf(data)

  const banners = useMemo(() => {
    const hot = events.filter((event) => event.hot)
    const rest = events.filter((event) => !event.hot)
    return [...hot, ...rest].slice(0, 5)
  }, [events])

  const normalized = query.trim().toLowerCase()
  const matchedGroups = useMemo(() => {
    if (!normalized) return groups
    return groups.filter((group) => {
      const groupEvents = events.filter((event) => event.groupId === group.id)
      const haystack = [
        group.name,
        group.shortName,
        group.description,
        ...groupEvents.map((event) => event.name),
        ...groupEvents.flatMap((event) => productsOf(data, event.id).map((product) => `${product.name} ${product.spec}`)),
      ].join(' ').toLowerCase()
      return haystack.includes(normalized)
    })
  }, [groups, events, normalized, data])

  const openEventRequest = () => {
    setRequest({
      groupId: groups[0]?.id ?? '',
      eventName: query.trim(),
      orderDeadline: '',
      note: '',
    })
    setRequestOpen(true)
  }

  const submitRequest = () => {
    const timestamp = new Date(request.orderDeadline).getTime()
    if (!Number.isFinite(timestamp)) {
      showToast('请选择有效的官方下单截止时间。', 'error')
      return
    }
    const result = submitEventRequest({
      groupId: request.groupId,
      eventName: request.eventName,
      orderDeadline: new Date(timestamp).toISOString(),
      note: request.note,
    })
    showToast(result.message, result.ok ? 'success' : 'error')
    if (result.ok) setRequestOpen(false)
  }

  return (
    <>
      <section className="relative mb-8 overflow-hidden rounded-[28px] border border-purple-200/70 bg-hero px-5 py-8 shadow-card sm:px-9 sm:py-10">
        <div className="hero-grid absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="relative grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">一起喜欢，也一起出发</p>
            <h1 className="text-balance text-3xl font-black leading-tight tracking-[-0.035em] text-ink sm:text-5xl">找到合适的活动，<br className="hidden sm:block" />和同好搭一辆车。</h1>
            <p className="mt-4 max-w-xl text-pretty text-sm leading-7 text-muted sm:text-base">按团体与活动浏览正在招募的周边拼车，选好商品或成员位置后完成模拟支付，拼成后进入专属群聊。</p>
          </div>
          <div className="w-full lg:w-auto">
            <label className="relative block">
              <span className="sr-only">搜索团体或活动</span>
              <input
                className={`${inputClass} bg-white pr-4`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索团体、活动或周边"
                type="search"
              />
            </label>
          </div>
        </div>
      </section>

      {banners.length > 0 && (
        <section className="mb-9" aria-label="近期热门活动">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Hot Events</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">近期热门活动</h2>
            </div>
            <span className="text-xs text-muted">点击进入对应活动的拼车广场</span>
          </div>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
            {banners.map((event) => {
              const group = groupOf(data, event.groupId)
              const categories = productCategoriesOf(data, event.id)
              return (
                <button
                  key={event.id}
                  onClick={() => navigate(`/event/${event.groupId}/${event.id}`)}
                  className="group flex w-[260px] flex-none flex-col rounded-card border border-slate-200 bg-white p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-purple-200 hover:shadow-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
                >
                  <span
                    className="mb-4 inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{ backgroundColor: `${group?.color ?? '#7557c8'}1a`, color: group?.color ?? '#7557c8' }}
                  >
                    {group?.name ?? '团体'}
                  </span>
                  <h3 className="text-lg font-bold leading-7 tracking-tight text-ink transition group-hover:text-primaryDark">{event.bannerTitle ?? event.name}</h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{event.bannerSubtitle ?? event.name}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-[11px] text-muted">
                    <span className="rounded-lg bg-slate-50 px-2 py-1 font-semibold">{categories.join(' / ') || '周边'}</span>
                    <span>{formatDateTime(event.orderDeadline)} 官方下单截止</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <PageHeader
        eyebrow="Artist Groups"
        title="艺人团体目录"
        description={`当前共有 ${groups.length} 个团体、${events.length} 个活动。示例数据仅用于演示，不代表真实活动信息。`}
      />

      {matchedGroups.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {matchedGroups.map((group) => {
            const groupEvents = events.filter((event) => event.groupId === group.id)
            const carpoolCount = data.carpools.filter((carpool) => carpool.groupId === group.id && carpool.status === 'recruiting').length
            return (
              <Card key={group.id} className="flex flex-col p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-12 w-12 flex-none place-items-center rounded-2xl text-base font-black text-white"
                    style={{ backgroundColor: group.color }}
                    aria-hidden="true"
                  >
                    {group.shortName.slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold text-ink">{group.name}</h3>
                    <p className="mt-0.5 text-[11px] text-muted">{group.memberCount} 位成员 · {carpoolCount} 辆正在招募</p>
                  </div>
                </div>
                <p className="mt-4 line-clamp-2 text-xs leading-5 text-muted">{group.description}</p>
                <div className="mt-4 space-y-2">
                  {groupEvents.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => navigate(`/event/${group.id}/${event.id}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-left transition hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink">{event.name}</span>
                        <span className="mt-0.5 block text-[11px] text-muted">{formatDateTime(event.orderDeadline)} 官方下单截止</span>
                      </span>
                      <span className="flex-none text-xs font-bold text-primary">进入 →</span>
                    </button>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="没有找到相关团体或活动"
          description="换一个关键词试试，或者浏览全部团体目录。"
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => setQuery('')}>清除搜索</Button>
              <Button onClick={openEventRequest}>申请收录活动</Button>
            </div>
          )}
        />
      )}

      {requestOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="event-request-title">
          <Card className="modal-enter w-full max-w-lg p-6 shadow-float">
            <h2 id="event-request-title" className="text-xl font-bold text-ink">申请收录活动</h2>
            <p className="mt-2 text-sm leading-6 text-muted">活动审核通过后不会自动发布拼车；请回到草稿，由你手动确认并发布。</p>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">所属团体</span>
                <select className={inputClass} value={request.groupId} onChange={(event) => setRequest((current) => ({ ...current, groupId: event.target.value }))}>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">活动名称</span>
                <input className={inputClass} value={request.eventName} onChange={(event) => setRequest((current) => ({ ...current, eventName: event.target.value }))} maxLength={60} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">官方下单截止时间</span>
                <input type="datetime-local" className={inputClass} value={request.orderDeadline} onChange={(event) => setRequest((current) => ({ ...current, orderDeadline: event.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">补充说明</span>
                <textarea className={`${inputClass} min-h-24 resize-y py-3 leading-6`} value={request.note} onChange={(event) => setRequest((current) => ({ ...current, note: event.target.value }))} maxLength={300} placeholder="可填写官方活动页面或商品说明" />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRequestOpen(false)}>取消</Button>
              <Button onClick={submitRequest}>提交申请</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
