import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { customerApiRequest, CustomerApiError, setCustomerToken } from "../../shared/api/customerClient";
import { Card, CardBody } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { Field, Input } from "../../shared/ui/Field";
import { PortalShell } from "./PortalShell";

interface CustomerAuthResponse {
  token: string;
  customer: { id: string; phone: string; name: string | null };
}

// صفحة عامة بدون تسجيل دخول موظفين - بوابة العميل الذاتية (نفس مفهوم RateOrderPage: مفيش AppShell،
// توكن العميل (سر مختلف تمامًا عن توكن الموظف - راجع CustomersModule) بيتخزن في customerClient
export function CustomerPortalLoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: () => customerApiRequest<CustomerAuthResponse>("/customer-auth/login", { method: "POST", body: { phone, password } }),
    onSuccess: (data) => {
      setCustomerToken(data.token);
      navigate("/portal/me");
    },
  });

  return (
    <PortalShell title="تسجيل الدخول">
      <Card>
        <CardBody>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              loginMutation.mutate();
            }}
          >
            <Field label="رقم التليفون">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01012345678" dir="ltr" required />
            </Field>
            <Field label="كلمة السر">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>

            {loginMutation.isError && (
              <p className="text-sm text-red-600">
                {loginMutation.error instanceof CustomerApiError ? loginMutation.error.message : "حصل خطأ، حاول تاني"}
              </p>
            )}

            <Button type="submit" className="w-full justify-center" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "جاري الدخول..." : "دخول"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            لسه معملتش حساب؟{" "}
            <Link to="/portal/register" className="font-semibold text-brand-600">
              سجّل دلوقتي
            </Link>
          </p>
        </CardBody>
      </Card>
    </PortalShell>
  );
}
