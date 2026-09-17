import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { useAuth } from "../../shared/auth/AuthContext";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Select } from "../../shared/ui/Field";
import { Badge, type Tone } from "../../shared/ui/Badge";

interface Branch { id: string; name: string; }
interface DashboardSummary {
  from: string; to: string;
  revenue: number; orderCount: number; cancelledCount: number; avgOrderValue: number;
  dailyTrend: { date: string; revenue: number }[];
  topItemsByRevenue: { menuItemId: string; name: string; quantity: number; revenue: number }[];
  revenueByBranch: { branchId: string; name: string; revenue: number; orderCount: number }[];
  orderStatusBreakdown: { status: string; count: number }[];
  paymentMethodBreakdown: { paymentMethodId: string; name: string; amount: number }[];
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  preparing: "بيتحضّر", out_for_delivery: "في الطريق", completed: "مكتمل", cancelled: "ملغي",
};
const ORDER_STATUS_TONES: Record<string, Tone> = {
  preparing: "warning", out_for_delivery: "info", completed: "success", cancelled: "danger",
};

const RANGE_PRESETS = [
  { key: "today", label: "اليوم", days: 1 },
  { key: "7d", label: "آخر 7 أيام", days: 7 },
  { key: "30d", label: "آخر 30 يوم", days: 30 },
] as const;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// en-US مش ar-EG عمدًا - نفس اتفاقية باقي الشاشات في المشروع (أرقام إنجليزية عادية رغم النص عربي)
function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export function DashboardSummary() {
  const { user } = useAuth();
  const [preset, setPreset] = useState<(typeof RANGE_PRESETS)[number]["key"]>("30d");
  const [branchId, setBranchId] = useState("");

  const days = RANGE_PRESETS.find((p) => p.key === preset)!.days;
  const to = toDateStr(new Date());
  const from = toDateStr(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));

  // مدير الفرع مقفول على فرعه من السيرفر أصلًا (نفس نطاق الريبو القديم) - فلتر الفرع هنا للأدمن/المحاسب بس
  const showBranchFilter = user?.role === "admin" || user?.role === "accountant";
  const branchesQuery = useQuery({
    queryKey: ["branches"],
    queryFn: () => apiRequest<Branch[]>("/branches"),
    enabled: showBranchFilter,
  });

  const summaryQuery = useQuery({
    queryKey: ["reports", "dashboard", branchId, from, to],
    queryFn: () =>
      apiRequest<DashboardSummary>(`/reports/dashboard?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ""}`),
    retry: false,
  });

  // كاشير/كول سنتر/سائق معندهمش reports.view - السيرفر بيرجع 403 وإحنا هنا بنتعامل مع ده بإخفاء
  // اللوحة كلها بدل ما نعرض رسالة خطأ (نفس أسلوب ShiftReviewPanel بالظبط)
  if (summaryQuery.isError) return null;

  const data = summaryQuery.data;
  const maxDailyRevenue = Math.max(1, ...(data?.dailyTrend.map((d) => d.revenue) ?? [0]));
  const maxBranchRevenue = Math.max(1, ...(data?.revenueByBranch.map((b) => b.revenue) ?? [0]));

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>لوحة التحكم</CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  preset === p.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {showBranchFilter && (
            <Select className="w-44" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">كل الفروع</option>
              {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        {!data ? (
          <p className="text-sm text-slate-400">بيتم التحميل...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiTile label="الإيراد" value={`${fmt(data.revenue)}ج`} />
              <KpiTile label="عدد الطلبات" value={fmt(data.orderCount)} />
              <KpiTile label="متوسط قيمة الطلب" value={`${fmt(data.avgOrderValue)}ج`} />
              <KpiTile label="الطلبات الملغية" value={fmt(data.cancelledCount)} />
            </div>

            {data.dailyTrend.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-slate-700">الإيراد اليومي</h3>
                <div className="flex h-32 items-end gap-1">
                  {data.dailyTrend.map((d) => (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${fmt(d.revenue)}ج`}>
                      <div
                        className="w-full rounded-t bg-brand-500"
                        style={{ height: `${Math.max(4, (d.revenue / maxDailyRevenue) * 100)}px` }}
                      />
                      <span className="text-[10px] text-slate-400">{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-bold text-slate-700">الأصناف الأكثر مبيعًا</h3>
                {data.topItemsByRevenue.length === 0 ? (
                  <p className="text-xs text-slate-400">مفيش بيانات</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.topItemsByRevenue.map((item) => (
                      <li key={item.menuItemId} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">{item.name}</span>
                        <span className="text-slate-500">{item.quantity}× - {fmt(item.revenue)}ج</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold text-slate-700">الإيراد حسب الفرع</h3>
                {data.revenueByBranch.length === 0 ? (
                  <p className="text-xs text-slate-400">مفيش بيانات</p>
                ) : (
                  <ul className="space-y-2">
                    {data.revenueByBranch.map((b) => (
                      <li key={b.branchId}>
                        <div className="mb-0.5 flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700">{b.name}</span>
                          <span className="text-slate-500">{fmt(b.revenue)}ج</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100">
                          <div
                            className="h-1.5 rounded-full bg-brand-500"
                            style={{ width: `${(b.revenue / maxBranchRevenue) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-bold text-slate-700">طرق الدفع</h3>
                {data.paymentMethodBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400">مفيش بيانات</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {data.paymentMethodBreakdown.map((m) => (
                      <li key={m.paymentMethodId} className="flex items-center justify-between">
                        <span className="text-slate-700">{m.name}</span>
                        <span className="text-slate-500">{fmt(m.amount)}ج</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold text-slate-700">حالة الطلبات</h3>
                <div className="flex flex-wrap gap-2">
                  {data.orderStatusBreakdown.map((s) => (
                    <Badge key={s.status} tone={ORDER_STATUS_TONES[s.status] ?? "neutral"}>
                      {ORDER_STATUS_LABELS[s.status] ?? s.status} ({s.count})
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}
