import { useState } from "react";
import { Button } from "../../shared/ui/Button";
import { sellableVariants, type SellableAddon, type SellableVariant } from "./menuPricing";
import { formatPrice } from "./posLabels";
import type { CartLineAddon, MenuItem, PriceMenu, RemovableIngredient } from "./posTypes";

export function ItemPickerDialog({
  item,
  priceMenu,
  addons,
  removableIngredientsOf,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  priceMenu: PriceMenu;
  addons: SellableAddon[];
  removableIngredientsOf: (variantId: string) => RemovableIngredient[];
  onAdd: (variant: SellableVariant, addons: CartLineAddon[], without: RemovableIngredient[]) => void;
  onClose: () => void;
}) {
  const variants = sellableVariants(item, priceMenu);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? null);
  const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>({});
  const [withoutIds, setWithoutIds] = useState<string[]>([]);
  const selectedVariant = variants.find((v) => v.id === variantId) ?? variants[0];
  const removable = removableIngredientsOf(selectedVariant.id);

  const chosenAddons: CartLineAddon[] = addons
    .filter((addon) => (addonQuantities[addon.variantId] ?? 0) > 0)
    .map((addon) => ({ variantId: addon.variantId, name: addon.name, quantity: addonQuantities[addon.variantId], unitPrice: addon.salePrice }));
  const total = selectedVariant.salePrice + chosenAddons.reduce((sum, addon) => sum + addon.quantity * addon.unitPrice, 0);

  function chooseVariant(id: string) {
    setVariantId(id);
    setWithoutIds([]);
  }

  function changeAddon(variantIdOfAddon: string, delta: number) {
    setAddonQuantities((current) => ({ ...current, [variantIdOfAddon]: Math.max(0, (current[variantIdOfAddon] ?? 0) + delta) }));
  }

  function toggleWithout(inventoryItemId: string) {
    setWithoutIds((current) => (current.includes(inventoryItemId) ? current.filter((id) => id !== inventoryItemId) : [...current, inventoryItemId]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">{item.name}</h3>
            {item.description && <p className="text-xs text-slate-500">{item.description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="text-xl text-slate-400 hover:text-slate-700">×</button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          {variants.length > 1 && (
            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-700">الحجم</h4>
              <div className="grid grid-cols-2 gap-2">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => chooseVariant(v.id)}
                    aria-pressed={selectedVariant.id === v.id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                      selectedVariant.id === v.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-400"
                    }`}
                  >
                    <span>{v.label}</span>
                    <span className="text-brand-700">{formatPrice(v.salePrice)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {addons.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-700">الإضافات</h4>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {addons.map((addon) => {
                  const quantity = addonQuantities[addon.variantId] ?? 0;
                  return (
                    <div
                      key={addon.variantId}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${quantity > 0 ? "border-brand-400 bg-brand-50" : "border-slate-200"}`}
                    >
                      <button type="button" onClick={() => changeAddon(addon.variantId, 1)} className="flex-1 text-start">
                        <span className="font-semibold text-slate-800">{addon.name}</span>
                        <span className="ms-1 text-xs text-brand-700">+{formatPrice(addon.salePrice)}</span>
                      </button>
                      {quantity > 0 && (
                        <div className="flex items-center gap-1">
                          <StepButton label={`قلل ${addon.name}`} onClick={() => changeAddon(addon.variantId, -1)}>−</StepButton>
                          <span className="w-4 text-center text-xs font-bold">{quantity}</span>
                          <StepButton label={`زوّد ${addon.name}`} onClick={() => changeAddon(addon.variantId, 1)}>+</StepButton>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {removable.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-700">بدون</h4>
              <div className="flex flex-wrap gap-1.5">
                {removable.map((ingredient) => {
                  const removed = withoutIds.includes(ingredient.inventoryItemId);
                  return (
                    <button
                      key={ingredient.inventoryItemId}
                      type="button"
                      aria-pressed={removed}
                      onClick={() => toggleWithout(ingredient.inventoryItemId)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                        removed ? "border-red-300 bg-red-50 text-red-700 line-through" : "border-slate-200 text-slate-600 hover:border-red-300"
                      }`}
                    >
                      {removed ? `بدون ${ingredient.name}` : ingredient.name}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">الإجمالي</span>
            <span className="text-lg font-bold text-brand-700">{formatPrice(total)}</span>
          </div>
          <Button
            className="w-full"
            onClick={() => onAdd(selectedVariant, chosenAddons, removable.filter((ingredient) => withoutIds.includes(ingredient.inventoryItemId)))}
          >
            إضافة للسلة
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="h-6 w-6 rounded-md bg-white text-slate-600 shadow-sm hover:bg-slate-100">
      {children}
    </button>
  );
}
