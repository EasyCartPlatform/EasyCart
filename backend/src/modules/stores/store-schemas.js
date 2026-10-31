// Zod schema for validating store settings updates.
import { z } from 'zod';

export const store_settings_schema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    logo_url: z.union([z.string(), z.null()]).optional(),
    banner_url: z.union([z.string(), z.null()]).optional(),
    theme: z.enum(['default', 'light', 'dark']).optional(),
    delivery_fee: z.number().min(0).optional(),
    promotion_banner_text: z.string().trim().max(2000).nullable().optional(),
    max_delivery_radius_km: z.number().min(0).max(100).optional(),
    pincode: z.string().trim().max(10).nullable().optional(),
    // Where riders collect orders from; used to offer each delivery to the nearest rider.
    address: z.string().trim().max(200).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional()
  })
  .partial()
  .refine((data) => (data.latitude === undefined) === (data.longitude === undefined), {
    message: 'Latitude and longitude must be set together',
    path: ['latitude']
  });

export function validate_store_settings_input(data) {
  return store_settings_schema.safeParse(data);
}
