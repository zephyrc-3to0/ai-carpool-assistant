/**
 * V2.0 其他状态迁移：采购凭证、异常处理、拼车草稿、活动收录申请。
 */
import type { AppData, CarpoolDraft, EventSubmission, ExceptionRecord, PurchaseVoucher } from '../types'
import { VOUCHER_IMAGE_MAX_BYTES, VOUCHER_IMAGES_TOTAL_MAX_CHARS } from './imageUpload'
import { uid } from '../utils'

export interface OpResult<T = undefined> {
  ok: boolean
  message: string
  next: AppData
  data?: T
}

const fail = <T,>(message: string, data: AppData): OpResult<T> => ({ ok: false, message, next: data })
const done = <T,>(message: string, data: AppData, payload?: T): OpResult<T> => ({ ok: true, message, next: data, data: payload })

const now = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// 采购凭证
// ---------------------------------------------------------------------------

/** 车主上传官方下单凭证并记录采购状态 */
export function uploadVoucherOp(
  data: AppData,
  ownerId: string,
  carpoolId: string,
  input: { title: string; note: string; imageDataUrl?: string; imageName?: string },
): OpResult<PurchaseVoucher> {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  if (carpool.ownerId !== ownerId) return fail('只有车主可以上传采购凭证。', data)
  if (carpool.status !== 'cut' && carpool.status !== 'purchasing') {
    return fail('截团后才能上传官方下单凭证。', data)
  }
  const title = input.title.trim()
  if (!title) return fail('请填写凭证名称。', data)
  if (input.imageDataUrl) {
    if (!input.imageDataUrl.startsWith('data:image/')) return fail('凭证附件必须是图片。', data)
    if (input.imageDataUrl.length > VOUCHER_IMAGE_MAX_BYTES) {
      return fail('凭证图片过大，请重新选择并压缩。', data)
    }
    const existingImageChars = (data.purchaseVouchers ?? []).reduce(
      (sum, item) => sum + (item.imageDataUrl?.length ?? 0),
      0,
    )
    if (existingImageChars + input.imageDataUrl.length > VOUCHER_IMAGES_TOTAL_MAX_CHARS) {
      return fail('本地凭证图片空间已满。请改用纯文字凭证，或选择体积更小的图片。', data)
    }
  }

  const voucher: PurchaseVoucher = {
    id: uid('voucher'),
    carpoolId,
    title,
    note: input.note.trim(),
    status: 'submitted',
    createdAt: now(),
    // 图片可选；纯文字凭证的历史记录保持兼容
    imageDataUrl: input.imageDataUrl,
    imageName: input.imageName,
  }
  const next: AppData = {
    ...data,
    carpools: data.carpools.map((item) => (
      item.id === carpoolId && item.status === 'cut' ? { ...item, status: 'purchasing' as const } : item
    )),
    purchaseVouchers: [voucher, ...(data.purchaseVouchers ?? [])],
  }
  return done(
    carpool.status === 'cut'
      ? '采购凭证已上传，车次进入采购履约阶段。'
      : '采购凭证已上传。',
    next,
    voucher,
  )
}

/** 确认采购凭证（车主本人操作） */
export function confirmVoucherOp(data: AppData, ownerId: string, voucherId: string): OpResult {
  const voucher = (data.purchaseVouchers ?? []).find((item) => item.id === voucherId)
  if (!voucher) return fail('没有找到这条采购凭证。', data)
  const carpool = data.carpools.find((item) => item.id === voucher.carpoolId)
  if (!carpool || carpool.ownerId !== ownerId) return fail('只有车主可以确认采购凭证。', data)
  const next: AppData = {
    ...data,
    purchaseVouchers: (data.purchaseVouchers ?? []).map((item) => (
      item.id === voucherId ? { ...item, status: 'confirmed' as const } : item
    )),
  }
  return done('采购凭证已确认。', next)
}

// ---------------------------------------------------------------------------
// 异常处理
// ---------------------------------------------------------------------------

/** 发起异常记录（费用异议、物流异常等） */
export function raiseExceptionOp(
  data: AppData,
  userId: string,
  carpoolId: string,
  input: { type: ExceptionRecord['type']; title: string; detail: string },
): OpResult<ExceptionRecord> {
  const carpool = data.carpools.find((item) => item.id === carpoolId)
  if (!carpool) return fail('没有找到这辆拼车。', data)
  const canAccess = carpool.ownerId === userId || carpool.positions.some((slot) => slot.occupantId === userId)
  if (!canAccess) return fail('只有本车车主或已参与车员可以提交异常。', data)
  const title = input.title.trim()
  const detail = input.detail.trim()
  if (!title) return fail('请填写异常标题。', data)
  if (detail.length < 5) return fail('请至少用 5 个字说明具体情况。', data)

  const record: ExceptionRecord = {
    id: uid('exc'),
    carpoolId,
    userId,
    type: input.type,
    title,
    detail,
    status: 'open',
    createdAt: now(),
  }
  const next: AppData = {
    ...data,
    exceptions: [record, ...(data.exceptions ?? [])],
  }
  return done('异常已提交，等待车主处理。', next, record)
}

/** 车主处理异常 */
export function resolveExceptionOp(data: AppData, ownerId: string, exceptionId: string): OpResult {
  const record = (data.exceptions ?? []).find((item) => item.id === exceptionId)
  if (!record) return fail('没有找到这条异常记录。', data)
  const carpool = data.carpools.find((item) => item.id === record.carpoolId)
  if (!carpool || carpool.ownerId !== ownerId) return fail('只有车主可以处理该异常。', data)
  if (record.status === 'resolved') return fail('这条异常已经处理过了。', data)
  const timestamp = now()
  const next: AppData = {
    ...data,
    exceptions: (data.exceptions ?? []).map((item) => (
      item.id === exceptionId ? { ...item, status: 'resolved' as const, resolvedAt: timestamp } : item
    )),
    // 费用异议处理完成后恢复为待支付；车主可保留原账单，或在支付前重新登记金额。
    domesticFeeBills: record.type === 'fee'
      ? (data.domesticFeeBills ?? []).map((bill) => (
        bill.carpoolId === record.carpoolId && bill.userId === record.userId && bill.status === 'disputed'
          ? { ...bill, status: 'pending' as const }
          : bill
      ))
      : (data.domesticFeeBills ?? []),
  }
  return done('异常已处理。', next)
}

// ---------------------------------------------------------------------------
// 草稿
// ---------------------------------------------------------------------------

/** 保存拼车草稿（草稿统一在车主管理中查看） */
export function saveDraftOp(
  data: AppData,
  ownerId: string,
  draft: Omit<CarpoolDraft, 'id' | 'ownerId' | 'savedAt'> & { id?: string },
): OpResult<CarpoolDraft> {
  const existing = draft.id ? (data.drafts ?? []).find((item) => item.id === draft.id) : undefined
  if (existing && existing.ownerId !== ownerId) return fail('只能修改自己的草稿。', data)
  const record: CarpoolDraft = {
    id: existing?.id ?? uid('draft'),
    ownerId,
    groupId: draft.groupId,
    eventId: draft.eventId,
    title: draft.title,
    savedAt: now(),
    data: draft.data,
  }
  const next: AppData = {
    ...data,
    drafts: [record, ...(data.drafts ?? []).filter((item) => item.id !== record.id)],
  }
  return done('草稿已保存，可在车主管理中继续编辑。', next, record)
}

/** 删除草稿 */
export function deleteDraftOp(data: AppData, ownerId: string, draftId: string): OpResult {
  const draft = (data.drafts ?? []).find((item) => item.id === draftId)
  if (!draft) return fail('没有找到这份草稿。', data)
  if (draft.ownerId !== ownerId) return fail('只能删除自己的草稿。', data)
  const next: AppData = {
    ...data,
    drafts: (data.drafts ?? []).filter((item) => item.id !== draftId),
  }
  return done('草稿已删除。', next)
}

// ---------------------------------------------------------------------------
// 活动收录申请
// ---------------------------------------------------------------------------

/** 活动未收录时，用户提交收录申请；审核通过后由用户手动发布草稿 */
export function submitEventRequestOp(
  data: AppData,
  userId: string,
  input: { groupId: string; eventName: string; orderDeadline: string; note: string },
): OpResult<EventSubmission> {
  const eventName = input.eventName.trim()
  if (!(data.groups ?? []).some((group) => group.id === input.groupId)) return fail('请选择有效的所属团体。', data)
  if (!eventName) return fail('请填写活动名称。', data)
  if (!input.orderDeadline) return fail('请填写官方下单截止时间。', data)
  const duplicated = (data.eventSubmissions ?? []).some(
    (item) => item.userId === userId && item.eventName === eventName && item.status === 'pending',
  )
  if (duplicated) return fail('你已经提交过该活动的收录申请，正在等待审核。', data)

  const record: EventSubmission = {
    id: uid('evreq'),
    userId,
    groupId: input.groupId,
    eventName,
    orderDeadline: input.orderDeadline,
    note: input.note.trim(),
    status: 'pending',
    createdAt: now(),
  }
  const next: AppData = {
    ...data,
    eventSubmissions: [record, ...(data.eventSubmissions ?? [])],
  }
  return done('活动收录申请已提交。', next, record)
}
