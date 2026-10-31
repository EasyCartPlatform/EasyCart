// Everyone on the platform, filtered by who they are (the website's Users page).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Avatar, Badge, Button, EmptyState, Field, Loading, Pills, Screen } from '@/components/ui';
import { useUsers, type PlatformUser } from '@/features/admin/admin-api';
import { date } from '@/lib/format';
import { colors, radius, shadow, space, text } from '@/theme/theme';

type Role = PlatformUser['role'];
type Filter = 'all' | Role;
const LABELS: Record<Filter, string> = { all: 'All', tenant_owner: 'Store owners', customer: 'Customers', delivery_partner: 'Delivery partners', platform_admin: 'Admins' };
const TONES: Record<Role, 'primary' | 'success' | 'warning' | 'neutral'> = { tenant_owner: 'primary', customer: 'neutral', delivery_partner: 'warning', platform_admin: 'success' };
const PAGE = 40;

export default function AdminUsers() {
  const { data, isLoading, refetch, isRefetching } = useUsers();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  if (isLoading) return <Loading />;

  const everyone = data ?? [];
  const term = search.trim().toLowerCase();
  const matching = everyone
    .filter((user) => filter === 'all' || user.role === filter)
    .filter((user) => !term || user.username.toLowerCase().includes(term) || user.email.toLowerCase().includes(term))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Field icon="search" value={search} onChangeText={(value) => { setSearch(value); setShown(PAGE); }} placeholder="Search name or email" autoCapitalize="none" />
      <Pills<Filter> options={(Object.keys(LABELS) as Filter[]).map((value) => ({ value, label: LABELS[value], count: value === 'all' ? everyone.length : everyone.filter((user) => user.role === value).length }))} value={filter} onChange={(value) => { setFilter(value); setShown(PAGE); }} />

      {matching.length === 0 ? <EmptyState icon="users" message="Nobody matches." /> : matching.slice(0, shown).map((user) => (
        <View key={user.id} style={styles.row}>
          <Avatar name={user.username} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={text.heading} numberOfLines={1}>{user.username}</Text>
            <Text style={text.small} numberOfLines={1}>{user.email}</Text>
            <Text style={text.small} numberOfLines={1}>{user.store ? `${user.store.name} · ` : ''}joined {date(user.created_at)}</Text>
          </View>
          <Badge tone={TONES[user.role]} label={LABELS[user.role]} />
        </View>
      ))}
      {matching.length > shown && <Button variant="outline" label={`Show more (${matching.length - shown} left)`} onPress={() => setShown((count) => count + PAGE)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: '#e8edf3', padding: space.md, ...shadow }
});
