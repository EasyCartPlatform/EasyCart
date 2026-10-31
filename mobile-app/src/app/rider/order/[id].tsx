// One delivery for the rider: where to go, the bill, and the step they are on (pickup code, then handover).
import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Icon } from '@/components/icon';
import { Badge, Button, Card, CodeInput, EmptyState, Field, InfoRow, Loading, Notice, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { riderCalls, useRiderAction, useRiderOrder } from '@/features/rider/rider-api';
import { OfferCard } from '@/features/rider/rider-cards';
import { ProofPhoto, openMap } from '@/features/delivery/delivery-parts';
import { takePhoto } from '@/lib/device';
import { errorMessage } from '@/lib/api';
import { dateTime, distance, price, shortId } from '@/lib/format';
import { RIDER_ORDER_STAGE } from '@/lib/delivery-labels';
import { colors, radius, space, text } from '@/theme/theme';
import type { RiderOrder } from '@/types/delivery';

function PickupStep({ order }: { order: RiderOrder }) {
  const [code, setCode] = useState('');
  const toast = useToast();
  const pickup = useRiderAction(riderCalls.pickup);
  return (
    <Card title="Collect the order" icon="package">
      <Text style={text.muted}>Check the items with the store, then ask for the 4-digit pickup code on their screen.</Text>
      <CodeInput label="Pickup code" length={4} value={code} onChange={setCode} />
      <Text style={text.small}>{order.pickup_attempts_left} tries left</Text>
      <Button label="Confirm pickup" disabled={code.length !== 4} loading={pickup.isPending}
        onPress={() => pickup.mutate({ id: order.id, code }, { onSuccess: () => toast('Picked up. Head to the customer.', 'success'), onError: (e) => { setCode(''); toast(errorMessage(e), 'error'); } })} />
    </Card>
  );
}

function DeliverStep({ order }: { order: RiderOrder }) {
  const [code, setCode] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [cash, setCash] = useState('');
  const toast = useToast();
  const deliver = useRiderAction(riderCalls.deliver);
  const cashMatches = cash !== '' && Math.abs(Number(cash) - order.cash_to_collect) < 0.01;

  async function snap() {
    try { const shot = await takePhoto('camera'); if (shot) setPhoto(shot); } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Card title="Hand over the order" icon="check-circle">
      <Text style={text.muted}>Only hand it over once the customer gives you their code.</Text>
      <Text style={styles.stepLabel}>1. Customer's 6-digit code</Text>
      <CodeInput label="Delivery code" length={6} value={code} onChange={setCode} />
      <Text style={text.small}>The customer sees it in their app. {order.delivery_attempts_left} tries left.</Text>

      <Text style={styles.stepLabel}>2. Photo at the door</Text>
      {photo ? (
        <Pressable onPress={snap}><Image source={{ uri: photo }} style={styles.photo} /><Text style={[text.small, { textAlign: 'center', marginTop: 4 }]}>Tap to retake</Text></Pressable>
      ) : (
        <Pressable onPress={snap} style={styles.camera}><Icon name="camera" size={26} color={colors.primary} /><Text style={{ fontWeight: '600', color: colors.primaryDark }}>Take photo</Text><Text style={text.small}>Show the package at the door</Text></Pressable>
      )}

      <Text style={styles.stepLabel}>3. Cash collected</Text>
      <Notice tone="warning" icon="dollar-sign">Collect exactly {price(order.cash_to_collect)}{order.cash_to_collect === 0 ? ' (already paid)' : ''}.</Notice>
      <Field label="Amount received" value={cash} onChangeText={setCash} keyboardType="decimal-pad" placeholder="Type the amount" error={cash !== '' && !cashMatches ? `Must be ${price(order.cash_to_collect)}` : undefined} />

      <Button variant="success" icon="check" label="Mark as delivered" disabled={code.length !== 6 || !photo || !cashMatches} loading={deliver.isPending}
        onPress={() => deliver.mutate({ id: order.id, delivery_code: code, cash_collected: Number(cash), photo: photo! }, { onSuccess: () => toast('Delivered. Great job!', 'success'), onError: (e) => { setCode(''); toast(errorMessage(e), 'error'); } })} />
    </Card>
  );
}

export default function RiderOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading, refetch, isRefetching } = useRiderOrder(id);

  if (isLoading) return <Loading />;
  if (!order) return <Screen><EmptyState message="This order is no longer yours. The store may have taken it back." /></Screen>;
  const stage = RIDER_ORDER_STAGE[order.stage];

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Stack.Screen options={{ title: `Order ${shortId(order.id)}` }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={text.muted}>Placed {dateTime(order.created_at)}</Text>
        <Badge tone={stage.tone} label={stage.label} />
      </View>

      {order.stage === 'offered' && <OfferCard order={order} />}
      {order.stage === 'delivered' && (
        <Card title={`Delivered ${dateTime(order.delivered_at)}`} icon="award">
          <Text style={text.body}>You earned {price(order.earning)} on this order.</Text>
          <ProofPhoto url={order.proof_photo_url} cash={order.cash_collected} />
        </Card>
      )}

      <Card title="Pick up from" icon="shopping-bag" right={order.stage === 'to_pickup' ? <Button small icon="navigation" label="Navigate" onPress={() => openMap(order.store, order.store.address)} /> : undefined}>
        <Text style={text.heading}>{order.store.name}</Text>
        <Text style={text.small}>{order.store.address ?? 'Address not set by the store'} · {distance(order.store.distance_km)}</Text>
      </Card>

      {order.customer && (
        <Card title="Deliver to" icon="map-pin" right={order.stage === 'to_customer' ? <Button small icon="navigation" label="Navigate" onPress={() => openMap(null, order.delivery_address)} /> : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Text style={text.heading}>{order.customer.name}</Text>
              <Text style={text.small}>{order.delivery_address}</Text>
            </View>
            {order.customer.phone_number && order.stage !== 'delivered' && (
              <Pressable onPress={() => Linking.openURL(`tel:${order.customer!.phone_number}`)} style={styles.call} accessibilityLabel="Call customer"><Icon name="phone" size={18} color={colors.success} /></Pressable>
            )}
          </View>
        </Card>
      )}

      {order.stage === 'to_pickup' && <PickupStep order={order} />}
      {order.stage === 'to_customer' && <DeliverStep order={order} />}

      <Card title={`Items and bill · ${order.item_count} items`} icon="file-text">
        {order.items.map((item, index) => <InfoRow key={index} label={`${item.name}${item.variant_label ? ` · ${item.variant_label}` : ''}`} value={`× ${item.quantity}`} />)}
        <InfoRow label="Order total" value={price(order.total)} strong />
        <InfoRow label="Cash to collect" value={price(order.cash_to_collect)} tone="warning" />
        <InfoRow label="You earn" value={price(order.earning)} tone="success" />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: space.xs },
  camera: { height: 130, borderRadius: radius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: '#7dd3fc', backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', gap: 4 },
  photo: { width: '100%', height: 220, borderRadius: radius.md },
  call: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' }
});
