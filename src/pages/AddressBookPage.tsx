import { useState } from 'react'
import { Button, Card, EmptyState, PageHeader, inputClass } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import type { SavedAddress } from '../types'
import { formatAddress, navigate } from '../utils'
import { sortSavedAddresses } from '../lib/logistics'

interface FormState {
  label: string
  receiverName: string
  phone: string
  province: string
  city: string
  district: string
  detail: string
}

const emptyForm: FormState = {
  label: '',
  receiverName: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  detail: '',
}

export function AddressBookPage() {
  const { data, currentUser, addSavedAddress, updateSavedAddress, deleteSavedAddress, setDefaultSavedAddress } = useAppStore()
  const showToast = useToast()
  const [form, setForm] = useState<FormState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SavedAddress | null>(null)

  const mine = sortSavedAddresses(data.savedAddresses.filter((item) => item.userId === currentUser.id))
  const update = (key: keyof FormState, value: string) => setForm((current) => (current ? { ...current, [key]: value } : current))

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
  }

  const openEdit = (address: SavedAddress) => {
    setEditingId(address.id)
    setForm({
      label: address.label,
      receiverName: address.receiverName,
      phone: address.phone,
      province: address.province,
      city: address.city,
      district: address.district,
      detail: address.detail,
    })
  }

  const closeForm = () => {
    setForm(null)
    setEditingId(null)
  }

  const submit = () => {
    if (!form) return
    const result = editingId
      ? updateSavedAddress(editingId, form)
      : addSavedAddress(form)
    showToast(result.message, result.ok ? 'success' : 'error')
    if (result.ok) closeForm()
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    const result = deleteSavedAddress(pendingDelete.id)
    showToast(result.message, result.ok ? 'success' : 'error')
    if (result.ok) setPendingDelete(null)
  }

  return (
    <>
      <PageHeader
        eyebrow="Address Book"
        title="我的地址"
        description="保存常用的收货地址，下单拼车时可以一键选用。地址簿与已提交的订单地址相互独立。"
        action={<Button onClick={openCreate}>新增地址</Button>}
      />

      <div className="mb-6 rounded-xl border border-purple-100 bg-purple-50/60 px-4 py-3 text-xs leading-5 text-primaryDark">
        演示提示：当前为本地模拟环境，地址仅保存在本机浏览器（localStorage），不同模拟账号之间的数据隔离仅用于演示，不构成真实的安全保护。请使用虚构的姓名、电话与地址。
      </div>

      {form && (
        <Card className="mb-6 p-5 sm:p-7">
          <h2 className="text-lg font-bold text-ink">{editingId ? '编辑地址' : '新增地址'}</h2>
          <p className="mt-1 text-sm text-muted">带 * 的字段为必填项。</p>

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

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={closeForm}>取消</Button>
            <Button onClick={submit}>{editingId ? '保存修改' : '保存地址'}</Button>
          </div>
        </Card>
      )}

      {mine.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {mine.map((address) => (
            <Card key={address.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-bold text-primaryDark">{address.label}</span>
                  {address.isDefault && <span className="rounded-lg border border-success/20 bg-successSoft px-2 py-1 text-xs font-bold text-success">默认地址</span>}
                </div>
              </div>
              <p className="mt-3 text-sm font-bold text-ink">{address.receiverName} · {address.phone}</p>
              <p className="mt-1.5 text-sm leading-6 text-muted">{formatAddress(address)}</p>

              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                <Button size="sm" variant="secondary" onClick={() => openEdit(address)}>编辑</Button>
                {!address.isDefault && <Button size="sm" variant="ghost" onClick={() => {
                  const result = setDefaultSavedAddress(address.id)
                  showToast(result.message, result.ok ? 'success' : 'error')
                }}>设为默认</Button>}
                <Button size="sm" variant="danger" onClick={() => setPendingDelete(address)}>删除</Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="还没有保存任何地址"
          description="新增一个常用地址，之后在拼车补充收货地址时可以一键选用。"
          action={<Button onClick={openCreate}>新增地址</Button>}
        />
      )}

      <div className="mt-8 flex justify-center">
        <Button variant="ghost" onClick={() => navigate('/profile')}>返回个人中心</Button>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-address-title">
          <Card className="modal-enter w-full max-w-md p-6 shadow-float">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-dangerSoft text-lg font-black text-danger" aria-hidden="true">!</span>
            <h2 id="delete-address-title" className="mt-5 text-xl font-bold text-ink">确认删除这条地址？</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              {pendingDelete.receiverName} · {formatAddress(pendingDelete)}。删除后可以在「我的地址」中重新添加。已经提交的拼车订单地址不受影响。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>暂不删除</Button>
              <Button variant="danger" onClick={confirmDelete}>确认删除</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
