import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextInput } from '@/components/text';
import { router } from 'expo-router';
import { Icon, type IconName } from '@/components/icon';
import { PressScale, Skeleton } from '@/components/motion';
import { Button, EmptyState, Loading, Notice, Screen } from '@/components/ui';
import { ShopSwitcher } from '@/features/shop/shop-switcher';
import { useT } from '@/lib/i18n';
import { useBrand } from '@/lib/brand';
import { estimateDelivery } from '@/lib/eta';
import { ProfileMenu } from '@/components/profile-menu';
import { FavouritesButton } from '@/components/favourites-button';
import { FloatingCartBar } from '@/components/floating-cart-bar';
import { useAddresses, type SavedAddress } from '@/features/shop/addresses';
import { checkDeliveryRange } from '@/lib/delivery-radius';
import { useSession } from '@/lib/session';
import { useShop } from '@/features/shop/shop-context';
import { useCategories, useProducts, useStore, useStoreReviews } from '@/features/shop/shop-api';
import { ReviewsStrip } from '@/features/shop/reviews-strip';
import { OffersBannerCarousel } from '@/features/shop/offers-banner-carousel';
import { ProductCard, productStock, useCardActions } from '@/features/shop/product-card';
import { ProductRail } from '@/features/shop/product-rail';
import { ApiError, errorMessage, fileUrl } from '@/lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accentAt, accents, colors, radius, space } from '@/theme/theme';



// Grey placeholder cards in the shape of real products, shown while the list loads.
function ProductGridSkeleton({ width }: { width: number }) {
  return (
    <View style={styles.grid}>
      {[0, 1, 2, 3, 4, 5].map((key) => (
        <View key={key} style={[styles.skeletonCard, { width }]}>
          <Skeleton height={width - 16} rounded={radius.md} />
          <Skeleton width="85%" height={14} />
          <Skeleton width="45%" height={16} />
        </View>
      ))}
    </View>
  );
}

function getDeliveryTarget(address?: SavedAddress | null): string | null {
  if (!address) return null;
  const parts: string[] = [];
  if (address.street?.trim()) parts.push(address.street.trim());
  if (address.landmark?.trim()) parts.push(address.landmark.trim());
  if (address.city?.trim()) parts.push(address.city.trim());
  if (address.zip?.trim()) parts.push(address.zip.trim());

  if (parts.length > 0) return parts.join(', ');
  return address.label || null;
}

type View_ = 'all' | 'rating' | 'low' | 'high';

export default function ShopHome() {
  const { user } = useSession();
  const { slug, favourites, recent, location } = useShop();
  const cardActions = useCardActions();
  const t = useT();
  const brand = useBrand();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View_>('all');
  const [category, setCategory] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [pendingView, setPendingView] = useState<View_>('all');
  const [pendingCategory, setPendingCategory] = useState('');
  const [pendingInStockOnly, setPendingInStockOnly] = useState(false);

  function openFilterModal() {
    setPendingCategory(category);
    setPendingView(view);
    setPendingInStockOnly(inStockOnly);
    setFilterModalOpen(true);
  }
  const store = useStore(slug);
  const reviews = useStoreReviews(slug);
  const categories = useCategories(slug);
  const products = useProducts(slug, search.trim(), category);
  const { width } = useWindowDimensions();
  const { active: activeAddress } = useAddresses();
  const insets = useSafeAreaInsets();
  const deliveryTarget = getDeliveryTarget(activeAddress);

  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 3500,
          useNativeDriver: true
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 3500,
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // 2 columns on phones, more on tablets; the page column is at most 720 wide.
  const contentWidth = Math.min(width, 720) - space.lg * 2;
  const columns = contentWidth >= 640 ? 4 : contentWidth >= 460 ? 3 : 2;
  const cardWidth = (contentWidth - space.md * (columns - 1)) / columns;

  if (store.isLoading) return <Loading />;
  // Status 0 means the server could not be reached at all (no network, or wrong server address).
  const offline = store.error instanceof ApiError && store.error.status === 0;
  if (store.isError || !store.data) {
    return (
      <Screen>
        <EmptyState
          icon={offline ? 'wifi-off' : 'shopping-bag'}
          message={offline ? errorMessage(store.error) : t('We could not open the shop "{slug}". It may be offline, or the shop code is wrong.', { slug })}
          action={offline ? <Button label="Try again" variant="outline" onPress={() => void store.refetch()} /> : <Button label="Choose another shop" variant="outline" onPress={() => router.push('/shop/account')} />}
        />
      </Screen>
    );
  }

  // The list the customer actually sees: filtered by stock, sorted by price or rating, on top of search and category.
  let shown = products.data ?? [];
  if (inStockOnly) shown = shown.filter((product) => productStock(product) > 0);
  if (view === 'low') shown = [...shown].sort((a, b) => a.price - b.price);
  if (view === 'high') shown = [...shown].sort((a, b) => b.price - a.price);
  // Best rated first; products nobody has rated yet go to the end.
  if (view === 'rating') shown = [...shown].sort((a, b) => (cardActions.ratingFor(b.id)?.average ?? -1) - (cardActions.ratingFor(a.id)?.average ?? -1));
  const count = shown.length;

  // Shelves above the grid, only while nobody is searching or filtering. Each one is worked out from data the app already has.
  const catalog = products.data ?? [];
  const showRails = !search.trim() && category === '' && view === 'all' && !inStockOnly && catalog.length > 0;
  const activeFilterCount = (category ? 1 : 0) + (view !== 'all' ? 1 : 0) + (inStockOnly ? 1 : 0);
  const recentlyViewed = recent.map((id) => catalog.find((product) => product.id === id)).filter((product): product is (typeof catalog)[number] => Boolean(product)).slice(0, 8);
  const almostGone = catalog.filter((product) => productStock(product) > 0 && productStock(product) <= (product.low_stock_threshold ?? 5)).slice(0, 8);
  const range = activeAddress || location ? checkDeliveryRange(store.data, activeAddress?.zip ?? null, activeAddress?.latitude !== undefined && activeAddress?.longitude !== undefined ? { latitude: activeAddress.latitude, longitude: activeAddress.longitude } : location?.coords) : null;

  return (
    <LinearGradient
      colors={[brand.primaryTint, brand.primarySoft, '#f8fafc', '#ffffff']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.4, y: 1 }}
      style={{ flex: 1, paddingTop: insets.top }}
    >
      <Screen
        preserveScroll
        style={{ backgroundColor: 'transparent' }}
        onRefresh={() => { void store.refetch(); void products.refetch(); }}
        refreshing={products.isRefetching}
        stickyHeaderIndices={[1]}
      >
        {/* Index 0: Top Header Logo + Delivery Bar + Hero Banner */}
        <View style={{ gap: space.sm }}>
          <View style={styles.topHeader}>
            <ShopSwitcher name={store.data?.name ?? 'Shop'} logoUrl={fileUrl(store.data?.logo_url)} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <FavouritesButton />
              <ProfileMenu photoUrl={user?.avatar_url} />
            </View>
          </View>

          {/* Delivery & ETA Bar */}
          <PressScale
            onPress={() => router.push('/shop/addresses')}
            style={[
              styles.deliveryBar,
              {
                backgroundColor: brand.primarySoft,
                borderColor: brand.primaryTint
              }
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('Change delivery address')}
          >
            <View style={[styles.deliveryPinCircle, { borderColor: brand.primaryTint, backgroundColor: brand.primaryTint }]}>
              <Icon name="map-pin" size={14} color={brand.primary} />
            </View>
            <View style={styles.deliveryContent}>
              <Text style={[styles.deliveryDeliverTo, { color: brand.primary }]}>{t('DELIVER TO')}</Text>
              <Text style={styles.deliveryTitle} numberOfLines={1} ellipsizeMode="tail">
                {deliveryTarget ?? t('Add a delivery address')}
              </Text>
            </View>
            <Icon name="chevron-right" size={14} color={brand.primary} />
            {range?.isEligible && (
              <View style={[styles.etaPill, { borderColor: brand.primaryTint }]}>
                <Icon name="zap" size={11} color={brand.primary} />
                <Text style={[styles.etaText, { color: brand.primary }]}>
                  {(() => { const eta = estimateDelivery(range.distanceKm); return `${eta.low}–${eta.high} min`; })()}
                </Text>
              </View>
            )}
          </PressScale>

          {range && !range.isEligible && <Notice tone="warning" icon="alert-triangle">{range.message}. Pickup is still available at checkout.</Notice>}

          {/* Theme Gradient Storefront Hero Banner */}
          <LinearGradient
            colors={brand.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroBannerCard, { shadowColor: brand.primary }]}
          >
            {/* Animated decorative gradient orbs */}
            <Animated.View
              style={[
                styles.heroGlowCircle1,
                {
                  backgroundColor: brand.primaryTint,
                  opacity: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.35, 0.65]
                  }),
                  transform: [
                    {
                      scale: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.15]
                      })
                    }
                  ]
                }
              ]}
            />
            <Animated.View
              style={[
                styles.heroGlowCircle2,
                {
                  backgroundColor: brand.primaryDark,
                  opacity: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.25, 0.55]
                  }),
                  transform: [
                    {
                      scale: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.2]
                      })
                    }
                  ]
                }
              ]}
            />

            {/* Top pill badge */}
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroTopBadge}>
                <Icon name="check-circle" size={12} color="#ffffff" />
                <Text style={styles.heroTopBadgeText}>Local store · Delivered</Text>
              </View>
            </View>

            {/* Store Title & Description */}
            <Text style={styles.heroStoreTitle} numberOfLines={2}>
              {t('Welcome to')} {store.data?.name ?? 'Shop'}
            </Text>

            {store.data?.address ? (
              <Text style={styles.heroStoreAddress} numberOfLines={1}>
                {store.data.address} · {t('Delivered to your door.')}
              </Text>
            ) : (
              <Text style={styles.heroStoreAddress} numberOfLines={1}>
                {t('Fresh essentials, straight to your doorstep.')}
              </Text>
            )}

            {/* Rating pill */}
            <View style={styles.heroBottomRow}>
              {reviews.data?.average ? (
                <View style={styles.heroRatingPill}>
                  <Text style={styles.heroRatingStar}>★</Text>
                  <Text style={styles.heroRatingText}>
                    {reviews.data.average.toFixed(1)} {t('out of 5')} · {reviews.data.count} {t('ratings')}
                  </Text>
                </View>
              ) : (
                <View style={styles.heroRatingPill}>
                  <Icon name="award" size={12} color="#fef08a" />
                  <Text style={styles.heroRatingText}>{t('Trusted local store')}</Text>
                </View>
              )}
            </View>
          </LinearGradient>

          {/* Multi-Offer Auto-sliding Banner */}
          <OffersBannerCarousel
            rawOffers={store.data.promotion_banner_text}
            fallbackText={t('Free delivery over ₹499 this week')}
          />
        </View>

        {/* Index 1: Sticky Header with Search Bar + Filters */}
        <View style={[styles.stickyFilterContainer, { backgroundColor: brand.primarySoft }]}>
          <View style={styles.searchRow}>
            <View style={[styles.search, { borderColor: brand.primaryTint }]}>
              <Icon name="search" size={16} color={colors.textFaint} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('Search products')}
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Icon name="x" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            <Pressable
              onPress={openFilterModal}
              style={[
                styles.filterIconButton,
                activeFilterCount > 0 && [styles.filterIconButtonActive, { borderColor: brand.primary, backgroundColor: brand.primarySoft }]
              ]}
              accessibilityLabel="Open filters"
              accessibilityRole="button"
            >
              <Icon
                name="sliders"
                size={18}
                color={activeFilterCount > 0 ? brand.primary : colors.text}
              />
              {activeFilterCount > 0 && (
                <View style={[styles.filterBadge, { backgroundColor: brand.primary }]}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* Index 2: Products Grid */}
        <View style={{ marginTop: space.xs, gap: space.md }}>
          {showRails && (
            <>
              <ProductRail actions={cardActions} title={t('Almost gone')} subtitle={t('Grab them before they sell out')} icon="zap" accent={accents.orange} products={almostGone} />
              <ProductRail actions={cardActions} title={t('Recently viewed')} icon="clock" accent={accents.violet} products={recentlyViewed} compact boxed />
              <ReviewsStrip reviews={reviews.data} />
            </>
          )}
          {showRails && <Text style={styles.sectionTitle}>{t('All products')}</Text>}
          {products.isLoading ? <ProductGridSkeleton width={cardWidth} /> : count === 0 ? (
            <EmptyState icon="search" message={search ? t('No products match "{search}".', { search }) : t('This shop has no products yet.')} />
          ) : (
            <View style={styles.grid}>
              {shown.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  width={cardWidth}
                  index={index}
                  line={cardActions.lineFor(product.id)}
                  lines={cardActions.linesFor(product.id)}
                  rating={cardActions.ratingFor(product.id)}
                  onAdd={cardActions.onAdd}
                  onSetQuantity={cardActions.onSetQuantity}
                />
              ))}
            </View>
          )}
        </View>
      </Screen>

      <FloatingCartBar />

      {/* Filters Modal */}
      <Modal
        visible={filterModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterModalOpen(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="sliders" size={18} color={brand.primary} />
                <Text style={styles.modalTitle}>{t('Filter & Sort')}</Text>
              </View>
              <Pressable onPress={() => setFilterModalOpen(false)} hitSlop={10}>
                <Icon name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingVertical: 4 }}>
              {/* Category Filter */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>{t('Categories')}</Text>
                <View style={styles.modalOptionsWrap}>
                  <Pressable
                    onPress={() => setPendingCategory('')}
                    style={[styles.modalOptionChip, pendingCategory === '' && [styles.modalOptionChipActive, { backgroundColor: brand.primary, borderColor: brand.primary }]]}
                  >
                    <Text style={[styles.modalOptionText, pendingCategory === '' && styles.modalOptionTextActive]}>
                      {t('All')}
                    </Text>
                  </Pressable>
                  {(categories.data ?? []).map((cat) => {
                    const isSelected = pendingCategory === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => setPendingCategory(isSelected ? '' : cat.id)}
                        style={[styles.modalOptionChip, isSelected && [styles.modalOptionChipActive, { backgroundColor: brand.primary, borderColor: brand.primary }]]}
                      >
                        <Text style={[styles.modalOptionText, isSelected && styles.modalOptionTextActive]}>
                          {cat.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Sort By */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>{t('Sort by')}</Text>
                <View style={styles.modalOptionsWrap}>
                  {[
                    { value: 'all', label: t('Default') },
                    { value: 'rating', label: t('Top rated') },
                    { value: 'low', label: t('Price: Low to high') },
                    { value: 'high', label: t('Price: High to low') }
                  ].map((opt) => {
                    const isSelected = pendingView === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setPendingView(opt.value as View_)}
                        style={[styles.modalOptionChip, isSelected && [styles.modalOptionChipActive, { backgroundColor: brand.primary, borderColor: brand.primary }]]}
                      >
                        <Text style={[styles.modalOptionText, isSelected && styles.modalOptionTextActive]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Availability */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>{t('Availability')}</Text>
                <View style={styles.modalOptionsWrap}>
                  <Pressable
                    onPress={() => setPendingInStockOnly((v) => !v)}
                    style={[styles.modalOptionChip, pendingInStockOnly && [styles.modalOptionChipActive, { backgroundColor: brand.primary, borderColor: brand.primary }]]}
                  >
                    <Text style={[styles.modalOptionText, pendingInStockOnly && styles.modalOptionTextActive]}>
                      {t('In stock only')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <View style={{ flex: 1 }}>
                <Button
                  variant="outline"
                  label={t('Reset all')}
                  onPress={() => {
                    setPendingCategory('');
                    setPendingView('all');
                    setPendingInStockOnly(false);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  variant="primary"
                  label={t('Apply')}
                  onPress={() => {
                    setCategory(pendingCategory);
                    setView(pendingView);
                    setInStockOnly(pendingInStockOnly);
                    setFilterModalOpen(false);
                  }}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}


const styles = StyleSheet.create({
  // Blue Gradient Hero Banner
  heroBannerCard: {
    borderRadius: radius.xl,
    padding: space.lg,
    overflow: 'hidden',
    position: 'relative',
    gap: space.sm,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 4
  },
  heroGlowCircle1: {
    position: 'absolute',
    right: -25,
    top: -25,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#38bdf8'
  },
  heroGlowCircle2: {
    position: 'absolute',
    right: 20,
    bottom: -35,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#0284c7'
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  heroTopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)'
  },
  heroTopBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2
  },
  heroStoreTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.4,
    lineHeight: 28,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  heroStoreAddress: {
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
    marginTop: -2
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    gap: space.sm
  },
  heroRatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)'
  },
  heroRatingStar: {
    color: '#fef08a',
    fontSize: 12,
    fontWeight: '900'
  },
  heroRatingText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700'
  },

  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 2 },
  deliveryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2
  },
  deliveryPinCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1
  },
  deliveryContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 1,
    minWidth: 0,
    marginRight: 4
  },
  deliveryDeliverTo: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0284c7',
    letterSpacing: 0.5
  },
  deliveryTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2
  },
  etaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1
  },
  etaText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7'
  },
  stickyFilterContainer: { backgroundColor: '#f0f9ff', paddingVertical: 4, gap: space.xs, zIndex: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginVertical: 4 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: '#e0f2fe', backgroundColor: colors.white, paddingHorizontal: space.lg },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, height: '100%' },
  filterIconButton: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  filterIconButtonActive: { borderColor: '#0284c7', backgroundColor: '#f0f9ff' },
  filterBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: colors.white },
  filterBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, gap: space.md, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.borderSoft, paddingBottom: space.md },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  modalSection: { gap: space.xs },
  modalSectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalOptionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: 4 },
  modalOptionChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderSoft },
  modalOptionChipActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  modalOptionText: { fontSize: 13, fontWeight: '600', color: colors.text },
  modalOptionTextActive: { color: '#ffffff', fontWeight: '700' },
  modalFooter: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  skeletonCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 8, gap: 10 }
});
