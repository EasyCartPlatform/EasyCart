// Checkout: pickup or delivery, address, coupon, and the final bill.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/text';
import { router } from 'expo-router';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/motion';
import { useMutation } from '@tanstack/react-query';
import { Button, Card, EmptyState, InfoRow, Notice, Screen } from '@/components/ui';
import { addressLocation, addressText, useAddresses } from '@/features/shop/addresses';
import { checkDeliveryRange } from '@/lib/delivery-radius';
import { useToast } from '@/components/toast';
import { useShop } from '@/features/shop/shop-context';
import { useAppConfig, useStore } from '@/features/shop/shop-api';
import { api, errorMessage } from '@/lib/api';
import { price } from '@/lib/format';
import { colors, radius, space, text } from '@/theme/theme';
import { useT } from '@/lib/i18n';
import { useBrand } from '@/lib/brand';
import { estimateDelivery } from '@/lib/eta';
import type { Order } from '@/types/order';

type Method = 'delivery' | 'pickup';

export default function CheckoutScreen() {
  const { slug, lines, subtotal, clear, location, setQuantity } = useShop();
  const { data: store } = useStore(slug);
  const toast = useToast();
  const t = useT();
  const brand = useBrand();
  const [method, setMethod] = useState<Method>('delivery');
  const config = useAppConfig();
  const [payWith, setPayWith] = useState<'cash_on_delivery' | 'online'>('cash_on_delivery');
  // If the server has switched online payment off, never send "online", whatever was chosen earlier.
  const paymentChoice = config.data?.online_payments ? payWith : 'cash_on_delivery';
  const { active: address } = useAddresses();
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState<{ code: string; amount: number } | null>(null);

  const fee = method === 'delivery' ? store?.delivery_fee ?? 0 : 0;
  const total = Math.max(0, subtotal - (discount?.amount ?? 0)) + fee;

  const applyCoupon = useMutation({
    mutationFn: async () => (await api<{ coupon: { discount_type: 'percent' | 'fixed'; discount_value: number; code: string } }>(`/stores/${slug}/coupons/validate`, { method: 'POST', body: { code: coupon.trim() } })).coupon,
    onSuccess: (result) => {
      const amount = result.discount_type === 'percent' ? (subtotal * result.discount_value) / 100 : result.discount_value;
      setDiscount({ code: result.code ?? coupon.trim().toUpperCase(), amount: Math.min(subtotal, amount) });
      toast('Coupon applied', 'success');
    },
    onError: (err) => { setDiscount(null); toast(errorMessage(err, 'Coupon not valid'), 'error'); }
  });

  const placeOrder = useMutation({
    mutationFn: () => {
      if (isOutOfRange) {
        throw new Error(range?.message ?? 'Selected address is outside the delivery range. Please choose Pick up or change your address.');
      }
      return api<{ order: Order }>(`/stores/${slug}/checkout`, {
        method: 'POST',
        body: {
          items: lines.map((line) => ({ product_id: line.product_id, variant_label: line.variant_label, quantity: line.quantity })),
          payment_method: paymentChoice,
          fulfillment_method: method,
          ...(method === 'delivery' && address ? { delivery_address: addressText(address) } : {}),
          ...(discount ? { coupon_code: discount.code } : {})
        }
      });
    },
    onSuccess: ({ order }) => {
      clear();
      toast('Order placed', 'success');
      // Online orders go straight to payment; cash orders to the celebration.
      router.replace(paymentChoice === 'online' ? `/shop/pay?id=${order.id}` : `/shop/order-placed?id=${order.id}`);
    },
    onError: (err) => toast(errorMessage(err, 'Could not place the order'), 'error')
  });

  const range = method === 'delivery' && address && store ? checkDeliveryRange(store, address.zip, address.latitude !== undefined && address.longitude !== undefined ? { latitude: address.latitude, longitude: address.longitude } : location?.coords) : null;
  const isOutOfRange = method === 'delivery' && Boolean(range && !range.isEligible);
  const eta = range?.isEligible ? estimateDelivery(range.distanceKm) : null;
  const ready = lines.length > 0 && (method === 'pickup' || (Boolean(address) && !isOutOfRange));

  if (lines.length === 0) {
    return <Screen><EmptyState icon="shopping-cart" message="Your cart is empty, so there is nothing to check out." action={<Button label="Browse products" variant="outline" onPress={() => router.navigate('/shop')} />} /></Screen>;
  }

  const placeOrderLabel = isOutOfRange
    ? t('Outside delivery range')
    : `${t(paymentChoice === 'online' ? 'Place order & pay' : 'Place order')} · ${price(total)}`;

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs, paddingBottom: 76 }}>
          {isOutOfRange && (
            <Notice tone="danger" icon="alert-triangle">
              {t('Cannot deliver to this location. Please choose Pick up or switch to an address within {km} km.', { km: range?.maxRadiusKm ?? 5 })}
            </Notice>
          )}
          <Button
            icon={isOutOfRange ? 'alert-triangle' : 'check'}
            label={placeOrderLabel}
            onPress={() => {
              if (isOutOfRange) {
                toast(range?.message ?? 'Address is outside delivery range. Switch to Pick up or change address.', 'error');
                return;
              }
              placeOrder.mutate();
            }}
            loading={placeOrder.isPending}
            disabled={!ready}
            variant={isOutOfRange ? 'outline' : 'primary'}
          />
        </View>
      }
    >
      {/* Product Details at the top (compact size) */}
      <Card title={t('Order items ({count})', { count: lines.length })}>
        <View style={styles.orderItemsList}>
          {lines.map((line, index) => {
            const isLast = index === lines.length - 1;
            const atMax = line.quantity >= line.max;
            return (
              <View
                key={`${line.product_id}-${line.variant_label ?? ''}`}
                style={[styles.orderItemRow, isLast && { borderBottomWidth: 0, paddingBottom: 0 }]}
              >
                <Pressable
                  style={styles.orderItemThumb}
                  onPress={() => router.push({ pathname: '/shop/product/[id]', params: { id: line.product_id, variant: line.variant_label ?? '' } })}
                >
                  {line.image ? (
                    <Image
                      source={{ uri: line.image }}
                      style={styles.orderItemImage}
                      contentFit="cover"
                      transition={100}
                    />
                  ) : (
                    <Icon name="package" size={18} color={colors.textFaint} />
                  )}
                </Pressable>

                <Pressable
                  style={styles.orderItemInfo}
                  onPress={() => router.push({ pathname: '/shop/product/[id]', params: { id: line.product_id, variant: line.variant_label ?? '' } })}
                >
                  <Text style={styles.orderItemName} numberOfLines={1}>
                    {line.name}
                  </Text>
                  {line.variant_label ? (
                    <View style={[styles.orderItemOptionBadge, { backgroundColor: brand.primarySoft || colors.primarySoft, borderColor: brand.primaryTint || colors.cardBorder }]}>
                      <Text style={[styles.orderItemOptionText, { color: brand.primaryDark || colors.text }]}>
                        {line.variant_label}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.orderItemUnitPrice}>{price(line.price)} each</Text>
                </Pressable>

                <View style={styles.orderItemRight}>
                  <Text style={styles.orderItemTotal}>
                    {price(line.price * line.quantity)}
                  </Text>
                  <View style={styles.orderItemActions}>
                    <PressScale
                      onPress={() => setQuantity(line.product_id, line.variant_label, 0)}
                      style={styles.orderItemDeleteBtn}
                      accessibilityRole="button"
                      accessibilityLabel={t('Remove {name}', { name: line.name })}
                      hitSlop={6}
                    >
                      <Icon name="trash-2" size={13} color={colors.danger} strokeWidth={2.2} />
                    </PressScale>
                    <View style={[styles.compactStepper, { borderColor: brand.primaryTint || colors.cardBorder }]}>
                      <PressScale
                        onPress={() => setQuantity(line.product_id, line.variant_label, line.quantity - 1)}
                        style={styles.compactStepBtn}
                        accessibilityLabel="Decrease"
                      >
                        <Icon name="minus" size={12} color={brand.primaryDark || colors.primaryDark} strokeWidth={2.8} />
                      </PressScale>
                      <Text style={[styles.compactQty, { color: brand.primaryDark || colors.primaryDark }]}>
                        {line.quantity}
                      </Text>
                      <PressScale
                        onPress={() => setQuantity(line.product_id, line.variant_label, line.quantity + 1)}
                        disabled={atMax}
                        style={[styles.compactStepBtn, atMax && { opacity: 0.35 }]}
                        accessibilityLabel="Increase"
                      >
                        <Icon name="plus" size={12} color={brand.primaryDark || colors.primaryDark} strokeWidth={2.8} />
                      </PressScale>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      <Card title={t('Delivery details')}>
        {/* Modern Segmented Control */}
        <View style={styles.segmentContainer}>
          <PressScale
            onPress={() => setMethod('delivery')}
            style={[styles.segmentBtn, method === 'delivery' && [styles.segmentBtnActive, { backgroundColor: brand.primary }]]}
            accessibilityState={{ selected: method === 'delivery' }}
          >
            <Icon name="truck" size={16} color={method === 'delivery' ? colors.white : colors.textMuted} />
            <Text style={[styles.segmentText, method === 'delivery' && styles.segmentTextActive]}>
              {t('Delivery')} {store?.delivery_fee ? `· ${price(store.delivery_fee)}` : `· ${t('Free')}`}
            </Text>
          </PressScale>
          <PressScale
            onPress={() => setMethod('pickup')}
            style={[styles.segmentBtn, method === 'pickup' && [styles.segmentBtnActive, { backgroundColor: brand.primary }]]}
            accessibilityState={{ selected: method === 'pickup' }}
          >
            <Icon name="shopping-bag" size={16} color={method === 'pickup' ? colors.white : colors.textMuted} />
            <Text style={[styles.segmentText, method === 'pickup' && styles.segmentTextActive]}>
              {t('Pick up')} · {t('Free')}
            </Text>
          </PressScale>
        </View>

        {method === 'delivery' ? (
          address ? (
            <View style={[styles.unifiedAddressCard, { borderColor: brand.primaryTint || colors.cardBorder }]}>
              {/* Header row: Pin + Recipient/Label + ETA badge */}
              <View style={styles.addressTopRow}>
                <View style={styles.addressLabelWrap}>
                  <View style={[styles.pinCircle, { backgroundColor: brand.primarySoft || colors.primarySoft }]}>
                    <Icon name="map-pin" size={15} color={brand.primaryDark || colors.primaryDark} />
                  </View>
                  <Text style={styles.recipientTitle} numberOfLines={1}>
                    {address.recipientName} · {address.label}
                  </Text>
                </View>

                {range?.isEligible && eta ? (
                  <View style={[styles.etaBadge, { backgroundColor: brand.primarySoft || colors.primarySoft }]}>
                    <Icon name={eta.fast ? 'zap' : 'clock'} size={12} color={brand.primaryDark || colors.primaryDark} />
                    <Text style={[styles.etaBadgeText, { color: brand.primaryDark || colors.primaryDark }]}>
                      {t('{low}–{high} min', { low: eta.low, high: eta.high })}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Address text & Change button */}
              <View style={styles.addressMiddleRow}>
                <Text style={styles.addressLocationText} numberOfLines={2}>
                  {addressLocation(address)}
                </Text>
                <PressScale
                  onPress={() => router.push('/shop/addresses')}
                  style={[styles.changeAddressBtn, { borderColor: brand.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('Change address')}
                >
                  <Text style={[styles.changeAddressText, { color: brand.primary }]}>{t('Change')}</Text>
                </PressScale>
              </View>

              {/* Contact phone + Distance in a neat subtle row */}
              <View style={styles.addressBottomRow}>
                <Text style={styles.phoneText}>Ph: {address.phone}</Text>
                {range?.distanceKm !== undefined ? (
                  <Text style={styles.distanceText}>
                    · {range.distanceKm < 1 ? '< 1 km away' : `${range.distanceKm.toFixed(1)} km away`}
                  </Text>
                ) : null}
              </View>

              {/* Out of range alert only when NOT eligible */}
              {range && !range.isEligible ? (
                <View style={styles.outOfRangeWarning}>
                  <Icon name="alert-triangle" size={14} color={colors.danger} />
                  <Text style={styles.outOfRangeText}>{range.message}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.noAddressBox}>
              <View style={[styles.pinCircle, { backgroundColor: colors.borderSoft }]}>
                <Icon name="map-pin" size={18} color={colors.textMuted} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.noAddressTitle}>{t('No delivery address selected')}</Text>
                <Text style={styles.noAddressSub}>{t('Add an address to proceed with delivery')}</Text>
              </View>
              <Button small icon="plus" label={t('Add')} onPress={() => router.push('/shop/addresses')} />
            </View>
          )
        ) : (
          <View style={styles.pickupBox}>
            <View style={[styles.pinCircle, { backgroundColor: brand.primarySoft || colors.primarySoft }]}>
              <Icon name="store" size={18} color={brand.primaryDark || colors.primaryDark} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.recipientTitle}>{store?.name ?? 'Store Pickup'}</Text>
              <Text style={styles.addressLocationText}>{store?.address ?? t('Address available at store')}</Text>
              <Text style={styles.pickupHint}>{t('We will notify you when your order is ready for pickup.')}</Text>
            </View>
          </View>
        )}
      </Card>

      <Card title={t('Coupon')}>
        {discount ? (
          <View style={[styles.appliedCouponCard, { backgroundColor: brand.primarySoft || colors.primarySoft, borderColor: brand.primaryTint || colors.cardBorder }]}>
            <View style={styles.appliedLeft}>
              <View style={[styles.appliedIconCircle, { backgroundColor: brand.primary }]}>
                <Icon name="ticket" size={16} color={colors.white} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.appliedCodeText}>
                  '{discount.code}' {t('applied')}
                </Text>
                <Text style={[styles.appliedSavingsText, { color: colors.success }]}>
                  {t('You save {amount}', { amount: price(discount.amount) })}
                </Text>
              </View>
            </View>
            <PressScale
              onPress={() => { setDiscount(null); setCoupon(''); }}
              style={styles.removeCouponBtn}
              accessibilityRole="button"
              accessibilityLabel={t('Remove coupon')}
            >
              <Text style={styles.removeCouponText}>{t('Remove')}</Text>
            </PressScale>
          </View>
        ) : (
          <View style={styles.couponInputWrap}>
            <Icon name="ticket" size={18} color={brand.primaryDark || colors.textMuted} />
            <TextInput
              value={coupon}
              onChangeText={setCoupon}
              autoCapitalize="characters"
              placeholder={t('Enter coupon code')}
              placeholderTextColor={colors.textFaint}
              style={styles.couponInput}
            />
            {coupon.trim().length > 0 ? (
              <PressScale
                onPress={() => applyCoupon.mutate()}
                disabled={applyCoupon.isPending}
                style={[styles.applyInlineBtn, { backgroundColor: brand.primary }]}
                accessibilityRole="button"
                accessibilityLabel={t('Apply coupon')}
              >
                {applyCoupon.isPending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.applyInlineText}>{t('APPLY')}</Text>
                )}
              </PressScale>
            ) : null}
          </View>
        )}
      </Card>

      {config.data?.online_payments ? (
        <Card title={t('Payment method')}>
          <View style={styles.paymentMethodsList}>
            {([
              {
                id: 'cash_on_delivery' as const,
                icon: 'wallet' as const,
                label: t('Cash on delivery'),
                subtext: t('Pay with cash or UPI upon delivery'),
              },
              {
                id: 'online' as const,
                icon: 'credit-card' as const,
                label: t('Pay online'),
                subtext: t('UPI, Credit/Debit cards, Netbanking'),
              },
            ] as const).map((option) => {
              const isSelected = paymentChoice === option.id;
              return (
                <PressScale
                  key={option.id}
                  onPress={() => setPayWith(option.id)}
                  style={[
                    styles.paymentMethodRow,
                    isSelected && [
                      styles.paymentMethodRowActive,
                      { borderColor: brand.primary, backgroundColor: brand.primarySoft || colors.primarySoft },
                    ],
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View
                    style={[
                      styles.paymentMethodIconCircle,
                      isSelected
                        ? { backgroundColor: brand.primary }
                        : { backgroundColor: colors.borderSoft },
                    ]}
                  >
                    <Icon
                      name={option.icon}
                      size={18}
                      color={isSelected ? colors.white : colors.textMuted}
                    />
                  </View>

                  <View style={styles.paymentMethodInfo}>
                    <Text
                      style={[
                        styles.paymentMethodTitle,
                        isSelected && { color: brand.primaryDark || colors.text },
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text style={styles.paymentMethodSubtext}>
                      {option.subtext}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.radioCircle,
                      isSelected && { borderColor: brand.primary },
                    ]}
                  >
                    {isSelected && (
                      <View
                        style={[
                          styles.radioInnerCircle,
                          { backgroundColor: brand.primary },
                        ]}
                      />
                    )}
                  </View>
                </PressScale>
              );
            })}
          </View>
        </Card>
      ) : null}

      <Card title={t('Bill')}>
        <InfoRow label={t('Items')} value={price(subtotal)} />
        {discount && <InfoRow label={t('Coupon {code}', { code: discount.code })} value={`-${price(discount.amount)}`} tone="success" />}
        {method === 'delivery' && <InfoRow label={t('Delivery fee')} value={price(fee)} />}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: space.sm }}><InfoRow label={t('Total')} value={price(total)} strong /></View>
        <Text style={text.small}>{paymentChoice === 'online' ? t('You will pay online right after placing the order.') : t('Pay in cash when you receive your order.')}</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: colors.borderSoft,
    borderRadius: radius.md,
    padding: 3,
    gap: 4,
    marginBottom: space.sm,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: radius.md - 2,
    gap: 6,
  },
  segmentBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  unifiedAddressCard: {
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: space.md,
    gap: 8,
  },
  addressTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  addressLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pinCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipientTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
  },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
  },
  etaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  addressMiddleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  addressLocationText: {
    flex: 1,
    fontSize: 12.5,
    color: colors.textMuted,
    lineHeight: 18,
  },
  changeAddressBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  changeAddressText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  addressBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  phoneText: {
    fontSize: 11.5,
    color: colors.textMuted,
    fontWeight: '500',
  },
  distanceText: {
    fontSize: 11.5,
    color: colors.textMuted,
    fontWeight: '500',
  },
  outOfRangeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  outOfRangeText: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
    flex: 1,
  },
  noAddressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.white,
  },
  noAddressTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
  },
  noAddressSub: {
    fontSize: 12,
    color: colors.textMuted,
  },
  pickupBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
  },
  pickupHint: {
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 3,
  },
  couponInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    minHeight: 46,
    gap: 10,
  },
  couponInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
    paddingVertical: 8,
  },
  applyInlineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md - 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyInlineText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  appliedCouponCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  appliedLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  appliedIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appliedCodeText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
  },
  appliedSavingsText: {
    fontSize: 12,
    fontWeight: '700',
  },
  removeCouponBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  removeCouponText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  paymentMethodsList: {
    gap: 8,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.white,
    gap: 12,
  },
  paymentMethodRowActive: {
    borderWidth: 1.5,
  },
  paymentMethodIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentMethodInfo: {
    flex: 1,
    gap: 2,
  },
  paymentMethodTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
  },
  paymentMethodSubtext: {
    fontSize: 11.5,
    color: colors.textMuted,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInnerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  orderItemsList: { gap: 0 },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft
  },
  orderItemThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  orderItemImage: {
    width: '100%',
    height: '100%'
  },
  orderItemInfo: {
    flex: 1,
    gap: 2,
    justifyContent: 'center'
  },
  orderItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 17
  },
  orderItemOptionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryTint,
    marginTop: 1
  },
  orderItemOptionText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.primaryDark
  },
  orderItemUnitPrice: {
    fontSize: 11,
    color: colors.textMuted
  },
  orderItemRight: {
    alignItems: 'flex-end',
    gap: 4
  },
  orderItemTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums']
  },
  orderItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderItemDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: '#fecdd3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    height: 28,
    paddingHorizontal: 2
  },
  compactStepBtn: {
    width: 24,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center'
  },
  compactQty: {
    minWidth: 18,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800'
  }
});
