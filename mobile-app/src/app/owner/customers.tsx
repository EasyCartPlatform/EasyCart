// The store's customers: who has ordered, how many times, and how much they have spent.
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Avatar, EmptyState, Loading, Screen } from '@/components/ui';
import { useCustomers } from '@/features/owner/owner-api';
import { date, price } from '@/lib/format';
import { colors, radius, shadow, space, text } from '@/theme/theme';

export default function OwnerCustomers() {
  const { data, isLoading, refetch, isRefetching } = useCustomers();
  if (isLoading) return <Loading />;
  const list = [...(data ?? [])].sort((a, b) => b.lifetime_total - a.lifetime_total);

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Text style={text.muted}>{list.length} {list.length === 1 ? 'customer' : 'customers'}, biggest spenders first</Text>
      {list.length === 0 ? <EmptyState icon="users" message="Customers appear here after their first order." /> : list.map((customer) => (
        <View key={customer.customer_id} style={styles.row}>
          <Avatar name={customer.username ?? customer.email ?? '?'} size={46} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={text.heading} numberOfLines={1}>{customer.username ?? customer.customer_id.slice(0, 8)}</Text>
            <Text style={text.small} numberOfLines={1}>{customer.email ?? '—'}</Text>
            <Text style={text.small}>{customer.order_count} {customer.order_count === 1 ? 'order' : 'orders'} · last {date(customer.last_order_at)}</Text>
          </View>
          <Text style={styles.total}>{price(customer.lifetime_total).replace('.00', '')}</Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: '#e8edf3', padding: space.lg, ...shadow },
  total: { fontSize: 15, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }
});
