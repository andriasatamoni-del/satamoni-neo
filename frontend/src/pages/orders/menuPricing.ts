import { formatPrice } from "./posLabels";
import type { CartLine, MenuItem, MenuItemVariant, PriceMenu } from "./posTypes";

export interface SellableVariant extends MenuItemVariant { salePrice: number; }

export interface SellableAddon {
  menuItemId: string;
  variantId: string;
  name: string;
  salePrice: number;
}

export function sellableVariants(item: MenuItem, priceMenu: PriceMenu): SellableVariant[] {
  return item.variants.flatMap((variant) => {
    const salePrice = priceMenu === "talabat" ? variant.talabatPrice ?? null : variant.price;
    return salePrice === null ? [] : [{ ...variant, salePrice }];
  });
}

export function sellableAddons(addons: MenuItem[], priceMenu: PriceMenu): SellableAddon[] {
  return addons.flatMap((addon) => {
    if (!addon.isActive) return [];
    const [variant] = sellableVariants(addon, priceMenu);
    return variant ? [{ menuItemId: addon.id, variantId: variant.id, name: addon.name, salePrice: variant.salePrice }] : [];
  });
}

export function needsOptionPicker(item: MenuItem, priceMenu: PriceMenu): boolean {
  return sellableVariants(item, priceMenu).length > 1;
}

export function addonsPerUnit(line: CartLine): number {
  return line.addons.reduce((sum, a) => sum + a.quantity * a.unitPrice, 0);
}

export function cartLineTotal(line: CartLine): number {
  return (line.unitPrice + addonsPerUnit(line)) * line.quantity;
}

export function itemPriceLabel(item: MenuItem, priceMenu: PriceMenu): string {
  const variants = sellableVariants(item, priceMenu);
  if (variants.length === 0) return priceMenu === "talabat" ? "مالوش سعر طلبات" : "-ج";
  const minPrice = Math.min(...variants.map((v) => v.salePrice));
  return variants.length > 1 ? `من ${formatPrice(minPrice)}` : formatPrice(minPrice);
}
