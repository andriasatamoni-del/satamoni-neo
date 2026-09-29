import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { customerApiRequest } from "../../shared/api/customerClient";
import { StorefrontShell, useStorefrontCustomer } from "./StorefrontShell";
import { trackingSteps } from "./TrackOrderPage";
import type { TrackedOrder } from "./types";
import { money, ORDER_TYPE_LABELS } from "./types";
import { loadRecentOrders } from "./storefrontStorage";

function statusLabel(order: TrackedOrder): string {
  if (order.status === "cancelled") return "اتلغى";
  const steps = trackingSteps(order).filter((s) => s.reached);
  return steps[steps.length - 1].label;
}

// العميل المسجّل: كل طلباته برقمه (من السيرفر). الضيف: آخر الطلبات اللي عملها من الجهاز ده بس
export function MyOrdersPage() {
  const customer = useStorefrontCustomer();
  const mine = useQuery({
    queryKey: ["storefront", "my-orders"],
    queryFn: () => customerApiRequest<TrackedOrder[]>("/storefront/me/orders"),
    enabled: Boolean(customer),
  });
  const recent = loadRecentOrders();

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-lg space-y-3">
        <h1 className="text-lg font-bold text-slate-900">طلباتي</h1>
        {customer ? (
          mine.data?.length ? (
            mine.data.map((order) => (
              <Link
                key={order.id}
                to={`/order/track/${order.id}?token=${order.trackingToken}`}
                className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300"
                data-testid="my-order"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold" dir="ltr">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{statusLabel(order)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(order.createdAt).toLocaleString("ar-EG")} · {ORDER_TYPE_LABELS[order.orderType]} · {order.branch?.name}
                </p>
                <p className="mt-1 text-sm">
                  {order.lines.map((l) => `${l.quantity}× ${l.name}`).join("، ")} — <b>{money(order.total)}</b>
                </p>
              </Link>
            ))
          ) : (
            <p className="text-sm text-slate-400">{mine.isLoading ? "بيتم التحميل..." : "لسه معملتش طلبات"}</p>
          )
        ) : (
          <>
            <p className="rounded-xl bg-white p-3 text-sm text-slate-600 shadow-sm">
              <Link to="/portal/login?next=/order/orders" className="font-bold text-brand-600">
                سجّل دخول
              </Link>{" "}
              عشان تشوف كل طلباتك من أي جهاز. دي الطلبات اللي عملتها من الجهاز ده:
            </p>
            {recent.length ? (
              recent.map((order) => (
                <Link
                  key={order.id}
                  to={`/order/track/${order.id}?token=${order.token}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  data-testid="recent-order"
                >
                  <span className="font-bold" dir="ltr">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="text-sm text-slate-500">
                    {new Date(order.createdAt).toLocaleDateString("ar-EG")} · {money(order.total)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-sm text-slate-400">مفيش طلبات على الجهاز ده</p>
            )}
          </>
        )}
      </div>
    </StorefrontShell>
  );
}
