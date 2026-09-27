import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../shared/api/client";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Field, Input, Select } from "../shared/ui/Field";
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

interface Branch { id: string; name: string; }
interface InventoryItem { id: string; name: string; unit: string; }

interface InventoryValuationItemRow {
  branchId: string; branchName: string; inventoryItemId: string; itemName: string;
  unit: string; quantity: number; unitCost: number | null; value: number; costIncomplete: boolean;
}
interface InventoryValuationReport {
  totalValue: number;
  byBranch: { branchId: string; branchName: string; totalValue: number }[];
  items: InventoryValuationItemRow[];
}

interface StockCardRow {
  id: string; movementType: string; quantityDelta: number; unitCost: number | null;
  totalCost: number | null; balanceAfter: number; reason: string | null; occurredAt: string;
}

interface TransferReportLine {
  itemName: string; unit: string; requestedQuantity: number;
  dispatchedQuantity: number | null; receivedQuantity: number | null; variance: number | null;
}
interface TransferReportRow {
  id: string; fromBranchName: string | null; toBranchName: string; status: string;
  createdAt: string; dispatchedAt: string | null; receivedAt: string | null; lines: TransferReportLine[];
}

interface NegativeStockRow {
  branchName: string; itemName: string; unit: string; quantity: number; negativeStockPolicy: string;
}

interface InventoryComparisonRow {
  branchId: string; branchName: string; itemName: string; unit: string; quantity: number;
}

interface Supplier { id: string; name: string; }

interface PurchaseOrderReportRow {
  id: string; createdAt: string; status: string; supplierName: string; branchName: string;
  itemsCount: number; totalValue: number;
}
interface PurchaseReceiptReportRow {
  id: string; confirmedAt: string | null; supplierName: string | null; branchName: string;
  purchaseOrderId: string | null; totalValue: number;
}
interface PurchasePriceHistoryRow {
  purchaseOrderId: string; orderDate: string; status: string; supplierName: string; quantity: number; unitPrice: number;
}
interface PurchasePriceVarianceRow {
  purchaseOrderId: string; orderDate: string; supplierName: string; itemName: string;
  previousPrice: number | null; newPrice: number; difference: number | null; differencePercent: number | null;
}
interface SupplierPerformanceReport {
  ordersCount: number; receivedOrdersCount: number; fulfillmentRate: number | null; avgLeadTimeDays: number | null;
}
interface OutstandingPurchaseOrderRow {
  id: string; createdAt: string; supplierName: string; branchName: string; itemsCount: number; totalValue: number;
}

const PO_STATUS_LABELS: Record<string, string> = { DRAFT: "مسودة", SENT: "اترسل للمورد", RECEIVED: "اتسلّم", CANCELLED: "ملغي" };

interface DriverPerformanceRow {
  driverId: string; driverName: string; ordersCount: number; revenue: number; failedCount: number; avgDeliveryMinutes: number | null;
}
interface DeliveryServiceReport {
  thresholdMinutes: number; totalOrders: number; failedCount: number; failureRate: number | null;
  avgPrepMinutes: number | null; avgDeliveryMinutes: number | null; avgTotalMinutes: number | null; onTimeRate: number | null;
}
interface PeakHoursReport {
  byHour: { hour: number; ordersCount: number; revenue: number }[];
  byDayOfWeek: { dow: number; dayName: string; ordersCount: number; revenue: number }[];
}
interface CustomerSpendRow {
  phone: string; name: string | null; ordersCount: number; totalSpent: number; avgOrderValue: number; lastOrderAt: string;
}
interface CustomerSpendReport { newCustomersCount: number; topCustomers: CustomerSpendRow[]; }
interface ExpensesReportRow {
  id: string; businessDate: string; branchName: string | null; category: string; amount: number; alertThreshold: number; notes: string | null;
}
interface ExpensesReport {
  total: number;
  byCategory: { category: string; total: number; count: number }[];
  trend: { period: string; total: number }[];
  anomalies: ExpensesReportRow[];
}
interface PurchasesReport {
  total: number;
  byCategory: { category: string; total: number; count: number }[];
  trend: { period: string; total: number }[];
}

const TABS = [
  { key: "daily", label: "الملخّص اليومي" },
  { key: "sales-detail", label: "تفصيل المبيعات" },
  { key: "cancelled-orders", label: "الطلبات الملغاة" },
  { key: "delays", label: "التأخيرات" },
  { key: "item-performance", label: "أداء الأصناف" },
  { key: "catalog", label: "قائمة الطعام" },
  { key: "recipes", label: "الوصفات" },
  { key: "inventory-valuation", label: "تقييم المخزون" },
  { key: "stock-card", label: "كارت الصنف" },
  { key: "transfers", label: "التحويلات بين الفروع" },
  { key: "negative-stock", label: "المخزون السالب" },
  { key: "drivers", label: "أداء السائقين" },
  { key: "delivery-service", label: "خدمة الدليفري" },
  { key: "peak-hours", label: "ساعات الذروة" },
  { key: "customer-spend", label: "أعلى العملاء إنفاقًا" },
  { key: "expenses-report", label: "تقرير المصروفات" },
  { key: "purchases-report", label: "تقرير المشتريات النقدية" },
];
const BRANCH_HEALTH_TAB = { key: "inventory-comparison", label: "مقارنة المخزون بين الفروع" };
const PROCUREMENT_TABS = [
  { key: "purchase-orders", label: "أوامر الشراء" },
  { key: "purchase-receipts", label: "أذون الاستلام" },
  { key: "purchase-price-history", label: "تاريخ سعر الصنف" },
  { key: "purchase-price-variance", label: "فروق أسعار الشراء" },
  { key: "supplier-performance", label: "أداء المورد" },
  { key: "outstanding-purchase-orders", label: "أوامر شراء مستنية" },
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
  const { user } = useAuth();
  // مقارنة شاملة بين كل الفروع - أدمن/محاسب بس، نفس صلاحية reports.branch_health
  const canSeeBranchHealth = user?.role === "admin" || user?.role === "accountant";
  // نفس أدوار purchasing.view بالظبط (راجع procurement.module.ts) - أدمن/مدير فرع/محاسب
  const canSeeProcurement = user?.role === "admin" || user?.role === "branch_manager" || user?.role === "accountant";
  const tabs = [
    ...TABS,
    ...(canSeeBranchHealth ? [BRANCH_HEALTH_TAB] : []),
    ...(canSeeProcurement ? PROCUREMENT_TABS : []),
  ];

  return (
    <div>
      <PageHeader title="تقارير المبيعات والتشغيل" description="ملخّصات يومية، تفصيل مبيعات، طلبات ملغاة، تأخيرات، أداء الأصناف، وتقارير المخزون والمشتريات" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "daily" && <DailyTab />}
      {tab === "sales-detail" && <SalesDetailTab />}
      {tab === "cancelled-orders" && <CancelledOrdersTab />}
      {tab === "delays" && <DelaysTab />}
      {tab === "item-performance" && <ItemPerformanceTab />}
      {tab === "catalog" && <CatalogTab />}
      {tab === "recipes" && <RecipesTab />}
      {tab === "inventory-valuation" && <InventoryValuationTab />}
      {tab === "stock-card" && <StockCardTab />}
      {tab === "transfers" && <TransfersTab />}
      {tab === "negative-stock" && <NegativeStockTab />}
      {tab === "inventory-comparison" && canSeeBranchHealth && <InventoryComparisonTab />}
      {tab === "purchase-orders" && canSeeProcurement && <PurchaseOrdersTab />}
      {tab === "purchase-receipts" && canSeeProcurement && <PurchaseReceiptsTab />}
      {tab === "purchase-price-history" && canSeeProcurement && <PurchasePriceHistoryTab />}
      {tab === "purchase-price-variance" && canSeeProcurement && <PurchasePriceVarianceTab />}
      {tab === "supplier-performance" && canSeeProcurement && <SupplierPerformanceTab />}
      {tab === "outstanding-purchase-orders" && canSeeProcurement && <OutstandingPurchaseOrdersTab />}
      {tab === "drivers" && <DriversTab />}
      {tab === "delivery-service" && <DeliveryServiceTab />}
      {tab === "peak-hours" && <PeakHoursTab />}
      {tab === "customer-spend" && <CustomerSpendTab />}
      {tab === "expenses-report" && <ExpensesReportTab />}
      {tab === "purchases-report" && <PurchasesReportTab />}
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

function useBranches() {
  return useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
}
function useInventoryItems() {
  return useQuery({ queryKey: ["inventory", "items"], queryFn: () => apiRequest<InventoryItem[]>("/inventory/items") });
}

function BranchSelect({ value, onChange, branches }: { value: string; onChange: (v: string) => void; branches: Branch[] }) {
  return (
    <Field label="الفرع">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">كل الفروع</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </Select>
    </Field>
  );
}

function InventoryValuationTab() {
  const [branchId, setBranchId] = useState("");
  const branchesQuery = useBranches();
  const query = useQuery({
    queryKey: ["reports", "inventory-valuation", branchId],
    queryFn: () => apiRequest<InventoryValuationReport>(`/reports/inventory-valuation${branchId ? `?branchId=${branchId}` : ""}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>تقييم المخزون - قيمة كل صنف في كل فرع</CardTitle>
        <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
      </CardHeader>
      <CardBody className="space-y-4">
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">القيمة الإجمالية</p>
                <p className="text-lg font-bold text-slate-900">{fmt(query.data.totalValue)} ج.م</p>
              </div>
            </div>
            {!branchId && query.data.byBranch.length > 0 && (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {query.data.byBranch.map((b) => (
                  <li key={b.branchId} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <span className="text-slate-700">{b.branchName}</span>
                    <span className="font-semibold text-slate-900">{fmt(b.totalValue)} ج.م</span>
                  </li>
                ))}
              </ul>
            )}
            {query.data.items.length === 0 ? (
              <EmptyState>مفيش رصيد مخزون حاليًا</EmptyState>
            ) : (
              <Table>
                <THead>
                  <TR><TH>الصنف</TH><TH>الفرع</TH><TH>الكمية</TH><TH>تكلفة الوحدة</TH><TH>القيمة</TH></TR>
                </THead>
                <TBody>
                  {query.data.items.map((r, i) => (
                    <TR key={i}>
                      <TD>{r.itemName}</TD>
                      <TD>{r.branchName}</TD>
                      <TD>{fmt(r.quantity)} {r.unit}</TD>
                      <TD>{r.costIncomplete ? <span className="text-amber-600">بدون تكلفة</span> : fmt(r.unitCost!)}</TD>
                      <TD className="font-semibold">{fmt(r.value)}</TD>
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

function StockCardTab() {
  const { user } = useAuth();
  const [branchId, setBranchId] = useState(user?.role === "branch_manager" ? (user.branchId ?? "") : "");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const { from, setFrom, to, setTo } = useDateRange();
  const branchesQuery = useBranches();
  const itemsQuery = useInventoryItems();
  const canQuery = !!branchId && !!inventoryItemId;
  const query = useQuery({
    queryKey: ["reports", "stock-card", branchId, inventoryItemId, from, to],
    queryFn: () =>
      apiRequest<StockCardRow[]>(`/reports/stock-card?branchId=${branchId}&inventoryItemId=${inventoryItemId}&from=${from}&to=${to}`),
    enabled: canQuery,
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>كارت الصنف - كل حركة بالترتيب مع الرصيد بعدها</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          {user?.role !== "branch_manager" && <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />}
          <Field label="الصنف">
            <Select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)}>
              <option value="">اختار صنف</option>
              {itemsQuery.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody>
        {!canQuery && <EmptyState>اختار الفرع والصنف عشان تشوف كارت الحركة</EmptyState>}
        {canQuery && query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {canQuery && query.data && query.data.length === 0 && <EmptyState>مفيش حركات في الفترة دي</EmptyState>}
        {canQuery && query.data && query.data.length > 0 && (
          <Table>
            <THead>
              <TR><TH>التاريخ</TH><TH>نوع الحركة</TH><TH>الكمية</TH><TH>تكلفة الوحدة</TH><TH>إجمالي التكلفة</TH><TH>الرصيد بعدها</TH><TH>السبب</TH></TR>
            </THead>
            <TBody>
              {query.data.map((r) => (
                <TR key={r.id}>
                  <TD>{new Date(r.occurredAt).toLocaleString("en-GB")}</TD>
                  <TD>{r.movementType}</TD>
                  <TD className={r.quantityDelta < 0 ? "text-red-600" : "text-emerald-600"}>{r.quantityDelta > 0 ? "+" : ""}{fmt(r.quantityDelta)}</TD>
                  <TD>{r.unitCost !== null ? fmt(r.unitCost) : "-"}</TD>
                  <TD>{r.totalCost !== null ? fmt(r.totalCost) : "-"}</TD>
                  <TD className="font-semibold">{fmt(r.balanceAfter)}</TD>
                  <TD>{r.reason ?? "-"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function TransfersTab() {
  const [branchId, setBranchId] = useState("");
  const { from, setFrom, to, setTo } = useDateRange();
  const branchesQuery = useBranches();
  const query = useQuery({
    queryKey: ["reports", "transfers", branchId, from, to],
    queryFn: () => apiRequest<TransferReportRow[]>(`/reports/transfers?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ""}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>التحويلات بين الفروع</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && query.data.length === 0 && <EmptyState>مفيش تحويلات في الفترة دي</EmptyState>}
        {query.data?.map((t) => (
          <div key={t.id} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">{t.fromBranchName ?? "السنتر كيتشن"} ← {t.toBranchName}</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{t.status}</span>
            </div>
            <Table>
              <THead>
                <TR><TH>الصنف</TH><TH>المطلوب</TH><TH>اتشحن</TH><TH>اتستلم</TH><TH>الفرق</TH></TR>
              </THead>
              <TBody>
                {t.lines.map((l, i) => (
                  <TR key={i}>
                    <TD>{l.itemName}</TD>
                    <TD>{fmt(l.requestedQuantity)} {l.unit}</TD>
                    <TD>{l.dispatchedQuantity !== null ? fmt(l.dispatchedQuantity) : "-"}</TD>
                    <TD>{l.receivedQuantity !== null ? fmt(l.receivedQuantity) : "-"}</TD>
                    <TD className={l.variance ? "font-semibold text-red-600" : ""}>{l.variance !== null ? fmt(l.variance) : "-"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function NegativeStockTab() {
  const [branchId, setBranchId] = useState("");
  const branchesQuery = useBranches();
  const query = useQuery({
    queryKey: ["reports", "negative-stock", branchId],
    queryFn: () => apiRequest<NegativeStockRow[]>(`/reports/negative-stock${branchId ? `?branchId=${branchId}` : ""}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>أصناف برصيد سالب دلوقتي</CardTitle>
        <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && query.data.length === 0 && <EmptyState>مفيش أصناف برصيد سالب - ممتاز</EmptyState>}
        {query.data && query.data.length > 0 && (
          <Table>
            <THead>
              <TR><TH>الصنف</TH><TH>الفرع</TH><TH>الرصيد</TH><TH>سياسة الرصيد السالب</TH></TR>
            </THead>
            <TBody>
              {query.data.map((r, i) => (
                <TR key={i}>
                  <TD>{r.itemName}</TD>
                  <TD>{r.branchName}</TD>
                  <TD className="font-semibold text-red-600">{fmt(r.quantity)} {r.unit}</TD>
                  <TD>{r.negativeStockPolicy}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function InventoryComparisonTab() {
  const [inventoryItemId, setInventoryItemId] = useState("");
  const itemsQuery = useInventoryItems();
  const query = useQuery({
    queryKey: ["reports", "inventory-comparison", inventoryItemId],
    queryFn: () => apiRequest<InventoryComparisonRow[]>(`/reports/inventory-comparison${inventoryItemId ? `?inventoryItemId=${inventoryItemId}` : ""}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>مقارنة رصيد الأصناف بين كل الفروع</CardTitle>
        <Field label="الصنف">
          <Select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)}>
            <option value="">كل الأصناف</option>
            {itemsQuery.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </Field>
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && query.data.length === 0 && <EmptyState>مفيش بيانات</EmptyState>}
        {query.data && query.data.length > 0 && (
          <Table>
            <THead>
              <TR><TH>الصنف</TH><TH>الفرع</TH><TH>الرصيد</TH></TR>
            </THead>
            <TBody>
              {query.data.map((r, i) => (
                <TR key={i}>
                  <TD>{r.itemName}</TD>
                  <TD>{r.branchName}</TD>
                  <TD className={r.quantity < 0 ? "font-semibold text-red-600" : ""}>{fmt(r.quantity)} {r.unit}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function useSuppliers() {
  return useQuery({ queryKey: ["procurement", "suppliers"], queryFn: () => apiRequest<Supplier[]>("/procurement/suppliers") });
}

function SupplierSelect({ value, onChange, suppliers, allowEmpty }: {
  value: string; onChange: (v: string) => void; suppliers: Supplier[]; allowEmpty?: boolean;
}) {
  return (
    <Field label="المورد">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty && <option value="">كل الموردين</option>}
        {!allowEmpty && <option value="">اختار مورد</option>}
        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
    </Field>
  );
}

function PurchaseOrdersTab() {
  const [branchId, setBranchId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const { from, setFrom, to, setTo } = useDateRange();
  const branchesQuery = useBranches();
  const suppliersQuery = useSuppliers();
  const query = useQuery({
    queryKey: ["reports", "purchase-orders", branchId, supplierId, from, to],
    queryFn: () =>
      apiRequest<PurchaseOrderReportRow[]>(
        `/reports/purchase-orders?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ""}${supplierId ? `&supplierId=${supplierId}` : ""}`
      ),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>أوامر الشراء</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
          <SupplierSelect value={supplierId} onChange={setSupplierId} suppliers={suppliersQuery.data ?? []} allowEmpty />
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && query.data.length === 0 && <EmptyState>مفيش أوامر شراء في الفترة دي</EmptyState>}
        {query.data && query.data.length > 0 && (
          <Table>
            <THead>
              <TR><TH>التاريخ</TH><TH>المورد</TH><TH>الفرع</TH><TH>الحالة</TH><TH>عدد البنود</TH><TH>القيمة الإجمالية</TH></TR>
            </THead>
            <TBody>
              {query.data.map((r) => (
                <TR key={r.id}>
                  <TD>{new Date(r.createdAt).toLocaleDateString("en-GB")}</TD>
                  <TD>{r.supplierName}</TD>
                  <TD>{r.branchName}</TD>
                  <TD>{PO_STATUS_LABELS[r.status] ?? r.status}</TD>
                  <TD>{r.itemsCount}</TD>
                  <TD className="font-semibold">{fmt(r.totalValue)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function PurchaseReceiptsTab() {
  const [branchId, setBranchId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const { from, setFrom, to, setTo } = useDateRange();
  const branchesQuery = useBranches();
  const suppliersQuery = useSuppliers();
  const query = useQuery({
    queryKey: ["reports", "purchase-receipts", branchId, supplierId, from, to],
    queryFn: () =>
      apiRequest<PurchaseReceiptReportRow[]>(
        `/reports/purchase-receipts?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ""}${supplierId ? `&supplierId=${supplierId}` : ""}`
      ),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>أذون الاستلام المؤكّدة</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
          <SupplierSelect value={supplierId} onChange={setSupplierId} suppliers={suppliersQuery.data ?? []} allowEmpty />
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && query.data.length === 0 && <EmptyState>مفيش أذون استلام مؤكّدة في الفترة دي</EmptyState>}
        {query.data && query.data.length > 0 && (
          <Table>
            <THead>
              <TR><TH>تاريخ التأكيد</TH><TH>المورد</TH><TH>الفرع</TH><TH>القيمة الإجمالية</TH></TR>
            </THead>
            <TBody>
              {query.data.map((r) => (
                <TR key={r.id}>
                  <TD>{r.confirmedAt ? new Date(r.confirmedAt).toLocaleDateString("en-GB") : "-"}</TD>
                  <TD>{r.supplierName ?? "-"}</TD>
                  <TD>{r.branchName}</TD>
                  <TD className="font-semibold">{fmt(r.totalValue)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function PurchasePriceHistoryTab() {
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const itemsQuery = useInventoryItems();
  const suppliersQuery = useSuppliers();
  const canQuery = !!inventoryItemId;
  const query = useQuery({
    queryKey: ["reports", "purchase-price-history", inventoryItemId, supplierId],
    queryFn: () =>
      apiRequest<PurchasePriceHistoryRow[]>(
        `/reports/purchase-price-history?inventoryItemId=${inventoryItemId}${supplierId ? `&supplierId=${supplierId}` : ""}`
      ),
    enabled: canQuery,
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>تاريخ سعر الصنف عبر أوامر الشراء</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="الصنف">
            <Select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)}>
              <option value="">اختار صنف</option>
              {itemsQuery.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
          <SupplierSelect value={supplierId} onChange={setSupplierId} suppliers={suppliersQuery.data ?? []} allowEmpty />
        </div>
      </CardHeader>
      <CardBody>
        {!canQuery && <EmptyState>اختار صنف عشان تشوف تاريخ سعره</EmptyState>}
        {canQuery && query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {canQuery && query.data && query.data.length === 0 && <EmptyState>مفيش أوامر شراء لسه للصنف ده</EmptyState>}
        {canQuery && query.data && query.data.length > 0 && (
          <Table>
            <THead>
              <TR><TH>التاريخ</TH><TH>المورد</TH><TH>الحالة</TH><TH>الكمية</TH><TH>سعر الوحدة</TH></TR>
            </THead>
            <TBody>
              {query.data.map((r) => (
                <TR key={r.purchaseOrderId}>
                  <TD>{new Date(r.orderDate).toLocaleDateString("en-GB")}</TD>
                  <TD>{r.supplierName}</TD>
                  <TD>{PO_STATUS_LABELS[r.status] ?? r.status}</TD>
                  <TD>{fmt(r.quantity)}</TD>
                  <TD className="font-semibold">{fmt(r.unitPrice)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function PurchasePriceVarianceTab() {
  const [branchId, setBranchId] = useState("");
  const { from, setFrom, to, setTo } = useDateRange();
  const branchesQuery = useBranches();
  const query = useQuery({
    queryKey: ["reports", "purchase-price-variance", branchId, from, to],
    queryFn: () =>
      apiRequest<PurchasePriceVarianceRow[]>(`/reports/purchase-price-variance?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ""}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>فروق أسعار الشراء عن آخر سعر سابق لنفس المورد والصنف</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && query.data.length === 0 && <EmptyState>مفيش بنود أوامر شراء في الفترة دي</EmptyState>}
        {query.data && query.data.length > 0 && (
          <Table>
            <THead>
              <TR><TH>التاريخ</TH><TH>المورد</TH><TH>الصنف</TH><TH>السعر السابق</TH><TH>السعر الجديد</TH><TH>الفرق</TH></TR>
            </THead>
            <TBody>
              {query.data.map((r, i) => (
                <TR key={i}>
                  <TD>{new Date(r.orderDate).toLocaleDateString("en-GB")}</TD>
                  <TD>{r.supplierName}</TD>
                  <TD>{r.itemName}</TD>
                  <TD>{r.previousPrice !== null ? fmt(r.previousPrice) : "-"}</TD>
                  <TD>{fmt(r.newPrice)}</TD>
                  <TD className={r.difference && r.difference > 0 ? "font-semibold text-red-600" : r.difference && r.difference < 0 ? "font-semibold text-emerald-600" : ""}>
                    {r.difference !== null ? `${r.difference > 0 ? "+" : ""}${fmt(r.difference)} (${fmt(r.differencePercent ?? 0)}%)` : "أول سعر"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function SupplierPerformanceTab() {
  const [supplierId, setSupplierId] = useState("");
  const { from, setFrom, to, setTo } = useDateRange();
  const suppliersQuery = useSuppliers();
  const canQuery = !!supplierId;
  const query = useQuery({
    queryKey: ["reports", "supplier-performance", supplierId, from, to],
    queryFn: () => apiRequest<SupplierPerformanceReport>(`/reports/supplier-performance?supplierId=${supplierId}&from=${from}&to=${to}`),
    enabled: canQuery,
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>أداء مورد</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <SupplierSelect value={supplierId} onChange={setSupplierId} suppliers={suppliersQuery.data ?? []} />
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody>
        {!canQuery && <EmptyState>اختار مورد عشان تشوف أداءه</EmptyState>}
        {canQuery && query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {canQuery && query.data && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">عدد أوامر الشراء</p>
              <p className="text-lg font-bold text-slate-900">{query.data.ordersCount}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">اتستلم منها</p>
              <p className="text-lg font-bold text-slate-900">{query.data.receivedOrdersCount}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">معدّل التنفيذ</p>
              <p className="text-lg font-bold text-slate-900">{query.data.fulfillmentRate !== null ? `${fmt(query.data.fulfillmentRate)}%` : "-"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">متوسط مدة التسليم</p>
              <p className="text-lg font-bold text-slate-900">{query.data.avgLeadTimeDays !== null ? `${fmt(query.data.avgLeadTimeDays)} يوم` : "-"}</p>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function OutstandingPurchaseOrdersTab() {
  const [branchId, setBranchId] = useState("");
  const branchesQuery = useBranches();
  const query = useQuery({
    queryKey: ["reports", "outstanding-purchase-orders", branchId],
    queryFn: () => apiRequest<OutstandingPurchaseOrderRow[]>(`/reports/outstanding-purchase-orders${branchId ? `?branchId=${branchId}` : ""}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>أوامر شراء اترسلت ولسه من غير إذن استلام مؤكّد</CardTitle>
        <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && query.data.length === 0 && <EmptyState>مفيش أوامر شراء مستنية - كله اتسلّم</EmptyState>}
        {query.data && query.data.length > 0 && (
          <Table>
            <THead>
              <TR><TH>التاريخ</TH><TH>المورد</TH><TH>الفرع</TH><TH>عدد البنود</TH><TH>القيمة</TH></TR>
            </THead>
            <TBody>
              {query.data.map((r) => (
                <TR key={r.id}>
                  <TD>{new Date(r.createdAt).toLocaleDateString("en-GB")}</TD>
                  <TD>{r.supplierName}</TD>
                  <TD>{r.branchName}</TD>
                  <TD>{r.itemsCount}</TD>
                  <TD className="font-semibold">{fmt(r.totalValue)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function DriversTab() {
  const [branchId, setBranchId] = useState("");
  const { from, setFrom, to, setTo } = useDateRange();
  const branchesQuery = useBranches();
  const query = useQuery({
    queryKey: ["reports", "drivers", branchId, from, to],
    queryFn: () => apiRequest<DriverPerformanceRow[]>(`/reports/drivers?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ""}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>أداء السائقين</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && query.data.length === 0 && <EmptyState>مفيش توصيلات في الفترة دي</EmptyState>}
        {query.data && query.data.length > 0 && (
          <Table>
            <THead>
              <TR><TH>السائق</TH><TH>عدد الطلبات المسلّمة</TH><TH>الإيراد</TH><TH>عدد الفشل</TH><TH>متوسط وقت التوصيل (دقيقة)</TH></TR>
            </THead>
            <TBody>
              {query.data.map((r) => (
                <TR key={r.driverId}>
                  <TD>{r.driverName}</TD>
                  <TD>{r.ordersCount}</TD>
                  <TD>{fmt(r.revenue)}</TD>
                  <TD className={r.failedCount > 0 ? "text-red-600" : ""}>{r.failedCount}</TD>
                  <TD>{r.avgDeliveryMinutes !== null ? fmt(r.avgDeliveryMinutes) : "-"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function DeliveryServiceTab() {
  const [branchId, setBranchId] = useState("");
  const [threshold, setThreshold] = useState(45);
  const { from, setFrom, to, setTo } = useDateRange();
  const branchesQuery = useBranches();
  const query = useQuery({
    queryKey: ["reports", "delivery-service", branchId, from, to, threshold],
    queryFn: () =>
      apiRequest<DeliveryServiceReport>(
        `/reports/delivery-service?from=${from}&to=${to}&thresholdMinutes=${threshold}${branchId ? `&branchId=${branchId}` : ""}`
      ),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>مؤشرات خدمة الدليفري</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
          <Field label="حد التحضير بالدقائق">
            <Input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-24" />
          </Field>
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">إجمالي الطلبات</p>
              <p className="text-lg font-bold text-slate-900">{query.data.totalOrders}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">نسبة الفشل</p>
              <p className="text-lg font-bold text-red-700">{query.data.failureRate !== null ? `${fmt(query.data.failureRate * 100)}%` : "-"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">متوسط وقت التحضير</p>
              <p className="text-lg font-bold text-slate-900">{query.data.avgPrepMinutes !== null ? `${fmt(query.data.avgPrepMinutes)} د` : "-"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">متوسط وقت التوصيل</p>
              <p className="text-lg font-bold text-slate-900">{query.data.avgDeliveryMinutes !== null ? `${fmt(query.data.avgDeliveryMinutes)} د` : "-"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">متوسط الوقت الكلي</p>
              <p className="text-lg font-bold text-slate-900">{query.data.avgTotalMinutes !== null ? `${fmt(query.data.avgTotalMinutes)} د` : "-"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">نسبة الالتزام بالوقت</p>
              <p className="text-lg font-bold text-slate-900">{query.data.onTimeRate !== null ? `${fmt(query.data.onTimeRate * 100)}%` : "-"}</p>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function PeakHoursTab() {
  const [branchId, setBranchId] = useState("");
  const { from, setFrom, to, setTo } = useDateRange();
  const branchesQuery = useBranches();
  const query = useQuery({
    queryKey: ["reports", "peak-hours", branchId, from, to],
    queryFn: () => apiRequest<PeakHoursReport>(`/reports/peak-hours?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ""}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>ساعات الذروة</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && (
          <>
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-700">حسب الساعة</h3>
              <ul className="space-y-1 text-sm">
                {query.data.byHour.map((r) => (
                  <li key={r.hour} className="flex items-center justify-between">
                    <span className="text-slate-700">{r.hour}:00</span>
                    <span className="text-slate-500">{r.ordersCount} طلب - {fmt(r.revenue)} ج.م</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-700">حسب يوم الأسبوع</h3>
              <ul className="space-y-1 text-sm">
                {query.data.byDayOfWeek.map((r) => (
                  <li key={r.dow} className="flex items-center justify-between">
                    <span className="text-slate-700">{r.dayName}</span>
                    <span className="text-slate-500">{r.ordersCount} طلب - {fmt(r.revenue)} ج.م</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function CustomerSpendTab() {
  const [branchId, setBranchId] = useState("");
  const { from, setFrom, to, setTo } = useDateRange();
  const branchesQuery = useBranches();
  const query = useQuery({
    queryKey: ["reports", "customer-spend", branchId, from, to],
    queryFn: () => apiRequest<CustomerSpendReport>(`/reports/customer-spend?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ""}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>أعلى العملاء إنفاقًا</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody>
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && (
          <>
            <p className="mb-4 text-sm font-semibold text-slate-700">عملاء جدد في الفترة دي: {query.data.newCustomersCount}</p>
            {query.data.topCustomers.length === 0 ? (
              <EmptyState>مفيش عملاء في الفترة دي</EmptyState>
            ) : (
              <Table>
                <THead>
                  <TR><TH>العميل</TH><TH>الموبايل</TH><TH>عدد الطلبات</TH><TH>إجمالي الإنفاق</TH><TH>متوسط الطلب</TH><TH>آخر طلب</TH></TR>
                </THead>
                <TBody>
                  {query.data.topCustomers.map((r, i) => (
                    <TR key={i}>
                      <TD>{r.name ?? "-"}</TD>
                      <TD>{r.phone}</TD>
                      <TD>{r.ordersCount}</TD>
                      <TD className="font-semibold">{fmt(r.totalSpent)}</TD>
                      <TD>{fmt(r.avgOrderValue)}</TD>
                      <TD>{new Date(r.lastOrderAt).toLocaleDateString("en-GB")}</TD>
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

function ExpensesReportTab() {
  const [branchId, setBranchId] = useState("");
  const { from, setFrom, to, setTo } = useDateRange();
  const branchesQuery = useBranches();
  const query = useQuery({
    queryKey: ["reports", "expenses-report", branchId, from, to],
    queryFn: () => apiRequest<ExpensesReport>(`/reports/expenses-report?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ""}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>تقرير المصروفات</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && (
          <>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">الإجمالي</p>
              <p className="text-lg font-bold text-slate-900">{fmt(query.data.total)} ج.م</p>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-700">حسب الفئة</h3>
              {query.data.byCategory.length === 0 ? (
                <p className="text-xs text-slate-400">مفيش مصروفات</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {query.data.byCategory.map((r, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span className="text-slate-700">{r.category}</span>
                      <span className="text-slate-500">{fmt(r.total)} ج.م ({r.count})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {query.data.anomalies.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-red-700">مصروفات تجاوزت حد التنبيه</h3>
                <Table>
                  <THead>
                    <TR><TH>التاريخ</TH><TH>الفرع</TH><TH>الفئة</TH><TH>القيمة</TH><TH>حد التنبيه</TH></TR>
                  </THead>
                  <TBody>
                    {query.data.anomalies.map((r) => (
                      <TR key={r.id}>
                        <TD>{r.businessDate}</TD>
                        <TD>{r.branchName ?? "-"}</TD>
                        <TD>{r.category}</TD>
                        <TD className="font-semibold text-red-600">{fmt(r.amount)}</TD>
                        <TD>{fmt(r.alertThreshold)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function PurchasesReportTab() {
  const [branchId, setBranchId] = useState("");
  const { from, setFrom, to, setTo } = useDateRange();
  const branchesQuery = useBranches();
  const query = useQuery({
    queryKey: ["reports", "purchases-report", branchId, from, to],
    queryFn: () => apiRequest<PurchasesReport>(`/reports/purchases-report?from=${from}&to=${to}${branchId ? `&branchId=${branchId}` : ""}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-end justify-between gap-3">
        <CardTitle>تقرير المشتريات النقدية</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <BranchSelect value={branchId} onChange={setBranchId} branches={branchesQuery.data ?? []} />
          <DateRangeFields from={from} setFrom={setFrom} to={to} setTo={setTo} />
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        {query.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
        {query.data && (
          <>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">الإجمالي</p>
              <p className="text-lg font-bold text-slate-900">{fmt(query.data.total)} ج.م</p>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-700">حسب الفئة</h3>
              {query.data.byCategory.length === 0 ? (
                <p className="text-xs text-slate-400">مفيش مشتريات</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {query.data.byCategory.map((r, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span className="text-slate-700">{r.category}</span>
                      <span className="text-slate-500">{fmt(r.total)} ج.م ({r.count})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
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
