// The bottom bar every role uses: a sleek floating dark dock with clean icon and label highlights.
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Text } from './text';
import { radius } from '@/theme/theme';

// Which visible tab to light up while a hidden page is open, e.g. { 'product/[id]': 'index' }.
export type ActiveFor = Record<string, string>;

function TabButton({
  label,
  icon,
  badge,
  active,
  activeColor,
  onPress,
  onLongPress
}: {
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
  active: boolean;
  activeColor: string;
  onPress(): void;
  onLongPress(): void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.item}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <View style={styles.iconWrap}>
        {icon}
        {badge !== undefined && badge !== '' && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
      {active ? (
        <View style={[styles.activeDot, { backgroundColor: activeColor }]} />
      ) : (
        <View style={styles.activeDotPlaceholder} />
      )}
    </Pressable>
  );
}

export function AppTabBar({ state, descriptors, navigation, insets, activeFor }: BottomTabBarProps & { activeFor?: ActiveFor }) {
  const focusedRoute = state.routes[state.index];
  const focusedName = focusedRoute?.name;
  const focusedOptions = focusedRoute ? descriptors[focusedRoute.key]?.options : undefined;
  const isHidden = focusedName === 'product/[id]' || (focusedOptions?.tabBarStyle as any)?.display === 'none';

  // Hidden pages are tabs styled with href:null or tabBarItemStyle:display:none; they get no button.
  const visible = state.routes.filter((route) => {
    const opts = descriptors[route.key]?.options as any;
    if (!opts) return false;
    if (opts.href === null) return false;
    if (opts.tabBarItemStyle?.display === 'none') return false;
    return true;
  });
  const activeName = (focusedName && activeFor?.[focusedName]) ?? focusedName;

  if (isHidden || visible.length <= 1) {
    return null;
  }

  function press(route: (typeof visible)[number]) {
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(route.name, route.params);
  }

  const activeColor = '#38bdf8';

  return (
    <View style={[styles.barWrapper, { bottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {visible.map((route) => {
          const { options } = descriptors[route.key];
          const active = route.name === activeName;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
          const color = active ? activeColor : '#94a3b8';
          return (
            <TabButton
              key={route.key}
              label={label}
              active={active}
              activeColor={activeColor}
              badge={options.tabBarBadge}
              icon={options.tabBarIcon?.({ focused: active, color, size: 21 })}
              onPress={() => press(route)}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 9999,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 8,
    maxWidth: 500,
    width: '100%',
    minHeight: 60,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  item: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 20,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: -0.1,
    marginTop: 1,
  },
  labelActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  activeDot: {
    width: 14,
    height: 2.5,
    borderRadius: 1.5,
    marginTop: 2,
  },
  activeDotPlaceholder: {
    width: 14,
    height: 2.5,
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 8.5,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0f172a',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '800',
  },
});
