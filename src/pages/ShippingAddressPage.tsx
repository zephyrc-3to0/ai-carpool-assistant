import { useState } from 'react'
import { Button, Card, EmptyState, inputClass } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import { formatAddress, navigate } from '../utils'
import { getOrderAddress, sortSavedAddresses } from '../lib/logistics'

type Tab = 'saved' | 'manual'

export function ShippingAddressPage({ carpoolId }: { carpoolId: string }) {
  const { data, currentUser, submitOrderAddress } = useAppStore()
  const showToast = useToast()
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  const existing = getOrderAddress(data, carpoolId, currentUser.id)

  const saved = sortSavedAddresses(data.savedAddresses.filter((item) => item.userId === currentUser.id))
  const [tab, setTab] = useState<Tab>(saved.length ? 'saved' : 'manual')
  const [selectedId, setSelectedId] = useState<string | null>(saved.find((item) => item.isDefault)?.id ?? saved[0]?.id ?? null)

  const [form, setForm] = useState({
    label: existing?.label && existing.label !== '本次填写' ? existing.label : '',
    receiverName: existing?.status === 'submitted' ? existing.receiverName : '',
    phone: existing?.status === 'submitted' ? existing.phone : '',
    province: existing?.status === 'submitted' ? existing.province : '',
    city: existing?.status === 'submitted' ? existing.city : '',
    district: existing?.status === 'submitted' ? existing.district : '',
    detail: existing?.status === 'submitted' ? existing.detail : '',
  })
  const [saveToBook, setSaveToBook] = useState(false)

  if (!carpool) {
    return <EmptyState title="没有找到这辆拼车" description="返回我的拼车重新进入。" action={<Button onClick={() => navigate('/mine')}>返回我的拼车</Button>} />
  }

  const isRider = carpool.positions.some((slot) => slot.occupantId === currentUser.id)
  if (!isRider) {
    return <EmptyState title="你没有加入这辆拼车" description="只有本车车员可以填写收货地址。" action={<Button onClick={() => navigate(`/detail/${carpool.id}`)}>查看车次详情</Button>} />
  }

  const collectionOpen = Boolean(carpool.addressCollection?.enabled)
  if (!collectionOpen) {
    return (
      <EmptyState
        title="车主还没有开启地址收集"
        description="当国际物流开始运输后，系统会自动开启地址收集，届时你就可以在这里填写收货地址。"
        action={<Button onClick={() => navigate(`/shipping/${carpoolId}`)}>查看物流进度</Button>}
      />
    )
  }

  const selected = saved.find((item) => item.id === selectedId)
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const submitSaved = () => {
    if (!selected) {
      showToast('请先选择一个地址。', 'error')
      return
    }
    const result = submitOrderAddress(carpoolId, {
      label: selected.label,
      receiverName: selected.receiverName,
      phone: selected.phone,
      province: selected.province,
      city: selected.city,
      district: selected.district,
      detail: selected.detail,
      saveToBook: false,
      sourceAddressId: selected.id,
    })
    showToast(result.message, result.ok ? 'success' : 'error')
    if (result.ok) navigate(`/shipping/${carpoolId}`)
  }

  const submitManual = () => {
    const result = submitOrderAddress(carpoolId, { ...form, saveToBook })
    showToast(result.message, result.ok ? 'success' : 'error')
    if (result.ok) navigate(`/shipping/${carpoolId}`)
  }

  return (
    <>
      <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate(`/shipping/${carpoolId}`)}>
        <span aria-hidden="true">←</span> 返回物流详情
      </button>

      <div className="mx-auto max-w-3xl">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">Shipping Address</p>
        <h1 className="text-balance text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">
          {existing?.status === 'submitted' ? '修改收货地址' : '填写收货地址'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {carpool.title} · 提交后车主会按这个地址统一打包发货。
        </p>

        {existing?.status === 'submitted' && (
          <div className="mt-5 rounded-xl border border-success/20 bg-successSoft px-4 py-3 text-sm leading-6 text-success">
            你已提交过收货地址：{formatAddress(existing)}。本次修改只影响当前拼车订单，不会改变个人地址簿中的记录。
          </div>
        )}

        <div className="mt-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-fit" role="tablist" aria-label="填写方式">
          <button
            role="tab"
            aria-selected={tab === 'saved'}
            onClick={() => setTab('saved')}
            className={`min-h-10 flex-1 rounded-lg px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 sm:flex-none ${tab === 'saved' ? 'bg-primary text-white shadow-button' : 'text-muted hover:bg-slate-50 hover:text-ink'}`}
          >
            使用已保存地址
          </button>
          <button
            role="tab"
            aria-selected={tab === 'manual'}
            onClick={() => setTab('manual')}
            className={`min-h-10 flex-1 rounded-lg px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-purple-200 sm:flex-none ${tab === 'manual' ? 'bg-primary text-white shadow-button' : 'text-muted hover:bg-slate-50 hover:text-ink'}`}
          >
            填写临时地址
          </button>
        </div>

        {tab === 'saved' && (
          <Card className="mt-5 p-5 sm:p-7">
            <h2 className="text-lg font-bold text-ink">选择地址簿中的地址</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted">默认地址会排在最前面。选中的地址会被复制为本车订单的地址快照。</p>

            {saved.length ? (
              <div className="mt-5 space-y-3">
                {saved.map((address) => {
                  const active = address.id === selectedId
                  return (
                    <label
                      key={address.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${active ? 'border-primary bg-purple-50' : 'border-slate-200 hover:border-purple-200'}`}
                    >
                      <input
                        type="radio"
                        name="saved-address"
                        className="mt-1 h-4 w-4 accent-[#7557c8]"
                        checked={active}
                        onChange={() => setSelectedId(address.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg border border-purple-200 bg-white px-2 py-0.5 text-xs font-bold text-primaryDark">{address.label}</span>
                          {address.isDefault && <span className="rounded-lg border border-success/20 bg-successSoft px-2 py-0.5 text-xs font-bold text-success">默认</span>}
                        </span>
                        <span className="mt-2 block text-sm font-bold text-ink">{address.receiverName} · {address.phone}</span>
                        <span className="mt-1 block text-sm leading-6 text-muted">{formatAddress(address)}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center">
                <p className="text-sm font-bold text-ink">地址簿还是空的</p>
                <p className="mt-2 text-xs leading-5 text-muted">可以切换到「填写临时地址」，或者先去个人中心添加常用地址。</p>
                <Button size="sm" variant="secondary" className="mt-4" onClick={() => navigate('/addresses')}>去添加地址</Button>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setTab('manual')}>改用临时地址</Button>
              <Button onClick={submitSaved} disabled={!saved.length}>确认使用该地址</Button>
            </div>
          </Card>
        )}

        {tab === 'manual' && (
          <Card className="mt-5 p-5 sm:p-7">
            <h2 className="text-lg font-bold text-ink">填写本次使用的收货地址</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted">该地址只保存在本次拼车订单中，不会影响地址簿中的其他地址。</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">地址标签</span>
                <input className={inputClass} value={form.label} onChange={(event) => update('label', event.target.value)} placeholder="例如：学校 / 家 / 宿舍" maxLength={10} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">收件人姓名 *</span>
                <input className={inputClass} value={form.receiverName} onChange={(event) => update('receiverName', event.target.value)} placeholder="虚构姓名即可" maxLength={20} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">联系电话 *</span>
                <input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="11 位手机号" inputMode="numeric" maxLength={13} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">省份 *</span>
                <input className={inputClass} value={form.province} onChange={(event) => update('province', event.target.value)} placeholder="例如：上海市" maxLength={20} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">城市 *</span>
                <input className={inputClass} value={form.city} onChange={(event) => update('city', event.target.value)} placeholder="例如：上海市" maxLength={20} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">区县</span>
                <input className={inputClass} value={form.district} onChange={(event) => update('district', event.target.value)} placeholder="例如：徐汇区" maxLength={20} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-ink">详细地址 *</span>
                <input className={inputClass} value={form.detail} onChange={(event) => update('detail', event.target.value)} placeholder="街道、门牌号、楼层等" maxLength={60} />
              </label>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#7557c8]" checked={saveToBook} onChange={(event) => setSaveToBook(event.target.checked)} />
              <span className="text-sm leading-6 text-ink">同时保存到我的地址簿</span>
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setTab('saved')} disabled={!saved.length}>改用已保存地址</Button>
              <Button onClick={submitManual}>提交收货地址</Button>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
