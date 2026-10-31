// Sales: the platform's orders and revenue day by day, for as many days as you ask (up to 30).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Card, EmptyState, Field, InfoRow, Loading, Screen, StatCard } from '@/components/ui';
import { useStats } from '@/features/admin/admin-api';
import { price } from '@/lib/format';
import { colors, radius, space, text } from '@/theme/theme';

const MAX_DAYS = 30;
const DEFAULT_DAYS = 7;

export default function AdminSales() {
  const { data, isLoading, refetch, isRefetching } = useStats();
  const [typedDays, setTypedDays] = useState(String(DEFAULT_DAYS));
  if (isLoading || !data) return <Loading />;

  const typed = Number(typedDays);
  const days = typed >= 1 ? Math.min(Math.floor(typed), MAX_DAYS) : DEFAULT_DAYS;
  const rows = (data.daily_revenue ?? []).slice(-days).reverse();
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const orders = rows.reduce((sum, row) => sum + row.orders, 0);
  const best = rows.reduce((top, row) => (row.revenue > top.revenue ? row : top), { date: '', revenue: 0, orders: 0 });

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <View style={styles.range}>
        <Text style={text.muted}>Show last</Text>
        <View style={{ width: 80 }}><Field value={typedDays} onChangeText={setTypedDays} keyboardType="number-pad" maxLength={2} /></View>
        <Text style={text.muted}>days (max {MAX_DAYS})</Text>
      </View>

      <View style={styles.grid}>
        <StatCard label="Sales" value={price(revenue).replace('.00', '')} icon="dollar-sign" fg="#059669" bg="#d1fae5" hint={`Last ${days} days`} />
        <StatCard label="Orders" value={String(orders)} icon="shopping-bag" fg="#0284c7" bg="#e0f2fe" />
        <StatCard label="Average order" value={orders ? price(revenue / orders).replace('.00', '') : '—'} icon="clipboard" fg="#7c3aed" bg="#ede9fe" />
        <StatCard label="Best day" value={best.revenue > 0 ? price(best.revenue).replace('.00', '') : '—'} icon="award" fg="#d97706" bg="#fef3c7" hint={best.revenue > 0 ? best.date : undefined} />
      </View>

      <Card title={`Daily breakdown, last ${days} days`} icon="list">
        {rows.length === 0 ? <EmptyState icon="list" message="No sales data yet." /> : rows.map((row) => (
          <InfoRow key={row.date} label={`${row.date} · ${row.orders} ${row.orders === 1 ? 'order' : 'orders'}`} value={price(row.revenue)} strong={row.revenue > 0} />
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  range: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: '#e8edf3', padding: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md }
});
