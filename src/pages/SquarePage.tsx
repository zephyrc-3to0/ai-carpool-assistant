import { useMemo, useState } from 'react'
import { CarpoolCard } from '../components/CarpoolCard'
import { Button, EmptyState, PageHeader, inputClass } from '../components/UI'
import { useAppStore } from '../store'
import { navigate } from '../utils'

export function SquarePage() {
  const { data } = useAppStore()
  const [query, setQuery] = useState('')
  const [product, setProduct] = useState('all')
  const [position, setPosition] = useState('all')

  const recruiting = useMemo(() => data.carpools.filter((carpool) => carpool.status === 'recruiting'), [data.carpools])
  const products = useMemo(() => [...new Set(recruiting.map((carpool) => carpool.productName))].sort(), [recruiting])
  const positions = useMemo(() => [...new Set(recruiting.flatMap((carpool) => carpool.positions.map((slot) => slot.label.replace(/\s[①②③④⑤⑥⑦⑧⑨]|\s\d+$/, ''))))].sort(), [recruiting])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return recruiting.filter((carpool) => {
      const matchesQuery = !normalized || [carpool.title, carpool.eventName, carpool.productName].some((value) => value.toLowerCase().includes(normalized))
      const matchesProduct = product === 'all' || carpool.productName === product
      const matchesPosition = position === 'all' || carpool.positions.some((slot) => slot.label.startsWith(position) && !slot.occupantId)
      return matchesQuery && matchesProduct && matchesPosition
    })
  }, [product, position, query, recruiting])

  const clearFilters = () => {
    setQuery('')
    setProduct('all')
    setPosition('all')
  }

  return (
    <>
      <section className="relative mb-8 overflow-hidden rounded-[28px] border border-purple-200/70 bg-hero px-5 py-8 shadow-card sm:px-9 sm:py-10">
        <div className="hero-grid absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="relative grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">一起喜欢，也一起出发</p>
            <h1 className="text-balance text-3xl font-black leading-tight tracking-[-0.035em] text-ink sm:text-5xl">找到合适的位置，<br className="hidden sm:block" />和同好搭一辆车。</h1>
            <p className="mt-4 max-w-xl text-pretty text-sm leading-7 text-muted sm:text-base">浏览正在招募的周边拼车，选好成员位置后完成模拟支付，拼成即可进入专属群聊。</p>
          </div>
          <Button size="lg" onClick={() => navigate('/create')} className="w-full lg:w-auto">
            发起一辆拼车 <span aria-hidden="true">＋</span>
          </Button>
        </div>
      </section>

      <PageHeader
        eyebrow="Carpool Square"
        title="正在招募"
        description={`当前共有 ${recruiting.length} 辆拼车开放位置。示例数据仅用于演示，不代表真实活动信息。`}
      />

      <section className="mb-6 rounded-card border border-slate-200 bg-white p-4 shadow-card" aria-label="拼车筛选">
        <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_180px_auto]">
          <label className="relative">
            <span className="sr-only">搜索拼车</span>
            <input
              className={`${inputClass} pr-16`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、活动或商品"
              type="search"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">搜索</span>
          </label>
          <label>
            <span className="sr-only">按商品筛选</span>
            <select className={inputClass} value={product} onChange={(event) => setProduct(event.target.value)}>
              <option value="all">全部商品</option>
              {products.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">按成员位置筛选</span>
            <select className={inputClass} value={position} onChange={(event) => setPosition(event.target.value)}>
              <option value="all">全部位置</option>
              {positions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <Button variant="ghost" onClick={clearFilters} disabled={!query && product === 'all' && position === 'all'}>清除筛选</Button>
        </div>
      </section>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">找到 <span className="font-bold text-ink">{filtered.length}</span> 辆匹配拼车</p>
      </div>

      {filtered.length > 0 ? (
        <div className="grid items-stretch gap-5 lg:grid-cols-2">
          {filtered.map((carpool) => <CarpoolCard key={carpool.id} carpool={carpool} />)}
        </div>
      ) : (
        <EmptyState
          title="暂时没有匹配的拼车"
          description="换一个关键词或筛选条件，也可以自己发起一辆新的拼车。"
          action={<div className="flex flex-wrap justify-center gap-2"><Button variant="secondary" onClick={clearFilters}>清除筛选</Button><Button onClick={() => navigate('/create')}>发起拼车</Button></div>}
        />
      )}
    </>
  )
}
