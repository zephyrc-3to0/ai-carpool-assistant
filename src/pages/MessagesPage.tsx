import { useEffect, useMemo, useState } from 'react'
import { Avatar, Button, Card, EmptyState, PageHeader, StatusBadge } from '../components/UI'
import { useAppStore } from '../store'
import { formatDateTime, navigate } from '../utils'
import { canAccessChat, unreadCountOf } from '../lib/chat'
import { ChatPage } from './ChatPage'

/**
 * V2.0 消息中心。
 * 桌面端使用左右双栏：左侧固定系统入口和群聊列表，右侧直接复用 ChatPage。
 * 移动端自然纵向排列；旧的 /chat/:id 独立路由继续保留。
 */
export function MessagesPage() {
  const { data, currentUser } = useAppStore()
  const [selectedChatId, setSelectedChatId] = useState('')

  const notifications = useMemo(
    () => data.notifications.filter((item) => item.userId === currentUser.id),
    [data.notifications, currentUser.id],
  )
  const unreadNotifications = notifications.filter((item) => !item.read).length
  const logisticsNotifications = notifications.filter((item) => (
    item.type === 'domestic_shipped' || item.type === 'arrival_checked' || item.type === 'address_required' || item.type === 'address_urge'
  ))
  const unreadLogistics = logisticsNotifications.filter((item) => !item.read).length
  const appeals = (data.appeals ?? []).filter((appeal) => appeal.userId === currentUser.id)
  const pendingAppeals = appeals.filter((appeal) => appeal.status === 'pending').length

  const groups = useMemo(() => data.chats
    .filter((chat) => canAccessChat(data, chat, currentUser.id))
    .map((chat) => {
      const carpool = data.carpools.find((item) => item.id === chat.carpoolId)
      const last = chat.messages[chat.messages.length - 1]
      const sender = last ? data.users.find((user) => user.id === last.userId) : undefined
      return {
        chat,
        carpool,
        last,
        sender,
        time: last?.sentAt ?? chat.createdAt,
        unread: unreadCountOf(chat, currentUser.id),
      }
    })
    .filter((row) => Boolean(row.carpool))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()), [data, currentUser.id])

  useEffect(() => {
    const remainsAvailable = groups.some((row) => row.chat.id === selectedChatId)
    if (!remainsAvailable) setSelectedChatId(groups[0]?.chat.id ?? '')
  }, [groups, selectedChatId])

  const pinned = [
    {
      key: 'system',
      label: '系统通知',
      description: '截团、地址收集与平台提醒',
      count: unreadNotifications,
      mark: '系',
      onClick: () => navigate('/notifications'),
    },
    {
      key: 'logistics',
      label: '物流消息',
      description: '国际物流与国内发货进度',
      count: unreadLogistics,
      mark: '物',
      onClick: () => navigate('/notifications?tab=logistics'),
    },
    {
      key: 'appeal',
      label: '申诉助手',
      description: '投诉、扣分与申诉处理',
      count: pendingAppeals,
      mark: '申',
      onClick: () => navigate('/complaints?tab=appeals'),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Messages"
        title="消息"
        description="在同一工作区切换系统入口与拼车群聊，查看记录并直接发送消息。"
      />

      <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="overflow-hidden lg:sticky lg:top-24">
          <section className="border-b border-slate-100 p-3" aria-label="常用消息入口">
            <p className="px-2 pb-2 pt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">置顶入口</p>
            <div className="space-y-1">
              {pinned.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  className="relative flex min-h-16 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-purple-100"
                >
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-purple-50 text-xs font-black text-primary" aria-hidden="true">{item.mark}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">{item.description}</span>
                  </span>
                  {item.count > 0 && (
                    <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                      {item.count > 99 ? '99+' : item.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section aria-label="我加入的拼车群">
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Chats</p>
                <h2 className="mt-1 text-sm font-bold text-ink">我加入的拼车群</h2>
              </div>
              <span className="text-[11px] text-muted">{groups.length}</span>
            </div>

            {groups.length ? (
              <div className="max-h-[48vh] overflow-y-auto p-2 lg:max-h-[52vh]">
                {groups.map(({ chat, carpool, last, sender, time, unread }) => {
                  const owner = carpool ? data.users.find((user) => user.id === carpool.ownerId) : undefined
                  const selected = chat.id === selectedChatId
                  const preview = last
                    ? `${last.system ? '' : `${sender?.nickname ?? '成员'}：`}${last.content}`
                    : '还没有消息，说点什么吧。'
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      aria-pressed={selected}
                      aria-controls="selected-chat-panel"
                      onClick={() => setSelectedChatId(chat.id)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-purple-100 ${
                        selected ? 'bg-purple-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      {owner && <Avatar user={owner} size="sm" />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`truncate text-sm font-bold ${selected ? 'text-primaryDark' : 'text-ink'}`}>{chat.name}</span>
                          {carpool && <StatusBadge status={carpool.status} />}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted">{preview}</span>
                        <span className="mt-1.5 block text-[10px] text-slate-400">{formatDateTime(time)}</span>
                      </span>
                      {unread !== null && unread > 0 && (
                        <span className="mt-0.5 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="p-4 pt-2">
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs leading-5 text-muted">
                  成功占位后，拼车群会显示在这里。
                </p>
              </div>
            )}
          </section>
        </Card>

        <section id="selected-chat-panel" className="min-w-0" aria-label="当前群聊">
          {selectedChatId ? (
            <ChatPage key={selectedChatId} chatId={selectedChatId} embedded />
          ) : (
            <EmptyState
              title="还没有加入任何拼车群"
              description="你成功占位某辆拼车后，系统会自动建立并加入该车的群聊。"
              action={<Button onClick={() => navigate('/')}>去拼车广场</Button>}
            />
          )}
        </section>
      </div>
    </>
  )
}
