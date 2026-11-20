import { ReputationChip } from '../components/Reputation'
import { Avatar, Button, Card, PageHeader } from '../components/UI'
import { useAppStore } from '../store'
import { hasFulfillmentRecord } from '../lib/reputation'
import { navigate } from '../utils'

/**
 * V2.0 个人中心：只承载个人资料、参与记录、地址、信誉与申诉。
 * 车主管理和消息保留为一级导航，不在这里重复搭建同级工作台。
 */
export function ProfilePage() {
  const { data, currentUser, reputationOf, permissions, setAdminMode } = useAppStore()
  const myAddresses = data.savedAddresses.filter((item) => item.userId === currentUser.id)
  const joined = data.carpools.filter((carpool) => (
    carpool.ownerId !== currentUser.id
    && carpool.positions.some((slot) => slot.occupantId === currentUser.id)
  )).length
  const reputation = reputationOf(currentUser.id)
  const perm = permissions
  const hasRecord = hasFulfillmentRecord(data, currentUser.id)

  return (
    <>
      <PageHeader
        eyebrow="My Profile"
        title="个人中心"
        description={`查看“${currentUser.nickname}”的参与记录、公开资料、地址与信誉状态。车次管理和群聊分别归入顶部一级导航。`}
      />

      <Card className="mb-5 flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <Avatar user={currentUser} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-ink">{currentUser.nickname}</p>
          <p className="mt-1 text-xs text-muted">
            模拟账号 · {currentUser.id}{currentUser.province ? ` · ${currentUser.province}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ReputationChip reputation={reputation} />
            {!hasRecord && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-muted">暂无履约记录</span>
            )}
          </div>
        </div>
        <Button variant="secondary" onClick={() => navigate(`/user/${currentUser.id}`)}>查看公开主页</Button>
      </Card>

      {perm.reason && (
        <Card className="mb-5 border-danger/20 bg-dangerSoft p-5">
          <p className="text-sm font-bold text-danger">当前功能受限</p>
          <p className="mt-1 text-sm leading-6 text-danger/85">{perm.reason}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => navigate('/complaints?tab=appeals')}>提交申诉</Button>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5 transition hover:border-purple-200 hover:shadow-hover">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">My Participation</p>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-bold text-ink">我参与的</h2>
            <span className="text-2xl font-black tracking-tight text-ink">{joined}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted">
            按车次查看已购商品、独立交易、运费账单、地址、国内费用与物流进度。
          </p>
          <Button className="mt-5" onClick={() => navigate('/mine')}>查看参与记录</Button>
        </Card>

        <Card className="p-5 transition hover:border-purple-200 hover:shadow-hover">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Public Profile</p>
          <h2 className="mt-2 text-lg font-bold text-ink">个人资料与公开主页</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            公开主页展示昵称、地区、信誉和历史拼车记录，不公开收货地址、订单快照或物流单号。
          </p>
          <Button variant="secondary" className="mt-5" onClick={() => navigate(`/user/${currentUser.id}`)}>预览公开主页</Button>
        </Card>

        <Card className="p-5 transition hover:border-purple-200 hover:shadow-hover">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Address Book</p>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-bold text-ink">地址管理</h2>
            <span className="text-2xl font-black tracking-tight text-ink">{myAddresses.length}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted">
            只管理常用收货地址的新增、修改、删除与默认地址；订单地址和物流仍在参与详情中处理。
          </p>
          <Button variant="secondary" className="mt-5" onClick={() => navigate('/addresses')}>管理地址</Button>
        </Card>

        <Card className="p-5 transition hover:border-purple-200 hover:shadow-hover">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Reputation & Appeals</p>
          <h2 className="mt-2 text-lg font-bold text-ink">信誉与申诉</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            当前信誉分 {reputation.score} 分。查看等级、权限和变动历史，或进入投诉与申诉处理页面。
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => navigate('/reputation')}>查看信誉</Button>
            <Button variant="secondary" onClick={() => navigate('/complaints')}>投诉与申诉</Button>
          </div>
        </Card>
      </div>

      <Card className="mt-5 flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4">
        <div>
          <p className="text-sm font-bold text-ink">课程演示工具</p>
          <p className="mt-1 text-xs leading-5 text-muted">管理员后台仅用于演示投诉、申诉与信誉记录审核，不属于普通个人功能。</p>
        </div>
        <Button
          size="sm"
          variant={data.adminMode ? 'secondary' : 'ghost'}
          onClick={() => {
            setAdminMode(!data.adminMode)
            navigate(data.adminMode ? '/profile' : '/admin')
          }}
        >
          {data.adminMode ? '退出管理员模式' : '进入管理员演示'}
        </Button>
      </Card>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white px-5 py-4 text-xs leading-6 text-muted">
        本项目为课程演示：所有账号、拼车、支付、物流、地址与信誉数据均为本地模拟，不接入真实支付、物流查询与短信服务，也不构成真实的数据隔离或安全保护；信誉分与权限控制不代表真实平台的安全认证。
      </div>
    </>
  )
}
