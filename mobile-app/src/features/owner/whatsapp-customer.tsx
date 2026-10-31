// One tap to tell the customer on WhatsApp where their order is, with the message already written.
import { Button } from '@/components/ui';
import { shortId } from '@/lib/format';
import { openWhatsApp, phoneFromAddress } from '@/lib/whatsapp';
import type { Order } from '@/types/order';

export function messageFor(order: Order, shop: string): string {
  const id = shortId(order.id);
  if (order.status === 'cancelled') return `Hello! Sorry, your order ${id} from ${shop} was cancelled.`;
  if (order.status === 'fulfilled') return `Hello! Your order ${id} from ${shop} was delivered. Thank you for shopping with us!`;
  if (order.fulfillment_status === 'dispatched') return `Hello! Your order ${id} from ${shop} is on the way.`;
  if (order.fulfillment_status === 'ready_for_pickup') return `Hello! Your order ${id} is ready. Please collect it from ${shop}.`;
  if (order.status === 'confirmed') return `Hello! Your order ${id} from ${shop} is confirmed and being packed.`;
  return `Hello! We received your order ${id} at ${shop}. We will confirm it shortly.`;
}

export function WhatsAppCustomerButton({ order, shop }: { order: Order; shop: string }) {
  const phone = phoneFromAddress(order.delivery_address);
  if (!phone) return null;
  return <Button variant="outline" icon="message-square" label="Message customer on WhatsApp" onPress={() => void openWhatsApp(messageFor(order, shop), phone)} />;
}
