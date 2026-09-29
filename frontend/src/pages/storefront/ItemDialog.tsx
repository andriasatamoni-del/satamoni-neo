import { useEffect, useState } from "react";
import { Button } from "../../shared/ui/Button";
import type { StorefrontItem } from "./types";
import { money } from "./types";
import type { CartLine } from "./storefrontStorage";

// اختيار الحجم والإضافات والكمية - سعر الإضافة بيتغيّر حسب الحجم (سعر خاص بالحجم لو متحدد في المنيو)
export function ItemDialog({
  item,
  onClose,
  onAdd,
}: {
  item: StorefrontItem;
  onClose: () => void;
  onAdd: (line: Omit<CartLine, "key">) => void;
}) {
  const [variantId, setVariantId] = useState(item.variants[0].id);
  const [modifierIds, setModifierIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const variant = item.variants.find((v) => v.id === variantId)!;
  const chosen = item.modifiers.filter((m) => modifierIds.includes(m.id));
  const unitPrice = variant.price + chosen.reduce((sum, m) => sum + (m.prices[variantId] ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={item.name}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {item.imageUrl && <img src={item.imageUrl} alt="" className="mb-3 h-40 w-full rounded-xl object-cover" />}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{item.name}</h2>
            {item.description && <p className="mt-1 text-sm text-slate-500">{item.description}</p>}
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-slate-600" aria-label="إغلاق">
            ×
          </button>
        </div>

        {item.variants.length > 1 && (
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-semibold text-slate-700">الحجم</legend>
            <div className="grid grid-cols-2 gap-2">
              {item.variants.map((v) => (
                <label
                  key={v.id}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                    v.id === variantId ? "border-brand-500 bg-brand-50 font-semibold" : "border-slate-200"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="variant" checked={v.id === variantId} onChange={() => setVariantId(v.id)} />
                    {v.label}
                  </span>
                  <span>{money(v.price)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {item.modifiers.length > 0 && (
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-semibold text-slate-700">إضافات</legend>
            <div className="space-y-2">
              {item.modifiers.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={modifierIds.includes(m.id)}
                      onChange={(e) => setModifierIds((ids) => (e.target.checked ? [...ids, m.id] : ids.filter((id) => id !== m.id)))}
                    />
                    {m.name}
                  </span>
                  <span className="text-slate-500">+{money(m.prices[variantId] ?? 0)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="mt-5 flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-slate-300">
            <button className="px-3 py-2 text-lg" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="أقل">
              −
            </button>
            <span className="w-8 text-center font-bold" data-testid="dialog-quantity">
              {quantity}
            </span>
            <button className="px-3 py-2 text-lg" onClick={() => setQuantity((q) => Math.min(50, q + 1))} aria-label="أكتر">
              +
            </button>
          </div>
          <Button
            className="flex-1 justify-center py-2.5"
            data-testid="add-to-cart"
            onClick={() =>
              onAdd({
                kind: "item",
                refId: variantId,
                name: item.name,
                variantLabel: item.variants.length > 1 ? variant.label : null,
                modifierIds: chosen.map((m) => m.id),
                modifierNames: chosen.map((m) => m.name),
                unitPrice,
                quantity,
              })
            }
          >
            أضف للسلة · {money(unitPrice * quantity)}
          </Button>
        </div>
      </div>
    </div>
  );
}
