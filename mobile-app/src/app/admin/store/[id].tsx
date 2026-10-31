// One store (or store request) for the admin: the owner, the applicant's address and documents, activity, and the actions.
import { Linking, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from '@/components/text';
import { Badge, Button, Card, InfoRow, Loading, Notice, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { adminCalls, requestCalls, useAdminAction, useTenantDetail, verificationOf } from '@/features/admin/admin-api';
import { errorMessage } from '@/lib/api';
import { date, price } from '@/lib/format';
import { colors, space, text } from '@/theme/theme';

export default function AdminStoreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, refetch, isRefetching } = useTenantDetail(id);
  const approve = useAdminAction(requestCalls.approve);
  const reject = useAdminAction(requestCalls.reject);
  const tenantAction = useAdminAction(adminCalls.tenantAction);
  const toast = useToast();
  const [confirmReject, setConfirmReject] = useState(false);
  if (isLoading || !data) return <Loading />;

  const { tenant, store, owner, activity } = data;
  const proof = verificationOf(data);
  const isRequest = tenant.status === 'pending';
  const tone = tenant.status === 'suspended' || tenant.status === 'rejected' ? 'danger' : tenant.status === 'pending' ? 'warning' : store?.is_published ? 'success' : 'neutral';
  const statusLabel = tenant.status === 'active' ? (store?.is_published ? 'Live' : 'Not published') : tenant.status === 'pending' ? 'Request' : tenant.status;
  const done = (message: string) => ({ onSuccess: () => { toast(message, 'success'); void refetch(); }, onError: (e: unknown) => toast(errorMessage(e), 'error') });

  function rejectOrAsk() {
    if (!confirmReject) { setConfirmReject(true); return; }
    reject.mutate(tenant.id, { onSuccess: () => { toast('Request rejected', 'success'); router.back(); }, onError: (e) => toast(errorMessage(e), 'error') });
  }

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Stack.Screen options={{ title: tenant.name }} />
      <Card>
        <View style={styles.top}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={text.title}>{tenant.name}</Text>
            <Text style={text.small}>/{tenant.slug} · since {date(tenant.created_at)}</Text>
          </View>
          <Badge tone={tone} label={statusLabel} />
        </View>
      </Card>

      {isRequest && <Notice tone="warning" icon="clock">This store is waiting for your decision. Check the address and documents, then approve or reject.</Notice>}

      <Card title="Owner" icon="users">
        <InfoRow label="Name" value={owner?.username ?? '—'} />
        <InfoRow label="Email" value={owner?.email ?? '—'} />
        <InfoRow label="Phone" value={owner?.phone_number ?? '—'} />
      </Card>

      {(proof.address || proof.idProofUrl || proof.businessProofUrl || proof.documents.length > 0) && (
        <Card title="Business verification" icon="shield-check">
          {proof.address && (
            <View style={{ gap: 2 }}>
              <Text style={text.label}>Business address</Text>
              <Text style={text.body}>{proof.address}</Text>
            </View>
          )}
          <View style={{ gap: space.sm }}>
            {proof.idProofUrl && <Button variant="outline" icon="file-text" label="Open ID proof" onPress={() => void Linking.openURL(proof.idProofUrl!)} />}
            {proof.businessProofUrl && <Button variant="outline" icon="file-text" label="Open business proof" onPress={() => void Linking.openURL(proof.businessProofUrl!)} />}
            {proof.documents.filter((doc) => doc.url !== proof.idProofUrl && doc.url !== proof.businessProofUrl).map((doc) => (
              <Button key={doc.id} variant="outline" icon="file" label={`Open ${doc.title}`} onPress={() => void Linking.openURL(doc.url)} />
            ))}
          </View>
          <Text style={text.small}>Links expire after an hour. Pull to refresh for new ones.</Text>
        </Card>
      )}

      {store && (
        <Card title="Store" icon="store">
          <InfoRow label="Delivery fee" value={price(store.delivery_fee)} />
          {store.promotion_banner_text ? <InfoRow label="Announcement" value={store.promotion_banner_text} /> : null}
        </Card>
      )}

      {!isRequest && (
        <Card title="Activity" icon="clipboard">
          <InfoRow label="Products" value={String(activity.product_count)} />
          <InfoRow label="Orders" value={`${activity.order_count} (${activity.pending_order_count} pending)`} />
          <InfoRow label="Customers" value={String(activity.customer_count)} />
          <InfoRow label="Revenue" value={price(activity.revenue)} strong />
          {activity.low_stock_count > 0 && <InfoRow label="Low stock products" value={String(activity.low_stock_count)} tone="warning" />}
          <InfoRow label="Last order" value={activity.last_order_at ? date(activity.last_order_at) : 'No orders yet'} />
        </Card>
      )}

      {isRequest ? (
        <View style={{ gap: space.sm }}>
          <Button variant="success" icon="check" label="Approve store" loading={approve.isPending} onPress={() => approve.mutate(tenant.id, done('Store approved. The owner now has a dashboard.'))} />
          <Button variant={confirmReject ? 'danger' : 'outline'} icon="x-circle" label={confirmReject ? 'Tap again to reject this request' : 'Reject request'} loading={reject.isPending} onPress={rejectOrAsk} />
        </View>
      ) : tenant.status === 'active' ? (
        <Button variant="danger" icon="slash" label="Suspend store" loading={tenantAction.isPending} onPress={() => tenantAction.mutate({ id: tenant.id, action: 'suspend' }, done('Store suspended'))} />
      ) : tenant.status === 'suspended' ? (
        <Button variant="outline" icon="check" label="Reactivate store" loading={tenantAction.isPending} onPress={() => tenantAction.mutate({ id: tenant.id, action: 'reactivate' }, done('Store reactivated'))} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md }
});
