// One order in the owner's lists: prominent ID, customer/item preview, payment pill, and quick 1-tap accept.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/motion';
import { Badge } from '@/components/ui';
import { useToast } from '@/components/toast';
import { dateTime, price } from '@/lib/format';
import { errorMessage } from '@/lib/api';
import { colors, radius, shadow, space } from '@/theme/theme';
import type { Order } from '@/types/order';
import { orderStage, ownerCalls, useOwnerAction } from './owner-api';

export function OrderRow({ order, allowQuickAction = true }: { order: Order; allowQuickAction?: boolean }) {
  const stage = orderStage(order);
  const toast = useToast();
  const setStatus = useOwnerAction(ownerCalls.setStatus);
  const [loading, setLoading] = useState(false);

  const totalQty = (order.items ?? []).reduce((acc, it) => acc + (it.quantity || 1), 0);
  const firstItem = order.items?.[0];
  const itemsText = !firstItem
    ? 'Order items'
    : order.items.length === 1
      ? `${firstItem.name}${firstItem.quantity > 1 ? ` × ${firstItem.quantity}` : ''}`
      : `${firstItem.name} + ${order.items.length - 1} more (${totalQty} items)`;

  const shortCode = `#${order.id.slice(0, 6).toUpperCase()}`;
  const isPending = order.status === 'pending';
  const waitingForPayment = order.payment_method === 'online' && order.payment_status !== 'paid' && isPending;
  const canQuickAccept = allowQuickAction && isPending && !waitingForPayment;

  function handleAccept() {
    setLoading(true);
    setStatus.mutate(
      { id: order.id, status: 'confirmed' },
      {
        onSuccess: () => {
          setLoading(false);
          toast(`Order ${shortCode} confirmed`, 'success');
        },
        onError: (err) => {
          setLoading(false);
          toast(errorMessage(err), 'error');
        }
      }
    );
  }

  const cleanAddress = order.fulfillment_method === 'delivery'
    ? (order.delivery_address?.replace(/\n/g, ', ') || 'Delivery address provided')
    : 'Store pickup';

  const orderBody = (
    <>
      {/* Top Header: Short ID, Status Badge, Payment Tag, and Total Price */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.typeIcon, { backgroundColor: order.fulfillment_method === 'delivery' ? '#e0f2fe' : '#ecfdf5' }]}>
            <Icon name={order.fulfillment_method === 'delivery' ? 'truck' : 'shopping-bag'} size={17} color={order.fulfillment_method === 'delivery' ? '#0284c7' : '#059669'} />
          </View>
          <View style={styles.titleCol}>
            <View style={styles.tagLine}>
              <Text style={styles.orderId}>{shortCode}</Text>
              <Badge tone={stage.tone} label={stage.label} />
              <View style={[styles.payTag, { backgroundColor: order.payment_method === 'cash_on_delivery' ? '#fffbeb' : '#f0fdf4' }]}>
                <Text style={[styles.payText, { color: order.payment_method === 'cash_on_delivery' ? '#b45309' : '#15803d' }]}>
                  {order.payment_method === 'cash_on_delivery' ? 'COD' : 'Paid'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.priceCol}>
          <Text style={styles.priceText}>{price(order.total)}</Text>
        </View>
      </View>

      {/* Middle: Items Summary Box */}
      <View style={styles.itemsBox}>
        <Icon name="package" size={14} color="#64748b" />
        <Text style={styles.itemsText} numberOfLines={1}>{itemsText}</Text>
      </View>

      {/* Bottom: Destination & Timestamp */}
      <View style={styles.metaRow}>
        <View style={styles.metaLeft}>
          <Icon name={order.fulfillment_method === 'delivery' ? 'map-pin' : 'store'} size={13} color="#94a3b8" />
          <Text style={styles.metaText} numberOfLines={1}>{cleanAddress}</Text>
        </View>
        <Text style={styles.timeText}>{dateTime(order.created_at)}</Text>
      </View>
    </>
  );

  if (!canQuickAccept) {
    return (
      <PressScale onPress={() => router.push(`/owner/order/${order.id}`)} style={styles.card} accessibilityRole="button">
        {orderBody}
      </PressScale>
    );
  }

  return (
    <View style={styles.card}>
      <PressScale
        onPress={() => router.push(`/owner/order/${order.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`View order ${shortCode}`}
        style={styles.cardBody}
      >
        {orderBody}
      </PressScale>

      {/* Quick 1-Tap Action for Pending Orders */}
      <View style={styles.actionRow}>
        <PressScale
          onPress={handleAccept}
          disabled={loading}
          style={[styles.acceptBtn, loading && styles.acceptBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Accept order ${shortCode}`}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Icon name="check" size={15} color="#ffffff" strokeWidth={2.8} />
              <Text style={styles.acceptText}>Accept Order</Text>
            </>
          )}
        </PressScale>
        <PressScale
          onPress={() => router.push(`/owner/order/${order.id}`)}
          style={styles.detailsBtn}
          accessibilityRole="button"
          accessibilityLabel={`View details for ${shortCode}`}
        >
          <Text style={styles.detailsText}>View details</Text>
          <Icon name="chevron-right" size={14} color="#0284c7" />
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: space.md + 2,
    gap: 10,
    ...shadow
  },
  cardBody: {
    gap: 10
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  titleCol: {
    gap: 2,
    flex: 1
  },
  tagLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap'
  },
  orderId: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2
  },
  payTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)'
  },
  payText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.2
  },
  priceCol: {
    alignItems: 'flex-end',
    justifyContent: 'center'
  },
  priceText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3
  },
  itemsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#f8fafc',
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  itemsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    flex: 1
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1
  },
  metaText: {
    fontSize: 12,
    color: colors.textMuted,
    flex: 1
  },
  timeText: {
    fontSize: 11.5,
    color: colors.textFaint,
    fontWeight: '500'
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  acceptBtn: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm + 2,
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  acceptBtnDisabled: {
    opacity: 0.6
  },
  acceptText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#ffffff'
  },
  detailsBtn: {
    paddingHorizontal: 12,
    height: 38,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  detailsText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0284c7'
  }
});
