// The partner application on the phone: details, vehicle, base location and documents (camera or gallery), then send.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { router } from 'expo-router';
import { Icon } from '@/components/icon';
import { Button, Card, Field, Loading, Notice, Pills, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { riderCalls, useMyRider, useRiderAction } from '@/features/rider/rider-api';
import { ApplicationStatus } from '@/features/rider/application-status';
import { currentPosition, takePhoto } from '@/lib/device';
import { errorMessage, fileUrl } from '@/lib/api';
import { DOCUMENT_INFO, REQUIRED_DOCUMENT_KINDS, VEHICLE_LABELS } from '@/lib/delivery-labels';
import { colors, radius, space, text } from '@/theme/theme';
import type { DocumentKind, Rider, RiderProfileFields, VehicleType } from '@/types/delivery';

const FIELDS: (keyof RiderProfileFields)[] = ['full_name', 'date_of_birth', 'vehicle_type', 'vehicle_number', 'license_number', 'license_expiry', 'address_line', 'area', 'city', 'pincode', 'emergency_contact_name', 'emergency_contact_phone', 'upi_id'];
const pick = (rider: Rider) => Object.fromEntries(FIELDS.map((key) => [key, rider[key] ?? ''])) as unknown as RiderProfileFields;

function DocumentSlot({ kind, rider, editable }: { kind: DocumentKind; rider: Rider; editable: boolean }) {
  const info = DOCUMENT_INFO[kind];
  const current = rider.documents.find((doc) => doc.kind === kind);
  const upload = useRiderAction(riderCalls.uploadDocument);
  const toast = useToast();

  async function choose(source: 'camera' | 'library') {
    try {
      const file = await takePhoto(source);
      if (file) upload.mutate({ kind, file }, { onSuccess: () => toast(`${info.title} uploaded`, 'success'), onError: (e) => toast(errorMessage(e), 'error') });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <View style={styles.doc}>
      <View style={[styles.docPreview, current && { borderColor: '#a7f3d0' }]}>
        {upload.isPending ? <ActivityIndicator color={colors.primary} /> : current?.url && current.type === 'image' ? <Image source={{ uri: fileUrl(current.url)! }} style={{ width: '100%', height: '100%' }} /> : <Icon name={current ? 'file' : 'camera'} size={22} color={current ? colors.success : colors.primary} />}
        {current && <View style={styles.tick}><Icon name="check" size={12} color={colors.white} /></View>}
      </View>
      <Text style={styles.docTitle} numberOfLines={2}>{info.title}{info.required ? ' *' : ''}</Text>
      {editable && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable onPress={() => choose('camera')} style={styles.docButton} accessibilityLabel={`Take photo of ${info.title}`}><Icon name="camera" size={14} color={colors.primary} /></Pressable>
          <Pressable onPress={() => choose('library')} style={styles.docButton} accessibilityLabel={`Choose ${info.title} from gallery`}><Icon name="image" size={14} color={colors.primary} /></Pressable>
        </View>
      )}
    </View>
  );
}

export default function ApplicationScreen() {
  const { data: rider, isLoading } = useMyRider();
  const [form, setForm] = useState<RiderProfileFields | null>(null);
  const save = useRiderAction(riderCalls.updateProfile);
  const pin = useRiderAction(riderCalls.setBaseLocation);
  const submit = useRiderAction(riderCalls.submit);
  const toast = useToast();

  useEffect(() => { if (rider && !form) setForm(pick(rider)); }, [rider, form]);
  if (isLoading || !rider || !form) return <Loading />;

  const editable = rider.status === 'draft' || rider.status === 'rejected';
  const set = (key: keyof RiderProfileFields) => (value: string) => setForm((prev) => ({ ...prev!, [key]: value }));
  const bicycle = form.vehicle_type === 'bicycle';
  const docsDone = REQUIRED_DOCUMENT_KINDS.filter((kind) => rider.documents.some((doc) => doc.kind === kind)).length;

  async function pinLocation() {
    try { pin.mutate(await currentPosition(), { onSuccess: () => toast('Location pinned', 'success') }); } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Screen>
      <ApplicationStatus rider={rider} />
      <Notice tone="neutral" icon="list">{rider.missing_steps.includes('profile') ? 'Details not complete' : 'Details complete'} · {docsDone} of {REQUIRED_DOCUMENT_KINDS.length} required documents · location {rider.latitude !== null ? 'pinned' : 'not pinned'}</Notice>

      <Card title="About you" icon="user">
        <Field label="Full name" value={form.full_name} onChangeText={set('full_name')} editable={editable} />
        <Field label="Date of birth" value={form.date_of_birth} onChangeText={set('date_of_birth')} placeholder="YYYY-MM-DD" editable={editable} />
      </Card>

      <Card title="Vehicle and licence" icon="truck">
        <Pills<VehicleType> options={(Object.keys(VEHICLE_LABELS) as VehicleType[]).map((v) => ({ value: v, label: VEHICLE_LABELS[v] }))} value={(form.vehicle_type || 'bike') as VehicleType} onChange={(v) => editable && set('vehicle_type')(v)} />
        {!bicycle && (
          <>
            <Field label="Number plate" value={form.vehicle_number} onChangeText={set('vehicle_number')} autoCapitalize="characters" editable={editable} />
            <Field label="Driving licence number" value={form.license_number} onChangeText={set('license_number')} autoCapitalize="characters" editable={editable} />
            <Field label="Licence valid until" value={form.license_expiry} onChangeText={set('license_expiry')} placeholder="YYYY-MM-DD" editable={editable} />
          </>
        )}
      </Card>

      <Card title="Where you live" icon="home">
        <Field label="House / street" value={form.address_line} onChangeText={set('address_line')} />
        <Field label="Area" value={form.area} onChangeText={set('area')} />
        <Field label="City" value={form.city} onChangeText={set('city')} />
        <Field label="Pincode" value={form.pincode} onChangeText={set('pincode')} keyboardType="number-pad" maxLength={6} />
        <Button small variant="outline" icon="map-pin" label={rider.latitude !== null ? 'Location pinned · pin again' : 'Pin my base location'} onPress={pinLocation} loading={pin.isPending} />
      </Card>

      <Card title="Emergency contact and payouts" icon="heart">
        <Field label="Contact name" value={form.emergency_contact_name} onChangeText={set('emergency_contact_name')} />
        <Field label="Contact phone" value={form.emergency_contact_phone} onChangeText={set('emergency_contact_phone')} keyboardType="phone-pad" />
        <Field label="UPI ID (optional)" value={form.upi_id} onChangeText={set('upi_id')} autoCapitalize="none" />
      </Card>
      <Button variant="outline" icon="save" label="Save details" loading={save.isPending} onPress={() => save.mutate(form as never, { onSuccess: () => toast('Details saved', 'success'), onError: (e) => toast(errorMessage(e), 'error') })} />

      <Card title="Documents" icon="file-text">
        <Text style={text.small}>Clear photos, all four corners visible. Tap the camera or gallery button.</Text>
        <View style={styles.docs}>
          {[...REQUIRED_DOCUMENT_KINDS, 'license_back' as DocumentKind, 'insurance' as DocumentKind].map((kind) => <DocumentSlot key={kind} kind={kind} rider={rider} editable={editable} />)}
        </View>
      </Card>

      {editable && (
        <Button icon="send" label={rider.status === 'rejected' ? 'Send again' : 'Send for review'} disabled={rider.missing_steps.length > 0} loading={submit.isPending}
          onPress={() => submit.mutate(undefined, { onSuccess: () => { toast('Application sent', 'success'); router.replace('/rider'); }, onError: (e) => toast(errorMessage(e), 'error') })} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  docs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  doc: { width: '30%', minWidth: 92, flexGrow: 1, gap: 6 },
  docPreview: { aspectRatio: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tick: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  docTitle: { fontSize: 12, fontWeight: '600', color: colors.text },
  docButton: { flex: 1, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }
});
