import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { parseStoreOffers, type StoreOffer } from './store-offers';
import { radius, space } from '@/theme/theme';
import { useBrand } from '@/lib/brand';

export function OffersBannerCarousel({
  rawOffers,
  fallbackText
}: {
  rawOffers?: string | null;
  fallbackText?: string;
}) {
  const toast = useToast();
  const brand = useBrand();
  const offers: StoreOffer[] = parseStoreOffers(rawOffers);

  // If owner hasn't set any offers and there's a fallback, show fallback as 1 offer
  const displayOffers = offers.length > 0
    ? offers
    : fallbackText
    ? [{ id: 'fallback', text: fallbackText, icon: 'gift' as const }]
    : [];

  const [activeIndex, setActiveIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Auto-advance every 4 seconds when there are multiple offers
  useEffect(() => {
    if (displayOffers.length <= 1) return;

    const interval = setInterval(() => {
      // Fade & slide out slightly
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true
        }),
        Animated.timing(slideAnim, {
          toValue: -12,
          duration: 220,
          useNativeDriver: true
        })
      ]).start(() => {
        setActiveIndex((prev) => (prev + 1) % displayOffers.length);
        slideAnim.setValue(12);
        // Fade & slide in from right
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 260,
            useNativeDriver: true
          })
        ]).start();
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [displayOffers.length, fadeAnim, slideAnim]);

  if (displayOffers.length === 0) return null;

  const current = displayOffers[activeIndex] || displayOffers[0];

  function handlePress() {
    if (current.code) {
      toast(`Offer code "${current.code}" applied!`, 'success');
    }
  }

  function handleDotPress(index: number) {
    if (index === activeIndex) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setActiveIndex(index);
      slideAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.card,
        {
          backgroundColor: brand.primarySoft,
          borderColor: brand.primaryTint
        }
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Offer: ${current.text}`}
    >
      <View style={[styles.iconCircle, { borderColor: brand.primaryTint }]}>
        <Icon name={current.icon || 'gift'} size={17} color={brand.primary} />
      </View>

      <Animated.View
        style={[
          styles.contentWrap,
          {
            opacity: fadeAnim,
            transform: [{ translateX: slideAnim }]
          }
        ]}
      >
        <View style={styles.textRow}>
          <Text style={[styles.offerText, { color: brand.primaryDark }]} numberOfLines={2}>
            {current.text}
          </Text>
          {current.code ? (
            <View style={[styles.codePill, { borderColor: brand.primaryTint }]}>
              <Text style={[styles.codeText, { color: brand.primary }]}>{current.code}</Text>
            </View>
          ) : null}
        </View>
      </Animated.View>

      {displayOffers.length > 1 && (
        <View style={styles.dotsWrap}>
          {displayOffers.map((_, idx) => (
            <Pressable
              key={idx}
              onPress={() => handleDotPress(idx)}
              hitSlop={6}
              style={[
                styles.dot,
                { backgroundColor: brand.primaryTint },
                idx === activeIndex && [styles.dotActive, { backgroundColor: brand.primary }]
              ]}
            />
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e0f2fe',
    overflow: 'hidden',
    position: 'relative'
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0f2fe'
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'center'
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6
  },
  offerText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0369a1',
    flexShrink: 1
  },
  codePill: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#bae6fd'
  },
  codeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
    letterSpacing: 0.5
  },
  dotsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#bae6fd'
  },
  dotActive: {
    width: 14,
    backgroundColor: '#0284c7'
  }
});
