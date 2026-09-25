import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerApiRequest, CustomerApiError, getCustomerToken, setCustomerToken } from "../../shared/api/customerClient";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { Field, Input } from "../../shared/ui/Field";
import { PortalShell } from "./PortalShell";

interface CustomerProfile {
  id: string;
  phone: string;
  phone2: string | null;
  name: string | null;
  addressDetails: string | null;
  distinguishingMark: string | null;
  loyaltyPoints: number;
}

interface CustomerAddress {
  id: string;
  label: string | null;
  addressDetails: string;
  distinguishingMark: string | null;
  isDefault: boolean;
}

export function CustomerPortalProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const hasToken = Boolean(getCustomerToken());

  const profileQuery = useQuery({
    queryKey: ["customer-portal", "me"],
    queryFn: () => customerApiRequest<CustomerProfile>("/customer-auth/me"),
    enabled: hasToken,
    retry: false,
  });

  if (!hasToken) {
    return <Navigate to="/portal/login" replace />;
  }

  const addressesQuery = useQuery({
    queryKey: ["customer-portal", "me", "addresses"],
    queryFn: () => customerApiRequest<CustomerAddress[]>("/customer-auth/me/addresses"),
    enabled: profileQuery.isSuccess,
  });

  const [label, setLabel] = useState("");
  const [addressDetails, setAddressDetails] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const addAddressMutation = useMutation({
    mutationFn: () =>
      customerApiRequest<CustomerAddress>("/customer-auth/me/addresses", {
        method: "POST",
        body: { label: label || undefined, addressDetails, isDefault },
      }),
    onSuccess: () => {
      setLabel("");
      setAddressDetails("");
      setIsDefault(false);
      queryClient.invalidateQueries({ queryKey: ["customer-portal", "me", "addresses"] });
    },
  });

  function logout() {
    setCustomerToken(null);
    navigate("/portal/login", { replace: true });
  }

  if (profileQuery.isLoading) {
    return <PortalShell title="بياناتي">بيتم التحميل...</PortalShell>;
  }

  if (profileQuery.isError) {
    return (
      <PortalShell title="بياناتي">
        <Card>
          <CardBody className="text-center text-sm text-red-600">
            {profileQuery.error instanceof CustomerApiError ? profileQuery.error.message : "لازم تسجّل دخول تاني"}
          </CardBody>
        </Card>
      </PortalShell>
    );
  }

  const customer = profileQuery.data!;

  return (
    <PortalShell title="بياناتي">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>{customer.name ?? customer.phone}</CardTitle>
            <button onClick={logout} className="text-xs font-semibold text-slate-400 hover:text-red-600">
              تسجيل الخروج
            </button>
          </CardHeader>
          <CardBody className="space-y-1 text-sm text-slate-600">
            <p>
              <span className="text-slate-400">التليفون:</span> <span dir="ltr">{customer.phone}</span>
            </p>
            <p>
              <span className="text-slate-400">نقاط الولاء:</span> {customer.loyaltyPoints}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>دفتر العناوين</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {addressesQuery.data?.length ? (
              <ul className="space-y-2">
                {addressesQuery.data.map((addr) => (
                  <li key={addr.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">{addr.label || "عنوان"}</span>
                      {addr.isDefault && (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-600">افتراضي</span>
                      )}
                    </div>
                    <p className="mt-1 text-slate-500">{addr.addressDetails}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">مفيش عناوين محفوظة</p>
            )}

            <form
              className="space-y-3 border-t border-slate-100 pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                addAddressMutation.mutate();
              }}
            >
              <Field label="اسم العنوان (اختياري)">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="البيت، الشغل..." />
              </Field>
              <Field label="تفاصيل العنوان">
                <Input value={addressDetails} onChange={(e) => setAddressDetails(e.target.value)} required />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                خليه العنوان الافتراضي
              </label>

              {addAddressMutation.isError && (
                <p className="text-sm text-red-600">
                  {addAddressMutation.error instanceof CustomerApiError ? addAddressMutation.error.message : "حصل خطأ"}
                </p>
              )}

              <Button type="submit" className="w-full justify-center" disabled={addAddressMutation.isPending}>
                {addAddressMutation.isPending ? "جاري الإضافة..." : "إضافة عنوان"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </PortalShell>
  );
}
