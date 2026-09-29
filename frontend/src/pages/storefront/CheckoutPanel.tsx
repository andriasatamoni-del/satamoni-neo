import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerApiRequest, CustomerApiError, setCustomerToken } from "../../shared/api/customerClient";
import { Button } from "../../shared/ui/Button";
import { Field, Input, Select, Textarea } from "../../shared/ui/Field";
import type { CustomerProfile } from "./StorefrontShell";
import type { StorefrontBranch, StorefrontMenu } from "./types";
import { money, ORDER_TYPE_LABELS } from "./types";
import { newRequestId, rememberOrder, type CartLine } from "./storefrontStorage";

interface SavedAddress {
  id: string;
  label: string | null;
  addressDetails: string;
  distinguishingMark: string | null;
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const branches = menu.branches;

  const [branchId, setBranchId] = useState(
    (initialBranchId && branches.some((b) => b.id === initialBranchId) ? initialBranchId : null) ?? (branches.length === 1 ? branches[0].id : "")
  );
  const branch: StorefrontBranch | undefined = branches.find((b) => b.id === branchId);
  const [orderType, setOrderType] = useState(initialTable ? "dinein" : "delivery");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [address, setAddress] = useState("");
  const [mark, setMark] = useState("");
  const [saveAddress, setSaveAddress] = useState(true);
  const [table, setTable] = useState(initialTable ?? "");
  const [notes, setNotes] = useState("");
  const [locating, setLocating] = useState<string | null>(null);
  // نفس المعرّف لحد ما الطلب ينجح - لو داس مرتين أو النت فصل بعد الإرسال، السيرفر بيرجّع نفس الطلب
  const requestId = useRef(newRequestId());

  const prefilled = useRef(false);
  useEffect(() => {
    if (customer?.name && !prefilled.current) {
      prefilled.current = true;
      setName((current) => current || customer.name!);
    }
  }, [customer]);

  const addressesQuery = useQuery({
    queryKey: ["storefront", "addresses"],
    queryFn: () => customerApiRequest<SavedAddress[]>("/customer-auth/me/addresses"),
    enabled: Boolean(customer),
  });
  useEffect(() => {
    const preferred = addressesQuery.data?.find((a) => a.isDefault) ?? addressesQuery.data?.[0];
    if (preferred && !address) {
      setAddress(preferred.addressDetails);
      setMark(preferred.distinguishingMark ?? "");
    }
  }, [addressesQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const availableTypes = useMemo(
    () => ["delivery", "takeaway", ...(branch?.supportsDineIn ? ["dinein"] : [])],
    [branch]
  );
  useEffect(() => {
    if (!availableTypes.includes(orderType)) setOrderType("delivery");
  }, [availableTypes, orderType]);

  const total = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
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

  const placeMutation = useMutation({
    mutationFn: () =>
      customerApiRequest<PlacedOrder>("/storefront/orders", {
        method: "POST",
        body: {
          clientRequestId: requestId.current,
          branchId,
          orderType,
          customerName: name,
          customerPhone: customer ? undefined : phone,
          customerPhone2: phone2 || undefined,
          addressDetails: orderType === "delivery" ? address : undefined,
          distinguishingMark: orderType === "delivery" ? mark || undefined : undefined,
          tableNumber: orderType === "dinein" ? table : undefined,
          notes: notes || undefined,
          saveAddress: Boolean(customer) && saveAddress,
          items: cart.map((l) =>
            l.kind === "combo"
              ? { comboId: l.refId, quantity: l.quantity }
              : { variantId: l.refId, quantity: l.quantity, modifierIds: l.modifierIds }
          ),
        },
      }),
    onSuccess: (placed) => {
      rememberOrder({ id: placed.orderId, token: placed.trackingToken, total: placed.total, createdAt: new Date().toISOString() });
      requestId.current = newRequestId();
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ["storefront", "addresses"] });
      navigate(`/order/track/${placed.orderId}?token=${placed.trackingToken}`);
    },
    onError: (err) => {
      if (err instanceof CustomerApiError && err.status === 401) {
        setCustomerToken(null);
        queryClient.invalidateQueries({ queryKey: ["storefront", "customer"] });
      }
    },
  });

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

      <form
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          placeMutation.mutate();
        }}
      >
        <h2 className="text-base font-bold text-slate-900">بيانات الطلب</h2>

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
        {branch && (branch.address || branch.hours) && (
          <p className="text-xs text-slate-500">
            {branch.address}
            {branch.hours && ` · ${branch.hours}`}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="نوع الطلب">
          {availableTypes.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={orderType === type}
              onClick={() => setOrderType(type)}
              className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                orderType === type ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"
              }`}
            >
              {ORDER_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <Field label="الاسم">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </Field>
        {customer ? (
          <p className="text-xs text-slate-500">
            الطلب هيتسجّل على رقمك: <span dir="ltr">{customer.phone}</span>
          </p>
        ) : (
          <Field label="رقم التليفون">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" placeholder="01012345678" required />
          </Field>
        )}

        {orderType === "delivery" && (
          <>
            {addressesQuery.data && addressesQuery.data.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {addressesQuery.data.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setAddress(a.addressDetails);
                      setMark(a.distinguishingMark ?? "");
                    }}
                    className={`rounded-full border px-3 py-1 text-xs ${address === a.addressDetails ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}
                  >
                    {a.label || a.addressDetails.slice(0, 24)}
                  </button>
                ))}
              </div>
            )}
            <Field label="العنوان بالتفصيل">
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} required maxLength={300} placeholder="المنطقة، الشارع، رقم العمارة، الدور، الشقة" />
            </Field>
            <Field label="علامة مميزة (اختياري)">
              <Input value={mark} onChange={(e) => setMark(e.target.value)} maxLength={150} />
            </Field>
            <Field label="رقم تليفون تاني (اختياري)">
              <Input value={phone2} onChange={(e) => setPhone2(e.target.value)} dir="ltr" inputMode="tel" />
            </Field>
            {customer && (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                احفظ العنوان ده للمرة الجاية
              </label>
            )}
          </>
        )}

        {orderType === "dinein" && (
          <Field label="رقم الترابيزة">
            <Input value={table} onChange={(e) => setTable(e.target.value)} required maxLength={10} />
          </Field>
        )}

        <Field label="ملاحظات للمطبخ (اختياري)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} placeholder="من غير بصل، زيادة صوص..." />
        </Field>

        <fieldset className="space-y-2 text-sm">
          <legend className="mb-1 text-xs font-semibold text-slate-600">طريقة الدفع</legend>
          <label className="flex items-center gap-2 rounded-lg border border-brand-500 bg-brand-50 px-3 py-2">
            <input type="radio" checked readOnly /> كاش عند الاستلام
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-400">
            <input type="radio" disabled /> دفع أونلاين (قريبًا)
          </label>
        </fieldset>

        {!menu.orderingEnabled && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">الطلب أونلاين مقفول حاليًا</p>}
        {placeMutation.isError && (
          <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" data-testid="order-error">
            {placeMutation.error instanceof CustomerApiError ? placeMutation.error.message : "حصل خطأ، جرّب تاني"}
          </p>
        )}

        <Button
          type="submit"
          className="w-full justify-center py-3 text-base"
          disabled={!menu.orderingEnabled || cart.length === 0 || !branchId || placeMutation.isPending}
          data-testid="place-order"
        >
          {placeMutation.isPending ? "بنبعت الطلب..." : `أكّد الطلب · ${money(total)}`}
        </Button>
      </form>
    </div>
  );
}
