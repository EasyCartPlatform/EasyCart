// Customer order tracking: live ETA, delivery steps, OTP PIN, address and summary.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/motion';
import { Button, Card, EmptyState, InfoRow, Loading, Notice, Screen } from '@/components/ui';
import { CustomerSupportModal } from '@/components/customer-support-modal';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { useT } from '@/lib/i18n';
import { useBrand } from '@/lib/brand';
import { ContentText } from '@/components/content-text';
import { openWhatsApp } from '@/lib/whatsapp';
import { ORDER_STATUS, useMyDelivery, useMyOrder } from '@/features/shop/shop-api';
import { useReorder } from '@/features/shop/reorder';
import { RateOrderCard } from '@/features/shop/rate-order-card';
import { RefundCard } from '@/features/shop/refund-card';
import { DeliverySteps, PICKUP_STEPS, ProgressTimeline, ProofPhoto, RiderCard } from '@/features/delivery/delivery-parts';
import { api, errorMessage } from '@/lib/api';
import { date, price, shortId } from '@/lib/format';
import { colors, radius, space, text } from '@/theme/theme';

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

function pickupStep(status: string, fulfilment: string) {
  if (status === 'fulfilled' || fulfilment === 'picked_up') return 3;
  if (fulfilment === 'ready_for_pickup') return 2;
  if (status === 'confirmed') return 1;
  return 0;
}

export default function CustomerOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading, refetch, isRefetching } = useMyOrder(id);
  const isDelivery = order?.fulfillment_method === 'delivery' && order.status !== 'cancelled';
  const { data: delivery } = useMyDelivery(id, Boolean(isDelivery));
  const queryClient = useQueryClient();
  const toast = useToast();
  const reorder = useReorder();
  const askConfirm = useConfirm();
  const t = useT();
  const brand = useBrand();
  const [supportVisible, setSupportVisible] = useState(false);

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

  // Status and Delivery Stages
  const stage = delivery?.stage ?? (order.status === 'confirmed' ? 'ready_for_delivery' : order.status === 'fulfilled' ? 'delivered' : 'not_started');
  const isDelivered = stage === 'delivered' || order.status === 'fulfilled';
  const isCancelled = order.status === 'cancelled';
  const isOutForDelivery = stage === 'dispatched';
  const isRiderAssigned = stage === 'rider_assigned';
  const isReadyForPickup = order.fulfillment_method === 'pickup' && order.fulfillment_status === 'ready_for_pickup';

  const activePhase = isCancelled ? -1 : isDelivered ? 3 : (isOutForDelivery || isReadyForPickup) ? 2 : (stage === 'rider_assigned' || stage === 'ready_for_delivery' || order.status === 'confirmed') ? 1 : 0;
  const phases = order.fulfillment_method === 'pickup'
    ? [t('Placed'), t('Preparing'), t('Ready'), t('Collected')]
    : [t('Placed'), t('Packing'), t('On the way'), t('Delivered')];

  let statusHeadline = t('Store is packing your order');
  let statusSubtitle = t('Items are being prepared and packed');
  let etaBadgeText: string | null = null;
  let etaIcon: 'zap' | 'clock' | 'bike' | 'check' = 'clock';

  if (isCancelled) {
    statusHeadline = t('Order Cancelled');
    statusSubtitle = t('This order was cancelled');
  } else if (isDelivered) {
    statusHeadline = order.fulfillment_method === 'pickup' ? t('Order Collected') : t('Delivered');
    statusSubtitle = t('Enjoy your order!');
    etaIcon = 'check';
  } else if (order.fulfillment_method === 'pickup') {
    if (isReadyForPickup) {
      statusHeadline = t('Ready for pickup');
      statusSubtitle = t('Visit the store to collect your order');
    } else {
      statusHeadline = t('Preparing your order');
      statusSubtitle = t('Store is packing your items');
    }
  } else if (isOutForDelivery) {
    statusHeadline = t('Out for delivery');
    statusSubtitle = t('Rider is on the way to your doorstep');
    etaBadgeText = t('10–15 mins');
    etaIcon = 'zap';
  } else if (isRiderAssigned) {
    statusHeadline = t('Rider picking up');
    statusSubtitle = t('Heading to the store for pickup');
    const mins = delivery?.pickup_eta?.minutes ?? 15;
    etaBadgeText = t('{low}–{high} mins', { low: mins, high: mins + 10 });
    etaIcon = 'bike';
  } else if (delivery?.rider_offer_status === 'offered') {
    statusHeadline = t('Finding a rider');
    statusSubtitle = t('Assigning a delivery partner nearby');
    etaBadgeText = t('15–20 mins');
    etaIcon = 'clock';
  } else {
    statusHeadline = t('Store is packing your order');
    statusSubtitle = t('Getting your items ready for handover');
    etaBadgeText = t('15–25 mins');
    etaIcon = 'clock';
  }

  const parsedAddress = parseDeliveryAddress(order.delivery_address);

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Stack.Screen
        options={{
          title: t('Order {id}', { id: shortId(order.id) }),
          headerRight: () => (
            <Pressable
              onPress={() => setSupportVisible(true)}
              hitSlop={10}
              style={{ marginRight: 16 }}
              accessibilityRole="button"
              accessibilityLabel={t('Customer support')}
            >
              <Icon name="headphones" size={20} color={colors.text} />
            </Pressable>
          )
        }}
      />

      {/* Live Status & ETA Card */}
      <View style={[styles.heroCard, { borderColor: brand.primaryTint || colors.cardBorder }]}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroStatusWrap}>
            <Text style={styles.heroStatusTitle}>{statusHeadline}</Text>
            <Text style={styles.heroStatusSub}>{statusSubtitle}</Text>
          </View>
          {etaBadgeText && (
            <View style={[styles.etaPill, { backgroundColor: brand.primarySoft || colors.primarySoft }]}>
              <Icon name={etaIcon} size={12} color={brand.primaryDark || colors.primary} />
              <Text style={[styles.etaPillText, { color: brand.primaryDark || colors.primaryDark }]}>
                {etaBadgeText}
              </Text>
            </View>
          )}
        </View>

        {/* 4-Phase Progress Bar */}
        {!isCancelled && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBarTrack}>
              {phases.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.progressSegment,
                    i <= activePhase
                      ? [styles.progressSegmentActive, { backgroundColor: isDelivered ? colors.success : brand.primary }]
                      : styles.progressSegmentInactive,
                  ]}
                />
              ))}
            </View>
            <View style={styles.progressLabelsRow}>
              {phases.map((name, i) => (
                <Text
                  key={name}
                  style={[
                    styles.progressLabel,
                    i === activePhase && [styles.progressLabelActive, { color: isDelivered ? colors.success : (brand.primaryDark || colors.text) }],
                  ]}
                >
                  {name}
                </Text>
              ))}
            </View>
          </View>
        )}

        <View style={styles.heroMetaRow}>
          <Text style={styles.heroMetaText}>
            {t('{count} items', { count: order.items.reduce((s, it) => s + it.quantity, 0) })} · {date(order.created_at)}
          </Text>
          <Text style={styles.heroMetaTotal}>{price(order.total)}</Text>
        </View>
      </View>

      {/* Delivery Tracking / Detailed Steps */}
      {isDelivery && delivery && (
        <Card title={t('Where is my order?')} icon="truck">
          <DeliverySteps stage={delivery.stage} offer={delivery.rider_offer_status} />

          {/* Delivery PIN OTP Card */}
          {delivery.delivery_code && !isDelivered && !isCancelled && (
            <View style={[styles.pinCard, { borderColor: brand.primaryTint || colors.cardBorder }]}>
              <View style={styles.pinHeader}>
                <View style={styles.pinHeaderLeft}>
                  <View style={[styles.pinKeyCircle, { backgroundColor: brand.primarySoft || colors.primarySoft }]}>
                    <Icon name="key" size={13} color={brand.primaryDark || colors.primary} />
                  </View>
                  <Text style={styles.pinTitle}>{t('Delivery PIN')}</Text>
                </View>
                <View style={[styles.pinSharePill, { backgroundColor: brand.primarySoft || colors.primarySoft }]}>
                  <Text style={[styles.pinShareText, { color: brand.primaryDark || colors.primaryDark }]}>
                    {t('Share at doorstep')}
                  </Text>
                </View>
              </View>

              <View style={styles.pinDigitsRow}>
                {delivery.delivery_code.split('').map((digit, i) => (
                  <View key={i} style={[styles.pinDigitBox, { borderColor: brand.primaryTint || colors.cardBorder }]}>
                    <Text style={[styles.pinDigitText, { color: brand.primaryDark || colors.text }]}>{digit}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.pinWarning}>
                {t('Share this OTP with your delivery partner only after receiving your package in hand.')}
              </Text>
            </View>
          )}

          {delivery.delivery_locked && (
            <Notice tone="danger" icon="alert-triangle">
              {t('Your code was entered wrong too many times, so it is locked. The store will give you a new one.')}
            </Notice>
          )}

          {delivery.rider && (
            <RiderCard rider={delivery.rider} caption={delivery.stage === 'delivered' ? t('Delivered by') : t('Your delivery partner')} />
          )}

          {delivery.rider && delivery.stage !== 'delivered' && (
            <Text style={text.small}>{t('Check the name, photo and vehicle plate match the person at your door.')}</Text>
          )}

          {delivery.stage === 'delivered' && (
            <ProofPhoto url={delivery.proof_photo_url} cash={delivery.cash_collected} />
          )}
        </Card>
      )}

      {/* Formatted Delivery Address */}
      {order.delivery_address && (
        <Card title={t('Delivering to')}>
          <View style={styles.addressBox}>
            <View style={[styles.addressPinCircle, { backgroundColor: brand.primarySoft || colors.primarySoft }]}>
              <Icon name="map-pin" size={16} color={brand.primaryDark || colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              {parsedAddress.name ? (
                <Text style={styles.addressRecipient}>{parsedAddress.name}</Text>
              ) : null}
              <Text style={styles.addressLocationText}>{parsedAddress.body}</Text>
              {parsedAddress.phone ? (
                <Text style={styles.addressPhone}>Ph: {parsedAddress.phone}</Text>
              ) : null}
            </View>
          </View>
        </Card>
      )}

      {order.fulfillment_method === 'pickup' && order.status !== 'cancelled' && (
        <Card title={t('Order progress')} icon="shopping-bag">
          <ProgressTimeline steps={PICKUP_STEPS} current={pickupStep(order.status, order.fulfillment_status)} finished={order.status === 'fulfilled'} />
        </Card>
      )}

      {!isDelivery && (
        <Notice icon={order.status === 'cancelled' ? 'x-circle' : 'shopping-bag'} tone={order.status === 'cancelled' ? 'danger' : 'primary'}>
          {order.status === 'cancelled' ? t('This order was cancelled. Nothing to pay.') : t('Pick up at the store. Pay in cash when you collect it.')}
        </Notice>
      )}

      {/* Order Items with thumbnails */}
      <Card title={t('Items in order ({count})', { count: order.items.reduce((s, it) => s + it.quantity, 0) })}>
        <View style={styles.orderItemsList}>
          {order.items.map((item, index) => {
            const isLast = index === order.items.length - 1;
            return (
              <View key={index} style={[styles.orderItemRow, isLast && { borderBottomWidth: 0 }]}>
                <View style={[styles.orderItemThumb, { backgroundColor: brand.primarySoft || colors.borderSoft }]}>
                  <Icon name="package" size={18} color={brand.primaryDark || colors.textMuted} />
                </View>
                <View style={styles.orderItemInfo}>
                  <ContentText value={item.name} style={styles.orderItemName} numberOfLines={2} />
                  {item.variant_label ? (
                    <View style={[styles.orderItemOptionBadge, { backgroundColor: brand.primarySoft || colors.borderSoft, borderColor: brand.primaryTint || colors.borderSoft, borderWidth: 1 }]}>
                      <Text style={[styles.orderItemOptionText, { color: brand.primaryDark || colors.textMuted }]}>{item.variant_label}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.orderItemUnitPrice}>
                    {price(item.price)} × {item.quantity}
                  </Text>
                </View>
                <Text style={styles.orderItemTotal}>
                  {price(item.price * item.quantity)}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Summary Card */}
      <Card title={t('Summary')}>
        <InfoRow label={t('Items')} value={price(subtotal)} />
        {order.discount_amount > 0 && <InfoRow label={t('Coupon {code}', { code: order.coupon_code ?? '' })} value={`-${price(order.discount_amount)}`} tone="success" />}
        {order.delivery_fee > 0 && <InfoRow label={t('Delivery fee')} value={price(order.delivery_fee)} />}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: space.sm }}>
          <InfoRow label={t('Total')} value={price(order.total)} strong />
        </View>
        <Text style={text.small}>
          {t(order.payment_method === 'online' ? (order.payment_status === 'paid' ? 'Paid online' : order.status === 'cancelled' ? 'Online payment · Nothing to pay' : 'Online payment · Waiting for payment') : order.payment_status === 'paid' ? 'Cash on delivery · Paid' : order.status === 'cancelled' ? 'Cash on delivery · Nothing to pay' : 'Cash on delivery · Pay when you receive it')}
        </Text>
      </Card>

      {order.payment_method === 'online' && order.payment_status === 'unpaid' && order.status !== 'cancelled' && (
        <Button icon="credit-card" label={`${t('Pay now')} · ${price(order.total)}`} onPress={() => router.push(`/shop/pay?id=${order.id}`)} />
      )}

      {/* Quick Action Buttons */}
      <View style={styles.actionsRow}>
        <PressScale
          onPress={() => void openWhatsApp(t('My EasyCart order {id}: {count} items, {total}. Status: {status}.', { id: shortId(order.id), count: order.items.reduce((sum, item) => sum + item.quantity, 0), total: price(order.total), status: t(status.label) }))}
          style={[styles.actionBtn, { borderColor: '#86efac', backgroundColor: '#f0fdf4' }]}
          accessibilityRole="button"
          accessibilityLabel={t('Share on WhatsApp')}
        >
          <Icon name="message-square" size={16} color="#16a34a" />
          <Text style={[styles.actionBtnText, { color: '#15803d' }]}>{t('Share on WhatsApp')}</Text>
        </PressScale>

        {order.status !== 'cancelled' && (
          <PressScale
            onPress={() => reorder(order)}
            style={[styles.actionBtn, { borderColor: brand.primaryTint || colors.border, backgroundColor: colors.white }]}
            accessibilityRole="button"
            accessibilityLabel={t('Order again')}
          >
            <Icon name="refresh-cw" size={15} color={brand.primary} />
            <Text style={[styles.actionBtnText, { color: brand.primary }]}>{t('Order again')}</Text>
          </PressScale>
        )}
      </View>

      <RefundCard order={order} />

      {order.status === 'fulfilled' && <RateOrderCard orderId={order.id} wasDelivery={order.fulfillment_method === 'delivery'} items={order.items} />}

      {canCancel && (
        <Button
          variant="danger"
          icon="x-circle"
          label={t('Cancel order')}
          loading={cancel.isPending}
          onPress={async () => {
            if (await askConfirm({
              title: t('Cancel this order?'),
              message: t('The store has not started on it yet, so you can still cancel.'),
              confirmLabel: t('Yes, cancel order'),
              cancelLabel: t('Keep my order'),
              icon: 'x-circle'
            })) cancel.mutate();
          }}
        />
      )}

      <CustomerSupportModal visible={supportVisible} onClose={() => setSupportVisible(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: space.md,
    gap: 12,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  heroStatusWrap: {
    flex: 1,
    gap: 2,
  },
  heroStatusTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  heroStatusSub: {
    fontSize: 12.5,
    color: colors.textMuted,
  },
  etaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  etaPillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  progressContainer: {
    gap: 6,
    paddingTop: 2,
  },
  progressBarTrack: {
    flexDirection: 'row',
    gap: 4,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  progressSegmentActive: {
    backgroundColor: colors.primary,
  },
  progressSegmentInactive: {
    backgroundColor: colors.borderSoft,
  },
  progressLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 11,
    color: colors.textFaint,
    fontWeight: '600',
  },
  progressLabelActive: {
    fontWeight: '800',
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  heroMetaText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  heroMetaTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  pinCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: space.md,
    gap: 10,
    marginTop: space.sm,
  },
  pinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pinHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pinKeyCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.3,
  },
  pinSharePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pinShareText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  pinDigitsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 2,
  },
  pinDigitBox: {
    width: 38,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDigitText: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  pinWarning: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 15,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  addressPinCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressRecipient: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
  },
  addressLocationText: {
    fontSize: 12.5,
    color: colors.textMuted,
    lineHeight: 18,
  },
  addressPhone: {
    fontSize: 11.5,
    color: colors.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  orderItemsList: {
    gap: 0,
  },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  orderItemThumb: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderItemInfo: {
    flex: 1,
    gap: 2,
  },
  orderItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 17,
  },
  orderItemOptionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: colors.borderSoft,
    marginTop: 1,
  },
  orderItemOptionText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  orderItemUnitPrice: {
    fontSize: 11,
    color: colors.textMuted,
  },
  orderItemTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
  },
  actionBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
});
