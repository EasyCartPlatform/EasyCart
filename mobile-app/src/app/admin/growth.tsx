// Growth: how many stores and people joined recently.
import { Text } from '@/components/text';
import { Card, EmptyState, InfoRow, Loading, Screen, StatCard } from '@/components/ui';
import { useTenants, useUsers } from '@/features/admin/admin-api';
import { StyleSheet, View } from 'react-native';
import { date } from '@/lib/format';
import { space, text } from '@/theme/theme';

const DAY_MS = 24 * 60 * 60 * 1000;

function joinedWithin(items: { created_at: string }[], days: number) {
  const since = Date.now() - days * DAY_MS;
  return items.filter((item) => new Date(item.created_at).getTime() >= since).length;
}

export default function AdminGrowth() {
  const tenants = useTenants();
  const users = useUsers();
  if (tenants.isLoading || users.isLoading) return <Loading />;

  const stores = tenants.data ?? [];
  const people = users.data ?? [];
  const newest = [...stores].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);

  return (
    <Screen onRefresh={() => { void tenants.refetch(); void users.refetch(); }} refreshing={tenants.isRefetching}>
      <View style={styles.grid}>
        <StatCard label="New stores (7 days)" value={String(joinedWithin(stores, 7))} icon="store" fg="#d97706" bg="#fef3c7" hint={`${joinedWithin(stores, 30)} in 30 days`} />
        <StatCard label="New people (7 days)" value={String(joinedWithin(people, 7))} icon="users" fg="#7c3aed" bg="#ede9fe" hint={`${joinedWithin(people, 30)} in 30 days`} />
        <StatCard label="All stores" value={String(stores.length)} icon="shopping-bag" fg="#0284c7" bg="#e0f2fe" />
        <StatCard label="All people" value={String(people.length)} icon="users" fg="#059669" bg="#d1fae5" />
      </View>

      <Card title="Newest stores" icon="store">
        {newest.length === 0 ? <EmptyState icon="store" message="No stores yet." /> : newest.map((store) => <InfoRow key={store.id} label={store.name} value={date(store.created_at)} />)}
      </Card>
      <Text style={[text.small, { textAlign: 'center', padding: space.sm }]}>Charts are on the website; these are the same numbers in short form.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md }
});
