// One product in the grid: an inset rounded photo, name, price, and a top-right ADD button that turns into a quantity stepper.
import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Icon } from '@/components/icon';
import { FadeIn, PressScale } from '@/components/motion';
import { FavouriteButton } from './favourite-button';
import { Text } from '@/components/text';
import { fileUrl } from '@/lib/api';
import { price } from '@/lib/format';
import { accents, colors, radius, shadow } from '@/theme/theme';
import type { Product, ProductVariant } from '@/types/catalog';
import { useShop, type CartLine } from './shop-context';
import { useProductRatings, type StarSummary } from './shop-api';
import { useT, useContent } from '@/lib/i18n';
import { useBrand } from '@/lib/brand';
import { ProductOptionsModal } from './product-options-modal';

export function productStock(product: Product) {
  return product.variants && product.variants.length > 0
    ? product.variants.reduce((sum, v) => sum + v.stock, 0)
    : product.stock_quantity;
}

// The cart behaviour every card shares. Cards get these as props instead of reading the cart themselves,
// so tapping ADD redraws only that one card and not the whole shop.
export interface CardActions {
  lineFor(productId: string): CartLine | undefined;
  linesFor(productId: string): CartLine[];
  ratingFor(productId: string): StarSummary | undefined;
  onAdd(product: Product, variant?: ProductVariant): void;
  onSetQuantity(productId: string, quantity: number, variantLabel?: string): void;
}

export function useCardActions(): CardActions {
  const { slug, lines, add, setQuantity } = useShop();
  const t = useT();
  const productRatings = useProductRatings(slug);
  const ratingFor = useCallback((productId: string) => productRatings.data?.[productId], [productRatings.data]);

  // Group lines by product_id
  const productLinesMap = useMemo(() => {
    const map = new Map<string, CartLine[]>();
    for (const line of lines) {
      const existing = map.get(line.product_id);
      if (existing) {
        existing.push(line);
      } else {
        map.set(line.product_id, [line]);
      }
    }
    return map;
  }, [lines]);

  const linesFor = useCallback((productId: string) => productLinesMap.get(productId) ?? [], [productLinesMap]);

  const lineFor = useCallback((productId: string) => {
    const list = productLinesMap.get(productId);
    return list && list.length > 0 ? list[0] : undefined;
  }, [productLinesMap]);

  const onAdd = useCallback((product: Product, variant?: ProductVariant) => {
    const targetVariant = variant ?? (product.variants?.length === 1 ? product.variants[0] : undefined);
    const variantLabel = targetVariant?.label;
    const itemPrice = targetVariant ? targetVariant.price : product.price;
    const maxStock = targetVariant ? targetVariant.stock : product.stock_quantity;
    const image = fileUrl(product.images?.[0]);

    add({
      product_id: product.id,
      variant_label: variantLabel,
      name: product.name,
      price: itemPrice,
      quantity: 1,
      image,
      max: maxStock
    });
  }, [add]);

  const onSetQuantity = useCallback((productId: string, quantity: number, variantLabel?: string) => {
    let resolvedLabel = variantLabel;
    if (resolvedLabel === undefined) {
      const match = lines.find((l) => l.product_id === productId);
      if (match) {
        resolvedLabel = match.variant_label;
      }
    }
    setQuantity(productId, resolvedLabel, quantity);
  }, [setQuantity, lines]);

  return useMemo(() => ({ lineFor, linesFor, ratingFor, onAdd, onSetQuantity }), [lineFor, linesFor, ratingFor, onAdd, onSetQuantity]);
}

export interface ProductCardProps {
  product: Product;
  width: number;
  index?: number;
  line?: CartLine;
  lines?: CartLine[];
  rating?: StarSummary;
  onAdd(product: Product, variant?: ProductVariant): void;
  onSetQuantity(productId: string, quantity: number, variantLabel?: string): void;
}

function ProductCardView({
  product,
  width,
  index = 0,
  line,
  lines,
  rating,
  onAdd,
  onSetQuantity
}: ProductCardProps) {
  const t = useT();
  const brand = useBrand();
  const name = useContent(product.name);
  const image = fileUrl(product.images?.[0]);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);

  const hasVariants = Boolean(product.variants && product.variants.length > 0);
  const isMultiOption = Boolean(product.variants && product.variants.length > 1);
  const isSingleOption = !isMultiOption;
  const singleVariant = hasVariants && product.variants.length === 1 ? product.variants[0] : undefined;

  const stock = productStock(product);
  const availableStock = singleVariant ? singleVariant.stock : (hasVariants ? stock : product.stock_quantity);
  const fewLeft = stock > 0 && stock <= (product.low_stock_threshold ?? 5);

  const fromPrice = isMultiOption
    ? Math.min(...product.variants.map((v) => v.price))
    : singleVariant
      ? singleVariant.price
      : product.price;

  const productLines = useMemo(() => {
    if (lines && lines.length > 0) return lines;
    if (line) return [line];
    return [];
  }, [lines, line]);

  const totalCartQty = useMemo(() => {
    return productLines.reduce((sum, l) => sum + l.quantity, 0);
  }, [productLines]);

  const inCart = totalCartQty > 0;

  function quickAdd(event?: any) {
    event?.stopPropagation?.();
    if (stock <= 0) return;
    if (isMultiOption) {
      setOptionsModalVisible(true);
      return;
    }
    onAdd(product, singleVariant);
  }

  function handleDecrease(event?: any) {
    event?.stopPropagation?.();
    if (isSingleOption) {
      const currentQty = productLines[0]?.quantity ?? 0;
      onSetQuantity(product.id, currentQty - 1, singleVariant?.label);
      return;
    }

    if (productLines.length === 1) {
      const activeLine = productLines[0];
      onSetQuantity(product.id, activeLine.quantity - 1, activeLine.variant_label);
    } else {
      setOptionsModalVisible(true);
    }
  }

  function handleIncrease(event?: any) {
    event?.stopPropagation?.();
    if (isMultiOption) {
      setOptionsModalVisible(true);
      return;
    }

    const currentQty = productLines[0]?.quantity ?? 0;
    if (currentQty < availableStock) {
      onSetQuantity(product.id, currentQty + 1, singleVariant?.label);
    }
  }

  function handleQtyPress(event?: any) {
    event?.stopPropagation?.();
    if (isMultiOption) {
      setOptionsModalVisible(true);
    }
  }

  return (
    <>
      <FadeIn index={index} style={{ width }}>
        <PressScale onPress={() => router.push(`/shop/product/${product.id}`)} style={styles.card} accessibilityLabel={product.name}>
          <View style={styles.imageWrap}>
            {image ? (
              <Image source={{ uri: image }} style={styles.image} contentFit="cover" transition={150} cachePolicy="memory-disk" recyclingKey={product.id} />
            ) : (
              <Icon name="image" size={28} color={colors.textFaint} />
            )}
            <View style={styles.heart}><FavouriteButton productId={product.id} size={30} /></View>
            {stock <= 0 ? (
              <View style={[styles.badge, { backgroundColor: 'rgba(15,23,42,0.85)' }]}><Text style={[styles.badgeText, { color: colors.white }]}>{t('Sold out')}</Text></View>
            ) : fewLeft ? (
              <View style={[styles.badge, { backgroundColor: colors.warningSoft }]}><Text style={[styles.badgeText, { color: colors.warning }]}>{t('Only {n} left', { n: stock })}</Text></View>
            ) : null}

            {/* Plus / Stepper on top right corner touching edges */}
            {stock > 0 && (
              <View style={styles.topRightAction}>
                {inCart ? (
                  <View style={styles.stepper}>
                    <PressScale
                      onPress={handleDecrease}
                      style={styles.stepButton}
                      accessibilityLabel={`Remove one ${product.name}`}
                    >
                      <Icon
                        name="minus"
                        size={14}
                        color={brand.primary}
                        strokeWidth={2.8}
                      />
                    </PressScale>
                    <PressScale
                      onPress={handleQtyPress}
                      style={styles.qtyPressable}
                      accessibilityRole="button"
                      accessibilityLabel={`${totalCartQty} in cart`}
                    >
                      <Text style={[styles.qty, { color: brand.primary }]}>{totalCartQty}</Text>
                    </PressScale>
                    <PressScale
                      onPress={handleIncrease}
                      disabled={isSingleOption && totalCartQty >= availableStock}
                      style={[styles.stepButton, isSingleOption && totalCartQty >= availableStock && { opacity: 0.4 }]}
                      accessibilityLabel={`Add one more ${product.name}`}
                    >
                      <Icon name="plus" size={14} color={brand.primary} strokeWidth={2.8} />
                    </PressScale>
                  </View>
                ) : (
                  <PressScale
                    onPress={quickAdd}
                    style={styles.add}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${product.name}`}
                  >
                    <Icon name="plus" size={18} color={brand.primary} strokeWidth={2.8} />
                  </PressScale>
                )}
              </View>
            )}
          </View>

          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={2}>{name}</Text>
            <View style={styles.metaRow}>
              {rating && rating.count > 0 && rating.average !== null ? (
                <View style={styles.rating}>
                  <Icon name="star" size={11} color={accents.amber.fg} fill={accents.amber.fg} />
                  <Text style={styles.ratingText}>{rating.average.toFixed(1)}</Text>
                </View>
              ) : null}
              <Text style={styles.meta} numberOfLines={1}>
                {isMultiOption
                  ? t('{n} options', { n: product.variants.length })
                  : singleVariant
                    ? singleVariant.label
                    : ' '}
              </Text>
            </View>
            <Text style={styles.price} numberOfLines={1}>
              {isMultiOption ? <Text style={styles.from}>{t('From')} </Text> : null}
              {price(fromPrice)}
            </Text>
          </View>
        </PressScale>
      </FadeIn>

      {/* Options Selection Modal for products with multiple variants */}
      {isMultiOption && (
        <ProductOptionsModal
          visible={optionsModalVisible}
          onClose={() => setOptionsModalVisible(false)}
          product={product}
          lines={productLines}
          onAdd={onAdd}
          onSetQuantity={onSetQuantity}
        />
      )}
    </>
  );
}

// memo: the card is redrawn only when its own product, size or cart line changes.
export const ProductCard = memo(ProductCardView);

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 8, ...shadow },
  imageWrap: { aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  heart: { position: 'absolute', top: 6, left: 6, zIndex: 2 },
  topRightAction: { position: 'absolute', top: 0, right: 0, zIndex: 2 },
  badge: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 11, fontWeight: '700' },
  body: { paddingHorizontal: 4, paddingTop: 10, paddingBottom: 6, gap: 2 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text, minHeight: 36, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: accents.amber.bg, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  ratingText: { fontSize: 11, fontWeight: '800', color: '#92400e' },
  meta: { fontSize: 11, color: colors.textMuted, flexShrink: 1 },
  from: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  price: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2, marginBottom: 2 },
  add: {
    width: 36,
    height: 36,
    borderTopRightRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    borderTopLeftRadius: 0,
    borderBottomRightRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: -1, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3
  },
  stepper: {
    height: 36,
    borderTopRightRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    borderTopLeftRadius: 0,
    borderBottomRightRadius: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 2,
    shadowColor: '#000',
    shadowOffset: { width: -1, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3
  },
  stepButton: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  qtyPressable: { height: 36, justifyContent: 'center', alignItems: 'center', minWidth: 20 },
  qty: { fontSize: 13, fontWeight: '800', paddingHorizontal: 2 }
});
