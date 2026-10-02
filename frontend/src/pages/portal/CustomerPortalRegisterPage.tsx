import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customerApiRequest, CustomerApiError, setCustomerToken } from "../../shared/api/customerClient";
import { Card, CardBody } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { Field, Input } from "../../shared/ui/Field";
import { PortalShell } from "./PortalShell";
import { useSafeNext } from "./safeNext";
import { AddressFields, addressBody, EMPTY_ADDRESS } from "./AddressFields";

interface CustomerAuthResponse {
  token: string;
  customer: { id: string; phone: string; name: string | null };
}

// تسجيل مرة واحدة (STORE-2): البيانات + عنوان التوصيل كلهم في صفحة واحدة، وبعدها العميل بيطلب في أي وقت
// من غير ما يكتب حاجة تاني
export function CustomerPortalRegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const next = useSafeNext("/order");
  const [form, setForm] = useState({ name: "", phone: "", phone2: "", email: "", password: "" });
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const registerMutation = useMutation({
    mutationFn: () =>
      customerApiRequest<CustomerAuthResponse>("/customer-auth/register", { method: "POST", body: { ...form, address: addressBody(address) } }),
    onSuccess: (data) => {
      setCustomerToken(data.token);
      queryClient.invalidateQueries({ queryKey: ["storefront"] });
      navigate(next);
    },
  });

  return (
    <PortalShell title="حساب جديد - بتسجّل مرة واحدة وبعدها تطلب بضغطة" wide>
      <Card>
        <CardBody>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              registerMutation.mutate();
            }}
          >
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-slate-800">بياناتك</h2>
              <Field label="الاسم">
                <Input value={form.name} onChange={set("name")} required autoComplete="name" name="name" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="رقم التليفون">
                  <Input value={form.phone} onChange={set("phone")} placeholder="01012345678" dir="ltr" inputMode="tel" required autoComplete="tel" name="phone" />
                </Field>
                <Field label="رقم تليفون تاني">
                  <Input value={form.phone2} onChange={set("phone2")} placeholder="01112345678" dir="ltr" inputMode="tel" required name="phone2" />
                </Field>
              </div>
              <Field label="الإيميل">
                <Input type="email" value={form.email} onChange={set("email")} dir="ltr" required autoComplete="email" name="email" />
              </Field>
              <Field label="كلمة السر (6 حروف/أرقام على الأقل)">
                <Input type="password" value={form.password} onChange={set("password")} minLength={6} required autoComplete="new-password" name="password" />
              </Field>
            </section>

            <section className="space-y-3 border-t border-slate-100 pt-4">
              <h2 className="text-sm font-bold text-slate-800">عنوان التوصيل</h2>
              <AddressFields value={address} onChange={setAddress} />
            </section>

            {registerMutation.isError && (
              <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" data-testid="register-error">
                {registerMutation.error instanceof CustomerApiError ? registerMutation.error.message : "حصل خطأ، حاول تاني"}
              </p>
            )}

            <Button type="submit" className="w-full justify-center py-3 text-base" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? "جاري التسجيل..." : "سجّل وابدأ اطلب"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            عندك حساب بالفعل؟{" "}
            <Link to={`/portal/login?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-600">
              سجّل دخول
            </Link>
          </p>
        </CardBody>
      </Card>
    </PortalShell>
  );
}
