import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerApiRequest, CustomerApiError, setCustomerToken } from "../../shared/api/customerClient";
import { Button } from "../../shared/ui/Button";
import { Field, Input, Select, Textarea } from "../../shared/ui/Field";
import type { CustomerProfile } from "./StorefrontShell";
import type { LoyaltyReward, StorefrontBranch, StorefrontMenu } from "./types";
import { money, ORDER_TYPE_LABELS } from "./types";
import { loadLastBranch, newRequestId, rememberBranch, rememberOrder, type CartLine } from "./storefrontStorage";

interface SavedAddress {
  id: string;
  label: string | null;
  addressDetails: string;
  isDefault: boolean;
}

interface PlacedOrder {
  orderId: string;
  trackingToken: string;
  total: number;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// السلة + تأكيد الطلب. الحساب إلزامي (STORE-2): العميل المسجّل مابيكتبش أي بيانات - اسمه وتليفوناته
// وعنوانه الافتراضي جاهزين، والطلب بضغطة واحدة (وممكن يختار مكافأة بنقاطه)
export function CheckoutPanel({
  menu,
  cart,
  setCart,
  customer,
  initialBranchId,
  initialTable,
}: {
  menu: StorefrontMenu;
  cart: CartLine[];
  setCart: (lines: CartLine[]) => void;
  customer: CustomerProfile | null;
  initialBranchId: string | null;
  initialTable: string | null;
}) {
  const total = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  function updateQuantity(key: string, delta: number) {
    setCart(
      cart
        .map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  return (
    <div className="space-y-4" id="checkout">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="cart">
        <h2 className="mb-3 text-base font-bold text-slate-900">السلة</h2>
        {cart.length === 0 ? (
          <p className="text-sm text-slate-400">السلة فاضية - اختار من المنيو</p>
        ) : (
          <ul className="space-y-3">
            {cart.map((l) => (
              <li key={l.key} className="flex items-start justify-between gap-2 text-sm">
                <div>
                  <p className="font-semibold text-slate-800">
                    {l.name}
                    {l.variantLabel && <span className="text-slate-500"> · {l.variantLabel}</span>}
                  </p>
                  {l.modifierNames.length > 0 && <p className="text-xs text-slate-500">+ {l.modifierNames.join("، ")}</p>}
                  <p className="text-xs text-slate-500">{money(l.unitPrice * l.quantity)}</p>
                </div>
                <div className="flex items-center rounded-lg border border-slate-200">
                  <button className="px-2 py-1" onClick={() => updateQuantity(l.key, -1)} aria-label={`أقل ${l.name}`}>
                    −
                  </button>
                  <span className="w-6 text-center font-bold">{l.quantity}</span>
                  <button className="px-2 py-1" onClick={() => updateQuantity(l.key, 1)} aria-label={`أكتر ${l.name}`}>
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-base font-bold">
          <span>الإجمالي</span>
          <span data-testid="cart-total">{money(total)}</span>
        </div>
      </section>

      {!customer ? (
        <section className="space-y-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-center" data-testid="login-required">
          <p className="font-bold text-slate-900">عشان تطلب، ادخل بحسابك</p>
          <p className="text-sm text-slate-600">بتسجّل مرة واحدة ببياناتك وعنوانك، وبعد كده تطلب بضغطة{menu.loyalty.pointsPerEgp > 0 ? " وتجمع نقاط على كل طلب" : ""}.</p>
          <div className="flex gap-2">
            <Link to="/portal/register?next=/order" className="flex-1 rounded-lg bg-brand-600 px-3 py-2.5 font-bold text-white">
              حساب جديد
            </Link>
            <Link to="/portal/login?next=/order" className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-semibold text-slate-700">
              دخول
            </Link>
          </div>
        </section>
      ) : customer.missingProfileFields.length > 0 ? (
        <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center" data-testid="complete-profile-cta">
          <p className="font-bold text-amber-900">كمّل بياناتك مرة واحدة الأول</p>
          <Link to="/portal/me" className="inline-block rounded-lg bg-amber-500 px-4 py-2 font-bold text-white">
            كمّل بياناتي
          </Link>
        </section>
      ) : (
        <OrderForm menu={menu} cart={cart} setCart={setCart} customer={customer} total={total} initialBranchId={initialBranchId} initialTable={initialTable} />
      )}
    </div>
  );
}

function OrderForm({
  menu,
  cart,
  setCart,
  customer,
  total,
  initialBranchId,
  initialTable,
}: {
  menu: StorefrontMenu;
  cart: CartLine[];
  setCart: (lines: CartLine[]) => void;
  customer: CustomerProfile;
  total: number;
  initialBranchId: string | null;
  initialTable: string | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const branches = menu.branches;
  const pickBranch = (id: string | null) => (id && branches.some((b) => b.id === id) ? id : null);

  const [branchId, setBranchId] = useState(pickBranch(initialBranchId) ?? pickBranch(loadLastBranch()) ?? (branches.length === 1 ? branches[0].id : ""));
  const branch: StorefrontBranch | undefined = branches.find((b) => b.id === branchId);
  const [orderType, setOrderType] = useState(initialTable ? "dinein" : "delivery");
  const [addressId, setAddressId] = useState("");
  const [table, setTable] = useState(initialTable ?? "");
  const [notes, setNotes] = useState("");
  const [rewardId, setRewardId] = useState("");
  const [locating, setLocating] = useState<string | null>(null);
  // نفس المعرّف لحد ما الطلب ينجح - لو داس مرتين أو النت فصل بعد الإرسال، السيرفر بيرجّع نفس الطلب
  const requestId = useRef(newRequestId());

  const addressesQuery = useQuery({
    queryKey: ["storefront", "addresses"],
    queryFn: () => customerApiRequest<SavedAddress[]>("/customer-auth/me/addresses"),
  });
  const loyaltyQuery = useQuery({
    queryKey: ["storefront", "loyalty"],
    queryFn: () => customerApiRequest<{ balance: number; rewards: LoyaltyReward[] }>("/loyalty/me"),
  });
  useEffect(() => {
    const addresses = addressesQuery.data ?? [];
    if (!addresses.some((a) => a.id === addressId)) setAddressId((addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? "");
  }, [addressesQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const availableTypes = useMemo(() => ["delivery", "takeaway", ...(branch?.supportsDineIn ? ["dinein"] : [])], [branch]);
  useEffect(() => {
    if (!availableTypes.includes(orderType)) setOrderType("delivery");
  }, [availableTypes, orderType]);

  const locatable = branches.filter((b) => b.lat !== null && b.lng !== null);
  function findNearest() {
    if (!navigator.geolocation) return setLocating("المتصفح مش بيدعم تحديد المكان");
    setLocating("بنحدد مكانك...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const nearest = [...locatable].sort(
          (a, b) => distanceKm(here, { lat: a.lat!, lng: a.lng! }) - distanceKm(here, { lat: b.lat!, lng: b.lng! })
        )[0];
        setBranchId(nearest.id);
        setLocating(`أقرب فرع: ${nearest.name} (${distanceKm(here, { lat: nearest.lat!, lng: nearest.lng! }).toFixed(1)} كم)`);
      },
      () => setLocating("مقدرناش نحدد مكانك - اختار الفرع بنفسك")
    );
  }

  const rewards = (loyaltyQuery.data?.rewards ?? []).filter((r) => r.affordable);
  const reward = rewards.find((r) => r.id === rewardId);
  // تقدير للعرض بس - السيرفر بيحسب الخصم الحقيقي. الهدية بتتضاف ببلاش، والخصم مايعديش الطلب
  const discount = reward ? (reward.kind === "discount" ? Math.min(reward.value ?? 0, total) : 0) : 0;
  const finalTotal = total - discount;

  const placeMutation = useMutation({
    mutationFn: () =>
      customerApiRequest<PlacedOrder>("/storefront/orders", {
        method: "POST",
        body: {
          clientRequestId: requestId.current,
          branchId,
          orderType,
          addressId: orderType === "delivery" ? addressId : undefined,
          tableNumber: orderType === "dinein" ? table : undefined,
          notes: notes || undefined,
          rewardId: rewardId || undefined,
          items: cart.map((l) =>
            l.kind === "combo" ? { comboId: l.refId, quantity: l.quantity } : { variantId: l.refId, quantity: l.quantity, modifierIds: l.modifierIds }
          ),
        },
      }),
    onSuccess: (placed) => {
      rememberOrder({ id: placed.orderId, token: placed.trackingToken, total: placed.total, createdAt: new Date().toISOString() });
      rememberBranch(branchId);
      requestId.current = newRequestId();
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ["storefront"] });
      navigate(`/order/track/${placed.orderId}?token=${placed.trackingToken}`);
    },
    onError: (err) => {
      if (err instanceof CustomerApiError && err.status === 401) {
        setCustomerToken(null);
        queryClient.invalidateQueries({ queryKey: ["storefront", "customer"] });
      }
    },
  });

  const addresses = addressesQuery.data ?? [];
  const canSubmit =
    menu.orderingEnabled && cart.length > 0 && !!branchId && (orderType !== "delivery" || !!addressId) && (orderType !== "dinein" || !!table.trim());

  return (
    <form
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        placeMutation.mutate();
      }}
    >
      <p className="text-xs text-slate-500">
        الطلب باسم <b className="text-slate-700">{customer.name}</b> · <span dir="ltr">{customer.phone}</span>
      </p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="نوع الطلب">
        {availableTypes.map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={orderType === type}
            onClick={() => setOrderType(type)}
            className={`rounded-lg border px-2 py-2 text-sm font-semibold ${
              orderType === type ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"
            }`}
          >
            {ORDER_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {orderType === "delivery" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">التوصيل على</span>
            <Link to="/portal/me" className="text-xs font-semibold text-brand-600">
              + عنوان تاني
            </Link>
          </div>
          {addresses.map((a) => (
            <label
              key={a.id}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${a.id === addressId ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}
              data-testid="address-option"
            >
              <input type="radio" name="address" className="mt-1" checked={a.id === addressId} onChange={() => setAddressId(a.id)} />
              <span>
                {a.label && <b className="block">{a.label}</b>}
                <span className="text-slate-600">{a.addressDetails}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      <Field label="الفرع">
        <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} required data-testid="branch-select">
          <option value="">اختار الفرع</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      {locatable.length > 1 && (
        <button type="button" onClick={findNearest} className="text-xs font-semibold text-brand-600">
          📍 اختار أقرب فرع ليا
        </button>
      )}
      {locating && <p className="text-xs text-slate-500">{locating}</p>}

      {orderType === "dinein" && (
        <Field label="رقم الترابيزة">
          <Input value={table} onChange={(e) => setTable(e.target.value)} required maxLength={10} />
        </Field>
      )}

      {rewards.length > 0 && (
        <div className="space-y-2 rounded-lg bg-amber-50 p-3" data-testid="rewards-picker">
          <p className="text-sm font-bold text-amber-900">⭐ استخدم نقاطك (رصيدك {loyaltyQuery.data?.balance})</p>
          <div className="flex flex-wrap gap-2">
            {rewards.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRewardId(r.id === rewardId ? "" : r.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  r.id === rewardId ? "border-amber-500 bg-amber-400 text-amber-950" : "border-amber-300 bg-white text-amber-900"
                }`}
              >
                {r.name} · {r.pointsCost} نقطة
              </button>
            ))}
          </div>
        </div>
      )}

      <Field label="ملاحظات للمطبخ (اختياري)">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} placeholder="من غير بصل، زيادة صوص..." />
      </Field>

      <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
        <p className="flex justify-between text-slate-500">
          <span>الدفع</span>
          <span>كاش عند الاستلام</span>
        </p>
        {reward && reward.kind !== "discount" && (
          <p className="flex justify-between text-green-700">
            <span>🎁 {reward.targetName ?? reward.name}</span>
            <span>هدية</span>
          </p>
        )}
        {discount > 0 && (
          <p className="flex justify-between text-green-700">
            <span>خصم النقاط</span>
            <span>-{money(discount)}</span>
          </p>
        )}
      </div>

      {!menu.orderingEnabled && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">الطلب أونلاين مقفول حاليًا</p>}
      {placeMutation.isError && (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" data-testid="order-error">
          {placeMutation.error instanceof CustomerApiError ? placeMutation.error.message : "حصل خطأ، جرّب تاني"}
        </p>
      )}

      <Button type="submit" className="w-full justify-center py-3 text-base" disabled={!canSubmit || placeMutation.isPending} data-testid="place-order">
        {placeMutation.isPending ? "بنبعت الطلب..." : `أكّد الطلب · ${money(finalTotal)}`}
      </Button>
    </form>
  );
}
