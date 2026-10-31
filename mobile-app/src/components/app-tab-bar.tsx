// The bottom bar every role uses: a sleek floating black dock with green active pill.
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Text } from './text';
import { radius } from '@/theme/theme';
import { useBrand } from '@/lib/brand';

// Which visible tab to light up while a hidden page is open, e.g. { 'product/[id]': 'index' }.
export type ActiveFor = Record<string, string>;

function TabButton({ label, icon, badge, active, isFirstRender, activeColor, onPress, onLongPress }: {
  label: string;
  activeColor: string;
  icon: React.ReactNode;
  badge?: number | string;
  active: boolean;
  isFirstRender: boolean;
  onPress(): void;
  onLongPress(): void;
}) {
  const lift = useSharedValue(0);

  useEffect(() => {
    lift.value = withSpring(active ? -2 : 0, { damping: 22, stiffness: 400 });
  }, [active, lift]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }, { scale: 1 + (-lift.value) * 0.05 }]
  }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.item,
        active && isFirstRender && [styles.itemActiveFallback, { backgroundColor: activeColor }]
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.iconWrap, iconStyle]}>
        {icon}
        {badge !== undefined && badge !== '' && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </Animated.View>
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function AppTabBar({ state, descriptors, navigation, insets, activeFor }: BottomTabBarProps & { activeFor?: ActiveFor }) {
  const [width, setWidth] = useState(0);
  const brand = useBrand();
  const slide = useSharedValue(0);

  const focusedRoute = state.routes[state.index];
  const focusedName = focusedRoute?.name;
  const focusedOptions = focusedRoute ? descriptors[focusedRoute.key]?.options : undefined;
  const isHidden = focusedName === 'product/[id]' || (focusedOptions?.tabBarStyle as any)?.display === 'none';

  // Hidden pages are tabs styled with display:none or href:null; they get no button.
  const visible = state.routes.filter((route) => {
    const opts = descriptors[route.key]?.options as any;
    if (!opts) return false;
    if (opts.href === null) return false;
    if (opts.tabBarItemStyle?.display === 'none') return false;
    if (opts.tabBarStyle?.display === 'none') return false;
    return true;
  });
  const activeName = (focusedName && activeFor?.[focusedName]) ?? focusedName;
  const activeIndex = visible.findIndex((route) => route.name === activeName);
  const innerWidth = Math.max(0, width - 12);
  const itemWidth = visible.length > 0 ? innerWidth / visible.length : 0;

  useEffect(() => {
    if (!isHidden && activeIndex >= 0 && itemWidth > 0) {
      slide.value = withSpring(activeIndex * itemWidth, { damping: 26, stiffness: 380 });
    }
  }, [activeIndex, itemWidth, slide, isHidden]);

  const highlightStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slide.value }] }));

  if (isHidden) {
    return null;
  }

  function press(route: (typeof visible)[number]) {
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(route.name, route.params);
  }

  const activeColor = brand.primary || '#0284c7';

  return (
    <View style={[styles.barWrapper, { bottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <View
        style={styles.bar}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      >
        {activeIndex >= 0 && itemWidth > 0 && (
          <Animated.View style={[styles.highlight, { width: itemWidth, left: 6 }, highlightStyle]}>
            <View style={[styles.highlightPill, { backgroundColor: activeColor }]} />
          </Animated.View>
        )}
        {visible.map((route) => {
          const { options } = descriptors[route.key];
          const active = route.name === activeName;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
          const color = active ? '#ffffff' : '#94a3b8';
          return (
            <TabButton
              key={route.key}
              label={label}
              active={active}
              isFirstRender={width === 0}
              activeColor={activeColor}
              badge={options.tabBarBadge}
              icon={options.tabBarIcon?.({ focused: active, color, size: 19 })}
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
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 9999,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 6,
    maxWidth: 480,
    width: '100%',
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
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 22,
    minHeight: 48,
    zIndex: 2,
  },
  itemActiveFallback: {
    backgroundColor: '#0284c7',
  },
  highlight: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  highlightPill: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 22,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 1,
  },
  labelActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
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
