import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Tabs } from "../shared/ui/Tabs";

interface Branch { id: string; name: string; }
interface Printer {
  id: string; branchId: string; name: string; printerType: string; connectionType: string;
  osPrinterName: string | null; ipAddress: string | null; paperWidthMm: number; isEnabled: boolean; isDefaultForType: boolean;
}
interface KitchenStation { id: string; branchId: string; name: string; printerId: string | null; printerName: string | null; isActive: boolean; }
interface PrintJob {
  id: string; orderId: string | null; printType: string; status: string; attempts: number; lastError: string | null; createdAt: string;
}
interface MenuRoutingCategory {
  categoryId: string; categoryName: string; categoryStationId: string | null;
  items: { itemId: string; itemName: string; itemStationId: string | null }[];
}

const PRINTER_TYPES = [
  { value: "CASHIER", label: "كاشير" },
  { value: "KITCHEN", label: "مطبخ" },
  { value: "DELIVERY", label: "دليفري" },
  { value: "REPORT", label: "تقارير" },
];
const PRINT_TYPE_LABELS: Record<string, string> = {
  CUSTOMER_RECEIPT: "إيصال عميل", KITCHEN_TICKET: "تذكرة مطبخ", KITCHEN_SUMMARY: "ملخص مطبخ",
  DELIVERY_SUMMARY: "ملخص دليفري", DELIVERY_FINAL_RECEIPT: "إيصال تسليم دليفري", DINE_IN_BILL: "فاتورة صالة", TEST_PRINT: "طباعة تجريبية",
};
const STATUS_LABELS: Record<string, string> = { PENDING: "في الانتظار", PRINTING: "بيطبع", PRINTED: "اتطبعت", FAILED: "فشلت", CANCELLED: "اتلغت" };
const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  PENDING: "neutral", PRINTING: "warning", PRINTED: "success", FAILED: "danger", CANCELLED: "neutral",
};

const TABS = [
  { key: "printers", label: "الطابعات" },
  { key: "stations", label: "محطات التحضير والتوجيه" },
  { key: "queue", label: "طابور الطباعة" },
];

export function PrintingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("printers");
  const canPickBranch = user?.role === "admin";
  const [branchId, setBranchId] = useState(user?.branchId ?? "");
  const effectiveBranchId = branchId || user?.branchId || "";

  const branchesQuery = useQuery({
    queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches"), enabled: canPickBranch,
  });
  const printersQuery = useQuery({
    queryKey: ["printing", "printers", effectiveBranchId],
    queryFn: () => apiRequest<Printer[]>(`/printing/printers?branchId=${effectiveBranchId}`),
    enabled: Boolean(effectiveBranchId),
  });
  const stationsQuery = useQuery({
    queryKey: ["printing", "stations", effectiveBranchId],
    queryFn: () => apiRequest<KitchenStation[]>(`/printing/kitchen-stations?branchId=${effectiveBranchId}`),
    enabled: Boolean(effectiveBranchId),
  });
  const routingQuery = useQuery({
    queryKey: ["printing", "routing"], queryFn: () => apiRequest<MenuRoutingCategory[]>("/printing/kitchen-stations/routing/menu"),
  });
  const [queueStatus, setQueueStatus] = useState("");
  const printJobsQuery = useQuery({
    queryKey: ["printing", "print-jobs", effectiveBranchId, queueStatus],
    queryFn: () => apiRequest<PrintJob[]>(`/printing/print-jobs?branchId=${effectiveBranchId}${queueStatus ? `&status=${queueStatus}` : ""}`),
    enabled: Boolean(effectiveBranchId),
    refetchInterval: tab === "queue" ? 5000 : false,
  });

  // --- إضافة طابعة ---
  const [printerForm, setPrinterForm] = useState({ name: "", printerType: "CASHIER", connectionType: "USB", osPrinterName: "", ipAddress: "" });
  const [printerError, setPrinterError] = useState<string | null>(null);
  const registerPrinter = useMutation({
    mutationFn: () =>
      apiRequest("/printing/printers", {
        method: "POST",
        body: {
          branchId: effectiveBranchId, name: printerForm.name, printerType: printerForm.printerType, connectionType: printerForm.connectionType,
          osPrinterName: printerForm.osPrinterName || undefined, ipAddress: printerForm.ipAddress || undefined,
        },
      }),
    onSuccess: () => {
      setPrinterError(null);
      setPrinterForm({ name: "", printerType: "CASHIER", connectionType: "USB", osPrinterName: "", ipAddress: "" });
      queryClient.invalidateQueries({ queryKey: ["printing", "printers"] });
    },
    onError: (err) => setPrinterError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const toggleEnabled = useMutation({
    mutationFn: (input: { id: string; isEnabled: boolean }) => apiRequest(`/printing/printers/${input.id}`, { method: "PATCH", body: { isEnabled: input.isEnabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["printing", "printers"] }),
  });
  const setDefaultForType = useMutation({
    mutationFn: (id: string) => apiRequest(`/printing/printers/${id}`, { method: "PATCH", body: { isDefaultForType: true } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["printing", "printers"] }),
  });
  const testPrint = useMutation({
    mutationFn: (id: string) => apiRequest(`/printing/printers/${id}/test-print`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["printing", "print-jobs"] }),
  });

  // --- إضافة محطة تحضير ---
  const [stationForm, setStationForm] = useState({ name: "", printerId: "" });
  const [stationError, setStationError] = useState<string | null>(null);
  const registerStation = useMutation({
    mutationFn: () =>
      apiRequest("/printing/kitchen-stations", { method: "POST", body: { branchId: effectiveBranchId, name: stationForm.name, printerId: stationForm.printerId || undefined } }),
    onSuccess: () => {
      setStationError(null);
      setStationForm({ name: "", printerId: "" });
      queryClient.invalidateQueries({ queryKey: ["printing", "stations"] });
    },
    onError: (err) => setStationError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const linkStationPrinter = useMutation({
    mutationFn: (input: { id: string; printerId: string | null }) => apiRequest(`/printing/kitchen-stations/${input.id}`, { method: "PATCH", body: { printerId: input.printerId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["printing", "stations"] }),
  });

  const routeCategory = useMutation({
    mutationFn: (input: { categoryId: string; stationId: string | null }) =>
      apiRequest(`/printing/kitchen-stations/routing/menu-categories/${input.categoryId}`, { method: "PATCH", body: { stationId: input.stationId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["printing", "routing"] }),
  });
  const routeItem = useMutation({
    mutationFn: (input: { itemId: string; stationId: string | null }) =>
      apiRequest(`/printing/kitchen-stations/routing/menu-items/${input.itemId}`, { method: "PATCH", body: { stationId: input.stationId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["printing", "routing"] }),
  });

  const retryJob = useMutation({
    mutationFn: (id: string) => apiRequest(`/printing/print-jobs/${id}/retry`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["printing", "print-jobs"] }),
  });

  const stationOptions = stationsQuery.data ?? [];

  return (
    <div>
      <PageHeader title="الطباعة" description="الطابعات، محطات التحضير، توجيه المنيو، وطابور الطباعة" />

      {canPickBranch && (
        <div className="mb-4 max-w-xs">
          <Field label="الفرع">
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">اختر فرع</option>
              {branchesQuery.data?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {!effectiveBranchId ? (
        <EmptyState>اختر فرع الأول</EmptyState>
      ) : tab === "printers" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>إضافة طابعة</CardTitle></CardHeader>
            <CardBody>
              <form
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                onSubmit={(e: FormEvent) => { e.preventDefault(); registerPrinter.mutate(); }}
              >
                <Field label="الاسم">
                  <Input value={printerForm.name} onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })} required />
                </Field>
                <Field label="النوع">
                  <Select value={printerForm.printerType} onChange={(e) => setPrinterForm({ ...printerForm, printerType: e.target.value })}>
                    {PRINTER_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                  </Select>
                </Field>
                <Field label="نوع الاتصال">
                  <Select value={printerForm.connectionType} onChange={(e) => setPrinterForm({ ...printerForm, connectionType: e.target.value })}>
                    <option value="USB">USB</option>
                    <option value="LAN">شبكة (LAN)</option>
                  </Select>
                </Field>
                {printerForm.connectionType === "USB" ? (
                  <Field label="اسم الطابعة في نظام التشغيل">
                    <Input value={printerForm.osPrinterName} onChange={(e) => setPrinterForm({ ...printerForm, osPrinterName: e.target.value })} required />
                  </Field>
                ) : (
                  <Field label="عنوان IP">
                    <Input value={printerForm.ipAddress} onChange={(e) => setPrinterForm({ ...printerForm, ipAddress: e.target.value })} required />
                  </Field>
                )}
                <div className="flex items-end">
                  <Button type="submit" disabled={registerPrinter.isPending}>{registerPrinter.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
                </div>
              </form>
              {printerError && <p className="mt-2 text-sm text-red-600">{printerError}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>طابعات الفرع</CardTitle></CardHeader>
            <CardBody>
              {!printersQuery.data?.length ? (
                <EmptyState>مفيش طابعات متسجلة لسه</EmptyState>
              ) : (
                <Table>
                  <THead><TR><TH>الاسم</TH><TH>النوع</TH><TH>الاتصال</TH><TH>الحالة</TH><TH>افتراضية</TH><TH></TH></TR></THead>
                  <TBody>
                    {printersQuery.data.map((p) => (
                      <TR key={p.id}>
                        <TD>{p.name}</TD>
                        <TD>{PRINTER_TYPES.find((t) => t.value === p.printerType)?.label ?? p.printerType}</TD>
                        <TD>{p.connectionType === "USB" ? p.osPrinterName : p.ipAddress}</TD>
                        <TD>
                          <button
                            onClick={() => toggleEnabled.mutate({ id: p.id, isEnabled: !p.isEnabled })}
                            className="cursor-pointer"
                          >
                            <Badge tone={p.isEnabled ? "success" : "neutral"}>{p.isEnabled ? "شغالة" : "معطّلة"}</Badge>
                          </button>
                        </TD>
                        <TD>
                          {p.isDefaultForType ? (
                            <Badge tone="success">افتراضية</Badge>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => setDefaultForType.mutate(p.id)}>خليها الافتراضية</Button>
                          )}
                        </TD>
                        <TD>
                          <Button variant="secondary" size="sm" onClick={() => testPrint.mutate(p.id)} disabled={!p.isEnabled}>طباعة تجريبية</Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>
      ) : tab === "stations" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>إضافة محطة تحضير</CardTitle></CardHeader>
            <CardBody>
              <form className="grid grid-cols-1 gap-4 sm:grid-cols-3" onSubmit={(e: FormEvent) => { e.preventDefault(); registerStation.mutate(); }}>
                <Field label="اسم المحطة">
                  <Input value={stationForm.name} onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })} required />
                </Field>
                <Field label="الطابعة (اختياري)">
                  <Select value={stationForm.printerId} onChange={(e) => setStationForm({ ...stationForm, printerId: e.target.value })}>
                    <option value="">بدون طابعة</option>
                    {printersQuery.data?.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </Select>
                </Field>
                <div className="flex items-end">
                  <Button type="submit" disabled={registerStation.isPending}>{registerStation.isPending ? "جاري الإضافة..." : "إضافة"}</Button>
                </div>
              </form>
              {stationError && <p className="mt-2 text-sm text-red-600">{stationError}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>محطات الفرع</CardTitle></CardHeader>
            <CardBody>
              {!stationOptions.length ? (
                <EmptyState>مفيش محطات متسجلة لسه</EmptyState>
              ) : (
                <Table>
                  <THead><TR><TH>المحطة</TH><TH>الطابعة المربوطة</TH></TR></THead>
                  <TBody>
                    {stationOptions.map((s) => (
                      <TR key={s.id}>
                        <TD>{s.name}</TD>
                        <TD>
                          <Select
                            value={s.printerId ?? ""}
                            onChange={(e) => linkStationPrinter.mutate({ id: s.id, printerId: e.target.value || null })}
                          >
                            <option value="">بدون طابعة</option>
                            {printersQuery.data?.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                          </Select>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>توجيه المنيو للمحطات</CardTitle></CardHeader>
            <CardBody>
              {!routingQuery.data?.length ? (
                <EmptyState>مفيش أقسام منيو لسه</EmptyState>
              ) : (
                <div className="space-y-4">
                  {routingQuery.data.map((category) => (
                    <div key={category.categoryId} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="font-semibold text-slate-800">{category.categoryName}</span>
                        <Select
                          className="max-w-[220px]"
                          value={category.categoryStationId ?? ""}
                          onChange={(e) => routeCategory.mutate({ categoryId: category.categoryId, stationId: e.target.value || null })}
                        >
                          <option value="">بدون توجيه</option>
                          {stationOptions.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                        </Select>
                      </div>
                      {category.items.length > 0 && (
                        <div className="space-y-1 pr-3">
                          {category.items.map((item) => (
                            <div key={item.itemId} className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-slate-600">{item.itemName}</span>
                              <Select
                                className="max-w-[220px]"
                                value={item.itemStationId ?? ""}
                                onChange={(e) => routeItem.mutate({ itemId: item.itemId, stationId: e.target.value || null })}
                              >
                                <option value="">(توجيه القسم)</option>
                                {stationOptions.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </Select>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>طابور الطباعة</CardTitle>
              <Select className="max-w-[180px]" value={queueStatus} onChange={(e) => setQueueStatus(e.target.value)}>
                <option value="">كل الحالات</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (<option key={value} value={value}>{label}</option>))}
              </Select>
            </div>
          </CardHeader>
          <CardBody>
            {!printJobsQuery.data?.length ? (
              <EmptyState>مفيش أوامر طباعة</EmptyState>
            ) : (
              <Table>
                <THead><TR><TH>النوع</TH><TH>الطلب</TH><TH>الحالة</TH><TH>المحاولات</TH><TH>آخر خطأ</TH><TH></TH></TR></THead>
                <TBody>
                  {printJobsQuery.data.map((job) => (
                    <TR key={job.id}>
                      <TD>{PRINT_TYPE_LABELS[job.printType] ?? job.printType}</TD>
                      <TD>{job.orderId ?? "-"}</TD>
                      <TD><Badge tone={STATUS_TONE[job.status]}>{STATUS_LABELS[job.status] ?? job.status}</Badge></TD>
                      <TD>{job.attempts}</TD>
                      <TD className="max-w-xs truncate text-xs text-red-600">{job.lastError ?? "-"}</TD>
                      <TD>
                        {job.status === "FAILED" && (
                          <Button variant="secondary" size="sm" onClick={() => retryJob.mutate(job.id)}>إعادة المحاولة</Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
