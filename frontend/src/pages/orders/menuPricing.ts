import { formatPrice } from "./posLabels";
import type { MenuItem, MenuItemModifier, MenuItemVariant, PriceMenu } from "./posTypes";

export interface SellableVariant extends MenuItemVariant { salePrice: number; }

export function resolveModifierPrice(modifier: MenuItemModifier, variantId: string): number {
  const override = modifier.variantPrices.find((vp) => vp.variantId === variantId);
  return override ? override.priceDelta : modifier.priceDelta;
}

export function activeModifiersOf(item: MenuItem): MenuItemModifier[] {
  return item.modifiers.filter((m) => m.isActive);
}

export function sellableVariants(item: MenuItem, priceMenu: PriceMenu): SellableVariant[] {
  return item.variants.flatMap((variant) => {
    const salePrice = priceMenu === "talabat" ? variant.talabatPrice ?? null : variant.price;
    return salePrice === null ? [] : [{ ...variant, salePrice }];
  });
}

export function needsOptionPicker(item: MenuItem, priceMenu: PriceMenu): boolean {
  return sellableVariants(item, priceMenu).length > 1 || activeModifiersOf(item).length > 0;
}

export function itemPriceLabel(item: MenuItem, priceMenu: PriceMenu): string {
  const variants = sellableVariants(item, priceMenu);
  if (variants.length === 0) return priceMenu === "talabat" ? "مالوش سعر طلبات" : "-ج";
  const minPrice = Math.min(...variants.map((v) => v.salePrice));
  return variants.length > 1 ? `من ${formatPrice(minPrice)}` : formatPrice(minPrice);
}
