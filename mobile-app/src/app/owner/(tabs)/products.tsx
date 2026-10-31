// Store products with stock, search, filters and quick stock changes.
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/motion';
import { Badge, Button, EmptyState, Loading, Pills, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { ownerCalls, useOwnerAction, useOwnerProducts } from '@/features/owner/owner-api';
import { errorMessage, fileUrl } from '@/lib/api';
import { price } from '@/lib/format';
import { colors, radius, space, text } from '@/theme/theme';

type Filter = 'all' | 'low' | 'out' | 'hidden';

export default function OwnerProducts() {
  const { data, isLoading, refetch, isRefetching } = useOwnerProducts();
  const adjust = useOwnerAction(ownerCalls.adjustStock);
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  if (isLoading) return <Loading />;

  const products = data ?? [];
  const isOut = (stock: number) => stock <= 0;
  const isLow = (stock: number, threshold: number) => stock > 0 && stock <= threshold;
  const counts = {
    all: products.length,
    low: products.filter((p) => isLow(p.stock_quantity, p.low_stock_threshold)).length,
    out: products.filter((p) => isOut(p.stock_quantity)).length,
    hidden: products.filter((p) => !p.is_active).length
  };

  const shown = products.filter((product) => {
    if (search.trim() && !product.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (filter === 'low') return isLow(product.stock_quantity, product.low_stock_threshold);
    if (filter === 'out') return isOut(product.stock_quantity);
    if (filter === 'hidden') return !product.is_active;
    return true;
  });

  const change = (id: string, delta: number) => adjust.mutate({ id, delta }, { onError: (e) => toast(errorMessage(e), 'error') });

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Button icon="plus" label="Add product" onPress={() => router.push('/owner/product/new')} />

      {/* Search Input with 1-tap Clear */}
      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color="#94a3b8" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search your products"
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <Icon name="x" size={18} color="#94a3b8" />
          </Pressable>
        )}
      </View>

      <Pills<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: counts.all },
          { value: 'low', label: 'Low stock', count: counts.low },
          { value: 'out', label: 'Out of stock', count: counts.out },
          { value: 'hidden', label: 'Hidden', count: counts.hidden }
        ]}
      />

      {shown.length === 0 ? (
        <EmptyState icon="box" message={products.length === 0 ? 'No products yet.' : 'No products match.'} />
      ) : (
        shown.map((product) => {
          const image = fileUrl(product.images[0]);
          const stock = product.stock_quantity;
          const tone = isOut(stock) ? 'danger' : isLow(stock, product.low_stock_threshold) ? 'warning' : 'success';
          const note = isOut(stock) ? 'Out of stock' : isLow(stock, product.low_stock_threshold) ? 'Low stock' : 'In stock';

          return (
            <View key={product.id} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/owner/product/${product.id}`)}
                style={styles.open}
              >
                {/* Photo or Clean Fallback */}
                <View style={styles.thumb}>
                  {image ? (
                    <Image source={{ uri: image }} style={styles.thumbImage} contentFit="cover" />
                  ) : (
                    <View style={styles.thumbFallback}>
                      <Icon name="package" size={22} color="#94a3b8" />
                    </View>
                  )}
                </View>

                {/* Details */}
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                    <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                    <Icon name="edit-3" size={13} color="#94a3b8" style={{ marginTop: 3 }} />
                  </View>

                  <View style={styles.metaRow}>
                    <Text style={styles.priceText}>{price(product.price)}</Text>
                    {product.variants.length > 0 && (
                      <View style={styles.variantPill}>
                        <Text style={styles.variantPillText}>
                          {product.variants.length} {product.variants.length === 1 ? 'option' : 'options'}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                    <Badge tone={tone} label={note} />
                    {!product.is_active && <Badge tone="neutral" label="Hidden" />}
                  </View>
                </View>
              </Pressable>

              {/* Stock Stepper */}
              <View style={styles.stockBox}>
                <Text style={styles.stockLabel}>Stock</Text>
                <View style={[styles.stepper, stock <= 0 && styles.stepperOut]}>
                  <PressScale
                    onPress={() => change(product.id, -1)}
                    disabled={stock <= 0}
                    style={[styles.stepButton, stock <= 0 && { opacity: 0.3 }]}
                    accessibilityLabel={`Reduce stock of ${product.name}`}
                  >
                    <Icon name="minus" size={15} color={stock <= 0 ? '#ef4444' : colors.primaryDark} />
                  </PressScale>
                  <Text style={[styles.stockQty, stock <= 0 && { color: '#ef4444' }]}>{stock}</Text>
                  <PressScale
                    onPress={() => change(product.id, 1)}
                    style={styles.stepButton}
                    accessibilityLabel={`Increase stock of ${product.name}`}
                  >
                    <Icon name="plus" size={15} color={colors.primaryDark} />
                  </PressScale>
                </View>
              </View>
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: space.md,
    height: 48,
    gap: space.sm
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0
  },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  thumb: { width: 56, height: 56, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  thumbImage: { width: '100%', height: '100%' },
  thumbFallback: { width: '100%', height: '100%', backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  productName: { fontSize: 14.5, fontWeight: '700', color: colors.text, lineHeight: 19, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceText: { fontSize: 13.5, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  variantPill: { backgroundColor: '#f1f5f9', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  variantPillText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  stockBox: { alignItems: 'center', gap: 4 },
  stockLabel: { fontSize: 10, fontWeight: '700', color: colors.textFaint, letterSpacing: 0.6, textTransform: 'uppercase' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryTint },
  stepperOut: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  stepButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  stockQty: { minWidth: 30, textAlign: 'center', fontSize: 14, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }
});
