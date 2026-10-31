// Add or edit one product: photo, name, price, description, stock, category and whether shoppers can see it.
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { Button, Card, Field, Loading, Notice, Pills, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { productCalls, useOwnCategories, useOwnerProducts, useRefreshingAction, type ProductForm } from '@/features/owner/owner-api';
import { takePhoto } from '@/lib/device';
import { errorMessage, fileUrl } from '@/lib/api';
import { colors, radius, space, text } from '@/theme/theme';

export default function OwnerProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const products = useOwnerProducts();
  const categories = useOwnCategories();
  const toast = useToast();
  const create = useRefreshingAction(productCalls.create, ['products']);
  const update = useRefreshingAction(productCalls.update, ['products']);
  const remove = useRefreshingAction(productCalls.remove, ['products']);
  const existing = isNew ? undefined : products.data?.find((product) => product.id === id);

  const [form, setForm] = useState({ name: '', description: '', price: '', sku: '', stock: '0', threshold: '5', categoryId: '', active: true, image: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setForm({
      name: existing.name,
      description: existing.description ?? '',
      price: String(existing.price),
      sku: '',
      stock: String(existing.stock_quantity),
      threshold: String(existing.low_stock_threshold),
      categoryId: existing.category_id ?? '',
      active: existing.is_active,
      image: existing.images[0] ?? ''
    });
  }, [existing]);

  if (!isNew && products.isLoading) return <Loading />;
  if (!isNew && !existing) return <Screen><Notice tone="warning" icon="alert-circle">This product could not be found. It may have been removed.</Notice></Screen>;

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function pickImage(source: 'camera' | 'library') {
    try {
      const photo = await takePhoto(source);
      if (!photo) return;
      setIsUploading(true);
      const { url } = await productCalls.uploadImage(photo);
      setForm((current) => ({ ...current, image: url }));
    } catch (error) {
      toast(errorMessage(error, 'Could not add the photo'), 'error');
    } finally {
      setIsUploading(false);
    }
  }

  function buildPayload(): ProductForm | null {
    const price = Number(form.price);
    const stock = Number(form.stock);
    const threshold = Number(form.threshold);
    if (form.name.trim().length < 2) { toast('Give the product a name', 'error'); return null; }
    if (Number.isNaN(price) || price <= 0) { toast('Enter a price above 0', 'error'); return null; }
    if (!Number.isInteger(stock) || stock < 0) { toast('Stock must be a whole number, 0 or more', 'error'); return null; }
    if (!Number.isInteger(threshold) || threshold < 0) { toast('Low-stock alert must be a whole number, 0 or more', 'error'); return null; }
    return {
      name: form.name.trim(),
      description: form.description.trim(),
      price,
      ...(isNew && form.sku.trim() ? { sku: form.sku.trim() } : {}),
      images: form.image ? [form.image] : [],
      ...(form.categoryId ? { category_id: form.categoryId } : {}),
      stock_quantity: stock,
      low_stock_threshold: threshold,
      is_active: form.active
    };
  }

  function save() {
    const payload = buildPayload();
    if (!payload) return;
    const done = { onSuccess: () => { toast(isNew ? 'Product added' : 'Product saved', 'success'); router.back(); }, onError: (e: unknown) => toast(errorMessage(e), 'error') };
    if (isNew) create.mutate(payload, done);
    else update.mutate({ id: id!, payload }, done);
  }

  function askOrDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    remove.mutate(id!, { onSuccess: () => { toast('Product removed', 'success'); router.back(); }, onError: (e) => toast(errorMessage(e), 'error') });
  }

  const image = fileUrl(form.image);
  const busy = create.isPending || update.isPending;

  return (
    <Screen footer={<Button icon="save" label={isNew ? 'Add product' : 'Save changes'} onPress={save} loading={busy} />}>
      <Stack.Screen options={{ title: isNew ? 'New product' : 'Edit product' }} />

      <Card title="Photo" icon="image">
        <View style={styles.photo}>
          {image ? <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <View style={{ alignItems: 'center', gap: 6 }}><Icon name="image" size={30} color={colors.textFaint} /><Text style={text.small}>No photo yet</Text></View>}
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}><Button variant="outline" icon="image" label={image ? 'Change photo' : 'Choose photo'} loading={isUploading} onPress={() => void pickImage('library')} /></View>
          <View style={{ flex: 1 }}><Button variant="outline" icon="camera" label="Take photo" disabled={isUploading} onPress={() => void pickImage('camera')} /></View>
        </View>
        {image ? <Button small variant="ghost" icon="trash-2" label="Remove photo" onPress={() => setForm((current) => ({ ...current, image: '' }))} /> : null}
      </Card>

      <Card title="Details" icon="package">
        <Field label="Product name" value={form.name} onChangeText={set('name')} placeholder="e.g. Dove Beauty Moisture Bar" />
        <Field label="Price (Rs.)" value={form.price} onChangeText={set('price')} keyboardType="decimal-pad" placeholder="0.00" />
        <Field label="Description (optional)" value={form.description} onChangeText={set('description')} multiline placeholder="What makes it special?" />
        {isNew && <Field label="SKU (optional)" hint="Your own product code" value={form.sku} onChangeText={set('sku')} autoCapitalize="characters" placeholder="e.g. SOAP-100" />}
      </Card>

      <Card title="Stock" icon="box">
        <Field label="In stock" value={form.stock} onChangeText={set('stock')} keyboardType="number-pad" placeholder="0" />
        <Field label="Low-stock alert at" hint="You are warned when stock falls to this number" value={form.threshold} onChangeText={set('threshold')} keyboardType="number-pad" placeholder="5" />
      </Card>

      {(categories.data?.length ?? 0) > 0 && (
        <Card title="Category" icon="tags">
          <Pills options={[{ value: '', label: 'None' }, ...categories.data!.map((category) => ({ value: category.id, label: category.name }))]} value={form.categoryId} onChange={set('categoryId')} />
        </Card>
      )}

      <Card title="Visibility" icon="eye">
        <Pills<'on' | 'off'> options={[{ value: 'on', label: 'Visible to shoppers' }, { value: 'off', label: 'Hidden' }]} value={form.active ? 'on' : 'off'} onChange={(value) => setForm((current) => ({ ...current, active: value === 'on' }))} />
      </Card>

      {!isNew && <Button variant={confirmDelete ? 'danger' : 'outline'} icon="trash-2" label={confirmDelete ? 'Tap again to remove this product' : 'Remove product'} onPress={askOrDelete} loading={remove.isPending} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { height: 200, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' }
});
