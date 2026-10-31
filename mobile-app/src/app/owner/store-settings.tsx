// Store settings: publish switch, name, delivery fee and radius, pincode, address and the shop announcement.
import { useEffect, useState } from 'react';
import { Text } from '@/components/text';
import { Badge, Button, Card, Field, InfoRow, Loading, Notice, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { manageCalls, useOwnStore, useRefreshingAction } from '@/features/owner/owner-api';
import { errorMessage } from '@/lib/api';
import { text } from '@/theme/theme';

export default function OwnerStoreSettings() {
  const { data: store, isLoading, refetch, isRefetching } = useOwnStore();
  const save = useRefreshingAction(manageCalls.saveStore, ['store']);
  const publish = useRefreshingAction(manageCalls.setPublished, ['store']);
  const toast = useToast();
  const [form, setForm] = useState({ name: '', delivery_fee: '', radius: '', pincode: '', address: '', banner: '' });

  useEffect(() => {
    if (!store) return;
    setForm({
      name: store.name,
      delivery_fee: String(store.delivery_fee ?? 0),
      radius: String(store.max_delivery_radius_km ?? 5),
      pincode: store.pincode ?? '',
      address: store.address ?? '',
      banner: store.promotion_banner_text ?? ''
    });
  }, [store]);

  if (isLoading || !store) return <Loading />;
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  function handleSave() {
    const fee = Number(form.delivery_fee);
    const radius = Number(form.radius);
    if (form.name.trim().length < 2) { toast('The store name needs at least 2 letters', 'error'); return; }
    if (Number.isNaN(fee) || fee < 0) { toast('Delivery fee must be 0 or more', 'error'); return; }
    if (Number.isNaN(radius) || radius < 0.5 || radius > 100) { toast('Delivery radius must be between 0.5 and 100 km', 'error'); return; }
    save.mutate(
      { name: form.name.trim(), delivery_fee: fee, max_delivery_radius_km: radius, pincode: form.pincode.trim(), address: form.address.trim(), promotion_banner_text: form.banner.trim() },
      { onSuccess: () => toast('Store settings saved', 'success'), onError: (e) => toast(errorMessage(e), 'error') }
    );
  }

  function handlePublish() {
    publish.mutate(!store!.is_published, {
      onSuccess: () => toast(store!.is_published ? 'Store hidden from customers' : 'Your store is live', 'success'),
      onError: (e) => toast(errorMessage(e), 'error')
    });
  }

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Card title="Visibility" icon="eye" right={<Badge tone={store.is_published ? 'success' : 'warning'} label={store.is_published ? 'Live' : 'Not published'} />}>
        <Text style={text.muted}>{store.is_published ? 'Customers can open your store at /' + store.slug + '.' : 'Customers cannot see your store yet.'}</Text>
        <Button icon={store.is_published ? 'eye-off' : 'check'} variant={store.is_published ? 'outline' : 'primary'} label={store.is_published ? 'Hide store' : 'Publish store'} onPress={handlePublish} loading={publish.isPending} />
      </Card>

      <Card title="Store details" icon="store">
        <Field label="Store name" value={form.name} onChangeText={set('name')} placeholder="Store name" />
        <InfoRow label="Store link" value={`/${store.slug}`} />
        <Field label="Store address" hint="Where riders come to collect orders" value={form.address} onChangeText={set('address')} placeholder="Shop no., street, landmark" />
        <Field label="Pincode" value={form.pincode} onChangeText={set('pincode')} keyboardType="number-pad" maxLength={10} placeholder="e.g. 502278" />
      </Card>

      <Card title="Delivery and announcement" icon="truck">
        <Field label="Standard delivery fee (Rs.)" value={form.delivery_fee} onChangeText={set('delivery_fee')} keyboardType="decimal-pad" placeholder="0" />
        <Field label="Max delivery radius (km)" value={form.radius} onChangeText={set('radius')} keyboardType="decimal-pad" placeholder="5" />
        <Field label="Storefront announcement" hint="Shown to shoppers at the top of your shop" value={form.banner} onChangeText={set('banner')} multiline placeholder="e.g. Free delivery this weekend!" />
      </Card>

      <Notice icon="info">Logo, banner image and the pickup pin can be changed on the website for now.</Notice>
      <Button icon="save" label="Save changes" onPress={handleSave} loading={save.isPending} />
    </Screen>
  );
}
