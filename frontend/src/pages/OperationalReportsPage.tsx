import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Field, Input } from "../shared/ui/Field";
import { Tabs } from "../shared/ui/Tabs";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

interface DailyRow { businessDate: string; branchId: string; branchName: string; ordersCount: number; revenue: number; }

interface SalesDetailReport {
  summary: { revenue: number; ordersCount: number; avgOrderValue: number };
  byPaymentMethod: { name: string; kind: string | null; amount: number; count: number }[];
  byOrderType: { orderType: string; amount: number; count: number }[];
  dailyTrend: { date: string; revenue: number; ordersCount: number }[];
}

interface CancelledOrderRow { id: string; branchName: string | null; orderType: string; total: number; customerName: string | null; createdAt: string; }
interface CancelledOrdersReport { summary: { totalCount: number; totalValue: number }; orders: CancelledOrderRow[]; }

interface DelayedOrderRow { id: string; branchName: string | null; orderType: string; status: string; createdAt: string; prepMinutes: number; }
interface DelaysReport {
  thresholdMinutes: number;
  summary: { totalOrders: number; delayedCount: number; delayedPercent: number; avgPrepMinutes: number };
  delayedOrders: DelayedOrderRow[];
}

interface ItemPerformanceRow { name: string; quantity: number; revenue: number; cost: number; profit: number; costIncomplete: boolean; }
interface ItemPerformanceReport {
  topByRevenue: ItemPerformanceRow[];
  topByQuantity: ItemPerformanceRow[];
  leastByQuantity: ItemPerformanceRow[];
  leastProfitable: ItemPerformanceRow[];
}

interface CatalogRow {
  itemId: string; itemName: string; category: string | null; isActive: boolean; label: string;
  price: number; quantitySold: number; revenue: number;
}
interface CatalogReport { items: CatalogRow[]; }

interface RecipeIngredient { ingredient: string; unit: string | null; quantityPerUnit: number; unitCost: number | null; }
interface RecipeRow {
  itemName: string; variantId: string; label: string; price: number;
  ingredients: RecipeIngredient[]; hasActiveVersion: boolean; hasMissingCost: boolean;
}

const TABS = [
  { key: "daily", label: "الملخّص اليومي" },
  { key: "sales-detail", label: "تفصيل المبيعات" },
  { key: "cancelled-orders", label: "الطلبات الملغاة" },
  { key: "delays", label: "التأخيرات" },
  { key: "item-performance", label: "أداء الأصناف" },
  { key: "catalog", label: "قائمة الطعام" },
  { key: "recipes", label: "الوصفات" },
];

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function useDateRange() {
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  return { from, setFrom, to, setTo };
}

function DateRangeFields({ from, setFrom, to, setTo }: { from: string; setFrom: (v: string) => void; to: string; setTo: (v: string) => void }) {
  return (
    <div className="flex items-end gap-3">
      <Field label="من">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </Field>
      <Field label="إلى">
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </Field>
    </div>
  );
}

export function OperationalReportsPage() {
  const [tab, setTab] = useState("daily");

  return (
    <div>
      <PageHeader title="تقارير المبيعات والتشغيل" description="ملخّصات يومية، تفصيل مبيعات، طلبات ملغاة، تأخيرات، وأداء الأصناف" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "daily" && <DailyTab />}
      {tab === "sales-detail" && <SalesDetailTab />}
      {tab === "cancelled-orders" && <CancelledOrdersTab />}
      {tab === "delays" && <DelaysTab />}
      {tab === "item-performance" && <ItemPerformanceTab />}
      {tab === "catalog" && <CatalogTab />}
      {tab === "recipes" && <RecipesTab />}
    </div>
  );
}

function DailyTab() {
  const { from, setFrom, to, setTo } = useDateRange();
  const query = useQuery({
    queryKey: ["reports", "daily", from, to],
    queryFn: () => apiRequest<DailyRow[]>(`/reports/daily?from=${from}&to=${to}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>الملخّص اليومي لكل فرع</CardTitle>
        <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && query.data.length === 0 && <EmptyState>مفيش طلبات في الفترة دي</EmptyState>}
        {query.data && query.data.length > 0 && (
          <Table>
            <THead>
              <TR><TH>التاريخ</TH><TH>الفرع</TH><TH>عدد الطلبات</TH><TH>الإيراد</TH></TR>
            </THead>
            <TBody>
              {query.data.map((r, i) => (
                <TR key={i}>
                  <TD>{r.businessDate}</TD>
                  <TD className="font-semibold">{r.branchName}</TD>
                  <TD>{r.ordersCount}</TD>
                  <TD>{fmt(r.revenue)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function SalesDetailTab() {
  const { from, setFrom, to, setTo } = useDateRange();
  const query = useQuery({
    queryKey: ["reports", "sales-detail", from, to],
    queryFn: () => apiRequest<SalesDetailReport>(`/reports/sales-detail?from=${from}&to=${to}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>تفصيل المبيعات</CardTitle>
        <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
      </CardHeader>
      <CardBody className="space-y-6">
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">الإيراد</p>
                <p className="text-lg font-bold text-slate-900">{fmt(query.data.summary.revenue)} ج.م</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">عدد الطلبات</p>
                <p className="text-lg font-bold text-slate-900">{fmt(query.data.summary.ordersCount)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">متوسط قيمة الطلب</p>
                <p className="text-lg font-bold text-slate-900">{fmt(query.data.summary.avgOrderValue)} ج.م</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-bold text-slate-700">حسب طريقة الدفع</h3>
                <ul className="space-y-1 text-sm">
                  {query.data.byPaymentMethod.map((m, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span className="text-slate-700">{m.name}</span>
                      <span className="text-slate-500">{fmt(m.amount)} ج.م ({m.count})</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-bold text-slate-700">حسب نوع الطلب</h3>
                <ul className="space-y-1 text-sm">
                  {query.data.byOrderType.map((t, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span className="text-slate-700">{t.orderType}</span>
                      <span className="text-slate-500">{fmt(t.amount)} ج.م ({t.count})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function CancelledOrdersTab() {
  const { from, setFrom, to, setTo } = useDateRange();
  const query = useQuery({
    queryKey: ["reports", "cancelled-orders", from, to],
    queryFn: () => apiRequest<CancelledOrdersReport>(`/reports/cancelled-orders?from=${from}&to=${to}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>الطلبات الملغاة</CardTitle>
        <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && (
          <>
            <p className="mb-4 text-sm font-semibold text-slate-700">
              الإجمالي: {query.data.summary.totalCount} طلب - {fmt(query.data.summary.totalValue)} ج.م
            </p>
            {query.data.orders.length === 0 ? (
              <EmptyState>مفيش طلبات ملغاة في الفترة دي</EmptyState>
            ) : (
              <Table>
                <THead>
                  <TR><TH>الفرع</TH><TH>النوع</TH><TH>القيمة</TH><TH>العميل</TH><TH>التاريخ</TH></TR>
                </THead>
                <TBody>
                  {query.data.orders.map((o) => (
                    <TR key={o.id}>
                      <TD>{o.branchName ?? "-"}</TD>
                      <TD>{o.orderType}</TD>
                      <TD>{fmt(o.total)}</TD>
                      <TD>{o.customerName ?? "-"}</TD>
                      <TD>{new Date(o.createdAt).toLocaleString("en-GB")}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function DelaysTab() {
  const { from, setFrom, to, setTo } = useDateRange();
  const [threshold, setThreshold] = useState(45);
  const query = useQuery({
    queryKey: ["reports", "delays", from, to, threshold],
    queryFn: () => apiRequest<DelaysReport>(`/reports/delays?from=${from}&to=${to}&thresholdMinutes=${threshold}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>التأخيرات في التحضير</CardTitle>
        <div className="flex items-end gap-3">
          <Field label="الحد بالدقائق">
            <Input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-24" />
          </Field>
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && (
          <>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">متأخر</p>
                <p className="text-lg font-bold text-red-700">{query.data.summary.delayedCount} من {query.data.summary.totalOrders}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">نسبة التأخير</p>
                <p className="text-lg font-bold text-slate-900">{fmt(query.data.summary.delayedPercent * 100)}%</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">متوسط وقت التحضير</p>
                <p className="text-lg font-bold text-slate-900">{fmt(query.data.summary.avgPrepMinutes)} دقيقة</p>
              </div>
            </div>
            {query.data.delayedOrders.length === 0 ? (
              <EmptyState>مفيش طلبات متأخرة في الفترة دي</EmptyState>
            ) : (
              <Table>
                <THead>
                  <TR><TH>الفرع</TH><TH>النوع</TH><TH>الحالة</TH><TH>وقت التحضير (دقيقة)</TH></TR>
                </THead>
                <TBody>
                  {query.data.delayedOrders.map((o) => (
                    <TR key={o.id}>
                      <TD>{o.branchName ?? "-"}</TD>
                      <TD>{o.orderType}</TD>
                      <TD>{o.status}</TD>
                      <TD className="font-semibold text-red-700">{fmt(o.prepMinutes)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function ItemPerformanceTab() {
  const { from, setFrom, to, setTo } = useDateRange();
  const query = useQuery({
    queryKey: ["reports", "item-performance", from, to],
    queryFn: () => apiRequest<ItemPerformanceReport>(`/reports/item-performance?from=${from}&to=${to}`),
  });

  const section = (title: string, rows: ItemPerformanceRow[]) => (
    <div>
      <h3 className="mb-2 text-sm font-bold text-slate-700">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">مفيش بيانات</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between">
              <span className="text-slate-700">{r.name}</span>
              <span className="text-slate-500">
                {r.quantity}× - {fmt(r.revenue)} ج.م{r.costIncomplete ? " (تكلفة ناقصة)" : ` (ربح ${fmt(r.profit)})`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>أداء الأصناف</CardTitle>
        <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
      </CardHeader>
      <CardBody className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && (
          <>
            {section("الأعلى إيرادًا", query.data.topByRevenue)}
            {section("الأكثر مبيعًا", query.data.topByQuantity)}
            {section("الأقل مبيعًا", query.data.leastByQuantity)}
            {section("الأقل ربحًا", query.data.leastProfitable)}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function CatalogTab() {
  const { from, setFrom, to, setTo } = useDateRange();
  const query = useQuery({
    queryKey: ["reports", "catalog", from, to],
    queryFn: () => apiRequest<CatalogReport>(`/reports/catalog?from=${from}&to=${to}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>كل أصناف المنيو ومبيعاتها</CardTitle>
        <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && query.data.items.length === 0 && <EmptyState>مفيش أصناف</EmptyState>}
        {query.data && query.data.items.length > 0 && (
          <Table>
            <THead>
              <TR><TH>الصنف</TH><TH>الحجم</TH><TH>الفئة</TH><TH>السعر</TH><TH>الكمية المباعة</TH><TH>الإيراد</TH><TH>نشط</TH></TR>
            </THead>
            <TBody>
              {query.data.items.map((r, i) => (
                <TR key={i}>
                  <TD>{r.itemName}</TD>
                  <TD>{r.label}</TD>
                  <TD>{r.category ?? "-"}</TD>
                  <TD>{fmt(r.price)}</TD>
                  <TD className={r.quantitySold === 0 ? "text-slate-400" : ""}>{r.quantitySold}</TD>
                  <TD>{fmt(r.revenue)}</TD>
                  <TD>{r.isActive ? "نشط" : "متوقف"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function RecipesTab() {
  const query = useQuery({ queryKey: ["reports", "recipes"], queryFn: () => apiRequest<RecipeRow[]>("/reports/recipes") });

  return (
    <Card>
      <CardHeader>
        <CardTitle>كل الوصفات - مراجعة جودة البيانات</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && query.data.length === 0 && <EmptyState>مفيش أصناف</EmptyState>}
        {query.data?.map((r) => (
          <div key={r.variantId} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold text-slate-800">{r.itemName} - {r.label}</span>
              <div className="flex gap-2">
                {!r.hasActiveVersion && <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">من غير وصفة نشطة</span>}
                {r.hasActiveVersion && r.hasMissingCost && (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">مكوّن من غير تكلفة</span>
                )}
              </div>
            </div>
            {r.ingredients.length > 0 && (
              <ul className="space-y-0.5 text-xs text-slate-500">
                {r.ingredients.map((ing, i) => (
                  <li key={i}>
                    {ing.ingredient}: {ing.quantityPerUnit} {ing.unit ?? ""} {ing.unitCost !== null ? `(${fmt(ing.unitCost)} ج.م/وحدة)` : "(بدون تكلفة)"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
