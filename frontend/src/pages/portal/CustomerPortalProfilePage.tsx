import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerApiRequest, CustomerApiError, getCustomerToken, setCustomerToken } from "../../shared/api/customerClient";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { Field, Input } from "../../shared/ui/Field";
import { PortalShell } from "./PortalShell";
import { AddressFields, addressBody, EMPTY_ADDRESS } from "./AddressFields";

interface CustomerProfile {
  id: string;
  phone: string;
  phone2: string | null;
  email: string | null;
  name: string | null;
  loyaltyPoints: number;
  missingProfileFields: string[];
}

interface CustomerAddress {
  id: string;
  label: string | null;
  addressDetails: string;
  isDefault: boolean;
}

interface LoyaltyInfo {
  balance: number;
  pointsPerEgp: number;
  history: { id: string; kind: string; points: number; rewardName: string | null; note: string | null; createdAt: string }[];
  rewards: { id: string; name: string; pointsCost: number; affordable: boolean }[];
}

const HISTORY_LABELS: Record<string, string> = {
  earn: "كسبت من طلب",
  redeem: "صرفت في",
  reverse_earn: "اتسحبت (طلب اتلغى)",
  refund_redeem: "رجعت (طلب اتلغى)",
  adjust: "تعديل",
};

const errorText = (err: unknown) => (err instanceof CustomerApiError ? err.message : "حصل خطأ");

// "حسابي": البيانات + دفتر العناوين + نقاط الولاء. حساب قديم ناقصه بيانات بيكمّلها هنا مرة واحدة
export function CustomerPortalProfilePage() {
  if (!getCustomerToken()) return <Navigate to="/portal/login?next=/portal/me" replace />;
  return <Profile />;
}

function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["storefront", "customer"],
    queryFn: () => customerApiRequest<CustomerProfile>("/customer-auth/me"),
    retry: false,
  });
  const addressesQuery = useQuery({
    queryKey: ["storefront", "addresses"],
    queryFn: () => customerApiRequest<CustomerAddress[]>("/customer-auth/me/addresses"),
    enabled: profileQuery.isSuccess,
  });
  const loyaltyQuery = useQuery({
    queryKey: ["storefront", "loyalty"],
    queryFn: () => customerApiRequest<LoyaltyInfo>("/loyalty/me"),
    enabled: profileQuery.isSuccess,
  });

  const [contact, setContact] = useState({ name: "", email: "", phone2: "" });
  useEffect(() => {
    const c = profileQuery.data;
    if (c) setContact({ name: c.name ?? "", email: c.email ?? "", phone2: c.phone2 ?? "" });
  }, [profileQuery.data]);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [addingAddress, setAddingAddress] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["storefront"] });
  const saveContact = useMutation({
    mutationFn: () => customerApiRequest("/customer-auth/me", { method: "PATCH", body: contact }),
    onSuccess: refresh,
  });
  const addAddress = useMutation({
    mutationFn: () => customerApiRequest("/customer-auth/me/addresses", { method: "POST", body: addressBody(address) }),
    onSuccess: () => {
      setAddress(EMPTY_ADDRESS);
      setAddingAddress(false);
      refresh();
    },
  });
  const makeDefault = useMutation({
    mutationFn: (id: string) => customerApiRequest(`/customer-auth/me/addresses/${id}/default`, { method: "POST" }),
    onSuccess: refresh,
  });
  const removeAddress = useMutation({
    mutationFn: (id: string) => customerApiRequest(`/customer-auth/me/addresses/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  function logout() {
    setCustomerToken(null);
    queryClient.removeQueries({ queryKey: ["storefront"] });
    navigate("/order", { replace: true });
  }

  if (profileQuery.isLoading) return <PortalShell title="حسابي">بيتم التحميل...</PortalShell>;
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <PortalShell title="حسابي">
        <Card>
          <CardBody className="space-y-3 text-center text-sm">
            <p className="text-red-600">جلستك انتهت - سجّل دخول تاني</p>
            <Link to="/portal/login?next=/portal/me" className="font-semibold text-brand-600">
              تسجيل الدخول
            </Link>
          </CardBody>
        </Card>
      </PortalShell>
    );
  }

  const customer = profileQuery.data;
  const addresses = addressesQuery.data ?? [];
  const loyalty = loyaltyQuery.data;
  const showAddressForm = addingAddress || (addressesQuery.isSuccess && addresses.length === 0);

  return (
    <PortalShell title="حسابي" wide>
      <div className="space-y-4">
        {customer.missingProfileFields.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="complete-profile">
            كمّل بياناتك مرة واحدة عشان تقدر تطلب:{" "}
            {customer.missingProfileFields.map((f) => ({ email: "الإيميل", phone2: "رقم تليفون تاني", address: "عنوان التوصيل" })[f]).join("، ")}
          </div>
        )}

        <div className="flex gap-2">
          <Link to="/order" className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-center font-bold text-white">
            اطلب دلوقتي
          </Link>
          <Link to="/order/orders" className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-semibold text-slate-700">
            طلباتي
          </Link>
        </div>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>نقاطي</CardTitle>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800" data-testid="points-balance">
              ⭐ {loyalty?.balance ?? customer.loyaltyPoints} نقطة
            </span>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            {loyalty && loyalty.pointsPerEgp > 0 && (
              <p className="text-slate-500">بتكسب نقطة لكل {Math.round((1 / loyalty.pointsPerEgp) * 100) / 100} جنيه بعد ما طلبك يوصل، وتصرفها وانت بتطلب.</p>
            )}
            {loyalty && loyalty.rewards.length > 0 && (
              <ul className="space-y-1.5">
                {loyalty.rewards.map((r) => (
                  <li key={r.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${r.affordable ? "bg-green-50" : "bg-slate-50"}`}>
                    <span className="font-semibold">{r.name}</span>
                    <span className={r.affordable ? "font-bold text-green-700" : "text-slate-400"}>
                      {r.pointsCost} نقطة {r.affordable ? "✓ متاحة" : `(ناقصك ${r.pointsCost - loyalty.balance})`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {loyalty && loyalty.history.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-slate-500">سجل النقاط</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {loyalty.history.map((h) => (
                    <li key={h.id} className="flex justify-between">
                      <span>
                        {HISTORY_LABELS[h.kind] ?? h.kind} {h.rewardName ?? ""} · {new Date(h.createdAt).toLocaleDateString("ar-EG")}
                      </span>
                      <span className={h.points > 0 ? "text-green-700" : "text-red-600"} dir="ltr">
                        {h.points > 0 ? `+${h.points}` : h.points}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>عناوين التوصيل</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {addresses.map((a) => (
              <div key={a.id} className={`rounded-lg border px-3 py-2 text-sm ${a.isDefault ? "border-brand-400 bg-brand-50" : "border-slate-200"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-700">{a.label || (a.isDefault ? "العنوان الأساسي" : "عنوان")}</span>
                  <div className="flex gap-3 text-xs">
                    {a.isDefault ? (
                      <span className="font-semibold text-brand-700">الافتراضي</span>
                    ) : (
                      <button className="font-semibold text-brand-600" onClick={() => makeDefault.mutate(a.id)}>
                        خليه الافتراضي
                      </button>
                    )}
                    <button className="text-slate-400 hover:text-red-600" onClick={() => removeAddress.mutate(a.id)}>
                      حذف
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-slate-500">{a.addressDetails}</p>
              </div>
            ))}
            {showAddressForm ? (
              <form
                className="space-y-3 border-t border-slate-100 pt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  addAddress.mutate();
                }}
              >
                <AddressFields value={address} onChange={setAddress} showLabel />
                {addAddress.isError && <p className="text-sm text-red-600">{errorText(addAddress.error)}</p>}
                <Button type="submit" className="w-full justify-center" disabled={addAddress.isPending}>
                  {addAddress.isPending ? "جاري الحفظ..." : "حفظ العنوان"}
                </Button>
              </form>
            ) : (
              <button className="text-sm font-semibold text-brand-600" onClick={() => setAddingAddress(true)}>
                + عنوان جديد
              </button>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>بياناتي</CardTitle>
            <button onClick={logout} className="text-xs font-semibold text-slate-400 hover:text-red-600">
              تسجيل الخروج
            </button>
          </CardHeader>
          <CardBody>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveContact.mutate();
              }}
            >
              <p className="text-sm text-slate-500">
                رقم الدخول: <span dir="ltr">{customer.phone}</span>
              </p>
              <Field label="الاسم">
                <Input required value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="الإيميل">
                  <Input type="email" required dir="ltr" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} name="email" />
                </Field>
                <Field label="رقم تليفون تاني">
                  <Input required dir="ltr" inputMode="tel" value={contact.phone2} onChange={(e) => setContact({ ...contact, phone2: e.target.value })} name="phone2" />
                </Field>
              </div>
              {saveContact.isError && <p className="text-sm text-red-600">{errorText(saveContact.error)}</p>}
              {saveContact.isSuccess && <p className="text-sm text-green-700">اتحفظ</p>}
              <Button type="submit" variant="secondary" className="w-full justify-center" disabled={saveContact.isPending}>
                حفظ البيانات
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </PortalShell>
  );
}
