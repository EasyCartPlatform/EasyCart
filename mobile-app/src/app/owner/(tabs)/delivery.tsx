// Store delivery: orders on the road, cash to collect from riders, and partners nearby.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { Badge, Button, Card, EmptyState, Loading, Screen, StatStrip } from '@/components/ui';
import { useToast } from '@/components/toast';
import { ownerCalls, useOwnerAction, useRidersNearby, useStoreDeliveries, useStoreSettlements } from '@/features/owner/owner-api';
import { useRefreshAndSearch } from '@/features/owner/use-refresh-and-search';
import { errorMessage } from '@/lib/api';
import { distance, price } from '@/lib/format';
import { VEHICLE_LABELS, deliveryStageLabel } from '@/lib/delivery-labels';
import { colors, radius, space, text } from '@/theme/theme';

const ACTIVE = ['ready_for_delivery', 'rider_assigned', 'dispatched'];

export default function OwnerDelivery() {
  const deliveries = useStoreDeliveries();
  const settlements = useStoreSettlements();
  const riders = useRidersNearby();
  const toast = useToast();
  const settle = useOwnerAction(ownerCalls.settle);
  const [settlingId, setSettlingId] = useState<string | null>(null);

  // Pulling down also sends every order still waiting for a rider to all nearby riders again.
  const { refresh, refreshing } = useRefreshAndSearch(() => Promise.all([deliveries.refetch(), settlements.refetch(), riders.refetch()]));

  if (deliveries.isLoading) return <Loading />;

  const active = (deliveries.data ?? []).filter((row) => ACTIVE.includes(row.stage));
  const open = (settlements.data?.orders ?? []).filter((row) => !row.is_settled && row.net_to_store > 0);
  const totalCashToCollect = open.reduce((s, r) => s + r.net_to_store, 0);
  const nearbyRiders = riders.data?.riders ?? [];
  const onlineRidersCount = nearbyRiders.filter((r) => r.is_available).length;

  function handleSettle(orderId: string) {
    setSettlingId(orderId);
    settle.mutate(
      { id: orderId, method: 'cash' },
      {
        onSuccess: () => toast('Cash marked received', 'success'),
        onError: (err) => toast(errorMessage(err), 'error'),
        onSettled: () => setSettlingId(null)
      }
    );
  }

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      {/* Logistics KPI Strip */}
      <StatStrip items={[
        { label: 'In transit', value: String(active.length) },
        { label: 'Cash to collect', value: price(totalCashToCollect).replace('.00', '') },
        { label: 'Online nearby', value: String(onlineRidersCount) }
      ]} />

      {/* Active Orders On The Road */}
      <Card title="On the way" icon="truck" right={<Badge tone="primary" label={String(active.length)} />}>
        {active.length === 0 ? (
          <EmptyState icon="truck" message="No deliveries in progress." />
        ) : (
          <View style={{ gap: space.sm }}>
            {active.map((row) => {
              const stage = deliveryStageLabel(row.stage, row.rider_offer_status);
              const shortCode = `#${row.id.slice(0, 6).toUpperCase()}`;
              return (
                <Pressable
                  key={row.id}
                  onPress={() => router.push(`/owner/order/${row.id}`)}
                  style={styles.deliveryRow}
                  accessibilityRole="button"
                >
                  <View style={styles.deliveryHeader}>
                    <View style={styles.codeRow}>
                      <Text style={styles.codeText}>{shortCode}</Text>
                      <Badge tone={stage.tone} label={stage.label} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.priceText}>{price(row.total)}</Text>
                      <Icon name="chevron-right" size={16} color="#94a3b8" />
                    </View>
                  </View>

                  {row.rider_name ? (
                    <View style={styles.infoLine}>
                      <Icon name="bike" size={14} color="#0284c7" />
                      <Text style={[styles.infoText, { color: '#0369a1', fontWeight: '700' }]}>Rider: {row.rider_name}</Text>
                    </View>
                  ) : (
                    <View style={styles.infoLine}>
                      <Icon name="search" size={14} color="#d97706" />
                      <Text style={[styles.infoText, { color: '#d97706', fontWeight: '600' }]}>Waiting for nearby rider to accept</Text>
                    </View>
                  )}

                  {row.delivery_address ? (
                    <View style={styles.infoLine}>
                      <Icon name="map-pin" size={14} color="#64748b" />
                      <Text style={styles.infoText} numberOfLines={1}>{row.delivery_address.replace(/\n/g, ', ')}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      {/* Cash Settlements from Riders */}
      <Card
        title="Cash from riders"
        icon="dollar-sign"
        right={
          totalCashToCollect > 0 ? (
            <Badge tone="warning" label={price(totalCashToCollect)} />
          ) : undefined
        }
      >
        {open.length === 0 ? (
          <Text style={text.small}>All settled. Nothing to collect.</Text>
        ) : (
          <View style={{ gap: space.sm }}>
            {open.map((row) => {
              const shortCode = `#${row.order_id.slice(0, 6).toUpperCase()}`;
              const isSettling = settlingId === row.order_id;
              return (
                <View key={row.order_id} style={styles.settleRow}>
                  <Pressable
                    style={{ flex: 1, gap: 2 }}
                    onPress={() => router.push(`/owner/order/${row.order_id}`)}
                  >
                    <Text style={styles.codeText}>{shortCode} · {row.rider_name ?? 'Rider'}</Text>
                    <Text style={styles.settleAmount}>{price(row.net_to_store)}</Text>
                  </Pressable>

                  <Button
                    small
                    variant="success"
                    label="Mark Received"
                    icon="check"
                    loading={isSettling}
                    disabled={settlingId !== null}
                    onPress={() => handleSettle(row.order_id)}
                  />
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {/* Nearby Delivery Partners */}
      <Card title="Partners near you" icon="radio" right={<Badge tone="neutral" label={String(nearbyRiders.length)} />}>
        {nearbyRiders.length === 0 ? (
          <EmptyState icon="users" message="No approved delivery partners nearby yet." />
        ) : (
          <View>
            {nearbyRiders.slice(0, 10).map((rider, index) => {
              const isLast = index === Math.min(nearbyRiders.length, 10) - 1;
              const isAvailable = rider.is_available;
              const hasActive = (rider.active_orders ?? 0) > 0;
              return (
                <View key={rider.id} style={[styles.riderRow, isLast && { borderBottomWidth: 0 }]}>
                  <View style={styles.riderIconWrap}>
                    <Icon name={rider.vehicle_type === 'bicycle' ? 'bike' : 'bike'} size={18} color="#0284c7" />
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.riderName}>{rider.full_name}</Text>
                      {isAvailable ? (
                        <Badge tone="success" label="Available" />
                      ) : hasActive ? (
                        <Badge tone="warning" label={`${rider.active_orders} delivering`} />
                      ) : (
                        <Badge tone="neutral" label="Offline" />
                      )}
                    </View>
                    <Text style={styles.riderMeta}>
                      {rider.vehicle_type ? VEHICLE_LABELS[rider.vehicle_type] : 'Vehicle'} · {[rider.area, rider.city].filter(Boolean).join(', ')}
                    </Text>
                  </View>

                  <View style={styles.distancePill}>
                    <Text style={styles.distanceText}>{distance(rider.distance_km)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  deliveryRow: {
    backgroundColor: '#f8fafc',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: space.md,
    gap: 6
  },
  deliveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm
  },
  codeText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    fontFamily: 'monospace'
  },
  priceText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums']
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  infoText: {
    fontSize: 12.5,
    color: colors.textMuted,
    flex: 1
  },
  settleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fffbeb',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: space.md,
    gap: space.sm
  },
  settleAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#b45309',
    fontVariant: ['tabular-nums']
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft
  },
  riderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    alignItems: 'center',
    justifyContent: 'center'
  },
  riderName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text
  },
  riderMeta: {
    fontSize: 12,
    color: colors.textMuted
  },
  distancePill: {
    backgroundColor: '#f1f5f9',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  distanceText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textMuted
  }
});
