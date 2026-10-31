import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Bike, CheckCircle2, CheckCheck, MapPin, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useRiderHome } from '@/features/rider/hooks/use-rider-queries';
import { shortOrderId } from '@/features/orders/lib/order-rules';

const STORAGE_KEY = 'easycart_rider_read_notifications';

function getStoredReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function storeReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

function formatRelativeTime(dateString: string) {
  try {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(dateString).toLocaleDateString();
  } catch {
    return 'Recently';
  }
}

export function RiderNotificationBell({ isApproved = true }: { isApproved?: boolean }) {
  const navigate = useNavigate();
  const { data: home } = useRiderHome(isApproved);
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(() => getStoredReadIds());

  const offers = home?.offers ?? [];
  const activeDeliveries = home?.active ?? [];

  const rawNotifications: Array<{
    id: string;
    link: string;
    created_at: string;
    title: string;
    message: string;
    icon: LucideIcon;
    tone: string;
    is_read: boolean;
  }> = [];

  activeDeliveries.forEach((activeDelivery) => {
    const id = `delivery_${activeDelivery.id}_${activeDelivery.stage ?? 'active'}`;
    const createdAt = activeDelivery.created_at || new Date().toISOString();
    rawNotifications.push({
      id,
      link: `/rider/orders/${activeDelivery.id}`,
      created_at: createdAt,
      title: `Active Delivery #${shortOrderId(activeDelivery.id)}`,
      message: activeDelivery.stage === 'to_pickup'
        ? `Pick up order at ${activeDelivery.store.name ?? 'Store'}`
        : `Deliver order to ${activeDelivery.delivery_address ?? 'Customer'}`,
      icon: MapPin,
      tone: 'bg-amber-100 text-amber-700',
      is_read: localReadIds.has(id)
    });
  });

  offers.forEach((offer) => {
    if (!offer || !offer.id) return;
    const id = `offer_${offer.id}`;
    const createdAt = offer.created_at || new Date().toISOString();
    const fee = typeof offer.delivery_fee === 'number' ? offer.delivery_fee : 0;
    rawNotifications.push({
      id,
      link: '/rider',
      created_at: createdAt,
      title: `New Order Offer #${shortOrderId(offer.id)}`,
      message: `Delivery fee: Rs. ${fee.toFixed(2)} · ${offer.store.name ?? 'Store'}`,
      icon: Bike,
      tone: 'bg-sky-100 text-sky-700',
      is_read: localReadIds.has(id)
    });
  });

  const unreadCount = rawNotifications.filter((n) => !n.is_read).length;

  function handleItemClick(n: typeof rawNotifications[0]) {
    if (!n.is_read) {
      setLocalReadIds((prev) => {
        const next = new Set(prev);
        next.add(n.id);
        storeReadIds(next);
        return next;
      });
    }
    navigate(n.link);
  }

  function handleMarkAll() {
    setLocalReadIds((prev) => {
      const next = new Set(prev);
      rawNotifications.forEach((n) => next.add(n.id));
      storeReadIds(next);
      return next;
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Rider notifications (${unreadCount} unread)`}
          className="relative flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-2xs hover:border-sky-300 hover:text-sky-700 focus:outline-none cursor-pointer"
        >
          <Bell className="size-4 text-slate-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex min-w-5 h-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0 rounded-2xl shadow-xl border-slate-200/90 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">Delivery Notifications</span>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                {unreadCount} new
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                All caught up
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-sky-600 hover:bg-sky-50 transition-colors cursor-pointer"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300">
          {!rawNotifications.length ? (
            <div className="p-6 text-center">
              <CheckCircle2 className="mx-auto size-8 text-emerald-500 mb-2" />
              <p className="text-sm font-medium text-slate-800">No delivery alerts!</p>
              <p className="text-xs text-slate-400 mt-0.5">New order offers and assignments will appear here.</p>
            </div>
          ) : (
            rawNotifications.map((n) => {
              const Icon = n.icon;
              return (
                <DropdownMenuItem
                  key={n.id}
                  onSelect={() => handleItemClick(n)}
                  className={`flex items-start gap-3 p-3.5 cursor-pointer transition-colors focus:bg-sky-50/90 focus:text-slate-900 focus:**:text-slate-900 hover:bg-sky-50/90 hover:text-slate-900 ${
                    !n.is_read ? 'bg-sky-50/50' : 'bg-white opacity-85'
                  }`}
                >
                  <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${n.tone}`}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold ${!n.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                        {n.title}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatRelativeTime(n.created_at)}
                      </span>
                    </div>
                    <p className={`mt-0.5 text-xs ${!n.is_read ? 'text-slate-800 font-semibold' : 'text-slate-500'}`}>
                      {n.message}
                    </p>
                  </div>
                  {!n.is_read && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-600" title="Unread" />
                  )}
                </DropdownMenuItem>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
