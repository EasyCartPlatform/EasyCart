// One delivery partner: documents to check, then approve, reject, suspend or reactivate.
import { useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Avatar, Badge, Button, Card, EmptyState, Field, InfoRow, Loading, Notice, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { adminCalls, useAdminAction, useRider } from '@/features/admin/admin-api';
import { errorMessage, fileUrl } from '@/lib/api';
import { dateTime, price } from '@/lib/format';
import { RIDER_STATUS, VEHICLE_LABELS } from '@/lib/delivery-labels';
import { radius, space, text } from '@/theme/theme';

export default function AdminRider() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useRider(id);
  const action = useAdminAction(adminCalls.riderAction);
  const toast = useToast();
  const [note, setNote] = useState('');
  if (isLoading) return <Loading />;
  if (!data) return <Screen><EmptyState message="Partner not found." /></Screen>;
  const { rider, summary } = data;
  const status = RIDER_STATUS[rider.status];
  const run = (name: 'approve' | 'reject' | 'suspend' | 'reactivate', done: string) =>
    action.mutate({ id, action: name, note: note.trim() || undefined }, { onSuccess: () => { setNote(''); toast(done, 'success'); }, onError: (e) => toast(errorMessage(e), 'error') });

  return (
    <Screen>
      <Stack.Screen options={{ title: rider.full_name }} />
      <Card>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <Avatar name={rider.full_name} photoUrl={rider.photo_url} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={text.heading}>{rider.full_name}</Text>
            <Text style={text.small}>{rider.email} · {rider.phone_number}</Text>
            <Badge tone={status.tone} label={status.label} />
          </View>
        </View>
        {rider.review_note && <Notice tone="neutral" icon="message-square">Last note: {rider.review_note}</Notice>}
      </Card>

      <Card title="Details" icon="file-text">
        <InfoRow label="Date of birth" value={rider.date_of_birth || '—'} />
        <InfoRow label="Vehicle" value={rider.vehicle_type ? VEHICLE_LABELS[rider.vehicle_type] : '—'} />
        <InfoRow label="Number plate" value={rider.vehicle_number || '—'} />
        <InfoRow label="Licence" value={rider.license_number || '—'} />
        <InfoRow label="Licence valid until" value={rider.license_expiry || '—'} />
        <InfoRow label="Area" value={[rider.area, rider.city, rider.pincode].filter(Boolean).join(', ') || '—'} />
        <InfoRow label="Applied" value={dateTime(rider.submitted_at)} />
      </Card>

      <Card title="Documents" icon="image">
        <Text style={text.small}>Compare the photo, name and numbers with the details above. Tap to open full size.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {rider.documents.map((doc) => (
            <Pressable key={`${doc.kind}-${doc.index ?? 0}`} onPress={() => doc.url && Linking.openURL(fileUrl(doc.url)!)} style={{ width: '31%', gap: 4 }}>
              {doc.type === 'image' && doc.url ? <Image source={{ uri: fileUrl(doc.url)! }} style={{ width: '100%', aspectRatio: 1, borderRadius: radius.md }} /> : <View style={{ width: '100%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: '#fff1f2', alignItems: 'center', justifyContent: 'center' }}><Text style={text.small}>PDF</Text></View>}
              <Text style={text.small} numberOfLines={2}>{doc.title}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card title="Money" icon="dollar-sign">
        <InfoRow label="Deliveries" value={String(summary.deliveries)} />
        <InfoRow label="Earned" value={price(summary.earnings)} />
        <InfoRow label="Cash in hand" value={price(summary.cash_in_hand)} tone="warning" />
      </Card>

      <Card title="Review" icon="check-square">
        {(rider.status === 'pending' || rider.status === 'approved') && <Field label="Note (needed to reject or suspend)" value={note} onChangeText={setNote} placeholder="e.g. Licence photo is blurry" multiline />}
        {(rider.status === 'pending' || rider.status === 'rejected') && <Button variant="success" icon="check" label="Approve" loading={action.isPending} disabled={rider.missing_steps.length > 0} onPress={() => run('approve', `${rider.full_name} can now deliver`)} />}
        {rider.status === 'pending' && <Button variant="danger" icon="x" label="Reject" disabled={note.trim().length < 3} onPress={() => run('reject', 'Application rejected')} />}
        {rider.status === 'approved' && <Button variant="danger" icon="slash" label="Suspend" disabled={note.trim().length < 3} onPress={() => run('suspend', 'Partner suspended')} />}
        {rider.status === 'suspended' && <Button icon="rotate-ccw" label="Reactivate" onPress={() => run('reactivate', 'Partner reactivated')} />}
        {rider.status === 'draft' && <Text style={text.small}>The partner has not sent the application yet.</Text>}
      </Card>
    </Screen>
  );
}
