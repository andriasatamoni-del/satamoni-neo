import { formatPrice } from "./posLabels";
import type { MenuItem, MenuItemModifier } from "./posTypes";

export function resolveModifierPrice(modifier: MenuItemModifier, variantId: string): number {
  const override = modifier.variantPrices.find((vp) => vp.variantId === variantId);
  return override ? override.priceDelta : modifier.priceDelta;
}

export function activeModifiersOf(item: MenuItem): MenuItemModifier[] {
  return item.modifiers.filter((m) => m.isActive);
}

export function needsOptionPicker(item: MenuItem): boolean {
  return item.variants.length > 1 || activeModifiersOf(item).length > 0;
}

export function itemPriceLabel(item: MenuItem): string {
  const minPrice = item.variants.reduce((min, v) => Math.min(min, v.price), Infinity);
  if (item.variants.length > 1) return `من ${formatPrice(minPrice)}`;
  return minPrice === Infinity ? "-ج" : formatPrice(minPrice);
}
