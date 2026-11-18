import { useEffect, useState } from 'react'
import { Layout, NotFound } from './components/Layout'
import { AddressBookPage } from './pages/AddressBookPage'
import { AdminPage } from './pages/AdminPage'
import { ChatPage } from './pages/ChatPage'
import { ComplaintsPage } from './pages/ComplaintsPage'
import { CreatePage } from './pages/CreatePage'
import { DetailPage } from './pages/DetailPage'
import { ManagePage } from './pages/ManagePage'
import { MinePage } from './pages/MinePage'
import { NotificationsPage } from './pages/NotificationsPage'
import { PaymentPage } from './pages/PaymentPage'
import { ProfilePage } from './pages/ProfilePage'
import { PublicProfilePage } from './pages/PublicProfilePage'
import { ReputationPage } from './pages/ReputationPage'
import { ReputationRulesPage } from './pages/ReputationRulesPage'
import { ShippingAddressPage } from './pages/ShippingAddressPage'
import { ShippingManagePage } from './pages/ShippingManagePage'
import { ShippingTrackPage } from './pages/ShippingTrackPage'
import { SquarePage } from './pages/SquarePage'
import { getRoute } from './utils'

export default function App() {
  const [route, setRoute] = useState(getRoute)

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [route.pathname])

  const { pathname, searchParams } = route
  const segments = pathname.split('/').filter(Boolean)

  let content
  if (pathname === '/') content = <SquarePage />
  else if (pathname === '/create') content = <CreatePage />
  else if (pathname === '/mine') content = <MinePage />
  else if (pathname === '/manage') content = <ManagePage />
  else if (pathname === '/profile') content = <ProfilePage />
  else if (pathname === '/addresses') content = <AddressBookPage />
  else if (pathname === '/notifications') content = <NotificationsPage />
  // V1.2 信誉与审核
  else if (pathname === '/reputation') content = <ReputationPage />
  else if (pathname === '/reputation/rules') content = <ReputationRulesPage />
  else if (pathname === '/complaints') {
    const tab = searchParams.get('tab')
    const carId = searchParams.get('car') ?? undefined
    content = (
      <ComplaintsPage
        initialTab={tab === 'complaints' || tab === 'appeals' ? tab : 'new'}
        initialCarId={carId}
      />
    )
  }
  else if (pathname === '/admin') content = <AdminPage />
  else if (segments[0] === 'manage' && segments[1]) content = <ManagePage carpoolId={segments[1]} />
  else if (segments[0] === 'detail' && segments[1]) content = <DetailPage carpoolId={segments[1]} />
  else if (segments[0] === 'pay' && segments[1]) {
    const slots = (searchParams.get('slots') ?? '').split(',').filter(Boolean)
    content = <PaymentPage carpoolId={segments[1]} slotIds={slots} />
  }
  else if (segments[0] === 'shipping' && segments[1] === 'manage' && segments[2]) content = <ShippingManagePage carpoolId={segments[2]} />
  else if (segments[0] === 'shipping' && segments[1] === 'address' && segments[2]) content = <ShippingAddressPage carpoolId={segments[2]} />
  else if (segments[0] === 'shipping' && segments[1]) content = <ShippingTrackPage carpoolId={segments[1]} />
  else if (segments[0] === 'chat' && segments[1]) content = <ChatPage chatId={segments[1]} />
  else if (segments[0] === 'user' && segments[1]) content = <PublicProfilePage userId={segments[1]} />
  else content = <NotFound />

  return <Layout pathname={pathname}>{content}</Layout>
}
