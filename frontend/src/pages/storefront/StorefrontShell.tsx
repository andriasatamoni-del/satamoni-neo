import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { customerApiRequest, getCustomerToken } from "../../shared/api/customerClient";

export interface CustomerProfile {
  id: string;
  phone: string;
  name: string | null;
  loyaltyPoints: number;
}

// العميل المسجّل (لو فيه توكن صالح) - توكن منتهي = ضيف عادي، مش خطأ
export function useStorefrontCustomer() {
  const hasToken = Boolean(getCustomerToken());
  const query = useQuery({
    queryKey: ["storefront", "customer"],
    queryFn: () => customerApiRequest<CustomerProfile>("/customer-auth/me"),
    enabled: hasToken,
    retry: false,
    staleTime: 60_000,
  });
  return query.isSuccess ? query.data : null;
}

export function StorefrontShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const customer = useStorefrontCustomer();
  return (
    <div className="min-h-screen bg-slate-50 pb-24 lg:pb-8">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/order" className="text-lg font-extrabold text-brand-600">
            ساتاموني
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {actions}
            <Link to="/order/orders" className="rounded-lg px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-100" data-testid="my-orders-link">
              طلباتي
            </Link>
            {customer ? (
              <Link to="/portal/me" className="rounded-lg bg-brand-50 px-2.5 py-1.5 font-semibold text-brand-700" data-testid="customer-name">
                {customer.name ?? customer.phone}
              </Link>
            ) : (
              <Link to="/portal/login?next=/order" className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
                دخول
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
    </div>
  );
}
