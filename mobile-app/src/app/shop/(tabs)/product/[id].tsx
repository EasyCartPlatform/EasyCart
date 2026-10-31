import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/text';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Icon } from '@/components/icon';
import { FadeIn, PressScale } from '@/components/motion';
import { useT, useContent } from '@/lib/i18n';
import { useBrand } from '@/lib/brand';
import { FavouriteButton } from '@/features/shop/favourite-button';
import { Button, EmptyState, Loading, Screen } from '@/components/ui';
import { useShop } from '@/features/shop/shop-context';
import { useCategories, useProduct, useProductRatings, useProducts } from '@/features/shop/shop-api';
import { ProductRail } from '@/features/shop/product-rail';
import { productStock, useCardActions } from '@/features/shop/product-card';
import { StarRating } from '@/components/star-rating';
import { fileUrl } from '@/lib/api';
import { price } from '@/lib/format';
import { accents, colors, radius, space, text } from '@/theme/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function rupeePrice(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ProductScreen() {
  const { id, variant: queryVariant } = useLocalSearchParams<{ id: string; variant?: string }>();
  const { slug, add, lines, subtotal, setQuantity: updateCartQuantity, markViewed } = useShop();
  const t = useT();
  const brand = useBrand();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Make image visible around 40% of the screen height, starting flush from the very top
  const PHOTO_HEIGHT = Math.round(Math.max(300, Math.min(windowHeight * 0.40, 440)));

  const { data: product, isLoading } = useProduct(slug, id);
  const { data: categories } = useCategories(slug);
  const currentCategory = categories?.find((c) => c.id === product?.category_id);
  const categoryName = currentCategory?.name;

  const { data: categoryProducts } = useProducts(slug, '', product?.category_id ?? '');
  const { data: allProducts } = useProducts(slug, '', '');
  const cardActions = useCardActions();

  const name = useContent(product?.name);
  const productRating = useProductRatings(slug).data?.[id];
  const description = useContent(product?.description);
  const [variantLabel, setVariantLabel] = useState<string | undefined>(queryVariant);
  const [photo, setPhoto] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  const mainScrollRef = useRef<ScrollView>(null);

  // Animated scroll value for sticky header transitions
  const scrollY = useRef(new Animated.Value(0)).current;

  // Reset scroll position and header animation when opening or refocusing the product page
  useFocusEffect(
    useCallback(() => {
      mainScrollRef.current?.scrollTo({ y: 0, animated: false });
      scrollY.setValue(0);
      const frame = requestAnimationFrame(() => {
        mainScrollRef.current?.scrollTo({ y: 0, animated: false });
        scrollY.setValue(0);
      });
      return () => cancelAnimationFrame(frame);
    }, [id])
  );

  // Header product title starts coming in slowly as soon as user begins scrolling down the image
  const headerTitleOpacity = scrollY.interpolate({
    inputRange: [20, Math.round(PHOTO_HEIGHT * 0.65)],
    outputRange: [0, 1],
    extrapolate: 'clamp'
  });

  const headerTitleTranslateY = scrollY.interpolate({
    inputRange: [20, Math.round(PHOTO_HEIGHT * 0.65)],
    outputRange: [10, 0],
    extrapolate: 'clamp'
  });

  // Solid header background and shadow fade in on scroll to keep title legible
  const headerBgOpacity = scrollY.interpolate({
    inputRange: [10, Math.round(PHOTO_HEIGHT * 0.55)],
    outputRange: [0, 1],
    extrapolate: 'clamp'
  });

  useEffect(() => {
    setVariantLabel(queryVariant);
    setPhoto(0);
    pagerRef.current?.scrollTo({ x: 0, animated: false });
    mainScrollRef.current?.scrollTo({ y: 0, animated: false });
    scrollY.setValue(0);
  }, [id, queryVariant]);

  useEffect(() => {
    if (product) markViewed(product.id);
  }, [product?.id]);

  useEffect(() => {
    if (product && product.variants.length > 0 && !variantLabel) {
      const selected = queryVariant ? product.variants.find((v) => v.label === queryVariant) : undefined;
      const defaultVariant = selected ?? product.variants.find((v) => v.stock > 0) ?? product.variants[0];
      if (defaultVariant) {
        setVariantLabel(defaultVariant.label);
      }
    }
  }, [product, variantLabel, queryVariant]);

  const existingCartLine = lines.find(
    (l) => l.product_id === product?.id && (l.variant_label ?? '') === (variantLabel ?? '')
  );

  const relatedProducts = useMemo(() => {
    if (!product) return [];

    // Prioritize products strictly matching the current product's category
    if (product.category_id) {
      const source = categoryProducts ?? allProducts?.filter((p) => p.category_id === product.category_id) ?? [];
      const sameCategory = source.filter(
        (p) => p.id !== product.id && p.is_active !== false && productStock(p) > 0
      );
      if (sameCategory.length > 0) {
        return sameCategory.slice(0, 10);
      }
    }

    // Fallback if product has no category or no other available items in same category
    const all = allProducts ?? [];
    return all
      .filter((p) => p.id !== product.id && p.is_active !== false && productStock(p) > 0)
      .slice(0, 10);
  }, [product, categoryProducts, allProducts]);

  if (isLoading) return <Loading />;
  if (!product) return <Screen><EmptyState message="This product is no longer available." /></Screen>;

  const variant = product.variants.find((v) => v.label === variantLabel);
  const needsVariant = product.variants.length > 0 && !variant;
  const unitPrice = variant?.price ?? product.price;
  const stock = variant ? variant.stock : product.variants.length > 0 ? 0 : product.stock_quantity;
  const images = product.images.map((img) => fileUrl(img)).filter(Boolean) as string[];

  const stockLook = stock <= 0
    ? { label: t('Out of stock'), fg: colors.danger, bg: colors.dangerSoft, border: '#fecdd3', dot: colors.danger }
    : stock <= product.low_stock_threshold
      ? { label: t('Only {n} left', { n: stock }), fg: colors.warning, bg: colors.warningSoft, border: '#fde68a', dot: '#f59e0b' }
      : { label: t('In Stock'), fg: colors.success, bg: colors.successSoft, border: '#a7f3d0', dot: '#10b981' };

  function handleAddToCart() {
    if (!product) return;
    if (__DEV__) console.log(`[cart] tapped add: ${product.name}, option=${variant?.label ?? 'none'}, stock=${stock}`);
    add({ product_id: product.id, variant_label: variant?.label, name: product.name, price: unitPrice, quantity: 1, image: images[0] ?? null, max: stock });
  }

  // Once the item is in the cart, the stepper changes the cart straight away.
  function changeCartQuantity(next: number) {
    if (!product || !existingCartLine) return;
    updateCartQuantity(product.id, variant?.label, Math.max(0, Math.min(stock, next)));
  }

  function handleThumbnailPress(index: number) {
    setPhoto(index);
    pagerRef.current?.scrollTo({ x: index * windowWidth, animated: true });
  }

  async function handleShare() {
    if (!product) return;
    try {
      await Share.share({
        title: product.name,
        message: `Check out ${product.name} on EasyCart! Price: ${rupeePrice(unitPrice)}`
      });
    } catch {
      // User dismissed share dialog
    }
  }

  const footer = existingCartLine ? (
    <View style={styles.footerRow}>
      <View style={styles.stepper}>
        <PressScale onPress={() => changeCartQuantity(existingCartLine.quantity - 1)} style={styles.stepButton} accessibilityLabel="Less">
          <Icon name="minus" size={16} color={colors.primaryDark} />
        </PressScale>
        <Text style={styles.qty}>{existingCartLine.quantity}</Text>
        <PressScale onPress={() => changeCartQuantity(existingCartLine.quantity + 1)} disabled={existingCartLine.quantity >= stock} style={[styles.stepButton, existingCartLine.quantity >= stock && { opacity: 0.35 }]} accessibilityLabel="More">
          <Icon name="plus" size={16} color={colors.primaryDark} />
        </PressScale>
      </View>
      <View style={{ flex: 1 }}>
        <Button icon="shopping-cart" label={`${t('View cart')} · ${rupeePrice(subtotal)}`} onPress={() => router.push('/shop/checkout')} />
      </View>
    </View>
  ) : (
    <Button variant="primary" icon="shopping-bag" label={needsVariant ? t('Choose an option') : stock <= 0 ? t('Out of stock') : `${t('Add to cart')} · ${rupeePrice(unitPrice)}`} onPress={handleAddToCart} disabled={needsVariant || stock <= 0} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Floating Top Header Bar */}
      <View style={[styles.topHeaderBar, { paddingTop: insets.top }]}>
        {/* Animated background that fades in when scrolling down */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.headerBg, { opacity: headerBgOpacity }]} />

        <View style={styles.headerRow}>
          {/* Back button */}
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.navigate('/shop'))}
            style={styles.headerCircleBtn}
            hitSlop={8}
            accessibilityLabel="Go back"
          >
            <Icon name="arrow-left" size={18} color={colors.text} />
          </Pressable>

          {/* Product Name (fades in smoothly when scrolling down) */}
          <Animated.View
            style={[
              styles.headerTitleWrap,
              {
                opacity: headerTitleOpacity,
                transform: [{ translateY: headerTitleTranslateY }]
              }
            ]}
          >
            <Text style={styles.headerTitleText} numberOfLines={1} ellipsizeMode="tail">
              {name}
            </Text>
          </Animated.View>

          {/* Search & Share Action Buttons */}
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.navigate('/shop')}
              style={styles.headerCircleBtn}
              hitSlop={8}
              accessibilityLabel="Search products"
            >
              <Icon name="search" size={18} color={colors.text} />
            </Pressable>

            <Pressable
              onPress={handleShare}
              style={styles.headerCircleBtn}
              hitSlop={8}
              accessibilityLabel="Share product"
            >
              <Icon name="share-2" size={18} color={colors.text} />
            </Pressable>
          </View>
        </View>
      </View>

      <Screen
        key={id}
        scrollRef={mainScrollRef}
        noPadding
        footer={footer}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Top Product Image Container (Starts flush from the top, under the floating header) */}
        <View style={[styles.photo, { width: windowWidth, height: PHOTO_HEIGHT }]}>
          {images.length > 1 ? (
            <ScrollView
              ref={pagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={windowWidth}
              snapToAlignment="start"
              decelerationRate="fast"
              style={{ width: windowWidth, height: PHOTO_HEIGHT }}
              contentContainerStyle={{ width: windowWidth * images.length, height: PHOTO_HEIGHT }}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
                if (newIndex >= 0 && newIndex < images.length) {
                  setPhoto(newIndex);
                }
              }}
              scrollEventThrottle={16}
            >
              {images.map((uri, idx) => (
                <View
                  key={`${uri}-${idx}`}
                  style={{
                    width: windowWidth,
                    height: PHOTO_HEIGHT,
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingTop: insets.top + 44,
                    paddingBottom: 24,
                    paddingHorizontal: 20
                  }}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: windowWidth - 40, height: PHOTO_HEIGHT - insets.top - 68 }}
                    contentFit="contain"
                  />
                </View>
              ))}
            </ScrollView>
          ) : images[0] ? (
            <View
              style={{
                width: windowWidth,
                height: PHOTO_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: insets.top + 44,
                paddingBottom: 24,
                paddingHorizontal: 20
              }}
            >
              <Image
                source={{ uri: images[0] }}
                style={{ width: windowWidth - 40, height: PHOTO_HEIGHT - insets.top - 68 }}
                contentFit="contain"
              />
            </View>
          ) : (
            <View
              style={{
                width: windowWidth,
                height: PHOTO_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: insets.top + 44
              }}
            >
              <Icon name="image" size={44} color={colors.textFaint} />
            </View>
          )}

          {/* Favourite Heart floating on the bottom right of the image */}
          <View style={styles.heart}>
            <FavouriteButton productId={product.id} size={38} />
          </View>

          {/* Previous arrow button */}
          {images.length > 1 && photo > 0 && (
            <Pressable
              onPress={() => handleThumbnailPress(photo - 1)}
              style={styles.navBtnLeft}
              hitSlop={8}
              accessibilityLabel="Previous image"
            >
              <Icon name="chevron-left" size={18} color="#1e293b" />
            </Pressable>
          )}

          {/* Next arrow button */}
          {images.length > 1 && photo < images.length - 1 && (
            <Pressable
              onPress={() => handleThumbnailPress(photo + 1)}
              style={styles.navBtnRight}
              hitSlop={8}
              accessibilityLabel="Next image"
            >
              <Icon name="chevron-right" size={18} color="#1e293b" />
            </Pressable>
          )}

          {/* Counter badge (e.g. 1 / 3) */}
          {images.length > 1 && (
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>{photo + 1} / {images.length}</Text>
            </View>
          )}

          {/* Indicator dots */}
          {images.length > 1 && (
            <View style={styles.dotsRow}>
              {images.map((_, idx) => (
                <View
                  key={idx}
                  style={[styles.dot, idx === photo && styles.dotActive]}
                />
              ))}
            </View>
          )}
        </View>

        {/* Content body with responsive width and comfortable padding */}
        <View style={styles.contentWrap}>
          {/* Thumbnails row */}
          {images.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
              {images.map((uri, index) => {
                const active = index === photo;
                return (
                  <Pressable
                    key={`${uri}-${index}`}
                    onPress={() => handleThumbnailPress(index)}
                    style={[styles.thumb, active && styles.thumbActive]}
                    accessibilityLabel={`View photo ${index + 1}`}
                  >
                    <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <FadeIn style={styles.details}>
            {/* Row with in-stock status on left and rating on the right corner */}
            <View style={styles.stockMetaRow}>
              {!needsVariant ? (
                <View style={[styles.stock, { backgroundColor: stockLook.bg, borderColor: stockLook.border }]}>
                  <View style={[styles.stockDot, { backgroundColor: stockLook.dot }]} />
                  <Text style={[styles.stockText, { color: stockLook.fg }]}>{stockLook.label}</Text>
                </View>
              ) : <View />}
              {productRating && productRating.count > 0 && productRating.average !== null ? (
                <View style={styles.ratingBadge}>
                  <Icon name="star" size={13} color="#f59e0b" fill="#f59e0b" />
                  <Text style={styles.ratingScore}>{productRating.average.toFixed(1)}</Text>
                  <Text style={styles.ratingCount}>({productRating.count})</Text>
                </View>
              ) : null}
            </View>

            {/* Decreased font size for title, MRP removed below title, continued directly with description */}
            <Text style={styles.title}>{name}</Text>
            {product.description ? <Text style={styles.description}>{description}</Text> : null}
          </FadeIn>
          <View style={styles.divider} />

          {product.variants.length > 0 && (
            <View style={{ gap: space.xs }}>
              <Text style={text.heading}>{t('Choose an option')}</Text>
              <View style={styles.variants}>
                {product.variants.map((v) => {
                  const active = v.label === variantLabel;
                  return (
                    <PressScale
                      key={v.label}
                      disabled={v.stock <= 0}
                      onPress={() => setVariantLabel(v.label)}
                      style={[styles.variant, active && styles.variantActive, v.stock <= 0 && { opacity: 0.4 }]}
                    >
                      <Text style={[styles.variantText, active && { color: colors.primaryDark }]}>{v.label}</Text>
                    </PressScale>
                  );
                })}
              </View>
            </View>
          )}

          {/* Replaced Quantity with selected option name, price with rupee symbol, and Add button / count stepper */}
          {!needsVariant && stock > 0 && (
            <View style={styles.optionRow}>
              <View style={styles.optionInfo}>
                {variant ? (
                  <View style={{ gap: 2 }}>
                    <Text style={styles.optionName} numberOfLines={1}>{variant.label}</Text>
                    <Text style={[styles.optionPrice, { color: brand.primaryDark }]}>{rupeePrice(unitPrice)}</Text>
                  </View>
                ) : (
                  <Text style={[styles.optionPrice, { color: brand.primaryDark }]}>{rupeePrice(unitPrice)}</Text>
                )}
              </View>

              {existingCartLine ? (
                <View style={[styles.stepperPill, { borderColor: brand.primary, backgroundColor: brand.primarySoft }]}>
                  <PressScale
                    onPress={() => changeCartQuantity(existingCartLine.quantity - 1)}
                    style={styles.stepButton}
                    accessibilityLabel="Less"
                  >
                    <Icon
                      name="minus"
                      size={15}
                      color={brand.primaryDark}
                      strokeWidth={2.8}
                    />
                  </PressScale>
                  <Text style={styles.qty}>{existingCartLine.quantity}</Text>
                  <PressScale
                    onPress={() => changeCartQuantity(existingCartLine.quantity + 1)}
                    disabled={existingCartLine.quantity >= stock}
                    style={[styles.stepButton, existingCartLine.quantity >= stock && { opacity: 0.35 }]}
                    accessibilityLabel="More"
                  >
                    <Icon name="plus" size={15} color={brand.primaryDark} strokeWidth={2.8} />
                  </PressScale>
                </View>
              ) : (
                <PressScale
                  onPress={handleAddToCart}
                  style={[styles.addBtn, { borderColor: brand.primary, backgroundColor: brand.primarySoft }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${variant?.label ?? name} to cart`}
                >
                  <Icon name="plus" size={14} color={brand.primaryDark} strokeWidth={3} />
                  <Text style={[styles.addBtnText, { color: brand.primaryDark }]}>ADD</Text>
                </PressScale>
              )}
            </View>
          )}

          <View style={styles.trust}>
            <View style={styles.trustRow}><Icon name="truck" size={16} color={colors.primary} /><Text style={styles.trustText}>Delivery or in-store pickup at checkout</Text></View>
            <View style={styles.trustRow}><Icon name="shield-check" size={16} color={colors.primary} /><Text style={styles.trustText}>Secure checkout, code-verified handover</Text></View>
          </View>

          {/* Related products strictly based on category */}
          {relatedProducts.length > 0 && (
            <View style={{ marginTop: space.sm, marginBottom: space.sm }}>
              <ProductRail
                actions={cardActions}
                title={categoryName ? t('Related in {category}', { category: categoryName }) : t('Related products')}
                subtitle={categoryName ? t('More available items from {category}', { category: categoryName }) : t('More available items you might like')}
                icon="tags"
                accent={accents.teal}
                products={relatedProducts}
              />
            </View>
          )}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  topHeaderBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100
  },
  headerBg: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 4
  },
  headerRow: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    gap: space.sm
  },
  headerCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2
  },
  headerTitleWrap: {
    flex: 1,
    paddingHorizontal: 4
  },
  headerTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  photo: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    position: 'relative'
  },
  contentWrap: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.md
  },
  navBtnLeft: {
    position: 'absolute',
    left: 8,
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10
  },
  navBtnRight: {
    position: 'absolute',
    right: 8,
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10
  },
  heart: {
    position: 'absolute',
    bottom: 12,
    right: 14,
    zIndex: 11
  },
  counterBadge: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    zIndex: 10
  },
  counterText: { fontSize: 11, fontWeight: '700', color: colors.white },
  dotsRow: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center'
  },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(148, 163, 184, 0.45)' },
  dotActive: { width: 14, backgroundColor: colors.primary, borderRadius: 3 },
  details: { gap: 6, marginTop: space.sm },
  stockMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  ratingScore: { fontSize: 12, fontWeight: '700', color: '#92400e' },
  ratingCount: { fontSize: 12, fontWeight: '600', color: '#b45309' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.2, lineHeight: 23 },
  stock: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockText: { fontSize: 11, fontWeight: '700' },
  price: { fontSize: 24, fontWeight: '900', color: colors.primaryDark, letterSpacing: -0.5 },
  description: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border },
  trust: { gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryTint },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trustText: { fontSize: 12, color: colors.textSoft, flex: 1 },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: colors.white, padding: 4 },
  thumbActive: { borderColor: colors.primary, borderWidth: 2 },
  variants: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  variant: { minWidth: 56, height: 36, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  variantActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  variantText: { fontSize: 13, fontWeight: '600', color: colors.text },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, gap: space.md, marginTop: 4 },
  optionInfo: { flex: 1, justifyContent: 'center' },
  optionName: { fontSize: 14, fontWeight: '700', color: colors.text },
  optionPrice: { fontSize: 18, fontWeight: '800', color: colors.primaryDark, letterSpacing: -0.3 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1.5
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  stepperPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    height: 34
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.primaryTint, borderRadius: radius.pill, backgroundColor: colors.primarySoft, paddingHorizontal: 4 },
  stepButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 20, textAlign: 'center', fontSize: 14, fontWeight: '700', color: colors.text }
});
