// Helps a new store owner get set up: a short checklist that disappears once the shop is ready, and a card to share the shop code with WhatsApp & QR.
import { useState } from 'react';
import { Linking, Modal, Pressable, Share, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/motion';
import { Button, Card } from '@/components/ui';
import { useToast } from '@/components/toast';
import { accents, colors, radius, shadow, space, text } from '@/theme/theme';
import type { OwnerStore } from './owner-api';

interface Step { label: string; hint: string; done: boolean; href: Href }

export function SetupChecklist({ store, productCount }: { store: OwnerStore; productCount: number }) {
  const steps: Step[] = [
    { label: 'Add your first products', hint: 'Customers need something to buy', done: productCount > 0, href: '/owner/products' },
    { label: 'Add your shop address', hint: 'Shown to customers and used for pickup', done: Boolean(store.address), href: '/owner/store-settings' },
    { label: 'Pin your shop location', hint: 'So riders near your shop see your deliveries', done: store.latitude != null, href: '/owner/store-settings' },
    { label: 'Publish your shop', hint: 'Open it to customers', done: store.is_published, href: '/owner/store-settings' }
  ];
  const finished = steps.filter((step) => step.done).length;
  if (finished === steps.length) return null;

  return (
    <Card title="Set up your shop" icon="sparkles" right={<Text style={styles.count}>{finished} of {steps.length}</Text>}>
      <View style={styles.track}><View style={[styles.fill, { width: `${(finished / steps.length) * 100}%` }]} /></View>
      {steps.map((step) => (
        <PressScale key={step.label} onPress={() => router.push(step.href)} style={styles.row} accessibilityRole="button">
          <View style={[styles.check, step.done && styles.checkDone]}>
            {step.done ? <Icon name="check" size={14} color={colors.white} strokeWidth={3} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, step.done && styles.labelDone]}>{step.label}</Text>
            {!step.done ? <Text style={text.small}>{step.hint}</Text> : null}
          </View>
          {!step.done ? <Icon name="chevron-right" size={18} color={colors.textFaint} /> : null}
        </PressScale>
      ))}
    </Card>
  );
}

// The shop code and QR code let customers open this shop in the app.
export function ShareShopCard({ store }: { store: OwnerStore }) {
  const toast = useToast();
  const [showQr, setShowQr] = useState(false);

  const shareMessage = `Order fresh products from ${store.name} on EasyCart! Enter shop code "${store.slug}" in the app or open: https://easycart.app/${store.slug}`;

  function shareNative() {
    void Share.share({ message: shareMessage });
  }

  function shareWhatsApp() {
    const url = `whatsapp://send?text=${encodeURIComponent(shareMessage)}`;
    Linking.openURL(url).catch(() => {
      void Share.share({ message: shareMessage });
    });
  }

  function copyCode() {
    toast(`Shop code "${store.slug}" copied!`, 'success');
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=15&data=${encodeURIComponent(`easycart://shop/${store.slug}`)}`;

  return (
    <Card title="Share your shop" icon="send">
      <Pressable onPress={copyCode} style={styles.codeBox} accessibilityRole="button" accessibilityLabel="Copy shop code">
        <Text style={styles.codeLabel}>YOUR SHOP CODE (TAP TO COPY)</Text>
        <View style={styles.codeRow}>
          <Text style={styles.code}>{store.slug}</Text>
          <Icon name="copy" size={16} color={colors.primary} />
        </View>
      </Pressable>

      <Text style={text.small}>Customers enter this code or scan your QR to open your shop.</Text>

      <View style={styles.actionGrid}>
        <Pressable onPress={shareWhatsApp} style={styles.whatsAppBtn} accessibilityRole="button">
          <Icon name="message-circle" size={17} color="#ffffff" strokeWidth={2.4} />
          <Text style={styles.whatsAppText}>Share on WhatsApp</Text>
        </Pressable>

        <Pressable onPress={() => setShowQr(true)} style={styles.qrBtn} accessibilityRole="button">
          <Icon name="qr-code" size={16} color={colors.text} strokeWidth={2.2} />
          <Text style={styles.qrBtnText}>View QR</Text>
        </Pressable>

        <Pressable onPress={shareNative} style={styles.moreBtn} accessibilityRole="button">
          <Icon name="share-2" size={16} color="#64748b" />
        </Pressable>
      </View>

      {/* QR Code Modal Popup */}
      <Modal visible={showQr} transparent animationType="fade" onRequestClose={() => setShowQr(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.modalTitle}>{store.name}</Text>
                <Text style={styles.modalSub}>Scan with phone camera to shop</Text>
              </View>
              <Pressable onPress={() => setShowQr(false)} hitSlop={10} style={styles.closeBtn}>
                <Icon name="x" size={18} color="#64748b" />
              </Pressable>
            </View>

            <View style={styles.qrWrap}>
              <Image source={{ uri: qrUrl }} style={styles.qrImage} contentFit="contain" />
              <View style={styles.qrCodeBadge}>
                <Text style={styles.qrCodeBadgeText}>CODE: {store.slug}</Text>
              </View>
            </View>

            <Text style={styles.modalNote}>
              Place this QR code on your cash counter or share on your social pages so customers can open your shop instantly.
            </Text>

            <Button label="Done" onPress={() => setShowQr(false)} />
          </View>
        </View>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  count: { fontSize: 12, fontWeight: '700', color: colors.primary },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.borderSoft, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: colors.success, borderColor: colors.success },
  label: { fontSize: 14, fontWeight: '700', color: colors.text },
  labelDone: { color: colors.textMuted, textDecorationLine: 'line-through', fontWeight: '600' },
  codeBox: { alignItems: 'center', gap: 3, backgroundColor: accents.sky.bg, borderRadius: radius.md, paddingVertical: space.md, borderWidth: 1, borderColor: '#bae6fd' },
  codeLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: '#0369a1' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { fontSize: 22, fontWeight: '900', color: colors.primaryDark, letterSpacing: 1 },
  actionGrid: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  whatsAppBtn: {
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    ...shadow
  },
  whatsAppText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  qrBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  qrBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  moreBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: radius.xl,
    padding: space.xl,
    gap: space.md,
    alignItems: 'center',
    ...shadow
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text
  },
  modalSub: {
    fontSize: 12,
    color: colors.textMuted
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  qrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10
  },
  qrImage: {
    width: 200,
    height: 200
  },
  qrCodeBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill
  },
  qrCodeBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0369a1',
    letterSpacing: 0.5
  },
  modalNote: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17
  }
});
