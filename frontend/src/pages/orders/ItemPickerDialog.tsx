import { useState } from "react";
import { Button } from "../../shared/ui/Button";
import { activeModifiersOf, resolveModifierPrice } from "./menuPricing";
import { formatPrice } from "./posLabels";
import type { MenuItem, MenuItemVariant } from "./posTypes";

export function ItemPickerDialog({
  item,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  onAdd: (variant: MenuItemVariant, modifierIds: string[]) => void;
  onClose: () => void;
}) {
  const [variantId, setVariantId] = useState(item.variants[0]?.id ?? null);
  const [modifierIds, setModifierIds] = useState<string[]>([]);

  const activeModifiers = activeModifiersOf(item);
  const selectedVariant = item.variants.find((v) => v.id === variantId) ?? item.variants[0];
  const modifierTotal = activeModifiers
    .filter((m) => modifierIds.includes(m.id))
    .reduce((sum, m) => sum + resolveModifierPrice(m, selectedVariant.id), 0);

  function toggleModifier(id: string) {
    setModifierIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{item.name}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">×</button>
        </div>

        {item.variants.length > 1 && (
          <div className="mb-3 space-y-2">
            {item.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                  selectedVariant.id === v.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-400"
                }`}
              >
                <span>{v.label}</span>
                <span className="text-brand-700">{formatPrice(v.price)}</span>
              </button>
            ))}
          </div>
        )}

        {activeModifiers.length > 0 && (
          <div className="mb-3 space-y-1.5 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-500">إضافات</p>
            {activeModifiers.map((m) => (
              <label key={m.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-sm">
                <input type="checkbox" checked={modifierIds.includes(m.id)} onChange={() => toggleModifier(m.id)} />
                <span className="flex-1">{m.name}</span>
                <span className="text-slate-500">+{formatPrice(resolveModifierPrice(m, selectedVariant.id))}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-sm font-semibold text-slate-500">السعر</span>
          <span className="text-lg font-bold text-brand-700">{formatPrice(selectedVariant.price + modifierTotal)}</span>
        </div>
        <Button className="mt-3 w-full" onClick={() => onAdd(selectedVariant, modifierIds)}>
          إضافة للسلة
        </Button>
      </div>
    </div>
  );
}
