import { useState } from "react";
import { Button } from "../../shared/ui/Button";
import { sellableVariants, type SellableVariant } from "./menuPricing";
import { formatPrice } from "./posLabels";
import type { MenuItem, PriceMenu } from "./posTypes";

export function ItemPickerDialog({
  item,
  priceMenu,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  priceMenu: PriceMenu;
  onAdd: (variant: SellableVariant) => void;
  onClose: () => void;
}) {
  const variants = sellableVariants(item, priceMenu);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? null);
  const selectedVariant = variants.find((v) => v.id === variantId) ?? variants[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{item.name}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">×</button>
        </div>

        {variants.length > 1 && (
          <div className="mb-3 space-y-2">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                  selectedVariant.id === v.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-400"
                }`}
              >
                <span>{v.label}</span>
                <span className="text-brand-700">{formatPrice(v.salePrice)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-sm font-semibold text-slate-500">السعر</span>
          <span className="text-lg font-bold text-brand-700">{formatPrice(selectedVariant.salePrice)}</span>
        </div>
        <Button className="mt-3 w-full" onClick={() => onAdd(selectedVariant)}>
          إضافة للسلة
        </Button>
      </div>
    </div>
  );
}
