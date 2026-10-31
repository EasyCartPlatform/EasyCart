import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShop } from '@/features/shop/shop-context';
import { useBrand } from '@/lib/brand';

export function FloatingCartBar() {
  const { lines } = useShop();
  const brand = useBrand();
  const insets = useSafeAreaInsets();

  const totalItems = lines.length;

  // The pill gives a little pop and a tap when something is added.
  const pop = useSharedValue(1);
  const previousTotal = useRef(0);
  useEffect(() => {
    if (totalItems > previousTotal.current && previousTotal.current > 0) {
      pop.value = withSequence(withTiming(1.07, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 260 }));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    previousTotal.current = totalItems;
  }, [totalItems, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  if (totalItems <= 0) return null;

  const previewItems = lines.slice(0, 2);

  return (
    <View
      style={[
        styles.outerWrap,
        // Sits above the floating dark navbar
        { bottom: Math.max(insets.bottom + 4, 16) + 76 }
      ]}
      pointerEvents="box-none"
    >
      <Animated.View style={popStyle}>
      <Pressable
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: brand.primary },
          pressed && styles.pillPressed
        ]}
        onPress={() => router.push('/shop/checkout')}
        accessibilityLabel={`View cart, ${totalItems} items`}
      >
        {/* Overlapping circular product thumbnails */}
        <View style={styles.thumbnailsWrap}>
          {previewItems.map((item, index) => (
            <View
              key={`${item.product_id}-${index}`}
              style={[
                styles.thumbnailCircle,
                index > 0 && styles.thumbnailOverlap
              ]}
            >
              {item.image ? (
                <Image
                  source={{ uri: item.image }}
                  style={styles.thumbnailImg}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.thumbnailPlaceholder}>
                  <Icon name="shopping-bag" size={16} color={brand.primary} />
                </View>
              )}
            </View>
          ))}
        </View>

        {/* View cart text & item count */}
        <View style={styles.textWrap}>
          <Text style={styles.title}>View cart</Text>
          <Text style={styles.subtitle}>
            {totalItems} {totalItems === 1 ? 'item' : 'items'}
          </Text>
        </View>

        {/* Right chevron arrow */}
        <View style={styles.arrowWrap}>
          <Icon name="chevron-right" size={20} color="#ffffff" strokeWidth={2.8} />
        </View>
      </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999
  },
  pill: {
    backgroundColor: '#0284c7',
    borderRadius: 999,
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 8
  },
  pillPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }]
  },
  thumbnailsWrap: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  thumbnailCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#ffffff',
    zIndex: 1
  },
  thumbnailOverlap: {
    marginLeft: -16,
    zIndex: 2
  },
  thumbnailImg: {
    width: '100%',
    height: '100%'
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  textWrap: {
    gap: 1
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#e0f2fe'
  },
  arrowWrap: {
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
