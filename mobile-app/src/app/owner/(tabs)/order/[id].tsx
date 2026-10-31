// One order for the store: the next step, customer details & delivery, items and bill.
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, EmptyState, InfoRow, Loading, Notice, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { OrderRefundCard } from '@/features/owner/order-refund-card';
import { ownerCalls, orderStage, useOrder, useOrderDelivery, useOwnStore, useOwnerAction } from '@/features/owner/owner-api';
import { messageFor } from '@/features/owner/whatsapp-customer';
import { DeliverySteps, ProofPhoto, RiderCard, TimelineList, openMap } from '@/features/delivery/delivery-parts';
import { errorMessage } from '@/lib/api';
import { dateTime, price, shortId } from '@/lib/format';
import { openWhatsApp, phoneFromAddress } from '@/lib/whatsapp';
import { colors, radius, space, text } from '@/theme/theme';
import type { Order } from '@/types/order';

function parseDeliveryAddress(raw: string | null) {
  if (!raw) return { name: '', body: '', phone: '' };
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const phoneIdx = parts.findIndex((p) => p.toLowerCase().startsWith('ph:'));
  let phone = '';
  if (phoneIdx !== -1) {
    phone = parts[phoneIdx].replace(/^ph:\s*/i, '').trim();
    parts.splice(phoneIdx, 1);
  }
  const name = parts.length > 1 ? parts[0] : '';
  const body = parts.length > 1 ? parts.slice(1).join(', ') : raw;
  return { name, body, phone };
}

function NextStep({ order }: { order: Order }) {
  const toast = useToast();
  const status = useOwnerAction(ownerCalls.setStatus);
  const fulfil = useOwnerAction(ownerCalls.setFulfillment);
  const askConfirm = useConfirm();
  const [activeAction, setActiveAction] = useState<'confirm' | 'ready' | 'complete' | 'cancel' | null>(null);

  const isClosed = order.status === 'fulfilled' || order.status === 'cancelled' || order.fulfillment_status === 'picked_up' || order.fulfillment_status === 'delivered';
  if (isClosed) return null;

  const pickup = order.fulfillment_method === 'pickup';
  // An online order is worked on only once the customer has paid (the server checks this too).
  const waitingForPayment = order.payment_method === 'online' && order.payment_status !== 'paid' && order.status === 'pending';
  const canConfirm = order.status === 'pending' && !waitingForPayment;
  const canReady = pickup && order.status === 'confirmed' && order.fulfillment_status === 'not_started';
  const canComplete = pickup && order.status === 'confirmed' && order.fulfillment_status === 'ready_for_pickup';
  // The order can be cancelled until a rider picks it up from the shop (the server checks this too).
  const beforePickup = ['not_started', 'ready_for_delivery', 'rider_assigned'].includes(order.fulfillment_status);
  const canCancel = order.status !== 'cancelled' && order.status !== 'fulfilled' && beforePickup;
  // Nothing for the owner to press (for example, a rider has it): no empty card.
  if (!canConfirm && !canReady && !canComplete && !canCancel) return null;

  const isBusy = activeAction !== null;

  return (
    <Card title="Next step" icon="arrow-right-circle">
      {waitingForPayment && <Notice icon="clock" tone="warning">The customer chose to pay online and has not paid yet. You can confirm the order once it is paid.</Notice>}
      {canConfirm && (
        <Button
          icon="check"
          label="Confirm order"
          loading={activeAction === 'confirm'}
          disabled={isBusy}
          onPress={() => {
            setActiveAction('confirm');
            status.mutate(
              { id: order.id, status: 'confirmed' as const },
              {
                onSuccess: () => toast('Order confirmed', 'success'),
                onError: (e: unknown) => toast(errorMessage(e), 'error'),
                onSettled: () => setActiveAction(null)
              }
            );
          }}
        />
      )}
      {canReady && (
        <Button
          icon="package"
          label="Ready for pickup"
          loading={activeAction === 'ready'}
          disabled={isBusy}
          onPress={() => {
            setActiveAction('ready');
            fulfil.mutate(
              { id: order.id, fulfillment_status: 'ready_for_pickup' },
              {
                onSuccess: () => toast('Customer can collect it', 'success'),
                onError: (e: unknown) => toast(errorMessage(e), 'error'),
                onSettled: () => setActiveAction(null)
              }
            );
          }}
        />
      )}
      {canComplete && (
        <Button
          variant="success"
          icon="check-circle"
          label="Customer collected it"
          loading={activeAction === 'complete'}
          disabled={isBusy}
          onPress={async () => {
            setActiveAction('complete');
            try {
              try {
                await fulfil.mutateAsync({ id: order.id, fulfillment_status: 'picked_up' });
              } catch {
                // Ignore if fulfillment status is already progressed
              }
              await status.mutateAsync({ id: order.id, status: 'fulfilled' as const });
              toast('Order completed', 'success');
            } catch (e: unknown) {
              toast(errorMessage(e), 'error');
            } finally {
              setActiveAction(null);
            }
          }}
        />
      )}
      {canCancel && (
        <Button
          variant="danger"
          icon="x-circle"
          label="Cancel order"
          loading={activeAction === 'cancel'}
          disabled={isBusy}
          onPress={async () => {
            if (await askConfirm({
              title: 'Cancel this order?',
              message: order.fulfillment_status === 'not_started'
                ? 'The items go back in stock and the customer is told it was cancelled.'
                : 'Riders stop seeing it, any rider on the way is told, the items go back in stock and the customer is told.',
              confirmLabel: 'Yes, cancel order',
              cancelLabel: 'Keep order',
              icon: 'x-circle'
            })) {
              setActiveAction('cancel');
              status.mutate(
                { id: order.id, status: 'cancelled' as const },
                {
                  onSuccess: () => toast('Order cancelled, items back in stock', 'success'),
                  onError: (e: unknown) => toast(errorMessage(e), 'error'),
                  onSettled: () => setActiveAction(null)
                }
              );
            }
          }}
        />
      )}
    </Card>
  );
}

function CustomerDeliveryCard({ order, shopName }: { order: Order; shopName: string }) {
  const parsed = parseDeliveryAddress(order.delivery_address);
  const phone = parsed.phone || phoneFromAddress(order.delivery_address);
  const isPickup = order.fulfillment_method === 'pickup';
  const hasActions = Boolean(phone || (!isPickup && order.delivery_address));

  return (
    <Card title={isPickup ? 'Customer & Handover' : 'Customer & Delivery'} icon={isPickup ? 'user' : 'map-pin'}>
      <View style={styles.customerBox}>
        <View style={styles.customerHeaderRow}>
          <View style={styles.customerAvatar}>
            <Icon name={isPickup ? 'shopping-bag' : 'user'} size={18} color="#0284c7" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.customerName}>{parsed.name || (isPickup ? 'Store Counter Collection' : 'Customer')}</Text>
            {phone ? (
              <Text style={styles.customerPhone}>+91 {phone}</Text>
            ) : isPickup ? (
              <Text style={text.small}>Customer collects at your shop</Text>
            ) : null}
          </View>
          {isPickup && <Badge tone="primary" label="Self Pickup" />}
        </View>

        {!isPickup && order.delivery_address ? (
          <View style={styles.addressRow}>
            <Icon name="map-pin" size={16} color="#64748b" style={{ marginTop: 2 }} />
            <Text style={styles.addressText}>{parsed.body || order.delivery_address}</Text>
          </View>
        ) : null}

        {hasActions ? (
          <View style={styles.customerActionRow}>
            {phone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Call customer"
                style={[styles.customerBtn, styles.callBtn]}
                onPress={() => void Linking.openURL(`tel:${phone}`)}
              >
                <Icon name="phone" size={14} color="#059669" />
                <Text style={[styles.customerBtnText, { color: '#059669' }]}>Call</Text>
              </Pressable>
            ) : null}

            {phone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Message customer on WhatsApp"
                style={[styles.customerBtn, styles.waBtn]}
                onPress={() => void openWhatsApp(messageFor(order, shopName), phone)}
              >
                <Icon name="message-circle" size={14} color="#16a34a" />
                <Text style={[styles.customerBtnText, { color: '#16a34a' }]}>WhatsApp</Text>
              </Pressable>
            ) : null}

            {!isPickup && order.delivery_address ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open address in Maps"
                style={[styles.customerBtn, styles.mapBtn]}
                onPress={() => void openMap(null, order.delivery_address)}
              >
                <Icon name="map" size={14} color="#0284c7" />
                <Text style={[styles.customerBtnText, { color: '#0284c7' }]}>Open Map</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
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
      {delivery.stage !== 'cancelled' && <DeliverySteps stage={delivery.stage} offer={delivery.rider_offer_status} isOwner />}
      {!delivery.store_has_location && delivery.stage !== 'delivered' && <Notice tone="warning" icon="map-pin">Your store has no pickup location, so any online rider may get this order.</Notice>}
      {delivery.stage === 'not_started' && order.status !== 'cancelled' && (
        order.status === 'pending' ? (
          <Notice icon="clock">Accept the order above to begin packing and request a delivery partner.</Notice>
        ) : (
          <>
            <Text style={text.muted}>When the order is packed, send it for delivery. Every free rider nearby sees it, and the first to accept gets it.</Text>
            <Button icon="send" label="Packed, send for delivery" loading={action.isPending} onPress={() => doAction('request-rider', 'Sent to nearby riders')} />
          </>
        )
      )}
      {searching && <Notice icon="loader">{delivery.stage === 'ready_for_delivery' ? 'Shown to every free rider nearby. The first to accept gets it.' : 'A rider is taking this order.'}</Notice>}
      {delivery.stage === 'ready_for_delivery' && (delivery.declined_count ?? 0) > 0 && <Notice tone="warning" icon="alert-circle">{delivery.declined_count} riders passed on or gave back this order. Others nearby can still take it. Pull down to refresh, or tap Search again, to alert every rider again.</Notice>}
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

function PackingItemsCard({ order, subtotal }: { order: Order; subtotal: number }) {
  const totalItemCount = order.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <Card title={`Items to pack (${totalItemCount})`} icon="package">
      <View style={{ gap: space.md }}>
        {order.items.map((item, index) => (
          <View key={index} style={styles.packItemRow}>
            <View style={styles.packQtyBadge}>
              <Text style={styles.packQtyText}>{item.quantity}×</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.packItemName}>{item.name}</Text>
              {item.variant_label ? (
                <View style={styles.variantBadge}>
                  <Text style={styles.variantText}>{item.variant_label}</Text>
                </View>
              ) : null}
              <Text style={styles.packItemUnit}>{price(item.price)} each</Text>
            </View>
            <Text style={styles.packItemTotal}>{price(item.price * item.quantity)}</Text>
          </View>
        ))}
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: space.md, gap: 6, marginTop: space.xs }}>
        <InfoRow label="Items subtotal" value={price(subtotal)} />
        {order.discount_amount > 0 && <InfoRow label={`Coupon ${order.coupon_code}`} value={`-${price(order.discount_amount)}`} tone="success" />}
        {order.delivery_fee > 0 && <InfoRow label="Delivery fee" value={price(order.delivery_fee)} />}
        <InfoRow label="Total" value={price(order.total)} strong />

        <View style={[
          styles.paymentBadge,
          order.payment_method === 'online' && order.payment_status === 'paid'
            ? styles.paidBadge
            : styles.codBadge
        ]}>
          <Icon
            name={order.payment_method === 'online' && order.payment_status === 'paid' ? 'check-circle' : 'dollar-sign'}
            size={15}
            color={order.payment_method === 'online' && order.payment_status === 'paid' ? '#15803d' : '#b45309'}
          />
          <Text style={[
            styles.paymentBadgeText,
            { color: order.payment_method === 'online' && order.payment_status === 'paid' ? '#15803d' : '#b45309' }
          ]}>
            {order.payment_method === 'online'
              ? (order.payment_status === 'paid' ? 'Paid online · Do not collect cash' : 'Online payment · Payment pending')
              : `Cash on delivery · ${order.payment_status === 'paid' ? 'Paid' : `Collect ${price(order.total)}`}`}
          </Text>
        </View>
      </View>
    </Card>
  );
}

export default function OwnerOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading } = useOrder(id);
  const { data: store } = useOwnStore();
  const queryClient = useQueryClient();
  const searchAgain = useOwnerAction(ownerCalls.delivery);
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);

  // Pulling down reloads the order and its delivery card. An order still waiting for a rider
  // is also sent to every nearby rider again (riders who passed on it see it too).
  async function refresh() {
    setRefreshing(true);
    try {
      const waitingForRider = order?.status !== 'cancelled' && order?.fulfillment_status === 'ready_for_delivery';
      if (waitingForRider) {
        await searchAgain.mutateAsync({ id, action: 'request-rider' });
        toast('Sent to nearby riders again', 'success');
      }
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['orders', id] });
      setRefreshing(false);
    }
  }

  if (isLoading) return <Loading />;
  if (!order) return <Screen><EmptyState message="Order not found." /></Screen>;
  const stage = orderStage(order);
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <Screen onRefresh={() => void refresh()} refreshing={refreshing}>
      <Stack.Screen options={{ title: `Order ${shortId(order.id)}` }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={text.muted}>{dateTime(order.created_at)} · {order.fulfillment_method === 'delivery' ? 'Delivery' : 'Pickup'}</Text>
        <Badge tone={stage.tone} label={stage.label} />
      </View>

      <NextStep order={order} />
      <OrderRefundCard order={order} />
      <CustomerDeliveryCard order={order} shopName={store?.name ?? 'our shop'} />
      {order.fulfillment_method === 'delivery' && <DeliveryCard order={order} />}
      <PackingItemsCard order={order} subtotal={subtotal} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pickup: { alignItems: 'center', gap: 4, padding: space.lg, borderRadius: radius.lg, borderWidth: 2, borderStyle: 'dashed', borderColor: '#7dd3fc', backgroundColor: colors.primarySoft },
  pickupCode: { fontSize: 40, fontWeight: '800', letterSpacing: 10, color: colors.text, fontFamily: 'monospace' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  customerBox: { gap: space.md },
  customerHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  customerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', alignItems: 'center', justifyContent: 'center' },
  customerName: { fontSize: 15, fontWeight: '800', color: colors.text },
  customerPhone: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  addressRow: { flexDirection: 'row', gap: space.sm, backgroundColor: '#f8fafc', padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: '#e2e8f0' },
  addressText: { fontSize: 13, color: colors.text, flex: 1, lineHeight: 19 },
  customerActionRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  customerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  callBtn: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  waBtn: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  mapBtn: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  customerBtnText: { fontSize: 12.5, fontWeight: '700' },
  packItemRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 },
  packQtyBadge: { minWidth: 36, height: 36, borderRadius: 8, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', alignItems: 'center', justifyContent: 'center' },
  packQtyText: { fontSize: 14, fontWeight: '800', color: '#0284c7' },
  packItemName: { fontSize: 14, fontWeight: '700', color: colors.text },
  packItemUnit: { fontSize: 12, color: colors.textMuted },
  packItemTotal: { fontSize: 14, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  variantBadge: { alignSelf: 'flex-start', backgroundColor: '#f1f5f9', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  variantText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  paymentBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, marginTop: space.sm, borderWidth: 1 },
  paidBadge: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  codBadge: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  paymentBadgeText: { fontSize: 13, fontWeight: '700' }
});
