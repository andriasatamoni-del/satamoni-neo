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

export function CustomerPortalRegisterPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const registerMutation = useMutation({
    mutationFn: () =>
      customerApiRequest<CustomerAuthResponse>("/customer-auth/register", { method: "POST", body: { phone, name, password } }),
    onSuccess: (data) => {
      setCustomerToken(data.token);
      navigate("/portal/me");
    },
  });

  return (
    <PortalShell title="إنشاء حساب جديد">
      <Card>
        <CardBody>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              registerMutation.mutate();
            }}
          >
            <Field label="الاسم">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="رقم التليفون">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01012345678" dir="ltr" required />
            </Field>
            <Field label="كلمة السر">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            </Field>

            {registerMutation.isError && (
              <p className="text-sm text-red-600">
                {registerMutation.error instanceof CustomerApiError ? registerMutation.error.message : "حصل خطأ، حاول تاني"}
              </p>
            )}

            <Button type="submit" className="w-full justify-center" disabled={registerMutation.isPending}>
              {registerMutation.isPending ? "جاري التسجيل..." : "تسجيل"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            عندك حساب بالفعل؟{" "}
            <Link to="/portal/login" className="font-semibold text-brand-600">
              سجّل دخول
            </Link>
          </p>
        </CardBody>
      </Card>
    </PortalShell>
  );
}
