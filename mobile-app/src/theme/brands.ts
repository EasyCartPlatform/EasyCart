// The colour themes a shop can pick. A theme changes only the brand colour (buttons, banner, tab bar, prices);
// the rest of the app keeps its calm greys and white cards, so every shop still feels like the same easy app.
export type ThemeId = 'sky' | 'emerald' | 'sunset' | 'violet' | 'rose' | 'teal';

export interface Brand {
  id: ThemeId;
  name: string;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  primaryTint: string;
  // Dark to light, for banners.
  gradient: [string, string, string];
}

export const BRANDS: Record<ThemeId, Brand> = {
  sky: { id: 'sky', name: 'Sky', primary: '#0284c7', primaryDark: '#0369a1', primarySoft: '#f0f9ff', primaryTint: '#e0f2fe', gradient: ['#0369a1', '#0284c7', '#38bdf8'] },
  emerald: { id: 'emerald', name: 'Emerald', primary: '#059669', primaryDark: '#047857', primarySoft: '#ecfdf5', primaryTint: '#d1fae5', gradient: ['#064e3b', '#059669', '#10b981'] },
  sunset: { id: 'sunset', name: 'Sunset', primary: '#ea580c', primaryDark: '#c2410c', primarySoft: '#fff7ed', primaryTint: '#ffedd5', gradient: ['#c2410c', '#ea580c', '#f97316'] },
  violet: { id: 'violet', name: 'Violet', primary: '#7c3aed', primaryDark: '#6d28d9', primarySoft: '#f5f3ff', primaryTint: '#ede9fe', gradient: ['#6d28d9', '#7c3aed', '#8b5cf6'] },
  rose: { id: 'rose', name: 'Rose', primary: '#e11d48', primaryDark: '#be123c', primarySoft: '#fff1f2', primaryTint: '#ffe4e6', gradient: ['#be123c', '#e11d48', '#f43f5e'] },
  teal: { id: 'teal', name: 'Teal', primary: '#0d9488', primaryDark: '#0f766e', primarySoft: '#f0fdfa', primaryTint: '#ccfbf1', gradient: ['#0f766e', '#0d9488', '#14b8a6'] }
};

export const THEME_IDS = Object.keys(BRANDS) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && value in BRANDS;
}

// "#0284c7" with 0.9 becomes "rgba(2,132,199,0.9)", for colour laid over a photo.
export function withAlpha(hex: string, alpha: number): string {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}
