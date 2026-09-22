import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select, Textarea } from "../shared/ui/Field";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Badge, StatusBadge } from "../shared/ui/Badge";
import { ShiftBanner } from "./orders/ShiftBanner";
import { ShiftReviewPanel } from "./orders/ShiftReviewPanel";
import { enqueueOrder, loadSnapshot, saveSnapshot } from "../shared/offline/db";
import { useOfflineSync } from "../shared/offline/useOfflineSync";

// وضع الكاشير الأوفلاين (OFFLINE) - بيجيب البيانات من الشبكة كالمعتاد، وبيحفظ آخر نسخة ناجحة في
// IndexedDB. لو الطلب فشل (أوفلاين)، بيرجّع آخر نسخة محفوظة بدل ما يوقف الصفحة تمامًا - الكاشير يقدر
// يفضل يشتغل بقائمة الطعام والفروع وطرق الدفع اللي كانت متاحة آخر مرة كان فيها نت.
async function offlineFallbackQuery<T>(path: string, snapshotKey: string): Promise<T> {
  try {
    const data = await apiRequest<T>(path);
    await saveSnapshot(snapshotKey, data);
    return data;
  } catch (err) {
    const cached = await loadSnapshot<T>(snapshotKey);
    if (cached) return cached;
    throw err;
  }
}

interface Branch { id: string; name: string; }
interface MenuCategory { id: string; name: string; displayOrder: number; menuGroup: "regular" | "fasting"; isActive: boolean; }
interface MenuItemVariant { id: string; label: string; price: number; talabatPrice: number | null; }
interface MenuItemModifierVariantPrice { variantId: string; priceDelta: number; }
interface MenuItemModifier {
  id: string;
  name: string;
  priceDelta: number;
  isActive: boolean;
  variantPrices: MenuItemModifierVariantPrice[];
}
interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isBest: boolean;
  isActive: boolean;
  variants: MenuItemVariant[];
  modifiers: MenuItemModifier[];
}
interface PaymentMethod { id: string; name: string; }
interface OrderLineModifier { modifierId: string | null; nameAtSale: string; priceAtSale: number; }
interface OrderLine { menuItemId: string; variantId: string; quantity: number; unitPrice: number; lineTotal: number; modifiers: OrderLineModifier[]; }
interface Order {
  id: string;
  branchId: string;
  orderType: string;
  tableNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  items: OrderLine[];
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  kitchenStatus: string;
  paymentMethodId: string | null;
}

interface CartLineModifier { modifierId: string; name: string; priceDelta: number; }
interface CartLine {
  key: string;
  variantId: string;
  itemName: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
  modifiers: CartLineModifier[];
}

function resolveModifierPrice(modifier: MenuItemModifier, variantId: string): number {
  const override = modifier.variantPrices.find((vp) => vp.variantId === variantId);
  return override ? override.priceDelta : modifier.priceDelta;
}

const STATUS_LABELS: Record<string, string> = {
  preparing: "بيتحضّر", out_for_delivery: "في الطريق", completed: "مكتمل", cancelled: "ملغي",
};

const ORDER_TYPES = [
  { value: "takeaway", label: "تيك أواي" },
  { value: "dinein", label: "صالة" },
  { value: "delivery", label: "دليفري" },
];

const MENU_GROUP_LABELS: Record<string, string> = { regular: "عادي", fasting: "صيامي" };

export function OrdersPage() {
  const queryClient = useQueryClient();
  const offlineSync = useOfflineSync();
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => offlineFallbackQuery<Branch[]>("/branches", "branches") });
  const categoriesQuery = useQuery({ queryKey: ["catalog", "categories"], queryFn: () => apiRequest<MenuCategory[]>("/catalog/categories") });
  const menuItemsQuery = useQuery({ queryKey: ["catalog", "items"], queryFn: () => offlineFallbackQuery<MenuItem[]>("/catalog/items", "catalog-items") });
  const paymentMethodsQuery = useQuery({
    queryKey: ["payment-control", "methods"],
    queryFn: () => offlineFallbackQuery<PaymentMethod[]>("/payment-control/payment-methods", "payment-methods"),
  });

  const [branchId, setBranchId] = useState("");
  const ordersQuery = useQuery({
    queryKey: ["orders", branchId],
    queryFn: () => apiRequest<Order[]>(`/orders${branchId ? `?branchId=${branchId}` : ""}`),
  });

  const [menuGroup, setMenuGroup] = useState<"all" | "regular" | "fasting">("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [pickerItem, setPickerItem] = useState<MenuItem | null>(null);
  const [pickerVariantId, setPickerVariantId] = useState<string | null>(null);
  const [pickerModifierIds, setPickerModifierIds] = useState<string[]>([]);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState("takeaway");
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [addressDetails, setAddressDetails] = useState("");
  const [discount, setDiscount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const categoriesById = useMemo(() => {
    const map = new Map<string, MenuCategory>();
    for (const c of categoriesQuery.data ?? []) map.set(c.id, c);
    return map;
  }, [categoriesQuery.data]);

  const activeCategories = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter((c) => c.isActive && (menuGroup === "all" || c.menuGroup === menuGroup))
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [categoriesQuery.data, menuGroup]
  );

  const hasFastingMenu = (categoriesQuery.data ?? []).some((c) => c.menuGroup === "fasting");

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (menuItemsQuery.data ?? []).filter((item) => {
      if (!item.isActive) return false;
      const category = categoriesById.get(item.categoryId);
      if (menuGroup !== "all" && category?.menuGroup !== menuGroup) return false;
      if (categoryId !== "all" && item.categoryId !== categoryId) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [menuItemsQuery.data, categoriesById, menuGroup, categoryId, search]);

  function addToCart(item: MenuItem, variant: MenuItemVariant, modifierIds: string[]) {
    const modifiers: CartLineModifier[] = modifierIds.map((id) => {
      const modifier = item.modifiers.find((m) => m.id === id)!;
      return { modifierId: modifier.id, name: modifier.name, priceDelta: resolveModifierPrice(modifier, variant.id) };
    });
    const modifierTotal = modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
    const key = `${variant.id}:${modifierIds.slice().sort().join(",")}`;
    setCart((lines) => {
      const existing = lines.find((l) => l.key === key);
      if (existing) {
        return lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...lines,
        { key, variantId: variant.id, itemName: item.name, variantLabel: variant.label, unitPrice: variant.price + modifierTotal, quantity: 1, modifiers },
      ];
    });
    setPickerItem(null);
  }

  function handleItemClick(item: MenuItem) {
    if (item.variants.length === 0) return;
    const activeModifiers = item.modifiers.filter((m) => m.isActive);
    if (item.variants.length === 1 && activeModifiers.length === 0) {
      addToCart(item, item.variants[0], []);
    } else {
      setPickerItem(item);
      setPickerVariantId(item.variants[0]?.id ?? null);
      setPickerModifierIds([]);
    }
  }

  function changeQuantity(key: string, delta: number) {
    setCart((lines) =>
      lines
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  function removeLine(key: string) {
    setCart((lines) => lines.filter((l) => l.key !== key));
  }

  const subtotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const discountNum = Number(discount) || 0;
  const total = Math.max(0, subtotal - discountNum);

  const createOrder = useMutation({
    // React Query بشكل افتراضي بيوقف تنفيذ الـmutation تمامًا وهو أوفلاين (networkMode: 'online')
    // ويأجّله لحد ما النت يرجع - ده بالظبط عكس اللي محتاجينه هنا: عايزين الكود يتنفّذ فورًا وهو
    // أوفلاين عشان يسجّل الطلب في الطابور المحلي بنفسه، مش ينتظر النت يرجع الأول
    networkMode: "always",
    mutationFn: async () => {
      const payload = {
        branchId,
        orderType,
        tableNumber: orderType === "dinein" && tableNumber ? tableNumber : undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        addressDetails: orderType === "delivery" && addressDetails ? addressDetails : undefined,
        items: cart.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          modifierIds: l.modifiers.length > 0 ? l.modifiers.map((m) => m.modifierId) : undefined,
        })),
        discount: discountNum > 0 ? discountNum : undefined,
        paymentMethodId: paymentMethodId || undefined,
        // معرّف بيتولّد هنا (مش في السيرفر) عشان لو الطلب اتسجّل في الطابور المحلي وبعدين اتزامن أكتر
        // من مرة (وضع الكاشير الأوفلاين)، السيرفر يقدر يتجاهل التكرار - راجع تعليق Order.clientRequestId
        clientRequestId: crypto.randomUUID(),
      };
      const cartSummary = cart.map((l) => `${l.itemName} × ${l.quantity}`).join("، ");

      if (!navigator.onLine) {
        await enqueueOrder({ clientRequestId: payload.clientRequestId, payload, summary: cartSummary, createdAt: Date.now() });
        return { queued: true as const };
      }
      try {
        await apiRequest("/orders", { method: "POST", body: payload });
        return { queued: false as const };
      } catch (err) {
        if (err instanceof ApiError) throw err;
        // فشل الطلب من غير رد من السيرفر (انقطاع شبكة فعلي، مش رفض) - نسجّله في الطابور المحلي
        await enqueueOrder({ clientRequestId: payload.clientRequestId, payload, summary: cartSummary, createdAt: Date.now() });
        return { queued: true as const };
      }
    },
    onSuccess: (result) => {
      setError(null);
      setCart([]);
      setTableNumber("");
      setCustomerName("");
      setCustomerPhone("");
      setAddressDetails("");
      setDiscount("");
      setPaymentMethodId("");
      if (!result.queued) {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
      }
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const completeOrder = useMutation({
    mutationFn: (id: string) => apiRequest(`/orders/${id}/status`, { method: "PATCH", body: { status: "completed" } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createOrder.mutate();
  }

  const variantLabel = (variantId: string) => {
    for (const item of menuItemsQuery.data ?? []) {
      const v = item.variants.find((v) => v.id === variantId);
      if (v) return `${item.name} (${v.label})`;
    }
    return variantId;
  };
  const orders = ordersQuery.data ?? [];

  return (
    <div>
      <PageHeader title="الطلبات (POS)" description="تسجيل ومتابعة طلبات البيع" />

      <ShiftBanner />
      <ShiftReviewPanel />

      {(!offlineSync.isOnline || offlineSync.pendingOrders.length > 0 || offlineSync.syncError) && (
        <div className={`mb-4 rounded-xl border p-3 text-sm ${!offlineSync.isOnline ? "border-amber-200 bg-amber-50" : "border-brand-200 bg-brand-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-slate-800">
              {!offlineSync.isOnline && "أنت غير متصل بالإنترنت - الطلبات هتتسجّل محليًا وتتزامن أول ما النت يرجع. "}
              {offlineSync.pendingOrders.length > 0 && `${offlineSync.pendingOrders.length} طلب في انتظار المزامنة.`}
            </div>
            {offlineSync.pendingOrders.length > 0 && (
              <Button size="sm" variant="secondary" onClick={offlineSync.syncNow} disabled={!offlineSync.isOnline || offlineSync.syncing}>
                {offlineSync.syncing ? "بتتزامن..." : "مزامنة الآن"}
              </Button>
            )}
          </div>
          {offlineSync.syncError && <p className="mt-1 text-red-700">{offlineSync.syncError}</p>}
          {offlineSync.pendingOrders.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
              {offlineSync.pendingOrders.map((o) => (
                <li key={o.clientRequestId}>{o.summary}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="الفرع">
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="max-w-[220px]">
            <option value="">كل الفروع</option>
            {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          {/* Category/item grid */}
          <Card>
            <CardBody>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input
                  placeholder="بحث عن صنف..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-[220px]"
                />
                {hasFastingMenu && (
                  <div className="flex gap-1">
                    {(["all", "regular", "fasting"] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => { setMenuGroup(g); setCategoryId("all"); }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          menuGroup === g ? "bg-brand-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {g === "all" ? "الكل" : MENU_GROUP_LABELS[g]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-4 flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
                <button
                  type="button"
                  onClick={() => setCategoryId("all")}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    categoryId === "all" ? "bg-brand-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  كل الأصناف
                </button>
                {activeCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(c.id)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                      categoryId === c.id ? "bg-brand-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {visibleItems.map((item) => {
                  const minPrice = item.variants.reduce((min, v) => Math.min(min, v.price), Infinity);
                  const inCartQty = cart
                    .filter((l) => item.variants.some((v) => v.id === l.variantId))
                    .reduce((sum, l) => sum + l.quantity, 0);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleItemClick(item)}
                      className="relative flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white p-3 text-start shadow-sm transition-colors hover:border-brand-400 hover:shadow-md"
                    >
                      {inCartQty > 0 && (
                        <span className="absolute end-2 top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">
                          {inCartQty}
                        </span>
                      )}
                      {item.isBest && <Badge tone="warning" className="mb-0.5">الأكثر طلبًا</Badge>}
                      <p className="text-sm font-bold text-slate-900">{item.name}</p>
                      <p className="text-sm font-semibold text-brand-700">
                        {item.variants.length > 1 ? `من ${minPrice}ج` : `${minPrice === Infinity ? "-" : minPrice}ج`}
                      </p>
                    </button>
                  );
                })}
                {visibleItems.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-slate-400">مفيش أصناف مطابقة</p>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Cart panel */}
          <Card className="h-fit lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle>السلة ({cart.length})</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {ORDER_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setOrderType(t.value)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                      orderType === t.value ? "bg-brand-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {orderType === "dinein" && (
                <Field label="رقم الترابيزة">
                  <Input value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} />
                </Field>
              )}
              {(orderType === "delivery" || orderType === "takeaway") && (
                <>
                  <Field label="اسم العميل (اختياري)">
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                  </Field>
                  <Field label="رقم الموبايل (اختياري)">
                    <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                  </Field>
                </>
              )}
              {orderType === "delivery" && (
                <Field label="العنوان">
                  <Textarea rows={2} value={addressDetails} onChange={(e) => setAddressDetails(e.target.value)} />
                </Field>
              )}

              <div className="max-h-64 space-y-2 overflow-y-auto border-t border-slate-100 pt-3">
                {cart.map((line) => (
                  <div key={line.key} className="flex items-center gap-2 text-sm">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">{line.itemName}</p>
                      {line.variantLabel && <p className="text-xs text-slate-400">{line.variantLabel}</p>}
                      {line.modifiers.length > 0 && (
                        <p className="text-xs text-brand-600">{line.modifiers.map((m) => m.name).join("، ")}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => changeQuantity(line.key, -1)} className="h-6 w-6 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">−</button>
                      <span className="w-5 text-center font-semibold">{line.quantity}</span>
                      <button type="button" onClick={() => changeQuantity(line.key, 1)} className="h-6 w-6 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">+</button>
                    </div>
                    <span className="w-14 text-end font-bold text-slate-900">{line.unitPrice * line.quantity}ج</span>
                    <button type="button" onClick={() => removeLine(line.key)} className="text-red-500 hover:text-red-700">×</button>
                  </div>
                ))}
                {cart.length === 0 && <p className="py-6 text-center text-sm text-slate-400">السلة فاضية</p>}
              </div>

              <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">الإجمالي الفرعي</span><span className="font-semibold">{subtotal}ج</span></div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">الخصم</span>
                  <Input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className="max-w-[100px] py-1 text-end" />
                </div>
                <div className="flex justify-between text-base font-bold text-slate-900"><span>الإجمالي</span><span>{total}ج</span></div>
              </div>

              <Field label="طريقة الدفع (اختياري)">
                <Select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
                  <option value="">- بدون -</option>
                  {paymentMethodsQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </Field>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

              <Button type="submit" className="w-full" disabled={createOrder.isPending || cart.length === 0 || !branchId}>
                {createOrder.isPending ? "بيتسجّل..." : "تسجيل الطلب"}
              </Button>
              {!branchId && <p className="text-center text-xs text-amber-600">اختار الفرع الأول</p>}
            </CardBody>
          </Card>
        </div>
      </form>

      {pickerItem && (() => {
        const activeModifiers = pickerItem.modifiers.filter((m) => m.isActive);
        const selectedVariant = pickerItem.variants.find((v) => v.id === pickerVariantId) ?? pickerItem.variants[0];
        const modifierTotal = pickerModifierIds.reduce((sum, id) => {
          const modifier = activeModifiers.find((m) => m.id === id);
          return modifier ? sum + resolveModifierPrice(modifier, selectedVariant.id) : sum;
        }, 0);
        const finalPrice = selectedVariant.price + modifierTotal;

        function toggleModifier(id: string) {
          setPickerModifierIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPickerItem(null)}>
            <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">{pickerItem.name}</h3>
                <button type="button" onClick={() => setPickerItem(null)} className="text-slate-400 hover:text-slate-700">×</button>
              </div>

              {pickerItem.variants.length > 1 && (
                <div className="mb-3 space-y-2">
                  {pickerItem.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setPickerVariantId(v.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                        selectedVariant.id === v.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-400"
                      }`}
                    >
                      <span>{v.label}</span>
                      <span className="text-brand-700">{v.price}ج</span>
                    </button>
                  ))}
                </div>
              )}

              {activeModifiers.length > 0 && (
                <div className="mb-3 space-y-1.5 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-500">إضافات</p>
                  {activeModifiers.map((m) => {
                    const price = resolveModifierPrice(m, selectedVariant.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-sm">
                        <input type="checkbox" checked={pickerModifierIds.includes(m.id)} onChange={() => toggleModifier(m.id)} />
                        <span className="flex-1">{m.name}</span>
                        <span className="text-slate-500">+{price}ج</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-sm font-semibold text-slate-500">السعر</span>
                <span className="text-lg font-bold text-brand-700">{finalPrice}ج</span>
              </div>
              <Button className="mt-3 w-full" onClick={() => addToCart(pickerItem, selectedVariant, pickerModifierIds)}>
                إضافة للسلة
              </Button>
            </div>
          </div>
        );
      })()}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>الطلبات الجارية ({orders.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>النوع</TH>
                <TH>الأصناف</TH>
                <TH>الإجمالي</TH>
                <TH>الحالة</TH>
                <TH>إجراء</TH>
              </TR>
            </THead>
            <TBody>
              {orders.map((o) => (
                <TR key={o.id}>
                  <TD><Badge tone="neutral">{ORDER_TYPES.find((t) => t.value === o.orderType)?.label ?? o.orderType}</Badge></TD>
                  <TD className="max-w-xs">{o.items.map((i) => `${variantLabel(i.variantId)} × ${i.quantity}`).join("، ")}</TD>
                  <TD className="font-bold text-slate-900">{o.total}ج</TD>
                  <TD><StatusBadge status={STATUS_LABELS[o.status] ?? o.status} /></TD>
                  <TD>
                    {o.status === "preparing" && (
                      <Button size="sm" variant="secondary" onClick={() => completeOrder.mutate(o.id)} disabled={completeOrder.isPending}>
                        إتمام
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {orders.length === 0 && <EmptyState>مفيش طلبات لسه</EmptyState>}
        </CardBody>
      </Card>
    </div>
  );
}
