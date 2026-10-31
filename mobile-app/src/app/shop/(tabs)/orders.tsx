// The customer's orders, newest first - Quick-Commerce style.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/text';
import { router } from 'expo-router';
import { Icon } from '@/components/icon';
import { EmptyState, Loading, Screen } from '@/components/ui';
import { FadeIn, PressScale } from '@/components/motion';
import { ORDER_STATUS, useMyOrders, useProducts } from '@/features/shop/shop-api';
import { useShop } from '@/features/shop/shop-context';
import { useReorder } from '@/features/shop/reorder';
import { fileUrl } from '@/lib/api';
import { date, price, shortId } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { colors, radius, shadow, space } from '@/theme/theme';
import { useBrand } from '@/lib/brand';
import type { Order } from '@/types/order';

type FilterTab = 'all' | 'active' | 'completed';

export default function OrdersScreen() {
  const { data, isLoading, refetch, isRefetching } = useMyOrders();
  const { slug } = useShop();
  const productsQuery = useProducts(slug, '', '');
  const catalog = productsQuery.data ?? [];
  const reorder = useReorder();
  const brand = useBrand();
  const t = useT();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const orders = [...(data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Totals for the summary banner
  const nonCancelled = orders.filter((order) => order.status !== 'cancelled');
  const totalSpent = nonCancelled.reduce((sum, order) => sum + order.total, 0);

  // Group active vs completed
  const activeOrders = orders.filter((o) => o.status === 'pending' || o.status === 'confirmed');
  const completedOrders = orders.filter((o) => o.status === 'fulfilled' || o.status === 'cancelled');

  const filteredOrders =
    activeTab === 'active' ? activeOrders : activeTab === 'completed' ? completedOrders : orders;

  // Helper to look up images for order items
  const getItemImage = (productId: string) => {
    const p = catalog.find((prod) => prod.id === productId);
    if (p && p.images && p.images.length > 0) {
      return fileUrl(p.images[0]);
    }
    return null;
  };

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      {isLoading ? (
        <Loading />
      ) : orders.length === 0 ? (
        <EmptyState
          icon="package"
          message={t('You have not ordered anything yet.')}
          action={
            <PressScale
              onPress={() => router.navigate('/shop')}
              style={[styles.startShoppingBtn, { backgroundColor: brand.primary }]}
            >
              <Text style={styles.startShoppingText}>{t('Start shopping')}</Text>
            </PressScale>
          }
        />
      ) : (
        <>
          {/* Quick-Commerce Summary & Filter Header */}
          <View style={styles.summaryBar}>
            <View style={styles.summaryLeft}>
              <Text style={styles.summaryTitle}>
                {orders.length} {orders.length === 1 ? t('Order') : t('Orders')}
              </Text>
              <Text style={styles.summarySubtitle}>
                {t('Total spent')}: <Text style={styles.summarySpentBold}>{price(totalSpent)}</Text>
              </Text>
            </View>

            {/* Filter pills */}
            <View style={styles.tabPillsRow}>
              {(['all', 'active', 'completed'] as const).map((tab) => {
                const isActive = activeTab === tab;
                const count = tab === 'active' ? activeOrders.length : tab === 'completed' ? completedOrders.length : orders.length;
                const tabLabel = tab === 'all' ? t('All') : tab === 'active' ? t('Active') : t('Delivered');
                return (
                  <PressScale
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={[
                      styles.tabPill,
                      isActive && { backgroundColor: brand.primary, borderColor: brand.primary }
                    ]}
                  >
                    <Text style={[styles.tabPillText, isActive && styles.tabPillTextActive]}>
                      {tabLabel} {count > 0 ? `(${count})` : ''}
                    </Text>
                  </PressScale>
                );
              })}
            </View>
          </View>

          {/* Orders list */}
          {filteredOrders.length === 0 ? (
            <View style={styles.emptyFilterBox}>
              <Icon name="package" size={28} color={colors.textMuted} />
              <Text style={styles.emptyFilterText}>{t('No orders in this section.')}</Text>
            </View>
          ) : (
            filteredOrders.map((order, index) => {
              const status = ORDER_STATUS[order.status];
              const isLive = order.status === 'pending' || order.status === 'confirmed';
              const isCancelled = order.status === 'cancelled';
              const isFulfilled = order.status === 'fulfilled';
              const isDelivery = order.fulfillment_method === 'delivery';
              const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

              // Distinct item previews (up to 3)
              const previewItems = order.items.slice(0, 3);
              const remainingCount = order.items.length - previewItems.length;

              return (
                <FadeIn key={order.id} index={index} style={styles.orderCard}>
                  {/* Card Header: Order ID + Status Badge */}
                  <PressScale
                    onPress={() => router.push(`/shop/order/${order.id}`)}
                    style={styles.cardHeader}
                  >
                    <View style={styles.headerLeft}>
                      <View style={styles.orderNumberRow}>
                        <Text style={styles.orderNumber}>#{shortId(order.id)}</Text>
                        <Text style={styles.orderDate}>· {date(order.created_at)}</Text>
                      </View>
                      <Text style={styles.methodText}>
                        {isDelivery ? t('Home Delivery') : t('Store Pickup')}
                      </Text>
                    </View>

                    {/* Status Pill */}
                    <View
                      style={[
                        styles.statusPill,
                        isLive && styles.statusPillLive,
                        isCancelled && styles.statusPillCancelled,
                        isFulfilled && styles.statusPillFulfilled
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          isLive && { backgroundColor: colors.warning },
                          isCancelled && { backgroundColor: colors.danger },
                          isFulfilled && { backgroundColor: colors.success }
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusLabel,
                          isLive && { color: '#92400e' },
                          isCancelled && { color: colors.danger },
                          isFulfilled && { color: '#166534' }
                        ]}
                      >
                        {status.label}
                      </Text>
                    </View>
                  </PressScale>

                  {/* Product Previews Row */}
                  <PressScale
                    onPress={() => router.push(`/shop/order/${order.id}`)}
                    style={styles.productsPreviewRow}
                  >
                    {/* Thumbnails */}
                    <View style={styles.thumbnailsWrap}>
                      {previewItems.map((item, idx) => {
                        const img = getItemImage(item.product_id);
                        return (
                          <View key={idx} style={styles.thumbnailBox}>
                            {img ? (
                              <Image source={{ uri: img }} style={styles.thumbImage} contentFit="contain" />
                            ) : (
                              <Icon name="package" size={16} color={colors.textMuted} />
                            )}
                          </View>
                        );
                      })}
                      {remainingCount > 0 ? (
                        <View style={[styles.thumbnailBox, styles.extraCountBox]}>
                          <Text style={styles.extraCountText}>+{remainingCount}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Summary Item Names */}
                    <View style={styles.itemsSummary}>
                      <Text style={styles.itemNamesList} numberOfLines={2}>
                        {order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {itemCount} {itemCount === 1 ? t('item') : t('items')}
                      </Text>
                    </View>
                  </PressScale>

                  {/* Card Footer: Amount + Action Button */}
                  <View style={styles.cardFooter}>
                    <View style={styles.amountWrap}>
                      <Text style={styles.amountLabel}>{t('Total Bill')}</Text>
                      <Text style={styles.amountValue}>{price(order.total)}</Text>
                    </View>

                    <View style={styles.actionsWrap}>
                      {isLive ? (
                        <PressScale
                          onPress={() => router.push(`/shop/order/${order.id}`)}
                          style={[styles.trackOrderBtn, { backgroundColor: brand.primary }]}
                        >
                          <Icon name="map-pin" size={13} color={colors.white} />
                          <Text style={styles.trackOrderBtnText}>{t('Track Order')}</Text>
                          {order.delivery_code ? (
                            <View style={styles.codeReadyBadge}>
                              <Text style={styles.codeReadyText}>OTP {order.delivery_code}</Text>
                            </View>
                          ) : null}
                        </PressScale>
                      ) : !isCancelled ? (
                        <PressScale
                          onPress={() => reorder(order)}
                          style={[styles.reorderBtn, { borderColor: brand.primary, backgroundColor: brand.primarySoft || colors.primarySoft }]}
                        >
                          <Icon name="refresh-cw" size={13} color={brand.primaryDark || colors.primary} />
                          <Text style={[styles.reorderBtnText, { color: brand.primaryDark || colors.primary }]}>
                            {t('Order again')}
                          </Text>
                        </PressScale>
                      ) : (
                        <PressScale
                          onPress={() => router.push(`/shop/order/${order.id}`)}
                          style={styles.detailsBtn}
                        >
                          <Text style={styles.detailsBtnText}>{t('View Details')}</Text>
                          <Icon name="chevron-right" size={14} color={colors.textMuted} />
                        </PressScale>
                      )}
                    </View>
                  </View>
                </FadeIn>
              );
            })
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Top Banner / Filter Strip
  summaryBar: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: space.md,
    gap: space.sm,
    ...shadow
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 2
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3
  },
  summarySubtitle: {
    fontSize: 13,
    color: colors.textMuted
  },
  summarySpentBold: {
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums']
  },
  tabPillsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft
  },
  tabPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.borderSoft
  },
  tabPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted
  },
  tabPillTextActive: {
    color: colors.white
  },

  // Empty Filter
  emptyFilterBox: {
    paddingVertical: space.xxl,
    alignItems: 'center',
    gap: space.sm
  },
  emptyFilterText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '600'
  },

  // Order Card
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: space.md,
    gap: space.sm,
    ...shadow
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft
  },
  headerLeft: {
    gap: 2
  },
  orderNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  orderNumber: {
    fontSize: 14.5,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2
  },
  orderDate: {
    fontSize: 12,
    color: colors.textMuted
  },
  methodText: {
    fontSize: 11.5,
    color: colors.textMuted,
    fontWeight: '500'
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.bg
  },
  statusPillLive: {
    backgroundColor: '#fef3c7'
  },
  statusPillFulfilled: {
    backgroundColor: '#dcfce7'
  },
  statusPillCancelled: {
    backgroundColor: '#fee2e2'
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  statusLabel: {
    fontSize: 11.5,
    fontWeight: '700'
  },

  // Product Previews
  productsPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 2
  },
  thumbnailsWrap: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  thumbnailBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10
  },
  thumbImage: {
    width: '100%',
    height: '100%'
  },
  extraCountBox: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1'
  },
  extraCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted
  },
  itemsSummary: {
    flex: 1,
    gap: 2,
    marginLeft: 14
  },
  itemNamesList: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 17
  },
  itemMeta: {
    fontSize: 11.5,
    color: colors.textMuted
  },

  // Card Footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft
  },
  amountWrap: {
    gap: 1
  },
  amountLabel: {
    fontSize: 10.5,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  amountValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums']
  },
  actionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  trackOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill
  },
  trackOrderBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800'
  },
  codeReadyBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  codeReadyText: {
    color: colors.white,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  reorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1
  },
  reorderBtnText: {
    fontSize: 12,
    fontWeight: '800'
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted
  },

  // Empty state button
  startShoppingBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.pill
  },
  startShoppingText: {
    color: colors.white,
    fontSize: 13.5,
    fontWeight: '700'
  }
});
