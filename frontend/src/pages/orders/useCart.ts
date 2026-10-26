import { useState } from "react";
import { resolveModifierPrice } from "./menuPricing";
import type { CartLine, CartLineModifier, Combo, MenuItem, MenuItemVariant } from "./posTypes";

function sumQuantities(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);

  function addOne(line: Omit<CartLine, "quantity">) {
    setLines((current) =>
      current.some((l) => l.key === line.key)
        ? current.map((l) => (l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l))
        : [...current, { ...line, quantity: 1 }]
    );
  }

  function addItem(item: MenuItem, variant: MenuItemVariant, modifierIds: string[]) {
    const modifiers: CartLineModifier[] = modifierIds.map((id) => {
      const modifier = item.modifiers.find((m) => m.id === id)!;
      return { modifierId: modifier.id, name: modifier.name, priceDelta: resolveModifierPrice(modifier, variant.id) };
    });
    const modifierTotal = modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
    addOne({
      key: `${variant.id}:${modifierIds.slice().sort().join(",")}`,
      variantId: variant.id,
      comboId: null,
      itemName: item.name,
      variantLabel: variant.label,
      unitPrice: variant.price + modifierTotal,
      modifiers,
    });
  }

  function addCombo(combo: Combo) {
    addOne({ key: `combo:${combo.id}`, variantId: null, comboId: combo.id, itemName: combo.name, variantLabel: "", unitPrice: combo.price, modifiers: [] });
  }

  function changeQuantity(key: string, delta: number) {
    setLines((current) =>
      current.map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0)
    );
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((l) => l.key !== key));
  }

  return {
    lines,
    subtotal: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    addItem,
    addCombo,
    changeQuantity,
    removeLine,
    clear: () => setLines([]),
    itemQuantity: (item: MenuItem) => sumQuantities(lines.filter((l) => item.variants.some((v) => v.id === l.variantId))),
    comboQuantity: (comboId: string) => sumQuantities(lines.filter((l) => l.comboId === comboId)),
  };
}

export type Cart = ReturnType<typeof useCart>;
