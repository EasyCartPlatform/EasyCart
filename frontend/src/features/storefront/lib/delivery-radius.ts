// Calculates delivery distance and checks eligibility based on store radius and pincode/location.
import type { PublicStore } from '../types/storefront-types';

export interface DeliveryCheckResult {
  isEligible: boolean;
  estimatedDistanceKm: number;
  maxRadiusKm: number;
  customerPincode: string | null;
  storePincode: string | null;
  message: string;
}

export function extractPincodeFromAddress(address: string | undefined | null): string | null {
  if (!address) return null;
  // Match 6-digit Indian PIN code or 5-digit US ZIP code
  const match = address.match(/\b[1-9]\d{5}\b/) || address.match(/\b\d{5,6}\b/);
  return match ? match[0] : null;
}

export function getActiveCustomerPincode(customerAddressOrPincode?: string | null): string | null {
  if (customerAddressOrPincode) {
    const pin = extractPincodeFromAddress(customerAddressOrPincode);
    if (pin) return pin;
    if (/^\d{5,6}$/.test(customerAddressOrPincode.trim())) return customerAddressOrPincode.trim();
  }

  // Check active address from saved list
  const activeId = localStorage.getItem('customer_active_address_id');
  const rawList = localStorage.getItem('customer_saved_addresses');
  if (rawList) {
    try {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const found = activeId ? parsed.find((a: any) => a.id === activeId) : parsed[0];
        if (found) {
          const pin = found.zip || extractPincodeFromAddress(found.cityStateZip) || extractPincodeFromAddress(found.street);
          if (pin) return pin;
        }
      }
    } catch { /* ignore */ }
  }

  // Fallbacks
  const savedAddress = localStorage.getItem('customer_saved_address');
  const pinFromSaved = extractPincodeFromAddress(savedAddress);
  if (pinFromSaved) return pinFromSaved;

  return localStorage.getItem('customer_active_pincode') || null;
}

export function estimateDistanceBetweenPincodes(p1: string | null, p2: string | null): number {
  if (!p1 || !p2) return 0.8; // Default fallback within 0.8 km if store or customer has same area
  if (p1.trim() === p2.trim()) return 0.8;

  const n1 = parseInt(p1.replace(/\D/g, ''), 10);
  const n2 = parseInt(p2.replace(/\D/g, ''), 10);

  if (isNaN(n1) || isNaN(n2)) return 1.5;

  const diff = Math.abs(n1 - n2);
  if (diff === 0) return 0.8;
  if (diff <= 2) return 1.8;
  if (diff <= 5) return 3.5;
  if (diff <= 10) return 7.0;
  return Math.min(50, diff * 1.5);
}

export function checkStoreDeliveryEligibility(store: Pick<PublicStore, 'max_delivery_radius_km' | 'pincode'>, customerAddressOrPincode?: string | null): DeliveryCheckResult {
  const maxRadiusKm = store.max_delivery_radius_km ?? 10;
  const storePincode = store.pincode ?? null;

  const customerPincode = getActiveCustomerPincode(customerAddressOrPincode);

  const estimatedDistanceKm = estimateDistanceBetweenPincodes(storePincode, customerPincode);
  const isEligible = estimatedDistanceKm <= maxRadiusKm;

  let message: string;
  if (isEligible) {
    message = `⚡ Delivers to your location (~${estimatedDistanceKm.toFixed(1)} km away)`;
  } else {
    message = `⚠️ Outside delivery range (${estimatedDistanceKm.toFixed(1)} km away, max ${maxRadiusKm} km)`;
  }

  return {
    isEligible,
    estimatedDistanceKm,
    maxRadiusKm,
    customerPincode,
    storePincode,
    message
  };
}
