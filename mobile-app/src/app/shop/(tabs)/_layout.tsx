import { View } from 'react-native';
import { router, Tabs } from 'expo-router';
import { BackButton, hiddenPage, tabIcon, useTabOptions } from '@/components/nav';
import { ProfileMenu } from '@/components/profile-menu';
import { FavouritesButton } from '@/components/favourites-button';
import { useShop } from '@/features/shop/shop-context';
import { useStore } from '@/features/shop/shop-api';
import { BrandProvider } from '@/lib/brand';
import { useT } from '@/lib/i18n';
import { useOrderAlerts } from '@/features/shop/use-order-alerts';
import { useSession } from '@/lib/session';

function HeaderRightActions() {
  const { user } = useSession();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 16 }}>
      <FavouritesButton />
      <ProfileMenu photoUrl={user?.avatar_url} />
    </View>
  );
}

// While one of these pages is open, the tab next to it stays lit.
const ACTIVE_FOR = {
  'product/[id]': 'index',
  checkout: 'cart',
  'order/[id]': 'orders',
  'order-placed': 'orders',
  pay: 'orders',
  nearby: 'index',
  addresses: 'account',
  'store-request': 'account',
  favourites: 'index'
};

export default function ShopTabs() {
  const tabOptions = useTabOptions(ACTIVE_FOR);
  const { lines, slug } = useShop();
  const store = useStore(slug);
  const t = useT();
  useOrderAlerts();
  const cartCount = lines.length;

  return (
    <BrandProvider themeId={store.data?.color_theme}>
      <Tabs
        tabBar={tabOptions.tabBar}
        backBehavior="history"
        screenOptions={{ ...tabOptions.screenOptions, headerRight: () => <HeaderRightActions /> }}
      >
      <Tabs.Screen name="index" options={{ title: t('Shop'), headerShown: false, tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen
        name="cart"
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/shop/checkout');
          }
        }}
        options={{
          title: t('Cart'),
          tabBarIcon: tabIcon('shopping-cart'),
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarStyle: { display: 'none' },
          headerLeft: () => <BackButton />
        }}
      />
      <Tabs.Screen name="orders" options={{ title: t('My orders'), tabBarLabel: t('Orders'), tabBarIcon: tabIcon('clipboard'), tabBarStyle: { display: 'none' }, headerLeft: () => <BackButton /> }} />
      <Tabs.Screen name="account" options={{ title: t('Account'), tabBarIcon: tabIcon('user'), tabBarStyle: { display: 'none' }, headerLeft: () => <BackButton /> }} />
      <Tabs.Screen name="product/[id]" options={{ title: t('Product'), headerShown: false, tabBarStyle: { display: 'none' }, href: null }} />
      <Tabs.Screen name="checkout" options={hiddenPage(t('Checkout'))} />
      <Tabs.Screen name="pay" options={hiddenPage(t('Pay online'))} />
      <Tabs.Screen name="nearby" options={hiddenPage(t('Shops near you'))} />
      <Tabs.Screen name="order/[id]" options={hiddenPage(t('Order'))} />
      <Tabs.Screen name="order-placed" options={{ title: t('Order placed'), href: null, headerShown: false, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="addresses" options={hiddenPage(t('Delivery addresses'))} />
      <Tabs.Screen name="store-request" options={hiddenPage(t('Request a store'))} />
      <Tabs.Screen name="favourites" options={hiddenPage(t('Favourites'))} />
    </Tabs>
    </BrandProvider>
  );
}
