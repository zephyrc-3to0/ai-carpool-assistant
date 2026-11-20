import type { AddressStatus, CarpoolStatus, DomesticStatus, InternationalStatus, NotificationType } from './types'

export const money = (value: number) => `¥${value.toFixed(2)}`

export function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatFullDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export const statusText: Record<CarpoolStatus, string> = {
  recruiting: '招募中',
  expired: '招募已截止',
  cut: '已截团',
  purchasing: '采购履约中',
  completed: '已完成',
  failed: '已流团',
}

export const internationalStatusText: Record<InternationalStatus, string> = {
  waiting: '等待发货',
  in_transit: '国际运输中',
  customs: '清关 / 转运中',
  domestic_transit: '国内运输中',
  received: '车主已签收',
  checked: '到货检查完成',
}

/** 国际物流状态顺序（用于时间线展示） */
export const internationalStatusOrder: InternationalStatus[] = [
  'waiting',
  'in_transit',
  'customs',
  'domestic_transit',
  'received',
  'checked',
]

/** 清关完成后会触发地址收集的运输状态 */
export const collectionTriggerStatuses: InternationalStatus[] = ['domestic_transit', 'received', 'checked']

export const addressStatusText: Record<AddressStatus, string> = {
  pending: '待填写',
  submitted: '已提交',
  overdue: '逾期未提交',
}

export const domesticStatusText: Record<DomesticStatus, string> = {
  pending_address: '待填写地址',
  pending_pack: '待打包',
  pending_ship: '待发货',
  shipped: '已发货',
  received: '已签收',
}

export const notificationTypeText: Record<NotificationType, string> = {
  address_required: '地址提醒',
  address_urge: '催促填写',
  arrival_checked: '到货检查',
  domestic_shipped: '国内发货',
  reputation_penalty: '信誉扣分',
  appeal_result: '申诉结果',
  complaint_result: '投诉结果',
  carpool_cut: '拼车截团',
  carpool_expired: '招募截止',
  recruitment_extended: '招募延期',
  carpool_failed: '拼车流团',
  freight_bill: '国际运费',
  rule_change: '规则变更',
  slot_takeover: '空位承接',
}

/** 拼装完整地址文本 */
export function formatAddress(address: {
  receiverName?: string
  phone?: string
  province?: string
  city?: string
  district?: string
  detail?: string
}) {
  const region = [address.province, address.city, address.district].filter(Boolean).join(' ')
  return `${region}${region ? ' ' : ''}${address.detail ?? ''}`.trim()
}

export const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** ISO 时间 → datetime-local 输入框格式 */
export function toLocalInput(iso?: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** datetime-local 输入框格式 → ISO 时间 */
export function fromLocalInput(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

export function navigate(path: string) {
  window.location.hash = path.startsWith('/') ? path : `/${path}`
}

export function getRoute() {
  // 服务端渲染（如冒烟测试）时没有 window，返回默认路由
  if (typeof window === 'undefined') {
    return { pathname: '/', searchParams: new URLSearchParams() }
  }
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [pathname, search = ''] = raw.split('?')
  return { pathname, searchParams: new URLSearchParams(search) }
}
