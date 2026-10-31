import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, MapPin, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { useCart } from '@/features/cart/cart-context';
import { useCheckout } from '../hooks/use-checkout';
import { validateCoupon, type ValidatedCoupon } from '../api/checkout-api';
import { ApiError } from '@/shared/api/api-error';
import { usePublicStore } from '@/features/storefront/hooks/use-public-store';
import { checkStoreDeliveryEligibility } from '@/features/storefront/lib/delivery-radius';

export interface SavedAddress {
  id: string;
  label: string;
  recipientName?: string;
  phone?: string;
  street: string;
  landmark?: string;
  city?: string;
  state?: string;
  zip?: string;
  cityStateZip?: string;
}

const DEFAULT_ADDRESSES: SavedAddress[] = [
  {
    id: '1',
    label: 'Home',
    recipientName: 'Alex Morgan',
    phone: '+1 (555) 234-5678',
    street: '123 Main Street, Apt 4B',
    city: 'Cityville',
    state: 'NY',
    zip: '10001',
    cityStateZip: 'Cityville, NY 10001'
  },
  {
    id: '2',
    label: 'Work',
    recipientName: 'Alex Morgan (Office)',
    phone: '+1 (555) 987-6543',
    street: '456 Market Ave, Suite 300',
    landmark: 'Near City Mall',
    city: 'Hyderabad',
    state: 'Telangana',
    zip: '500001',
    cityStateZip: 'Hyderabad, Telangana 500001'
  }
];

function getLocationText(addr: SavedAddress): string {
  const parts = [
    addr.street,
    addr.landmark ? `(Landmark: ${addr.landmark})` : '',
    addr.cityStateZip || [addr.city, addr.state, addr.zip].filter(Boolean).join(', ')
  ].filter(Boolean);
  return parts.join(', ');
}

function formatAddressText(addr: SavedAddress): string {
  const parts = [
    addr.recipientName,
    getLocationText(addr),
    addr.phone ? `Ph: ${addr.phone}` : ''
  ].filter(Boolean);
  return parts.join(', ');
}

function getAddressLines(addr?: SavedAddress, rawAddressStr?: string) {
  if (addr) {
    const name = addr.recipientName || '';
    const location = getLocationText(addr);
    const phone = addr.phone ? (addr.phone.toLowerCase().startsWith('ph:') ? addr.phone : `Ph: ${addr.phone}`) : '';
    return { name, location, phone };
  }

  if (rawAddressStr) {
    const parts = rawAddressStr.split(',').map((s) => s.trim()).filter(Boolean);
    let name = '';
    let phone = '';
    const locationParts: string[] = [];

    for (const part of parts) {
      if (part.toLowerCase().startsWith('ph:') || part.toLowerCase().startsWith('phone:')) {
        phone = part;
      } else if (!name && locationParts.length === 0 && !/\d/.test(part) && part.length < 35) {
        name = part;
      } else {
        locationParts.push(part);
      }
    }

    return {
      name,
      location: locationParts.join(', '),
      phone
    };
  }

  return { name: '', location: '', phone: '' };
}

export function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: store } = usePublicStore(slug!);
  const { lines, total } = useCart();
  const checkoutMutation = useCheckout(slug!);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<'pickup' | 'delivery'>('delivery');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [addressList, setAddressList] = useState<SavedAddress[]>([]);
  const [activeAddressId, setActiveAddressId] = useState<string>('');
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<ValidatedCoupon | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState('');

  // Sync saved address list & active address in real-time from localStorage and custom events
  useEffect(() => {
    function syncAddressFromStorage() {
      const rawList = localStorage.getItem('customer_saved_addresses');
      let currentList = DEFAULT_ADDRESSES;
      if (rawList) {
        try {
          const parsed = JSON.parse(rawList);
          if (Array.isArray(parsed) && parsed.length > 0) {
            currentList = parsed;
          }
        } catch { /* ignore */ }
      }
      setAddressList(currentList);

      const actId = localStorage.getItem('customer_active_address_id') || currentList[0]?.id || '1';
      setActiveAddressId(actId);

      const activeObj = currentList.find((a) => a.id === actId) || currentList[0];
      const savedStr = localStorage.getItem('customer_saved_address');

      if (savedStr && savedStr.trim()) {
        setDeliveryAddress(savedStr);
      } else if (activeObj) {
        const formatted = formatAddressText(activeObj);
        setDeliveryAddress(formatted);
        localStorage.setItem('customer_saved_address', formatted);
      }
    }

    syncAddressFromStorage();
    window.addEventListener('customer_address_changed', syncAddressFromStorage);
    window.addEventListener('storage', syncAddressFromStorage);
    return () => {
      window.removeEventListener('customer_address_changed', syncAddressFromStorage);
      window.removeEventListener('storage', syncAddressFromStorage);
    };
  }, []);

  function handleSelectAddress(addr: SavedAddress) {
    const formatted = formatAddressText(addr);
    setActiveAddressId(addr.id);
    setDeliveryAddress(formatted);
    localStorage.setItem('customer_active_address_id', addr.id);
    localStorage.setItem('customer_saved_address', formatted);
    window.dispatchEvent(new Event('customer_address_changed'));
    toast.success(`Active delivery address changed to "${addr.label}"`);
  }

  const activeAddressObj = addressList.find((a) => a.id === activeAddressId) || addressList[0];

  const deliveryFee = fulfillmentMethod === 'delivery' ? (store?.delivery_fee ?? 0) : 0;
  const discountAmount = appliedCoupon
    ? appliedCoupon.discount_type === 'percent'
      ? Math.min(total, (total * appliedCoupon.discount_value) / 100)
      : Math.min(total, appliedCoupon.discount_value)
    : 0;
  const amountToPay = Math.max(0, total - discountAmount) + deliveryFee;

  async function handleApplyCoupon() {
    const trimmed = couponInput.trim();
    if (!trimmed) {
      toast.error('Please enter a coupon code');
      return;
    }
    setIsValidatingCoupon(true);
    setCouponError('');
    try {
      const res = await validateCoupon(slug!, trimmed);
      setAppliedCoupon(res.coupon);
      setCouponInput('');
      setCouponError('');
      toast.success(`Coupon "${res.coupon.code}" applied`);
    } catch (err) {
      setAppliedCoupon(null);
      const msg = err instanceof ApiError ? err.message : 'Invalid coupon code';
      setCouponError(msg);
      toast.error(msg);
    } finally {
      setIsValidatingCoupon(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError('');
  }

  function handlePlaceOrder() {
    if (isDeliveryOutOfRange) {
      toast.error(deliveryCheck?.message || 'Address is outside the delivery range. Please choose Pickup or change address.');
      return;
    }
    checkoutMutation.mutate(
      {
        items: lines.map((l) => ({ product_id: l.product_id, variant_label: l.variant_label, quantity: l.quantity })),
        payment_method: 'cash_on_delivery',
        fulfillment_method: fulfillmentMethod,
        delivery_address: fulfillmentMethod === 'delivery' ? deliveryAddress : undefined,
        coupon_code: appliedCoupon ? appliedCoupon.code : undefined
      },
      {
        onError: (err) => {
          const msg = err instanceof ApiError ? err.message : 'Checkout failed';
          toast.error(msg);
          if (msg.toLowerCase().includes('coupon')) {
            setAppliedCoupon(null);
          }
        }
      }
    );
  }

  const deliveryCheck = store && fulfillmentMethod === 'delivery'
    ? checkStoreDeliveryEligibility(store, deliveryAddress)
    : null;
  const isDeliveryOutOfRange = Boolean(deliveryCheck && !deliveryCheck.isEligible);
  const canPlaceOrder = fulfillmentMethod === 'pickup' || (deliveryAddress.trim().length > 0 && !isDeliveryOutOfRange);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 pt-4 sm:px-6 sm:pt-6 pb-12">
      <div className="flex max-w-md flex-col gap-4 sm:p-6">
        <h1 className="font-heading text-2xl">Checkout</h1>
        {lines.map((line) => (
          <div key={`${line.product_id}-${line.variant_label ?? ''}`} className="flex justify-between text-sm">
            <span>{line.name} × {line.quantity}</span>
            <span className="tabular-nums">Rs. {(line.price * line.quantity).toFixed(2)}</span>
          </div>
        ))}
        <Separator />
        <div className="flex flex-col gap-2">
          <Label>Fulfillment</Label>
          <Select value={fulfillmentMethod} onValueChange={(value) => setFulfillmentMethod(value as 'pickup' | 'delivery')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="pickup">Pickup</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {fulfillmentMethod === 'delivery' && (
          <div className="flex flex-col gap-3 rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                <MapPin className="size-4 text-sky-600" /> Delivery address <span className="text-rose-500">*</span>
              </Label>
              <button
                type="button"
                onClick={() => setShowAddressModal(true)}
                className="text-xs font-bold text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                Change address <ExternalLink className="size-3" />
              </button>
            </div>

            {/* Display ONLY the single selected active address card formatted in 3 lines */}
            {activeAddressObj && (() => {
              const lines = getAddressLines(activeAddressObj, deliveryAddress);

              return (
                <div className="flex items-start justify-between rounded-xl border border-sky-300 bg-white p-3.5 ring-2 ring-sky-500/10 shadow-xs">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="rounded-md bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        {activeAddressObj.label}
                      </span>
                      <span className="text-xs font-semibold text-slate-900">Selected Address</span>
                    </div>

                    {/* 1st line: Name */}
                    {lines.name && (
                      <p className="text-xs font-bold text-slate-900 leading-tight">
                        {lines.name}
                      </p>
                    )}

                    {/* 2nd line: Location */}
                    {lines.location && (
                      <p className="text-xs text-slate-700 font-medium leading-relaxed">
                        {lines.location}
                      </p>
                    )}

                    {/* 3rd line: Phone */}
                    {lines.phone && (
                      <p className="text-xs text-slate-500 font-medium leading-tight">
                        {lines.phone}
                      </p>
                    )}
                  </div>
                  <Check className="size-4 text-sky-600 font-bold shrink-0 ml-2 mt-0.5" />
                </div>
              );
            })()}

            {deliveryCheck && (
              <div className={`flex items-center gap-2 rounded-xl p-3 text-xs font-medium border ${
                deliveryCheck.isEligible
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}>
                <span>{deliveryCheck.message}</span>
              </div>
            )}
          </div>
        )}

        {fulfillmentMethod === 'delivery' && (
          <div className="flex justify-between text-sm">
            <span>Delivery fee</span>
            <span className="tabular-nums">Rs. {deliveryFee.toFixed(2)}</span>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="coupon_code">Coupon code</Label>
          {appliedCoupon ? (
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700">"{appliedCoupon.code}" applied</span>
                {discountAmount > 0 && (
                  <span className="text-xs font-semibold text-emerald-600">(-Rs. {discountAmount.toFixed(2)})</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleRemoveCoupon}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                id="coupon_code"
                value={couponInput}
                onChange={(e) => {
                  setCouponInput(e.target.value.toUpperCase());
                  if (couponError) setCouponError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleApplyCoupon())}
                placeholder="Enter coupon code"
                className="flex-1 uppercase placeholder:normal-case"
                disabled={isValidatingCoupon}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleApplyCoupon}
                disabled={!couponInput.trim() || isValidatingCoupon}
              >
                {isValidatingCoupon ? 'Checking…' : 'Apply'}
              </Button>
            </div>
          )}
          {couponError && (
            <p className="text-xs font-medium text-destructive text-center">
              {couponError}
            </p>
          )}
        </div>

        <Separator />
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Items subtotal</span>
            <span className="tabular-nums">Rs. {total.toFixed(2)}</span>
          </div>
          {appliedCoupon && discountAmount > 0 && (
            <div className="flex justify-between text-emerald-600 font-medium">
              <span>Coupon discount ({appliedCoupon.code})</span>
              <span className="tabular-nums">-Rs. {discountAmount.toFixed(2)}</span>
            </div>
          )}
          {fulfillmentMethod === 'delivery' && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery fee</span>
              <span className="tabular-nums">Rs. {deliveryFee.toFixed(2)}</span>
            </div>
          )}
          <Separator className="my-1" />
          <div className="flex justify-between items-baseline font-semibold text-base">
            <span>Total amount to pay</span>
            <span className="text-lg font-bold tabular-nums text-foreground">Rs. {amountToPay.toFixed(2)}</span>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">Payment method: Cash on delivery</p>
        <Button onClick={handlePlaceOrder} disabled={checkoutMutation.isPending || !canPlaceOrder}>
          {checkoutMutation.isPending ? 'Placing order…' : isDeliveryOutOfRange ? 'Outside delivery range' : 'Place order'}
        </Button>
      </div>

      {/* Change Address Selection Modal */}
      <Dialog open={showAddressModal} onOpenChange={setShowAddressModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
              <MapPin className="size-5 text-sky-600" /> Select Delivery Address
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Choose one of your saved delivery locations for this order.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2.5 my-2 max-h-[60vh] overflow-y-auto pr-1">
            {addressList.map((addr) => {
              const isSelected = activeAddressId === addr.id;
              const lines = getAddressLines(addr);

              return (
                <button
                  key={addr.id}
                  type="button"
                  onClick={() => {
                    handleSelectAddress(addr);
                    setShowAddressModal(false);
                  }}
                  className={`flex items-start justify-between text-left rounded-xl border p-3 text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'border-sky-500 bg-sky-50/50 ring-2 ring-sky-500/20 shadow-xs font-medium'
                      : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-col gap-1 pr-2 min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isSelected ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                        {addr.label}
                      </span>
                    </div>

                    {lines.name && (
                      <p className="text-xs font-bold text-slate-900 leading-tight">
                        {lines.name}
                      </p>
                    )}

                    {lines.location && (
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {lines.location}
                      </p>
                    )}

                    {lines.phone && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {lines.phone}
                      </p>
                    )}
                  </div>
                  {isSelected && <Check className="size-4 text-sky-600 font-bold shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 pt-3 gap-2">
            <Link
              to={`/${slug}/address`}
              onClick={() => setShowAddressModal(false)}
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-1"
            >
              + Add or manage saved addresses
            </Link>
            <Button variant="outline" size="sm" onClick={() => setShowAddressModal(false)} className="rounded-xl text-xs cursor-pointer">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

