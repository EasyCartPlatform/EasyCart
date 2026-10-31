// One order for the store: the next step, the delivery (request a rider, pickup code, proof), items and bill.
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, EmptyState, InfoRow, Loading, Notice, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { ownerCalls, orderStage, useOrder, useOrderDelivery, useOwnerAction } from '@/features/owner/owner-api';
import { DeliverySteps, ProofPhoto, RiderCard, TimelineList, openMap } from '@/features/delivery/delivery-parts';
import { errorMessage } from '@/lib/api';
import { dateTime, price, shortId } from '@/lib/format';
import { colors, radius, space, text } from '@/theme/theme';
import type { Order } from '@/types/order';

function NextStep({ order }: { order: Order }) {
  const toast = useToast();
  const status = useOwnerAction(ownerCalls.setStatus);
  const fulfil = useOwnerAction(ownerCalls.setFulfillment);
  const run = <T,>(m: { mutate(input: T, o: object): void }, input: T, done: string) => m.mutate(input, { onSuccess: () => toast(done, 'success'), onError: (e: unknown) => toast(errorMessage(e), 'error') });
  const busy = status.isPending || fulfil.isPending;
  const pickup = order.fulfillment_method === 'pickup';
  const canConfirm = order.status === 'pending';
  const canReady = pickup && order.status === 'confirmed' && order.fulfillment_status === 'not_started';
  const canComplete = pickup && order.fulfillment_status === 'ready_for_pickup';
  const canCancel = order.status !== 'cancelled' && order.status !== 'fulfilled' && order.fulfillment_status === 'not_started';
  // Nothing for the owner to press (for example, a rider has it): no empty card.
  if (!canConfirm && !canReady && !canComplete && !canCancel) return null;

  return (
    <Card title="Next step" icon="arrow-right-circle">
      {canConfirm && <Button icon="check" label="Confirm order" loading={busy} onPress={() => run(status, { id: order.id, status: 'confirmed' as const }, 'Order confirmed')} />}
      {canReady && <Button icon="package" label="Ready for pickup" loading={busy} onPress={() => run(fulfil, { id: order.id, fulfillment_status: 'ready_for_pickup' }, 'Customer can collect it')} />}
      {canComplete && <Button variant="success" icon="check-circle" label="Customer collected it" loading={busy} onPress={() => run(status, { id: order.id, status: 'fulfilled' as const }, 'Order completed')} />}
      {canCancel && <Button variant="danger" icon="x-circle" label="Cancel order" loading={busy} onPress={() => run(status, { id: order.id, status: 'cancelled' as const }, 'Order cancelled, items back in stock')} />}
    </Card>
  );
}

function DeliveryCard({ order }: { order: Order }) {
  const { data: delivery } = useOrderDelivery(order.id, true);
  const action = useOwnerAction(ownerCalls.delivery);
  const settle = useOwnerAction(ownerCalls.settle);
  const toast = useToast();
  if (!delivery) return <Loading />;
  const doAction = (name: Parameters<typeof ownerCalls.delivery>[0]['action'], done: string) => action.mutate({ id: order.id, action: name }, { onSuccess: () => toast(done, 'success'), onError: (e) => toast(errorMessage(e), 'error') });
  const searching = delivery.stage === 'ready_for_delivery' || (delivery.stage === 'rider_assigned' && delivery.rider_offer_status === 'offered');
  const waitingPickup = delivery.stage === 'rider_assigned' && delivery.rider_offer_status === 'accepted';
  const s = delivery.settlement;

  return (
    <Card title="Delivery" icon="truck">
      {delivery.stage !== 'cancelled' && <DeliverySteps stage={delivery.stage} offer={delivery.rider_offer_status} />}
      {!delivery.store_has_location && delivery.stage !== 'delivered' && <Notice tone="warning" icon="map-pin">Your store has no pickup location, so any online rider may get this order.</Notice>}
      {delivery.stage === 'not_started' && order.status !== 'cancelled' && (
        <>
          <Text style={text.muted}>When the order is packed, send it for delivery. The nearest free rider gets it automatically.</Text>
          <Button icon="send" label="Packed, send for delivery" loading={action.isPending} onPress={() => doAction('request-rider', 'Looking for the nearest rider')} />
        </>
      )}
      {searching && <Notice icon="loader">{delivery.stage === 'ready_for_delivery' ? 'No rider free right now. We keep trying as riders come online.' : 'Offered to the nearest rider. Waiting for them to accept.'}</Notice>}
      {delivery.stage === 'ready_for_delivery' && (delivery.declined_count ?? 0) > 0 && <Notice tone="warning" icon="alert-circle">{delivery.declined_count} riders passed on this order. Search again to offer it to everyone.</Notice>}
      {delivery.rider && <RiderCard rider={delivery.rider} caption={delivery.stage === 'delivered' ? 'Delivered by' : 'Your rider'} />}
      {delivery.pickup_code && (
        <View style={styles.pickup}>
          <Text style={[text.label, { color: colors.primaryDark }]}>Pickup code</Text>
          <Text style={styles.pickupCode}>{delivery.pickup_code}</Text>
          <Text style={[text.small, { textAlign: 'center' }]}>{waitingPickup ? 'Check the rider matches the photo and plate, then tell them this code.' : 'Give this only to the rider who comes to collect.'}</Text>
        </View>
      )}
      {delivery.delivery_locked && <Notice tone="danger" icon="alert-triangle">The rider entered the customer's code wrong 5 times. Call the customer before issuing a new code.</Notice>}
      {delivery.stage === 'delivered' && <ProofPhoto url={delivery.proof_photo_url} cash={delivery.cash_collected} />}
      {delivery.stage === 'delivered' && s?.is_cod && (
        <View style={{ gap: space.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: space.md }}>
          <InfoRow label="Rider keeps (delivery fee)" value={price(s.rider_earning)} />
          <InfoRow label="To receive from rider" value={price(s.net_to_store)} strong />
          {s.is_settled ? <Badge tone="success" label={`Settled ${dateTime(s.settled_at)} · ${s.method ?? 'cash'}`} /> : <Button small label="Mark cash received" loading={settle.isPending} onPress={() => settle.mutate({ id: order.id, method: 'cash' }, { onSuccess: () => toast('Settled with the rider', 'success'), onError: (e) => toast(errorMessage(e), 'error') })} />}
        </View>
      )}
      {delivery.stage !== 'not_started' && <TimelineList timeline={delivery.timeline} />}
      <View style={styles.actions}>
        {delivery.stage === 'ready_for_delivery' && <Button small variant="outline" icon="refresh-cw" label="Search again" onPress={() => doAction('request-rider', 'Searching again')} />}
        {(searching || waitingPickup) && <Button small variant="outline" icon="key" label="New pickup code" onPress={() => doAction('new-pickup-code', 'New pickup code made')} />}
        {(delivery.stage === 'dispatched' || delivery.delivery_locked) && <Button small variant="outline" icon="refresh-cw" label="New customer code" onPress={() => doAction('new-delivery-code', 'Customer sees a new code')} />}
        {(searching || waitingPickup) && <Button small variant="danger" icon="x" label="Deliver it myself" onPress={() => doAction('cancel-rider', 'Rider request cancelled')} />}
      </View>
    </Card>
  );
}

export default function OwnerOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading, refetch, isRefetching } = useOrder(id);
  if (isLoading) return <Loading />;
  if (!order) return <Screen><EmptyState message="Order not found." /></Screen>;
  const stage = orderStage(order);
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Stack.Screen options={{ title: `Order ${shortId(order.id)}` }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={text.muted}>{dateTime(order.created_at)} · {order.fulfillment_method === 'delivery' ? 'Delivery' : 'Pickup'}</Text>
        <Badge tone={stage.tone} label={stage.label} />
      </View>
      <NextStep order={order} />
      {order.fulfillment_method === 'delivery' && <DeliveryCard order={order} />}
      {order.fulfillment_method === 'delivery' && (
        <Card title="Deliver to" icon="map-pin">
          <Text style={text.body}>{order.delivery_address}</Text>
        </Card>
      )}
      <Card title="Items">
        {order.items.map((item, index) => <InfoRow key={index} label={`${item.name}${item.variant_label ? ` · ${item.variant_label}` : ''} × ${item.quantity}`} value={price(item.price * item.quantity)} />)}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: space.sm, gap: 4 }}>
          <InfoRow label="Items" value={price(subtotal)} />
          {order.discount_amount > 0 && <InfoRow label={`Coupon ${order.coupon_code}`} value={`-${price(order.discount_amount)}`} tone="success" />}
          {order.delivery_fee > 0 && <InfoRow label="Delivery fee" value={price(order.delivery_fee)} />}
          <InfoRow label="Total" value={price(order.total)} strong />
          <Text style={text.small}>Cash on delivery · {order.payment_status === 'paid' ? 'Paid' : 'Not paid yet'}</Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pickup: { alignItems: 'center', gap: 4, padding: space.lg, borderRadius: radius.lg, borderWidth: 2, borderStyle: 'dashed', borderColor: '#7dd3fc', backgroundColor: colors.primarySoft },
  pickupCode: { fontSize: 40, fontWeight: '800', letterSpacing: 10, color: colors.text, fontFamily: 'monospace' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }
});
