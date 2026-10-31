import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { hiddenPage, tabIcon, useTabOptions } from '@/components/nav';
import { ProfileMenu } from '@/components/profile-menu';
import { useRiders, useTenants } from '@/features/admin/admin-api';
import { useSession } from '@/lib/session';

// While one of these pages is open, the tab next to it stays lit.
const ACTIVE_FOR = {
  'rider/[id]': 'partners',
  'store/[id]': 'stores',
  earnings: 'more',
  refunds: 'more',
  themes: 'more',
  users: 'more',
  sales: 'more',
  growth: 'more'
};

function AdminProfileMenu() {
  const { user } = useSession();
  return (
    <View style={{ marginRight: 16 }}>
      <ProfileMenu
        profileHref="/admin/more"
        name={user?.username}
        photoUrl={user?.avatar_url}
        roleSubtitle="Platform Admin"
        showSupport={false}
        showStoreRequest={false}
      />
    </View>
  );
}

export default function AdminTabs() {
  const tabOptions = useTabOptions(ACTIVE_FOR);
  const { data } = useRiders();
  const waiting = (data?.riders ?? []).filter((rider) => rider.status === 'pending').length;
  const { data: stores } = useTenants();
  const requests = (stores ?? []).filter((store) => store.status === 'pending').length;
  return (
    <Tabs
      backBehavior="history"
      tabBar={tabOptions.tabBar}
      screenOptions={{ ...tabOptions.screenOptions, headerRight: () => <AdminProfileMenu /> }}
    >
      <Tabs.Screen name="index" options={{ title: 'Overview', tabBarIcon: tabIcon('grid') }} />
      <Tabs.Screen name="stores" options={{ title: 'Stores', tabBarIcon: tabIcon('store'), tabBarBadge: requests > 0 ? requests : undefined }} />
      <Tabs.Screen name="partners" options={{ title: 'Partners', tabBarIcon: tabIcon('bike'), tabBarBadge: waiting > 0 ? waiting : undefined }} />
      <Tabs.Screen name="deliveries" options={{ title: 'Deliveries', tabBarIcon: tabIcon('truck') }} />
      <Tabs.Screen name="more" options={{ title: 'Profile', tabBarIcon: tabIcon('user') }} />
      <Tabs.Screen name="rider/[id]" options={hiddenPage('Delivery partner')} />
      <Tabs.Screen name="store/[id]" options={hiddenPage('Store')} />
      <Tabs.Screen name="earnings" options={hiddenPage('Earnings')} />
      <Tabs.Screen name="refunds" options={hiddenPage('Refunds')} />
      <Tabs.Screen name="themes" options={hiddenPage('Shop themes')} />
      <Tabs.Screen name="users" options={hiddenPage('Users')} />
      <Tabs.Screen name="sales" options={hiddenPage('Sales')} />
      <Tabs.Screen name="growth" options={hiddenPage('Growth')} />
    </Tabs>
  );
}
