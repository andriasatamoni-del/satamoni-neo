import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { customerApiRequest, CustomerApiError } from "../../shared/api/customerClient";
import { StorefrontShell } from "./StorefrontShell";
import type { TrackedOrder } from "./types";
import { money, ORDER_TYPE_LABELS } from "./types";

const KITCHEN_ORDER = ["NEW", "ACCEPTED", "PREPARING", "READY"];

// خطوات التتبّع حسب نوع الطلب - مبنية من حالتين مستقلين زي باقي النظام: kitchenStatus (المطبخ) و status
// (الطلب نفسه: خرج للتوصيل/اتسلّم/اتلغى)
export function trackingSteps(order: Pick<TrackedOrder, "orderType" | "status" | "kitchenStatus">) {
  const kitchen = KITCHEN_ORDER.indexOf(order.kitchenStatus);
  const done = order.status === "completed";
  const steps = [
    { label: "استلمنا طلبك", reached: true },
    { label: "المطبخ بيجهّزه", reached: kitchen >= 1 || done || order.status === "out_for_delivery" },
    { label: order.orderType === "takeaway" ? "جاهز للاستلام" : "جاهز", reached: kitchen >= 3 || done || order.status === "out_for_delivery" },
  ];
  if (order.orderType === "delivery") steps.push({ label: "خرج للتوصيل", reached: order.status === "out_for_delivery" || done });
  steps.push({ label: order.orderType === "dinein" ? "اتقدّم" : "اتسلّم", reached: done });
  return steps;
}

export function TrackOrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [params] = useSearchParams();
  const token = params.get("token");

  const query = useQuery({
    queryKey: ["storefront", "track", orderId, token],
    queryFn: () => customerApiRequest<TrackedOrder>(`/storefront/orders/${orderId}?token=${encodeURIComponent(token ?? "")}`),
    enabled: Boolean(orderId && token),
    retry: false,
    refetchInterval: (q) => (q.state.data && ["completed", "cancelled"].includes(q.state.data.status) ? false : 15_000),
  });

  if (!token) {
    return (
      <StorefrontShell>
        <p className="py-20 text-center text-slate-500">اللينك ده ناقص - افتح الطلب من "طلباتي"</p>
      </StorefrontShell>
    );
  }
  if (query.isLoading) {
    return (
      <StorefrontShell>
        <p className="py-20 text-center text-slate-400">بيتم التحميل...</p>
      </StorefrontShell>
    );
  }
  if (query.isError || !query.data) {
    return (
      <StorefrontShell>
        <p className="py-20 text-center text-red-600">{query.error instanceof CustomerApiError ? query.error.message : "حصل خطأ"}</p>
      </StorefrontShell>
    );
  }

  const order = query.data;
  const cancelled = order.status === "cancelled";
  const steps = trackingSteps(order);
  const canRate = !order.rated && (order.status === "completed" || (order.orderType === "takeaway" && order.kitchenStatus === "READY"));

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
          <p className="text-sm text-slate-500">طلب رقم</p>
          <p className="text-2xl font-extrabold tracking-wider text-slate-900" dir="ltr" data-testid="order-number">
            #{order.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {ORDER_TYPE_LABELS[order.orderType]} · {order.branch?.name}
            {order.tableNumber && ` · ترابيزة ${order.tableNumber}`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="tracking-steps">
          {cancelled ? (
            <p className="text-center font-bold text-red-600">الطلب ده اتلغى - لو فيه حاجة كلّمنا</p>
          ) : (
            <ol className="space-y-3">
              {steps.map((step, i) => {
                const current = step.reached && !steps[i + 1]?.reached;
                return (
                  <li key={step.label} className="flex items-center gap-3" data-reached={step.reached}>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        step.reached ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"
                      } ${current ? "ring-4 ring-brand-100" : ""}`}
                    >
                      {step.reached ? "✓" : i + 1}
                    </span>
                    <span className={step.reached ? "font-semibold text-slate-900" : "text-slate-400"}>{step.label}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {!cancelled && order.status !== "completed" && <p className="mt-4 text-center text-xs text-slate-400">الصفحة بتتحدّث لوحدها</p>}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ul className="space-y-2 text-sm">
            {order.lines.map((line, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  {line.quantity}× {line.name}
                  {line.variantLabel && <span className="text-slate-500"> · {line.variantLabel}</span>}
                  {line.modifiers.length > 0 && <span className="block text-xs text-slate-500">+ {line.modifiers.join("، ")}</span>}
                </span>
                <span className="shrink-0">{money(line.lineTotal)}</span>
              </li>
            ))}
          </ul>
          {order.discount > 0 && (
            <p className="mt-2 flex justify-between text-sm text-green-700">
              <span>{order.customerNotes?.includes("مكافأة نقاط") ? "🎁 هدية/خصم نقاط الولاء" : "خصم"}</span>
              <span>-{money(order.discount)}</span>
            </p>
          )}
          <p className="mt-3 flex justify-between border-t border-slate-100 pt-3 font-bold">
            <span>الإجمالي (كاش عند الاستلام)</span>
            <span data-testid="order-total">{money(order.total)}</span>
          </p>
          {order.addressDetails && <p className="mt-3 text-xs text-slate-500">📍 {order.addressDetails}</p>}
          {order.customerNotes && <p className="mt-1 text-xs text-slate-500">📝 {order.customerNotes}</p>}
        </div>

        {canRate && (
          <Link
            to={`/rate/${order.id}?token=${order.trackingToken}`}
            className="block rounded-xl bg-amber-400 px-4 py-3 text-center font-bold text-amber-950 shadow-sm"
          >
            ⭐ قيّم طلبك
          </Link>
        )}

        <div className="flex gap-2">
          {order.branch?.phone && (
            <a href={`tel:${order.branch.phone}`} className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700">
              📞 كلّم الفرع
            </a>
          )}
          <Link to="/order" className="flex-1 rounded-xl bg-brand-600 px-4 py-3 text-center text-sm font-bold text-white">
            اطلب تاني
          </Link>
        </div>
      </div>
    </StorefrontShell>
  );
}
