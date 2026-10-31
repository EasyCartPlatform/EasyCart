import type { IconName } from '@/components/icon';

export interface StoreOffer {
  id: string;
  text: string;
  icon?: IconName;
  code?: string;
  badge?: string;
}

export const OFFER_ICON_OPTIONS: Array<{ name: IconName; label: string }> = [
  { name: 'gift', label: 'Gift' },
  { name: 'ticket', label: 'Coupon' },
  { name: 'tags', label: 'Discount' },
  { name: 'zap', label: 'Flash Sale' },
  { name: 'truck', label: 'Delivery' },
  { name: 'sparkles', label: 'Special' }
];

export const OFFER_PRESETS = [
  { text: 'Free delivery over ₹499 this week', icon: 'truck' as IconName, code: 'FREEDEL', badge: 'FREE' },
  { text: 'Flat 20% OFF on all grocery essentials', icon: 'tags' as IconName, code: 'SAVE20', badge: '20% OFF' },
  { text: '₹50 OFF on your first 3 orders', icon: 'ticket' as IconName, code: 'FIRST50', badge: '₹50 OFF' },
  { text: 'Weekend Rush: Buy 1 Get 1 on selected snacks', icon: 'zap' as IconName, code: 'BOGO', badge: 'BOGO' }
];

export function parseStoreOffers(raw?: string | null): StoreOffer[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .filter((item) => item && (typeof item.text === 'string' || typeof item === 'string'))
        .map((item, index) => {
          if (typeof item === 'string') {
            return { id: String(index + 1), text: item, icon: 'gift' as IconName };
          }
          return {
            id: item.id || String(index + 1),
            text: item.text,
            icon: (item.icon as IconName) || 'gift',
            code: item.code ? String(item.code).toUpperCase().trim() : undefined,
            badge: item.badge ? String(item.badge).trim() : undefined
          };
        });
    }
  } catch {
    // If plain string or multi-line string with newlines or pipes
    const lines = raw.split(/\r?\n|\|/).map((s) => s.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines.map((line, index) => ({
        id: String(index + 1),
        text: line,
        icon: 'gift' as IconName
      }));
    }
  }
  return [{ id: '1', text: raw.trim(), icon: 'gift' as IconName }];
}

export function serializeStoreOffers(offers: StoreOffer[]): string {
  const cleaned = offers
    .filter((o) => o.text.trim().length > 0)
    .map((o, idx) => ({
      id: o.id || String(idx + 1),
      text: o.text.trim(),
      icon: o.icon || 'gift',
      code: o.code?.trim() || undefined,
      badge: o.badge?.trim() || undefined
    }));
  return JSON.stringify(cleaned);
}
