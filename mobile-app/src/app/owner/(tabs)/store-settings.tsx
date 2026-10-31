// Store settings: publish switch, name, delivery fee and radius, pincode, address and the shop announcement.
import { useEffect, useState } from 'react';
import { Text } from '@/components/text';
import { View } from 'react-native';
import { Badge, Button, Card, Field, InfoRow, Loading, Notice, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { manageCalls, useOwnStore, useRefreshingAction } from '@/features/owner/owner-api';
import { errorMessage } from '@/lib/api';
import { MapPicker } from '@/components/map-picker';
import { ThemePicker } from '@/features/owner/theme-picker';
import { describePlace, readCurrentPosition, type Coords } from '@/lib/location';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/motion';
import {
  parseStoreOffers,
  serializeStoreOffers,
  OFFER_ICON_OPTIONS,
  OFFER_PRESETS,
  type StoreOffer
} from '@/features/shop/store-offers';
import { OffersBannerCarousel } from '@/features/shop/offers-banner-carousel';
import { colors, radius, space, text } from '@/theme/theme';

export default function OwnerStoreSettings() {
  const { data: store, isLoading, refetch, isRefetching } = useOwnStore();
  const save = useRefreshingAction(manageCalls.saveStore, ['store']);
  const publish = useRefreshingAction(manageCalls.setPublished, ['store']);
  const toast = useToast();
  const [form, setForm] = useState({ name: '', delivery_fee: '', radius: '', pincode: '', address: '', banner: '' });
  const [offers, setOffers] = useState<StoreOffer[]>([]);
  // Where the shop is on the map. Customers' "Shops near you" list and rider dispatch both use it.
  const [pin, setPin] = useState<Coords | null>(null);
  const [mapStart, setMapStart] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);

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
    const parsedOffers = parseStoreOffers(store.promotion_banner_text);
    setOffers(
      parsedOffers.length > 0
        ? parsedOffers
        : [
            { id: '1', text: 'Free delivery over ₹499 this week', icon: 'truck', code: 'FREEDEL', badge: 'FREE' },
            { id: '2', text: 'Flat 20% OFF on all grocery essentials', icon: 'tags', code: 'SAVE20', badge: '20% OFF' }
          ]
    );
    if (store.latitude != null && store.longitude != null) {
      const saved = { latitude: store.latitude, longitude: store.longitude };
      setPin(saved);
      setMapStart(saved);
    }
  }, [store]);

  if (isLoading || !store) return <Loading />;
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  // Fills an empty address and pincode from the spot, so the owner types less.
  async function choosePin(coords: Coords) {
    setPin(coords);
    try {
      const place = await describePlace(coords);
      setForm((current) => ({
        ...current,
        address: current.address.trim() ? current.address : [place.street, place.city].filter(Boolean).join(', '),
        pincode: current.pincode.trim() ? current.pincode : place.zip
      }));
    } catch {
      // The pin is saved either way; the address can be typed.
    }
  }

  async function useMyLocation() {
    setLocating(true);
    try {
      const coords = await readCurrentPosition();
      setMapStart(coords);
      await choosePin(coords);
    } catch (err) {
      toast(errorMessage(err, 'We could not find your location'), 'error');
    } finally {
      setLocating(false);
    }
  }

  function handleSave() {
    const fee = Number(form.delivery_fee);
    const radius = Number(form.radius);
    if (form.name.trim().length < 2) { toast('The store name needs at least 2 letters', 'error'); return; }
    if (Number.isNaN(fee) || fee < 0) { toast('Delivery fee must be 0 or more', 'error'); return; }
    if (Number.isNaN(radius) || radius < 0.5 || radius > 100) { toast('Delivery radius must be between 0.5 and 100 km', 'error'); return; }
    const serializedOffers = serializeStoreOffers(offers);
    save.mutate(
      {
        name: form.name.trim(),
        delivery_fee: fee,
        max_delivery_radius_km: radius,
        pincode: form.pincode.trim(),
        address: form.address.trim(),
        promotion_banner_text: serializedOffers,
        ...(pin ? { latitude: pin.latitude, longitude: pin.longitude } : {})
      },
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

      <Card title="Shop location" icon="map-pin" right={<Badge tone={pin ? 'success' : 'warning'} label={pin ? 'Pinned' : 'Not pinned'} />}>
        <Text style={text.muted}>Customers near you find your shop by this pin, and riders come here to collect orders. Stand at your shop and tap the button, or drop the pin on the map.</Text>
        <Button small variant={pin ? 'outline' : 'primary'} icon="navigation" label={locating ? 'Finding you…' : 'Use my current location'} onPress={() => void useMyLocation()} loading={locating} />
        {mapStart ? (
          <View style={{ gap: space.sm }}>
            <MapPicker center={mapStart} onPick={(coords) => void choosePin(coords)} height={240} />
            <Text style={[text.small, { color: colors.textMuted }]}>Tap the map or drag the pin to the exact spot, then press Save changes.</Text>
          </View>
        ) : null}
      </Card>

      <ThemePicker current={store.color_theme} />

      <Card title="Delivery settings" icon="truck">
        <Field label="Standard delivery fee (₹)" value={form.delivery_fee} onChangeText={set('delivery_fee')} keyboardType="decimal-pad" placeholder="0" />
        <Field label="Max delivery radius (km)" value={form.radius} onChangeText={set('radius')} keyboardType="decimal-pad" placeholder="5" />
      </Card>

      <Card title="Storefront Offers & Promos" icon="gift">
        <Text style={text.muted}>
          Add offers that will auto-slide on the top of your shop. Customers can see codes and tap to use them.
        </Text>

        {/* Live Preview */}
        {offers.length > 0 && (
          <View style={{ gap: space.xs, marginVertical: 4 }}>
            <Text style={[text.small, { color: colors.textMuted, fontWeight: '700' }]}>
              LIVE PREVIEW ({offers.length} {offers.length === 1 ? 'offer' : 'offers'})
            </Text>
            <OffersBannerCarousel rawOffers={serializeStoreOffers(offers)} />
          </View>
        )}

        {/* Quick presets */}
        <View style={{ gap: space.xs }}>
          <Text style={[text.small, { color: colors.textMuted, fontWeight: '700' }]}>QUICK PRESETS</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {OFFER_PRESETS.map((preset, idx) => (
              <PressScale
                key={idx}
                onPress={() => {
                  if (offers.length >= 5) {
                    toast('Maximum 5 active offers allowed', 'error');
                    return;
                  }
                  setOffers((prev) => [
                    ...prev,
                    {
                      id: String(Date.now() + idx),
                      text: preset.text,
                      icon: preset.icon,
                      code: preset.code,
                      badge: preset.badge
                    }
                  ]);
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                  backgroundColor: '#f0f9ff',
                  borderWidth: 1,
                  borderColor: '#bae6fd'
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0284c7' }}>
                  + {preset.badge}
                </Text>
              </PressScale>
            ))}
          </View>
        </View>

        {/* List of active offers */}
        {offers.map((offer, index) => (
          <View
            key={offer.id || index}
            style={{
              padding: space.md,
              borderRadius: radius.md,
              backgroundColor: colors.bg,
              borderWidth: 1,
              borderColor: colors.borderSoft,
              gap: space.sm
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', fontSize: 13, color: colors.text }}>
                Offer #{index + 1}
              </Text>
              <PressScale
                onPress={() => setOffers((prev) => prev.filter((_, i) => i !== index))}
                hitSlop={8}
              >
                <Icon name="trash-2" size={16} color="#ef4444" />
              </PressScale>
            </View>

            <Field
              label="Offer description"
              placeholder="e.g. Free delivery over ₹499 this week"
              value={offer.text}
              onChangeText={(val) => {
                setOffers((prev) =>
                  prev.map((o, i) => (i === index ? { ...o, text: val } : o))
                );
              }}
            />

            <Field
              label="Coupon Code (optional)"
              placeholder="e.g. FREEDEL"
              value={offer.code ?? ''}
              autoCapitalize="characters"
              onChangeText={(val) => {
                setOffers((prev) =>
                  prev.map((o, i) => (i === index ? { ...o, code: val.toUpperCase() } : o))
                );
              }}
            />

            {/* Icon picker chips */}
            <View style={{ gap: 4 }}>
              <Text style={[text.small, { color: colors.textMuted }]}>Icon</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {OFFER_ICON_OPTIONS.map((ico) => {
                  const isSelected = (offer.icon || 'gift') === ico.name;
                  return (
                    <PressScale
                      key={ico.name}
                      onPress={() => {
                        setOffers((prev) =>
                          prev.map((o, i) => (i === index ? { ...o, icon: ico.name } : o))
                        );
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 9,
                        paddingVertical: 5,
                        borderRadius: radius.pill,
                        backgroundColor: isSelected ? '#0284c7' : colors.card,
                        borderWidth: 1,
                        borderColor: isSelected ? '#0284c7' : colors.borderSoft
                      }}
                    >
                      <Icon name={ico.name} size={13} color={isSelected ? '#ffffff' : colors.text} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#ffffff' : colors.text }}>
                        {ico.label}
                      </Text>
                    </PressScale>
                  );
                })}
              </View>
            </View>
          </View>
        ))}

        {offers.length < 5 && (
          <Button
            small
            variant="outline"
            icon="plus"
            label="Add custom offer"
            onPress={() => {
              setOffers((prev) => [
                ...prev,
                { id: String(Date.now()), text: '', icon: 'gift' }
              ]);
            }}
          />
        )}
      </Card>

      <Notice icon="info">Logo and banner images can be changed on the website for now.</Notice>
      <Button icon="save" label="Save changes" onPress={handleSave} loading={save.isPending} />
    </Screen>
  );
}
