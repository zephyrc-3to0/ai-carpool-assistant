import { Button, Card, EmptyState, PageHeader } from '../components/UI'
import { useAppStore } from '../store'
import type { Notification } from '../types'
import { formatFullDateTime, getRoute, navigate, notificationTypeText } from '../utils'

export function NotificationsPage() {
  const { data, currentUser, markNotificationRead, markAllNotificationsRead } = useAppStore()
  const logisticsOnly = getRoute().searchParams.get('tab') === 'logistics'
  const logisticsTypes: Notification['type'][] = ['address_required', 'address_urge', 'arrival_checked', 'domestic_shipped']
  const all = data.notifications
    .filter((item) => item.userId === currentUser.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const list = logisticsOnly ? all.filter((item) => logisticsTypes.includes(item.type)) : all
  const unread = list.filter((item) => !item.read).length

  const open = (notification: Notification) => {
    markNotificationRead(notification.id)
    let target: string
    if (notification.type === 'address_required' || notification.type === 'address_urge') {
      target = `/shipping/address/${notification.carpoolId}`
    } else if (notification.type === 'reputation_penalty' || notification.type === 'appeal_result') {
      target = '/reputation'
    } else if (notification.type === 'complaint_result') {
      target = '/complaints?tab=complaints'
    } else {
      target = `/shipping/${notification.carpoolId}`
    }
    navigate(target)
  }

  return (
    <>
      <PageHeader
        eyebrow={logisticsOnly ? 'Logistics Messages' : 'Notifications'}
        title={logisticsOnly ? '物流消息' : '系统通知'}
        description={logisticsOnly
          ? '仅展示地址收集、到货检查与国内发货进度，点击可进入对应履约页面。'
          : '截团、规则、物流、投诉、扣分与申诉结果都会出现在这里。'}
        action={(
          <div className="flex flex-wrap gap-2">
            {logisticsOnly && <Button variant="ghost" onClick={() => navigate('/notifications')}>查看全部通知</Button>}
            {unread > 0 && <Button variant="secondary" onClick={markAllNotificationsRead}>全部标为已读</Button>}
          </div>
        )}
      />

      {list.length ? (
        <div className="space-y-3">
          {list.map((notification) => {
            const carpool = data.carpools.find((item) => item.id === notification.carpoolId)
            return (
              <Card key={notification.id} className={notification.read ? 'p-5' : 'border-purple-200 bg-purple-50/40 p-5'}>
                <button
                  className="flex w-full items-start gap-4 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
                  onClick={() => open(notification)}
                >
                  <span className={`mt-0.5 grid h-10 w-10 flex-none place-items-center rounded-xl text-sm font-black ${notification.read ? 'bg-slate-100 text-muted' : 'bg-primary text-white'}`} aria-hidden="true">
                    {notification.read ? '·' : '!'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-ink">{notification.title}</span>
                      <span className="rounded-full border border-purple-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-primaryDark">
                        {notificationTypeText[notification.type]}
                      </span>
                      {!notification.read && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">未读</span>}
                    </span>
                    <span className="mt-1.5 block text-sm leading-6 text-muted">{notification.content}</span>
                    <span className="mt-2 block text-[11px] text-muted">
                      {carpool ? `${carpool.title} · ` : ''}{formatFullDateTime(notification.createdAt)}
                    </span>
                  </span>
                </button>
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="暂时没有通知"
          description="当车主更新物流、平台处理投诉或扣分，以及管理员审核申诉时，你会在这里收到提醒。"
          action={<Button onClick={() => navigate('/mine')}>返回我的拼车</Button>}
        />
      )}
    </>
  )
}
