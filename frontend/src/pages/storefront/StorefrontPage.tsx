import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { customerApiRequest } from "../../shared/api/customerClient";
import { StorefrontShell, useStorefrontCustomer } from "./StorefrontShell";
import { ItemDialog } from "./ItemDialog";
import { CheckoutPanel } from "./CheckoutPanel";
import type { StorefrontCombo, StorefrontItem, StorefrontMenu } from "./types";
import { money } from "./types";
import { loadCart, saveCart, type CartLine } from "./storefrontStorage";

// موقع الطلب أونلاين (STORE-1) - نفس public/order.html في الريبو القديم: منيو بالأقسام والإضافات، سلة،
// دخول اختياري بعناوين محفوظة، توصيل/استلام/صالة (QR: ?branch=<id>&table=<رقم>)، كاش عند الاستلام، وتتبّع.
// صفحة عامة بالكامل - مفيش AppShell ولا توكن موظف (راجع App.tsx)
export function StorefrontPage() {
  const [params] = useSearchParams();
  const customer = useStorefrontCustomer();
  const menuQuery = useQuery({
    queryKey: ["storefront", "menu"],
    queryFn: () => customerApiRequest<StorefrontMenu>("/storefront/menu"),
    staleTime: 60_000,
  });

  const [cart, setCartState] = useState<CartLine[]>(loadCart);
  const setCart = (lines: CartLine[]) => {
    setCartState(lines);
    saveCart(lines);
  };
  const [selected, setSelected] = useState<StorefrontItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  const menu = menuQuery.data;

  // أصناف اتشالت من المنيو من ساعة ما اتحطت في السلة (السلة محفوظة على الجهاز) - بتتشال لوحدها
  useEffect(() => {
    if (!menu) return;
    const variants = new Set(menu.categories.flatMap((c) => c.items.flatMap((i) => i.variants.map((v) => v.id))));
    const combos = new Set(menu.combos.map((c) => c.id));
    const valid = cart.filter((l) => (l.kind === "combo" ? combos.has(l.refId) : variants.has(l.refId)));
    if (valid.length !== cart.length) setCart(valid);
  }, [menu]); // eslint-disable-line react-hooks/exhaustive-deps

  const bestSellers = useMemo(() => menu?.categories.flatMap((c) => c.items).filter((i) => i.isBest) ?? [], [menu]);
  const visibleCategories = useMemo(() => {
    if (!menu) return [];
    const term = search.trim().toLowerCase();
    return menu.categories
      .filter((c) => activeCategory === "all" || (c.id ?? "none") === activeCategory)
      .map((c) => ({ ...c, items: term ? c.items.filter((i) => i.name.toLowerCase().includes(term)) : c.items }))
      .filter((c) => c.items.length > 0);
  }, [menu, activeCategory, search]);

  function addLine(line: Omit<CartLine, "key">) {
    const key = `${line.kind}:${line.refId}:${[...line.modifierIds].sort().join(",")}`;
    const existing = cart.find((l) => l.key === key);
    setCart(
      existing
        ? cart.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l))
        : [...cart, { ...line, key }]
    );
  }

  function addCombo(combo: StorefrontCombo) {
    addLine({ kind: "combo", refId: combo.id, name: combo.name, variantLabel: null, modifierIds: [], modifierNames: [], unitPrice: combo.price, quantity: 1 });
  }

  const count = cart.reduce((sum, l) => sum + l.quantity, 0);
  const total = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  if (menuQuery.isLoading) {
    return (
      <StorefrontShell>
        <p className="py-20 text-center text-slate-400">بيتم تحميل المنيو...</p>
      </StorefrontShell>
    );
  }
  if (!menu) {
    return (
      <StorefrontShell>
        <p className="py-20 text-center text-red-600">مقدرناش نحمّل المنيو - جرّب تاني بعد شوية</p>
      </StorefrontShell>
    );
  }

  return (
    <StorefrontShell>
      {!menu.orderingEnabled && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="ordering-closed">
          الطلب أونلاين مقفول حاليًا - تقدر تتفرج على المنيو، وللطلب كلّمنا على تليفون الفرع
          {menu.branches.find((b) => b.phone)?.phone && (
            <>
              {" "}
              <a href={`tel:${menu.branches.find((b) => b.phone)!.phone}`} className="font-bold underline" dir="ltr">
                {menu.branches.find((b) => b.phone)!.phone}
              </a>
            </>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="دوّر على صنف..."
            className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
          />
          <div className="sticky top-[57px] z-20 -mx-4 mb-4 flex gap-2 overflow-x-auto bg-slate-50/95 px-4 py-2">
            {[{ id: "all", name: "الكل" }, ...menu.categories.map((c) => ({ id: c.id ?? "none", name: c.name }))].map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${
                  activeCategory === c.id ? "bg-brand-600 text-white" : "bg-white text-slate-600 shadow-sm"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {activeCategory === "all" && !search && menu.combos.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 text-lg font-bold text-slate-900">العروض</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {menu.combos.map((combo) => (
                  <div key={combo.id} className="rounded-xl border border-brand-200 bg-gradient-to-l from-brand-50 to-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-slate-900">{combo.name}</h3>
                      <span className="shrink-0 font-bold text-brand-700">{money(combo.price)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {combo.items.map((i) => `${i.quantity}× ${i.itemName} ${i.variantLabel}`).join(" + ")}
                    </p>
                    <button onClick={() => addCombo(combo)} className="mt-3 text-sm font-semibold text-brand-600" data-testid={`add-combo-${combo.name}`}>
                      + أضف للسلة
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeCategory === "all" && !search && bestSellers.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 text-lg font-bold text-slate-900">الأكثر طلبًا ⭐</h2>
              <ItemGrid items={bestSellers} onSelect={setSelected} />
            </section>
          )}

          {visibleCategories.map((category) => (
            <section key={category.id ?? "none"} className="mb-6">
              <h2 className="mb-3 text-lg font-bold text-slate-900">{category.name}</h2>
              <ItemGrid items={category.items} onSelect={setSelected} />
            </section>
          ))}
          {visibleCategories.length === 0 && <p className="py-10 text-center text-sm text-slate-400">مفيش أصناف مطابقة</p>}
        </div>

        <aside className="lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:self-start lg:overflow-y-auto">
          <CheckoutPanel
            menu={menu}
            cart={cart}
            setCart={setCart}
            customer={customer}
            initialBranchId={params.get("branch")}
            initialTable={params.get("table")}
          />
        </aside>
      </div>

      {count > 0 && (
        <a
          href="#checkout"
          className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-xl bg-brand-600 px-5 py-3 font-bold text-white shadow-lg lg:hidden"
          data-testid="mobile-cart-bar"
        >
          <span>السلة ({count})</span>
          <span>{money(total)}</span>
        </a>
      )}

      {selected && (
        <ItemDialog
          item={selected}
          onClose={() => setSelected(null)}
          onAdd={(line) => {
            addLine(line);
            setSelected(null);
          }}
        />
      )}
    </StorefrontShell>
  );
}

function ItemGrid({ items, onSelect }: { items: StorefrontItem[]; onSelect: (item: StorefrontItem) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const minPrice = Math.min(...item.variants.map((v) => v.price));
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 text-right shadow-sm transition hover:border-brand-300 hover:shadow"
            data-testid={`menu-item-${item.name}`}
          >
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" loading="lazy" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-2xl">🍽️</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900">{item.name}</p>
              {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description}</p>}
              <p className="mt-1 text-sm font-semibold text-brand-700">
                {item.variants.length > 1 ? `من ${money(minPrice)}` : money(minPrice)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
