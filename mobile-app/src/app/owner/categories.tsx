// Product categories: add one, remove one.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, EmptyState, Field, Loading, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { manageCalls, useOwnCategories, useRefreshingAction } from '@/features/owner/owner-api';
import { errorMessage } from '@/lib/api';
import { colors, radius, space } from '@/theme/theme';

export default function OwnerCategories() {
  const { data, isLoading, refetch, isRefetching } = useOwnCategories();
  const create = useRefreshingAction(manageCalls.createCategory, ['categories']);
  const remove = useRefreshingAction(manageCalls.deleteCategory, ['categories']);
  const toast = useToast();
  const [name, setName] = useState('');
  // The id waiting for "tap again to confirm"; a delete is never one accidental tap.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (isLoading) return <Loading />;

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(trimmed, { onSuccess: () => { setName(''); toast('Category added', 'success'); }, onError: (e) => toast(errorMessage(e), 'error') });
  }

  function askOrDelete(id: string) {
    if (confirmId !== id) { setConfirmId(id); return; }
    remove.mutate(id, { onSuccess: () => { setConfirmId(null); toast('Category removed', 'success'); }, onError: (e) => toast(errorMessage(e), 'error') });
  }

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Card title="New category" icon="tags">
        <Field value={name} onChangeText={setName} placeholder="e.g. Snacks" onSubmitEditing={add} returnKeyType="done" />
        <Button icon="plus" label="Add category" onPress={add} loading={create.isPending} disabled={!name.trim()} />
      </Card>

      {(data?.length ?? 0) === 0 ? <EmptyState icon="tags" message="No categories yet." /> : data!.map((category) => (
        <View key={category.id} style={styles.row}>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }} numberOfLines={1}>{category.name}</Text>
          <Button small variant={confirmId === category.id ? 'danger' : 'outline'} icon="trash-2" label={confirmId === category.id ? 'Tap again to remove' : 'Remove'} onPress={() => askOrDelete(category.id)} loading={remove.isPending && confirmId === category.id} />
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: '#e8edf3', padding: space.md, paddingLeft: space.lg }
});
