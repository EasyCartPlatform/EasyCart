import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Text, TextInput } from '@/components/text';
import { Icon } from '@/components/icon';
import { Button, EmptyState, Loading, Pills, Screen } from '@/components/ui';
import { useShop } from '@/features/shop/shop-context';
import { useCategories, useProducts, useStore } from '@/features/shop/shop-api';
import { ProductCard, productStock, useCardActions } from '@/features/shop/product-card';
import { FloatingCartBar } from '@/components/floating-cart-bar';
import { useT } from '@/lib/i18n';
import { colors, radius, space } from '@/theme/theme';

type SortFilter = 'all' | 'in_stock' | 'rating' | 'low' | 'high';

export default function FavouritesScreen() {
  const { slug, favourites } = useShop();
  const t = useT();
  const cardActions = useCardActions();
  const { width } = useWindowDimensions();

  const store = useStore(slug);
  const categories = useCategories(slug);
  const products = useProducts(slug, '', '');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SortFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Filter only items that are in the user's favourites list
  const favouriteProducts = useMemo(() => {
    const catalog = products.data ?? [];
    return catalog.filter((product) => favourites.includes(product.id));
  }, [products.data, favourites]);

  // Find categories that contain at least one favourite item
  const relevantCategories = useMemo(() => {
    const catList = categories.data ?? [];
    return catList.filter((cat) => favouriteProducts.some((p) => p.category_id === cat.id));
  }, [categories.data, favouriteProducts]);

  // Apply search, category filter, and sort/stock filters
  const displayedProducts = useMemo(() => {
    let list = [...favouriteProducts];

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category_id === selectedCategory);
    }

    // Stock & Sort filter
    if (filter === 'in_stock') {
      list = list.filter((p) => productStock(p) > 0);
    } else if (filter === 'rating') {
      list.sort((a, b) => (cardActions.ratingFor(b.id)?.average ?? -1) - (cardActions.ratingFor(a.id)?.average ?? -1));
    } else if (filter === 'low') {
      list.sort((a, b) => a.price - b.price);
    } else if (filter === 'high') {
      list.sort((a, b) => b.price - a.price);
    }

    return list;
  }, [favouriteProducts, search, selectedCategory, filter, cardActions]);

  const contentWidth = Math.min(width, 720) - space.lg * 2;
  const columns = contentWidth >= 640 ? 4 : contentWidth >= 460 ? 3 : 2;
  const cardWidth = (contentWidth - space.md * (columns - 1)) / columns;

  if (store.isLoading || products.isLoading) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen
        onRefresh={() => {
          void products.refetch();
          void categories.refetch();
        }}
        refreshing={products.isRefetching}
      >
        <View style={styles.container}>
          {favouriteProducts.length > 0 ? (
            <>
              {/* Search bar */}
              <View style={styles.search}>
                <Icon name="search" size={16} color={colors.textFaint} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('Search favourites')}
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

              {/* Category Filter Chips (if favourites span multiple categories) */}
              {relevantCategories.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryFilterRow}>
                  <Pressable
                    onPress={() => setSelectedCategory('all')}
                    style={[
                      styles.categoryChip,
                      selectedCategory === 'all' && styles.categoryChipActive
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        selectedCategory === 'all' && styles.categoryChipTextActive
                      ]}
                    >
                      {t('All')} ({favouriteProducts.length})
                    </Text>
                  </Pressable>

                  {relevantCategories.map((cat) => {
                    const count = favouriteProducts.filter((p) => p.category_id === cat.id).length;
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => setSelectedCategory(isSelected ? 'all' : cat.id)}
                        style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                      >
                        <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextActive]}>
                          {cat.name} ({count})
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {/* Sort & Stock Filter Pills */}
              <Pills<SortFilter>
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: t('All') },
                  { value: 'in_stock', label: t('In stock') },
                  { value: 'rating', label: t('Top rated') },
                  { value: 'low', label: t('Price: low to high') },
                  { value: 'high', label: t('Price: high to low') }
                ]}
              />

              {/* Products Grid or Filter Empty State */}
              {displayedProducts.length === 0 ? (
                <EmptyState
                  icon="search"
                  message={t('No favourites match your filters')}
                  action={
                    <Button
                      label={t('Reset filters')}
                      variant="outline"
                      onPress={() => {
                        setSearch('');
                        setSelectedCategory('all');
                        setFilter('all');
                      }}
                    />
                  }
                />
              ) : (
                <View style={styles.grid}>
                  {displayedProducts.map((product, index) => (
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
            </>
          ) : (
            <EmptyState
              icon="heart"
              message={t('No favourites yet')}
              action={
                <Button
                  label={t('Explore products')}
                  variant="primary"
                  onPress={() => router.navigate('/shop')}
                />
              }
            />
          )}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.md,
    paddingTop: space.xs
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: space.lg
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    height: '100%'
  },
  categoryFilterRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: 2
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderSoft
  },
  categoryChipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a'
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted
  },
  categoryChipTextActive: {
    color: '#ffffff',
    fontWeight: '700'
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    marginTop: space.xs
  }
});
