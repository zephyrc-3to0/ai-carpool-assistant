import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Avatar, Button, Card, EmptyState, ProgressBar, StatusBadge, inputClass } from '../components/UI'
import { useToast } from '../components/Toast'
import { useAppStore } from '../store'
import { formatDateTime, navigate } from '../utils'
import { recruitmentStateOf } from '../lib/recruitOps'

export function ChatPage({ chatId, embedded = false }: { chatId: string; embedded?: boolean }) {
  const { data, currentUser, updateChat, sendMessage, markChatRead } = useAppStore()
  const showToast = useToast()
  const chat = data.chats.find((item) => item.id === chatId)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const carpool = chat ? data.carpools.find((item) => item.id === chat.carpoolId) : undefined
  const isOwner = Boolean(carpool && carpool.ownerId === currentUser.id)
  const recruitment = useMemo(
    () => recruitmentStateOf(data, carpool?.id ?? ''),
    [data, carpool?.id],
  )

  const members = useMemo(() => {
    if (!carpool) return []
    const ids = new Set<string>([carpool.ownerId])
    carpool.positions.forEach((slot) => { if (slot.occupantId) ids.add(slot.occupantId) })
    return [...ids].map((id) => data.users.find((user) => user.id === id)).filter(Boolean)
  }, [carpool, data.users])

  useEffect(() => {
    setName(chat?.name ?? '')
    setAnnouncement(chat?.announcement ?? '')
    setDraft('')
    setEditing(false)
  }, [chat?.id, chat?.name, chat?.announcement])

  useEffect(() => {
    const node = listRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [chat?.messages.length])

  const isMember = useMemo(
    () => members.some((member) => member?.id === currentUser.id),
    [members, currentUser.id],
  )

  // V1.3-A.1：进入群聊即记录已读时间，群聊列表据此统计未读消息
  useEffect(() => {
    if (chat && isMember) markChatRead(chat.id)
  }, [chat?.id, isMember, chat?.messages.length])

  if (!chat || !carpool) {
    return <EmptyState title="群聊不存在" description="该群聊可能尚未创建。回到拼车详情或车主管理查看进度。" action={<Button onClick={() => navigate('/')}>返回广场</Button>} />
  }

  if (!isMember) {
    return <EmptyState title="你不在这个群里" description="只有本车车主和已上车的成员可以查看群聊。切换到对应模拟账号后再试。" action={<Button onClick={() => navigate(`/detail/${carpool.id}`)}>查看车次详情</Button>} />
  }

  const submitMessage = (event: FormEvent) => {
    event.preventDefault()
    const result = sendMessage(chat.id, draft)
    if (!result.ok) {
      showToast(result.message, 'error')
      return
    }
    setDraft('')
  }

  const saveProfile = () => {
    const result = updateChat(chat.id, { name, announcement })
    showToast(result.message, result.ok ? 'success' : 'error')
    if (result.ok) setEditing(false)
  }

  return (
    <div className={embedded ? 'min-w-0' : 'mx-auto max-w-5xl'}>
      {!embedded && (
        <button className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200" onClick={() => navigate(`/detail/${carpool.id}`)}>
          <span aria-hidden="true">←</span> 返回车次详情
        </button>
      )}

      <div className={`grid items-start gap-5 ${embedded ? '2xl:grid-cols-[minmax(0,1fr)_260px]' : 'lg:grid-cols-[minmax(0,1fr)_300px]'}`}>
        <Card className={`flex flex-col overflow-hidden ${embedded ? 'h-[72vh] min-h-[560px]' : 'h-[68vh] min-h-[520px]'}`}>
          <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-lg font-bold tracking-tight text-ink">{chat.name}</h1>
                <StatusBadge status={carpool.status} />
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">{carpool.title} · {members.length} 位成员</p>
            </div>
            {isOwner && (
              <Button size="sm" variant={editing ? 'ghost' : 'secondary'} onClick={() => setEditing((current) => !current)}>
                {editing ? '收起' : '编辑群资料'}
              </Button>
            )}
          </header>

          {editing && isOwner && (
            <div className="space-y-3 border-b border-purple-100 bg-purple-50/60 px-5 py-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">群昵称</span>
                <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} maxLength={30} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-ink">群公告</span>
                <textarea className={`${inputClass} min-h-24 resize-y py-3 leading-6`} value={announcement} onChange={(event) => setAnnouncement(event.target.value)} maxLength={300} />
              </label>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setName(chat.name); setAnnouncement(chat.announcement); setEditing(false) }}>取消</Button>
                <Button size="sm" onClick={saveProfile}>保存</Button>
              </div>
            </div>
          )}

          <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">群公告</p>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-ink">{chat.announcement}</p>
          </div>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {chat.messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">还没有消息，说点什么吧。</div>
            ) : chat.messages.map((message) => {
              const sender = data.users.find((user) => user.id === message.userId)
              const mine = message.userId === currentUser.id
              if (message.system) {
                return (
                  <p key={message.id} className="text-center text-xs text-muted">{message.content}</p>
                )
              }
              return (
                <div key={message.id} className={`flex items-end gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
                  {sender && <Avatar user={sender} size="sm" />}
                  <div className={`max-w-[75%] ${mine ? 'text-right' : ''}`}>
                    <p className={`mb-1 text-[11px] text-muted ${mine ? 'text-right' : ''}`}>{sender?.nickname ?? '成员'} · {formatDateTime(message.sentAt)}</p>
                    <div className={`inline-block rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${mine ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md bg-slate-100 text-ink'}`}>
                      {message.content}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <form className="flex items-end gap-2 border-t border-slate-100 bg-white p-3" onSubmit={submitMessage}>
            <label className="flex-1">
              <span className="sr-only">输入消息</span>
              <textarea
                className={`${inputClass} min-h-11 max-h-32 resize-none py-2.5`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submitMessage(event)
                  }
                }}
                placeholder="说点什么…（Enter 发送，Shift+Enter 换行）"
                rows={1}
                maxLength={300}
              />
            </label>
            <Button type="submit" disabled={!draft.trim()}>发送</Button>
          </form>
        </Card>

        <aside className="space-y-5">
          <Card className="p-5">
            <h2 className="text-sm font-bold text-ink">群成员 <span className="text-muted">{members.length}</span></h2>
            <div className="mt-4 space-y-3">
              {members.map((member) => member && (
                <div key={member.id} className="flex items-center gap-3">
                  <Avatar user={member} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{member.nickname}</p>
                    <p className="text-[11px] text-muted">{member.id === carpool.ownerId ? '车主' : '车员'}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-ink">车次进度</h2>
              <StatusBadge status={carpool.status} />
            </div>
            <div className="mt-4">
              <ProgressBar used={recruitment.occupiedSlots} total={recruitment.openSlots} />
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">已认领 {recruitment.occupiedSlots} / {recruitment.openSlots} 份</p>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">规则摘要</p>
              <p className="mt-2 line-clamp-4 text-xs leading-5 text-ink">{carpool.rules}</p>
              <p className="mt-2 text-[11px] leading-5 text-muted">截团时间：{formatDateTime(carpool.deadline)}</p>
            </div>
            <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => navigate(`/detail/${carpool.id}`)}>返回拼车详情</Button>
          </Card>
        </aside>
      </div>
    </div>
  )
}
