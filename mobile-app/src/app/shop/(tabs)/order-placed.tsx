// Shown right after checkout: a small celebration, then a clear way to track the order or keep shopping.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { Confetti } from '@/components/confetti';
import { Button, Card, InfoRow } from '@/components/ui';
import { useMyOrder } from '@/features/shop/shop-api';
import { price, shortId } from '@/lib/format';
import { colors, space, text } from '@/theme/theme';
import { useT } from '@/lib/i18n';
import { useBrand } from '@/lib/brand';

function OrderPlaced() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order } = useMyOrder(id);
  const brand = useBrand();
  const pop = useSharedValue(0);
  const t = useT();

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    pop.value = withDelay(150, withSpring(1, { damping: 9, stiffness: 140 }));
  }, [pop]);

  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const delivery = order?.fulfillment_method === 'delivery';
  const itemCount = order?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={[brand.primaryTint, brand.primarySoft, '#f8fafc', '#ffffff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Confetti />
      <View style={styles.content}>
        <Animated.View style={[styles.check, checkStyle]}>
          <Icon name="check" size={52} color={colors.white} strokeWidth={3} />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(350).duration(300)} style={styles.texts}>
          <Text style={styles.title}>{t('Order placed!')}</Text>
          <Text style={styles.subtitle}>{delivery ? 'The store will confirm it, then a rider brings it to you.' : 'The store will confirm it and tell you when it is ready to collect.'}</Text>
        </Animated.View>

        {order && (
          <Animated.View entering={FadeInUp.delay(500).duration(300)} style={{ width: '100%' }}>
            <Card>
              <InfoRow label="Order" value={shortId(order.id)} />
              <InfoRow label={itemCount === 1 ? t('1 item') : t('{n} items', { n: itemCount })} value={price(order.total)} strong />
              <Text style={text.small}>{order.payment_status === 'paid' ? t('Paid online. Nothing to pay at the door.') : delivery ? t('Pay in cash when it arrives.') : t('Pay in cash when you collect it.')}</Text>
            </Card>
          </Animated.View>
        )}

        <Animated.View entering={FadeInUp.delay(650).duration(300)} style={styles.buttons}>
          <Button icon="navigation" label={t('Track my order')} onPress={() => router.replace(`/shop/order/${id}`)} />
          <Button variant="outline" label={t('Keep shopping')} onPress={() => router.navigate('/shop')} />
        </Animated.View>
      </View>
    </View>
  );
}

// A new order starts the celebration again, because the page stays mounted between orders.
export default function OrderPlacedPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OrderPlaced key={id} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.xl, maxWidth: 480, width: '100%', alignSelf: 'center' },
  check: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', shadowColor: colors.success, shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  texts: { alignItems: 'center', gap: space.sm },
  title: { fontSize: 30, fontWeight: '900', color: colors.text, letterSpacing: -0.8 },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  buttons: { width: '100%', gap: space.md }
});
