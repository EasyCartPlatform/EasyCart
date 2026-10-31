// One order for the customer. For a delivery: where it is, the secret code to give the rider, and who is coming.
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, InfoRow, Loading, Notice, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { ORDER_STATUS, useMyDelivery, useMyOrder } from '@/features/shop/shop-api';
import { DeliverySteps, ProofPhoto, RiderCard, openMap } from '@/features/delivery/delivery-parts';
import { api, errorMessage } from '@/lib/api';
import { date, price, shortId } from '@/lib/format';
import { colors, radius, space, text } from '@/theme/theme';

function confirm(message: string, onYes: () => void) {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(message)) onYes(); return; }
  Alert.alert('Cancel order?', message, [{ text: 'Keep it', style: 'cancel' }, { text: 'Cancel order', style: 'destructive', onPress: onYes }]);
}

export default function CustomerOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading, refetch, isRefetching } = useMyOrder(id);
  const isDelivery = order?.fulfillment_method === 'delivery' && order.status !== 'cancelled';
  const { data: delivery } = useMyDelivery(id, Boolean(isDelivery));
  const queryClient = useQueryClient();
  const toast = useToast();

  const cancel = useMutation({
    mutationFn: () => api(`/my-orders/${id}/cancel`, { method: 'PATCH' }),
    onSuccess: () => { toast('Order cancelled', 'success'); void queryClient.invalidateQueries({ queryKey: ['my-orders'] }); },
    onError: (err) => toast(errorMessage(err), 'error')
  });

  if (isLoading) return <Loading />;
  if (!order) return <Screen><EmptyState message="We could not find this order." /></Screen>;
  const status = ORDER_STATUS[order.status];
  const canCancel = order.status === 'pending' && order.fulfillment_status === 'not_started';
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Stack.Screen options={{ title: `Order ${shortId(order.id)}` }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={text.muted}>Placed {date(order.created_at)}</Text>
        <Badge tone={status.tone} label={status.label} />
      </View>

      {isDelivery && delivery && (
        <Card title="Where is my order?" icon="truck">
          <DeliverySteps stage={delivery.stage} offer={delivery.rider_offer_status} />
          {delivery.delivery_code && (
            <View style={styles.code}>
              <Text style={styles.codeLabel}>YOUR DELIVERY CODE</Text>
              <Text style={styles.codeValue}>{delivery.delivery_code}</Text>
              <Text style={styles.codeHint}>Share it only after you have your order in hand. Never share it on a call.</Text>
            </View>
          )}
          {delivery.delivery_locked && <Notice tone="danger" icon="alert-triangle">Your code was entered wrong too many times, so it is locked. The store will give you a new one.</Notice>}
          {delivery.rider && <RiderCard rider={delivery.rider} caption={delivery.stage === 'delivered' ? 'Delivered by' : 'Your delivery partner'} />}
          {delivery.rider && delivery.stage !== 'delivered' && <Text style={text.small}>Check the name, photo and number plate match the person at your door.</Text>}
          {delivery.stage === 'delivered' && <ProofPhoto url={delivery.proof_photo_url} cash={delivery.cash_collected} />}
          <View style={styles.address}>
            <Text style={text.label}>Delivering to</Text>
            <Text style={text.body}>{order.delivery_address}</Text>
          </View>
        </Card>
      )}

      {!isDelivery && (
        <Notice icon={order.status === 'cancelled' ? 'x-circle' : 'shopping-bag'} tone={order.status === 'cancelled' ? 'danger' : 'primary'}>
          {order.status === 'cancelled' ? 'This order was cancelled. Nothing to pay.' : 'Pick up at the store. Pay in cash when you collect it.'}
        </Notice>
      )}

      <Card title="Items">
        {order.items.map((item, index) => (
          <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Text style={text.body} numberOfLines={2}>{item.name}</Text>
              <Text style={text.small}>{item.variant_label ? `${item.variant_label} · ` : ''}{price(item.price)} × {item.quantity}</Text>
            </View>
            <Text style={[text.body, { fontWeight: '600' }]}>{price(item.price * item.quantity)}</Text>
          </View>
        ))}
      </Card>

      <Card title="Summary">
        <InfoRow label="Items" value={price(subtotal)} />
        {order.discount_amount > 0 && <InfoRow label={`Coupon ${order.coupon_code}`} value={`-${price(order.discount_amount)}`} tone="success" />}
        {order.delivery_fee > 0 && <InfoRow label="Delivery fee" value={price(order.delivery_fee)} />}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: space.sm }}><InfoRow label="Total" value={price(order.total)} strong /></View>
        <Text style={text.small}>Cash on delivery · {order.payment_status === 'paid' ? 'Paid' : order.status === 'cancelled' ? 'Nothing to pay' : 'Pay when you receive it'}</Text>
      </Card>

      {canCancel && <Button variant="danger" icon="x-circle" label="Cancel order" loading={cancel.isPending} onPress={() => confirm('The store has not started on it yet, so you can still cancel.', () => cancel.mutate())} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: space.lg, alignItems: 'center', gap: 4 },
  codeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#e0f2fe' },
  codeValue: { fontSize: 38, fontWeight: '800', letterSpacing: 8, color: colors.white, fontFamily: 'monospace' },
  codeHint: { fontSize: 11, color: '#e0f2fe', textAlign: 'center' },
  address: { gap: 4, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: space.md }
});
