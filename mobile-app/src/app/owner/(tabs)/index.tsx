// Store overview, like the website's dashboard: greeting, headline numbers, orders that need you, recent orders, low stock.
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { Button, Card, EmptyState, Loading, Notice, Screen, SectionTitle, StatCard, StatStrip } from '@/components/ui';
import { useCustomerCount, useOrders, useOwnStore, useOwnerProducts, useRatingsSummary, useStoreRefunds } from '@/features/owner/owner-api';
import { StarRating } from '@/components/star-rating';
import { OrderRow } from '@/features/owner/order-row';
import { SetupChecklist, ShareShopCard } from '@/features/owner/setup-checklist';
import { getBestSellers, getBusiestHour, getLowStock, getPendingCount, getRepeatRate, getRevenue, getToday } from '@/features/owner/overview-stats';
import { useSession } from '@/lib/session';
import { price } from '@/lib/format';
import { accentAt, colors, radius, space } from '@/theme/theme';
import { useBrand } from '@/lib/brand';
import type { Product } from '@/types/catalog';

export default function OwnerOverview() {
  const { user } = useSession();
  const brand = useBrand();
  const store = useOwnStore();
  const orders = useOrders();
  const products = useOwnerProducts();
  const customers = useCustomerCount();
  const ratings = useRatingsSummary();
  const refunds = useStoreRefunds();

  // Map product names to image urls for the best-sellers visual thumbnails
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products.data ?? []) {
      map.set(p.name.toLowerCase().trim(), p);
    }
    return map;
  }, [products.data]);

  const waitingRefunds = (refunds.data ?? []).filter((refund) => refund.status === 'requested').length;
  if (orders.isLoading) return <Loading />;

  const list = [...(orders.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const needsYou = list.filter((o) => o.status === 'pending' || (o.status === 'confirmed' && o.fulfillment_status === 'not_started'));
  const lowStock = getLowStock(products.data ?? []);
  const today = getToday(list);
  const bestSellers = getBestSellers(list);
  const busiestHour = getBusiestHour(list);
  const repeatRate = getRepeatRate(list);

  const bannerColors = (brand.id === 'sky' || !brand.gradient)
    ? (['#075985', '#0369a1', '#0284c7', '#38bdf8'] as const)
    : [brand.primaryDark, brand.primary, brand.gradient[1], brand.gradient[2]];

  return (
    <Screen onRefresh={() => { void orders.refetch(); void products.refetch(); void customers.refetch(); }} refreshing={orders.isRefetching}>
      {/* Executive Store Banner with Live Status & Quick Action Shortcuts */}
      <LinearGradient colors={bannerColors as any} start={{ x: 0, y: 0.1 }} end={{ x: 1, y: 0.9 }} style={[styles.banner, { shadowColor: brand.primary || '#0284c7' }]}>
        <View style={styles.bannerGlow} />
        
        <View style={styles.bannerTopRow}>
          <Text style={styles.bannerHello}>STORE OVERVIEW</Text>
          <Pressable onPress={() => router.navigate('/owner/store-settings')} style={styles.liveBadge} accessibilityRole="button" accessibilityLabel="Store status">
            <View style={[styles.liveDot, { backgroundColor: store.data?.is_published ? '#22c55e' : '#f59e0b' }]} />
            <Text style={styles.liveText}>{store.data?.is_published ? 'Store Live' : 'Store Paused'}</Text>
          </Pressable>
        </View>

        <Text style={styles.bannerTitle} numberOfLines={2}>{store.data?.name ?? 'Store Dashboard'}</Text>

        <View style={styles.chips}>
          <Chip icon="plus" label="Add product" onPress={() => router.navigate('/owner/products')} />
          {needsYou.length > 0 ? (
            <Chip icon="alert-circle" label={`${needsYou.length} need action`} onPress={() => router.navigate('/owner/orders')} tone="amber" />
          ) : (
            <Chip icon="shopping-bag" label="Orders" onPress={() => router.navigate('/owner/orders')} />
          )}
        </View>
      </LinearGradient>

      {waitingRefunds > 0 ? (
        <Card title={`${waitingRefunds} refund ${waitingRefunds === 1 ? 'request' : 'requests'} waiting`} icon="rotate-ccw">
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Customers are waiting for your decision. Quick answers build trust.</Text>
          <Button label="Review refunds" onPress={() => router.push('/owner/refunds')} />
        </Card>
      ) : null}

      {store.data && <SetupChecklist store={store.data} productCount={products.data?.length ?? 0} />}

      {/* Headline Metric Cards */}
      <View style={styles.grid}>
        <StatCard label="Revenue" value={price(getRevenue(list)).replace('.00', '')} icon="dollar-sign" fg="#059669" bg="#d1fae5" hint="Excludes cancelled" />
        <StatCard label="Total orders" value={String(list.length)} icon="shopping-bag" fg="#0284c7" bg="#e0f2fe" />
        <StatCard label="To fulfill" value={String(getPendingCount(list))} icon="clock" fg="#d97706" bg="#fef3c7" hint="Pending orders" />
        <StatCard label="Customers" value={customers.data === undefined ? '…' : String(customers.data)} icon="users" fg="#7c3aed" bg="#ede9fe" />
      </View>

      <SectionTitle>Today</SectionTitle>
      <StatStrip items={[
        { label: 'Orders today', value: String(today.orders) },
        { label: 'Earned today', value: price(today.revenue).replace('.00', '') },
        { label: 'Busiest hour', value: busiestHour ?? '-' }
      ]} />

      {/* Best Sellers with Photo Thumbnails and Revenue */}
      {bestSellers.length > 0 && (
        <Card title="Best sellers" icon="award" right={repeatRate === null ? undefined : <Text style={styles.repeat}>{repeatRate}% come back</Text>}>
          {bestSellers.map((item, index) => {
            const matched = productMap.get(item.name.toLowerCase().trim());
            const image = matched?.images?.[0];
            const rankColors = ['#f59e0b', '#94a3b8', '#d97706', '#64748b', '#94a3b8'];
            return (
              <View key={item.name} style={styles.sellerRow}>
                <View style={styles.sellerThumbWrap}>
                  {image ? (
                    <Image source={{ uri: image }} style={styles.sellerThumb} contentFit="cover" />
                  ) : (
                    <View style={styles.sellerThumbFallback}>
                      <Icon name="package" size={18} color="#94a3b8" />
                    </View>
                  )}
                  <View style={[styles.rankBadge, { backgroundColor: rankColors[index] || '#64748b' }]}>
                    <Text style={styles.rankBadgeText}>{index + 1}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.sellerNameRow}>
                    <Text style={styles.sellerName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.sellerQty}>{item.quantity} sold</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.max(10, (item.quantity / bestSellers[0].quantity) * 100)}%`, backgroundColor: accentAt(index).fg }]} />
                  </View>
                  <Text style={styles.sellerRevenue}>{price(item.revenue)} revenue</Text>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {ratings.data && ratings.data.count > 0 && (
        <Card title="Customer ratings" icon="star" right={<Text style={styles.repeat}>{ratings.data.count} {ratings.data.count === 1 ? 'rating' : 'ratings'}</Text>}>
          <View style={styles.ratingTop}>
            <View style={styles.ratingBox}>
              <Text style={styles.ratingNumber}>{ratings.data.average_store?.toFixed(1)}</Text>
              <StarRating value={Math.round(ratings.data.average_store ?? 0)} size={16} />
              <Text style={styles.ratingLabel}>Store</Text>
            </View>
            {ratings.data.average_delivery !== null && (
              <View style={styles.ratingBox}>
                <Text style={styles.ratingNumber}>{ratings.data.average_delivery.toFixed(1)}</Text>
                <StarRating value={Math.round(ratings.data.average_delivery)} size={16} />
                <Text style={styles.ratingLabel}>Delivery</Text>
              </View>
            )}
          </View>
          {ratings.data.recent.map((item, index) => (
            <View key={index} style={styles.comment}>
              <StarRating value={item.store_stars} size={13} />
              {item.comment ? <Text style={styles.commentText}>{item.comment}</Text> : null}
              {(item.photo_urls ?? []).length > 0 ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {item.photo_urls!.map((url) => <Image key={url} source={{ uri: url }} style={styles.commentPhoto} contentFit="cover" />)}
                </View>
              ) : null}
            </View>
          ))}
        </Card>
      )}

      <SectionTitle right={<Button small variant="ghost" label="All orders" onPress={() => router.navigate('/owner/orders')} />}>Needs your attention</SectionTitle>
      {needsYou.length === 0 ? <EmptyState icon="check-circle" message="You are all caught up." /> : needsYou.slice(0, 5).map((order) => <OrderRow key={order.id} order={order} />)}

      <SectionTitle>Recent orders</SectionTitle>
      {list.length === 0 ? <EmptyState icon="shopping-bag" message="Orders will show up here as customers check out." /> : list.slice(0, 5).map((order) => <OrderRow key={order.id} order={order} />)}

      {store.data && <ShareShopCard store={store.data} />}

      <Card title="Low stock" icon="alert-triangle">
        {lowStock.length === 0 ? (
          <View style={styles.allGood}><Icon name="check-circle" size={24} color="#10b981" /><Text style={{ color: colors.textMuted, fontSize: 13 }}>All products are well stocked.</Text></View>
        ) : lowStock.slice(0, 5).map((product) => (
          <View key={product.id} style={styles.lowRow}>
            <Text style={{ flex: 1, color: colors.textSoft, fontSize: 14 }} numberOfLines={1}>{product.name}</Text>
            <Text style={styles.lowCount}>{product.stock_quantity} left</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function Chip({ icon, label, onPress, tone = 'default' }: { icon: 'package' | 'shopping-bag' | 'truck' | 'plus' | 'settings' | 'alert-circle'; label: string; onPress(): void; tone?: 'default' | 'amber' | 'emerald' }) {
  const bgStyle = tone === 'amber'
    ? { backgroundColor: 'rgba(245, 158, 11, 0.28)', borderColor: 'rgba(245, 158, 11, 0.5)' }
    : tone === 'emerald'
      ? { backgroundColor: 'rgba(16, 185, 129, 0.28)', borderColor: 'rgba(16, 185, 129, 0.5)' }
      : { backgroundColor: 'rgba(255, 255, 255, 0.18)', borderColor: 'rgba(255, 255, 255, 0.28)' };

  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [styles.chip, bgStyle, pressed && { opacity: 0.8 }]} onPress={onPress}>
      <Icon name={icon} size={13} color={colors.white} strokeWidth={2.4} />
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.xl, padding: space.xl, gap: space.sm, overflow: 'hidden', borderWidth: 0, shadowColor: '#0284c7', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  bannerGlow: { position: 'absolute', right: -25, top: -25, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  bannerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  bannerHello: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  bannerTitle: { color: '#ffffff', fontSize: 24, lineHeight: 30, fontWeight: '900', letterSpacing: -0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 7 },
  chipText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  ratingTop: { flexDirection: 'row', gap: space.md },
  ratingBox: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', borderRadius: radius.md, borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: space.md },
  ratingNumber: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  ratingLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  comment: { gap: 4, backgroundColor: colors.bg, borderRadius: radius.md, padding: space.md },
  commentPhoto: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.borderSoft },
  commentText: { fontSize: 13, color: colors.textSoft },
  repeat: { fontSize: 12, fontWeight: '700', color: '#0284c7' },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  sellerThumbWrap: { position: 'relative', width: 44, height: 44 },
  sellerThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#f1f5f9' },
  sellerThumbFallback: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  rankBadge: { position: 'absolute', bottom: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#ffffff' },
  rankBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  sellerNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  sellerName: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  sellerQty: { fontSize: 12, fontWeight: '700', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.borderSoft, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  sellerRevenue: { fontSize: 11.5, color: colors.textMuted, fontWeight: '600', fontVariant: ['tabular-nums'] },
  allGood: { alignItems: 'center', gap: 6, paddingVertical: space.md },
  lowRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.warningSoft, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10 },
  lowCount: { color: '#d97706', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }
});
