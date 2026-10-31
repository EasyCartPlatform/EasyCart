// Discount coupons: create one, switch it on or off, remove it.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Badge, Button, Card, EmptyState, Field, Loading, Pills, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { manageCalls, useCoupons, useRefreshingAction, type Coupon } from '@/features/owner/owner-api';
import { errorMessage } from '@/lib/api';
import { date, price } from '@/lib/format';
import { colors, radius, shadow, space, text } from '@/theme/theme';

function describe(coupon: Coupon) {
  const expired = coupon.expires_at ? new Date(coupon.expires_at) < new Date() : false;
  return {
    expired,
    status: expired ? 'expired' : coupon.is_active ? 'active' : 'inactive',
    tone: (expired ? 'danger' : coupon.is_active ? 'success' : 'neutral') as 'danger' | 'success' | 'neutral',
    discount: coupon.discount_type === 'percent' ? `${coupon.discount_value}% off` : `${price(coupon.discount_value)} off`
  };
}

export default function OwnerCoupons() {
  const { data, isLoading, refetch, isRefetching } = useCoupons();
  const create = useRefreshingAction(manageCalls.createCoupon, ['coupons']);
  const toggle = useRefreshingAction(manageCalls.setCouponActive, ['coupons']);
  const remove = useRefreshingAction(manageCalls.deleteCoupon, ['coupons']);
  const toast = useToast();
  const [code, setCode] = useState('');
  const [type, setType] = useState<'flat' | 'percent'>('flat');
  const [value, setValue] = useState('');
  const [expires, setExpires] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (isLoading) return <Loading />;

  function add() {
    const amount = Number(value);
    if (!code.trim() || !(amount > 0)) { toast('Enter a code and a discount above 0', 'error'); return; }
    const expiry = expires.trim();
    if (expiry && Number.isNaN(Date.parse(expiry))) { toast('Expiry must look like 2026-12-31', 'error'); return; }
    create.mutate(
      { code: code.trim().toUpperCase(), discount_type: type, discount_value: amount, expires_at: expiry ? new Date(expiry).toISOString() : null },
      { onSuccess: () => { setCode(''); setValue(''); setExpires(''); toast('Coupon created', 'success'); }, onError: (e) => toast(errorMessage(e), 'error') }
    );
  }

  function askOrDelete(id: string) {
    if (confirmId !== id) { setConfirmId(id); return; }
    remove.mutate(id, { onSuccess: () => { setConfirmId(null); toast('Coupon removed', 'success'); }, onError: (e) => toast(errorMessage(e), 'error') });
  }

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Card title="New coupon" icon="ticket">
        <Field label="Code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="SAVE10" />
        <View style={{ gap: 6 }}>
          <Text style={text.label}>Discount type</Text>
          <Pills<'flat' | 'percent'> options={[{ value: 'flat', label: 'Rs. off' }, { value: 'percent', label: '% off' }]} value={type} onChange={setType} />
        </View>
        <Field label={type === 'percent' ? 'Percent' : 'Amount (Rs.)'} value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder={type === 'percent' ? '10' : '50'} />
        <Field label="Expires on (optional)" hint="Format: 2026-12-31" value={expires} onChangeText={setExpires} placeholder="2026-12-31" autoCapitalize="none" />
        <Button icon="plus" label="Create coupon" onPress={add} loading={create.isPending} />
      </Card>

      {(data?.length ?? 0) === 0 ? <EmptyState icon="ticket" message="No coupons yet." /> : data!.map((coupon) => {
        const info = describe(coupon);
        return (
          <View key={coupon.id} style={styles.row}>
            <View style={styles.top}>
              <Text style={styles.code}>{coupon.code}</Text>
              <Badge tone={info.tone} label={info.status} />
            </View>
            <Text style={text.muted}>{info.discount} · {coupon.expires_at ? `expires ${date(coupon.expires_at)}` : 'no expiry'}</Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button small variant="outline" label={info.expired ? 'Expired' : coupon.is_active ? 'Deactivate' : 'Activate'} disabled={info.expired} onPress={() => toggle.mutate({ id: coupon.id, is_active: !coupon.is_active }, { onError: (e) => toast(errorMessage(e), 'error') })} />
              <Button small variant={confirmId === coupon.id ? 'danger' : 'outline'} icon="trash-2" label={confirmId === coupon.id ? 'Tap again to remove' : 'Remove'} onPress={() => askOrDelete(coupon.id)} />
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: '#e8edf3', padding: space.lg, ...shadow },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  code: { fontSize: 17, fontWeight: '800', color: colors.text, fontFamily: 'monospace', letterSpacing: 0.5 }
});
