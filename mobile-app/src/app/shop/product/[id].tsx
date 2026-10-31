// One product: photos, size/colour, stock, quantity and add to cart.
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Icon } from '@/components/icon';
import { Button, EmptyState, Loading, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useShop } from '@/features/shop/shop-context';
import { useProduct } from '@/features/shop/shop-api';
import { fileUrl } from '@/lib/api';
import { price } from '@/lib/format';
import { colors, radius, space, text } from '@/theme/theme';
import { FloatingCartBar } from '@/components/floating-cart-bar';

export default function ProductScreen() {
  const { id, variant: queryVariant } = useLocalSearchParams<{ id: string; variant?: string }>();
  const { slug, add, lines, setQuantity: updateCartQuantity } = useShop();
  const toast = useToast();
  const { data: product, isLoading } = useProduct(slug, id);
  const [variantLabel, setVariantLabel] = useState<string | undefined>(queryVariant);
  const [quantity, setQuantity] = useState(1);
  const [photo, setPhoto] = useState(0);

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

  useEffect(() => {
    if (existingCartLine) {
      setQuantity(existingCartLine.quantity);
    }
  }, [existingCartLine?.quantity, variantLabel]);

  if (isLoading) return <Loading />;
  if (!product) return <Screen><EmptyState message="This product is no longer available." /></Screen>;

  const variant = product.variants.find((v) => v.label === variantLabel);
  const needsVariant = product.variants.length > 0 && !variant;
  const unitPrice = variant?.price ?? product.price;
  const stock = variant ? variant.stock : product.variants.length > 0 ? 0 : product.stock_quantity;
  const images = product.images.map((img) => fileUrl(img)).filter(Boolean) as string[];

  const stockLook = stock <= 0
    ? { label: 'Out of stock', fg: colors.danger, bg: colors.dangerSoft, border: '#fecdd3', dot: colors.danger }
    : stock <= product.low_stock_threshold
      ? { label: `Only ${stock} left`, fg: colors.warning, bg: colors.warningSoft, border: '#fde68a', dot: '#f59e0b' }
      : { label: 'In Stock', fg: colors.success, bg: colors.successSoft, border: '#a7f3d0', dot: '#10b981' };

  function handleCartAction() {
    if (!product) return;
    if (existingCartLine) {
      updateCartQuantity(product.id, variant?.label, quantity);
      toast(`${product.name}${variant?.label ? ` (${variant.label})` : ''} cart updated`, 'success');
    } else {
      add({ product_id: product.id, variant_label: variant?.label, name: product.name, price: unitPrice, quantity, image: images[0] ?? null, max: stock });
      toast(`${product.name}${variant?.label ? ` (${variant.label})` : ''} added to cart`, 'success');
    }
  }

  return (
    <Screen footer={<Button variant="dark" icon="shopping-bag" label={needsVariant ? 'Choose an option' : stock <= 0 ? 'Out of stock' : existingCartLine ? `Update cart · ${price(unitPrice * quantity)}` : `Add to cart · ${price(unitPrice * quantity)}`} onPress={handleCartAction} disabled={needsVariant || stock <= 0} />}>
      <Stack.Screen options={{ title: product.name }} />
      <View style={styles.photo}>
        {images[photo] ? <Image source={{ uri: images[photo] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Icon name="image" size={40} color={colors.textFaint} />}
      </View>
      {images.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {images.map((uri, index) => (
            <Pressable key={uri} onPress={() => setPhoto(index)} style={[styles.thumb, index === photo && { borderColor: colors.primary }]}><Image source={{ uri }} style={{ width: '100%', height: '100%' }} /></Pressable>
          ))}
        </ScrollView>
      )}

      <View style={{ gap: 8 }}>
        {!needsVariant && (
          <View style={[styles.stock, { backgroundColor: stockLook.bg, borderColor: stockLook.border }]}>
            <View style={[styles.stockDot, { backgroundColor: stockLook.dot }]} />
            <Text style={[styles.stockText, { color: stockLook.fg }]}>{stockLook.label}</Text>
          </View>
        )}
        <Text style={text.title}>{product.name}</Text>
        <Text style={styles.price}>{price(unitPrice)}</Text>
        {product.description ? <Text style={[text.muted, { lineHeight: 20 }]}>{product.description}</Text> : null}
      </View>
      <View style={styles.divider} />

      {product.variants.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Text style={text.heading}>Choose an option</Text>
          <View style={styles.variants}>
            {product.variants.map((v) => {
              const active = v.label === variantLabel;
              return (
                <Pressable key={v.label} disabled={v.stock <= 0} onPress={() => { setVariantLabel(v.label); setQuantity(1); }} style={[styles.variant, active && styles.variantActive, v.stock <= 0 && { opacity: 0.4 }]}>
                  <Text style={[styles.variantText, active && { color: colors.primaryDark }]}>{v.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {!needsVariant && stock > 0 && (
        <View style={styles.stepperRow}>
          <Text style={text.heading}>Quantity</Text>
          <View style={styles.stepper}>
            <Pressable onPress={() => setQuantity((q) => Math.max(1, q - 1))} style={styles.stepButton} accessibilityLabel="Less"><Icon name="minus" size={16} color={colors.text} /></Pressable>
            <Text style={styles.qty}>{quantity}</Text>
            <Pressable onPress={() => setQuantity((q) => Math.min(stock, q + 1))} style={styles.stepButton} accessibilityLabel="More"><Icon name="plus" size={16} color={colors.text} /></Pressable>
          </View>
        </View>
      )}

      <View style={styles.trust}>
        <View style={styles.trustRow}><Icon name="truck" size={16} color={colors.primary} /><Text style={styles.trustText}>Delivery or in-store pickup at checkout</Text></View>
        <View style={styles.trustRow}><Icon name="shield-check" size={16} color={colors.primary} /><Text style={styles.trustText}>Secure checkout, code-verified handover</Text></View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { aspectRatio: 1, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: '#e8edf3', alignItems: 'center', justifyContent: 'center' },
  stock: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockText: { fontSize: 12, fontWeight: '700' },
  price: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  divider: { height: 1, backgroundColor: colors.border },
  trust: { gap: 10, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryTint },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trustText: { fontSize: 13, color: colors.textSoft, flex: 1 },
  thumb: { width: 60, height: 60, borderRadius: radius.md, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  variants: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  variant: { minWidth: 64, height: 42, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  variantActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  variantText: { fontSize: 14, fontWeight: '600', color: colors.text },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.white },
  stepButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 24, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.text }
});
