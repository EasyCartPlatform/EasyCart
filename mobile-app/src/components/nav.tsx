import { useCallback, type ReactNode } from 'react';
import { Image, Pressable, View, type ColorValue } from 'react-native';
import { Redirect, router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { colors } from '@/theme/theme';
import { homeForRole, useSession } from '@/lib/session';
import { useLiveUpdates } from '@/lib/live';
import type { Role } from '@/types/catalog';
import { AppTabBar, type ActiveFor } from './app-tab-bar';
import { useConfirmedSignOut } from './confirm';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { Loading } from './ui';

export const stackOptions = {
  headerStyle: { backgroundColor: colors.card },
  headerShadowVisible: false,
  headerTintColor: colors.text,
  headerTitleStyle: { color: colors.text, fontFamily: 'Inter_700Bold', fontSize: 17 },
  contentStyle: { backgroundColor: 'transparent' },
  headerBackButtonDisplayMode: 'minimal' as const
};

// Page name in header: Brand text 20px.
export function BrandTitle({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, flexShrink: 1 }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.4, flexShrink: 1 }} numberOfLines={1}>{children}</Text>
    </View>
  );
}

// Header styling and the shared bottom bar. `activeFor` says which tab to light up while a hidden page is open.
export function useTabOptions(activeFor?: ActiveFor) {
  const tabBar = useCallback(
    (props: BottomTabBarProps) => <AppTabBar {...props} activeFor={activeFor} />,
    [activeFor]
  );
  const screenOptions = {
    ...stackOptions,
    headerTitleAlign: 'left' as const,
    // The title may take about half the bar; a longer name is cut with "…" so the bell and profile buttons stay clear.
    headerTitleContainerStyle: { maxWidth: '50%' as const },
    headerTitle: ({ children }: { children: string }) => <BrandTitle>{children}</BrandTitle>,
    // No fixed height here: the header grows by itself to clear the status bar and notch.
    headerStyle: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
    tabBar,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: '#94a3b8',
    tabBarStyle: {
      position: 'absolute' as const,
      backgroundColor: 'transparent',
      borderTopWidth: 0,
      elevation: 0
    },
    sceneStyle: { backgroundColor: colors.bg }
  };

  return {
    tabBar,
    screenOptions,
    ...screenOptions
  };
}

// The tab bar draws the active highlight itself, so the icon is just the icon.
export function tabIcon(name: IconName) {
  return ({ color, focused, size = 20 }: { color: ColorValue; focused: boolean; size?: number }) => <Icon name={name} size={size} color={color} strokeWidth={focused ? 2.4 : 2} />;
}

export function BackButton() {
  return (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/shop'))} hitSlop={12} accessibilityLabel="Go back" style={{ marginLeft: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="arrow-left" size={20} color={colors.text} />
    </Pressable>
  );
}

// A page that is not a tab button, with a back button in its header and hidden tab bar.
export function hiddenPage(title: string) {
  return { title, href: null, headerLeft: () => <BackButton />, tabBarStyle: { display: 'none' as const } };
}

export function SignOutButton() {
  const logout = useConfirmedSignOut();
  return (
    <Pressable onPress={() => void logout()} accessibilityLabel="Log out" hitSlop={10} style={{ marginRight: 16, width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="log-out" size={17} color={colors.textMuted} />
    </Pressable>
  );
}

// Only the given role may open this area; anyone else goes to their own home (or to sign in).
export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const { user, isReady } = useSession();
  useLiveUpdates(Boolean(user && user.role === role));
  if (!isReady) return <Loading />;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== role) return <Redirect href={homeForRole(user.role)} />;
  return <>{children}</>;
}
