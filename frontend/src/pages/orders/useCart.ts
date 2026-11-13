import { useRef, useState } from "react";
import { cartLineTotal, type SellableAddon, type SellableVariant } from "./menuPricing";
import type { CartLine, CartLineAddon, Combo, MenuItem, RemovableIngredient } from "./posTypes";

function sumQuantities(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const nextLineNumber = useRef(0);

  function newKey(): string {
    nextLineNumber.current += 1;
    return `line-${nextLineNumber.current}`;
  }

  function addItem(item: MenuItem, variant: SellableVariant, addons: CartLineAddon[] = [], without: RemovableIngredient[] = []) {
    const plain = addons.length === 0 && without.length === 0;
    const mergeInto = plain ? lines.find((l) => l.variantId === variant.id && l.addons.length === 0 && l.without.length === 0) : undefined;
    if (mergeInto) {
      setLines((current) => current.map((l) => (l.key === mergeInto.key ? { ...l, quantity: l.quantity + 1 } : l)));
      setSelectedKey(null);
      return;
    }
    const key = newKey();
    setLines((current) => [
      ...current,
      { key, variantId: variant.id, comboId: null, itemName: item.name, variantLabel: variant.label, unitPrice: variant.salePrice, quantity: 1, addons, without },
    ]);
    setSelectedKey(null);
  }

  function addCombo(combo: Combo) {
    const key = `combo:${combo.id}`;
    setLines((current) =>
      current.some((l) => l.key === key)
        ? current.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l))
        : [...current, { key, variantId: null, comboId: combo.id, itemName: combo.name, variantLabel: "", unitPrice: combo.price, quantity: 1, addons: [], without: [] }]
    );
    setSelectedKey(null);
  }

  function addAddon(lineKey: string, addon: SellableAddon) {
    setLines((current) =>
      current.map((l) => {
        if (l.key !== lineKey || l.comboId) return l;
        const existing = l.addons.find((a) => a.variantId === addon.variantId);
        const addons = existing
          ? l.addons.map((a) => (a.variantId === addon.variantId ? { ...a, quantity: a.quantity + 1 } : a))
          : [...l.addons, { variantId: addon.variantId, name: addon.name, quantity: 1, unitPrice: addon.salePrice }];
        return { ...l, addons };
      })
    );
  }

  function toggleWithout(lineKey: string, ingredient: RemovableIngredient) {
    setLines((current) =>
      current.map((l) => {
        if (l.key !== lineKey || l.comboId) return l;
        const removed = l.without.some((w) => w.inventoryItemId === ingredient.inventoryItemId);
        return { ...l, without: removed ? l.without.filter((w) => w.inventoryItemId !== ingredient.inventoryItemId) : [...l.without, ingredient] };
      })
    );
  }

  function changeAddonQuantity(lineKey: string, variantId: string, delta: number) {
    setLines((current) =>
      current.map((l) =>
        l.key === lineKey
          ? { ...l, addons: l.addons.map((a) => (a.variantId === variantId ? { ...a, quantity: a.quantity + delta } : a)).filter((a) => a.quantity > 0) }
          : l
      )
    );
  }

  function changeQuantity(key: string, delta: number) {
    const line = lines.find((l) => l.key === key);
    if (line && line.quantity + delta <= 0 && selectedKey === key) setSelectedKey(null);
    setLines((current) => current.map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0));
  }

  function removeLine(key: string) {
    if (selectedKey === key) setSelectedKey(null);
    setLines((current) => current.filter((l) => l.key !== key));
  }

  function selectLine(key: string | null) {
    const line = lines.find((l) => l.key === key);
    setSelectedKey(line && !line.comboId ? line.key : null);
  }

  const selectedLine = lines.find((l) => l.key === selectedKey && !l.comboId) ?? null;

  return {
    lines,
    selectedLine,
    subtotal: lines.reduce((sum, l) => sum + cartLineTotal(l), 0),
    addItem,
    addCombo,
    addAddon,
    toggleWithout,
    changeAddonQuantity,
    changeQuantity,
    removeLine,
    selectLine,
    clear: () => {
      setLines([]);
      setSelectedKey(null);
    },
    itemQuantity: (item: MenuItem) => sumQuantities(lines.filter((l) => item.variants.some((v) => v.id === l.variantId))),
    comboQuantity: (comboId: string) => sumQuantities(lines.filter((l) => l.comboId === comboId)),
    addonQuantity: (variantId: string) => selectedLine?.addons.find((a) => a.variantId === variantId)?.quantity ?? 0,
  };
}

export type Cart = ReturnType<typeof useCart>;
