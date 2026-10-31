// Delivery pieces shared by the customer, store and rider screens: progress steps, rider card, proof photo.
import { useEffect } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { Avatar } from '@/components/ui';
import { fileUrl } from '@/lib/api';
import { dateTime, price } from '@/lib/format';
import { VEHICLE_LABELS } from '@/lib/delivery-labels';
import { colors, radius, space, text } from '@/theme/theme';
import type { DeliveryStage, DeliveryTimeline, HandoverRider } from '@/types/delivery';

interface Step { title: string; hint: string; icon: IconName }

const DELIVERY_STEPS: Step[] = [
  { title: 'Packing', hint: 'The store is getting your order ready', icon: 'package' },
  { title: 'Finding a rider', hint: 'Waiting for a nearby delivery partner to accept', icon: 'search' },
  { title: 'Rider picking up', hint: 'Your rider is heading to the store', icon: 'bike' },
  { title: 'Out for delivery', hint: 'Your order is on its way to you', icon: 'truck' },
  { title: 'Delivered', hint: 'Enjoy your order', icon: 'check-circle' }
];

export const PICKUP_STEPS: Step[] = [
  { title: 'Order placed', hint: 'Waiting for the store to confirm', icon: 'clipboard' },
  { title: 'Being packed', hint: 'The store is getting your order ready', icon: 'package' },
  { title: 'Ready for pickup', hint: 'Go to the store and show your order', icon: 'shopping-bag' },
  { title: 'Collected', hint: 'Enjoy your order', icon: 'check-circle' }
];

function stepIndex(stage: DeliveryStage, offer: 'offered' | 'accepted' | null) {
  if (stage === 'delivered') return 4;
  if (stage === 'dispatched') return 3;
  if (stage === 'rider_assigned') return offer === 'accepted' ? 2 : 1;
  if (stage === 'ready_for_delivery') return 1;
  return 0;
}

// The dot of the step that is happening now: a soft ring that pulses.
function PulseRing() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(withTiming(1.5, { duration: 1100 }), -1, true);
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: 1.6 - scale.value }));
  return <Animated.View style={[styles.pulse, style]} />;
}

// A vertical list of steps: finished ones in green, the current one highlighted with its hint, the rest greyed.
export function ProgressTimeline({ steps, current, finished }: { steps: Step[]; current: number; finished: boolean }) {
  return (
    <View>
      {steps.map((step, index) => {
        const done = finished || index < current;
        const active = !finished && index === current;
        const last = index === steps.length - 1;
        return (
          <View key={step.title} style={styles.stepRow}>
            <View style={styles.rail}>
              <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                {active && <PulseRing />}
                <Icon name={done ? 'check' : step.icon} size={done ? 14 : 15} color={done ? colors.white : active ? colors.primary : colors.textFaint} strokeWidth={2.4} />
              </View>
              {!last && <View style={[styles.line, done && styles.lineDone]} />}
            </View>
            <View style={styles.stepBody}>
              <Text style={[styles.stepTitle, (done || active) && { color: colors.text }, active && { fontWeight: '800' }]}>{step.title}</Text>
              {active && <Text style={styles.stepHint}>{step.hint}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const OWNER_DELIVERY_STEPS: Step[] = [
  { title: 'Packing', hint: 'Pack items securely before rider handover', icon: 'package' },
  { title: 'Finding a rider', hint: 'Alerting nearby delivery partners', icon: 'search' },
  { title: 'Rider picking up', hint: 'Delivery partner is heading to your store', icon: 'bike' },
  { title: 'Out for delivery', hint: 'Order is on its way to the customer', icon: 'truck' },
  { title: 'Delivered', hint: 'Order successfully delivered', icon: 'check-circle' }
];

export function DeliverySteps({ stage, offer, isOwner = false }: { stage: DeliveryStage; offer: 'offered' | 'accepted' | null; isOwner?: boolean }) {
  const steps = isOwner ? OWNER_DELIVERY_STEPS : DELIVERY_STEPS;
  return <ProgressTimeline steps={steps} current={stepIndex(stage, offer)} finished={stage === 'delivered'} />;
}

export function RiderCard({ rider, caption }: { rider: HandoverRider; caption: string }) {
  return (
    <View style={styles.rider}>
      <Avatar name={rider.full_name} photoUrl={rider.photo_url} />
      <View style={{ flex: 1 }}>
        <Text style={text.label}>{caption}</Text>
        <Text style={text.heading} numberOfLines={1}>{rider.full_name}</Text>
        <Text style={text.small}>{rider.vehicle_type ? VEHICLE_LABELS[rider.vehicle_type] : 'Vehicle'}{rider.vehicle_number ? ` · ${rider.vehicle_number}` : ''}</Text>
      </View>
      {rider.phone_number && (
        <Pressable onPress={() => Linking.openURL(`tel:${rider.phone_number}`)} style={styles.call} accessibilityLabel={`Call ${rider.full_name}`}>
          <Icon name="phone" size={18} color={colors.success} />
        </Pressable>
      )}
    </View>
  );
}

export function ProofPhoto({ url, cash }: { url: string | null; cash: number | null }) {
  const src = fileUrl(url);
  return (
    <View style={{ gap: space.sm }}>
      {src ? <Image source={{ uri: src }} style={styles.proof} /> : <Text style={text.small}>No delivery photo</Text>}
      {cash !== null && <Text style={text.small}>Cash collected by rider: <Text style={{ fontWeight: '700', color: colors.text }}>{price(cash)}</Text></Text>}
    </View>
  );
}

export function TimelineList({ timeline }: { timeline: DeliveryTimeline }) {
  const rows: [string, string | null][] = [
    ['Order placed', timeline.placed_at], ['Rider requested', timeline.ready_at], ['Rider accepted', timeline.accepted_at],
    ['Picked up', timeline.picked_up_at], ['Delivered', timeline.delivered_at]
  ];
  return (
    <View style={{ gap: 6 }}>
      {rows.filter(([, at]) => at).map(([name, at]) => (
        <View key={name} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={text.muted}>{name}</Text>
          <Text style={text.small}>{dateTime(at)}</Text>
        </View>
      ))}
    </View>
  );
}

export function openMap(point: { latitude: number | null; longitude: number | null } | null, address?: string | null) {
  const query = point && point.latitude !== null && point.longitude !== null ? `${point.latitude},${point.longitude}` : address ? encodeURIComponent(address) : null;
  if (query) void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
}

const styles = StyleSheet.create({
  stepRow: { flexDirection: 'row', gap: space.md },
  rail: { alignItems: 'center', width: 32 },
  dot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dotActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pulse: { position: 'absolute', width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryTint },
  line: { width: 2, flex: 1, minHeight: 22, backgroundColor: colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: colors.success },
  stepBody: { flex: 1, paddingTop: 5, paddingBottom: space.md, gap: 2 },
  stepTitle: { fontSize: 14, fontWeight: '600', color: colors.textFaint },
  stepHint: { fontSize: 12, color: colors.textMuted },
  rider: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, padding: space.md },
  call: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  proof: { width: '100%', height: 200, borderRadius: radius.md, backgroundColor: colors.borderSoft }
});
