import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Tabs } from "../shared/ui/Tabs";

interface Branch { id: string; name: string; talabatBranchId: string | null; }
interface PaymentMethod { id: string; name: string; talabatPaymentCode: string | null; }
interface TalabatOrderRow {
  id: string; talabatOrderId: string; branchId: string | null; posOrderId: string | null;
  status: "RECEIVED" | "MAPPING_ERROR" | "IMPORTED" | "FAILED" | "CANCELED";
  errorReason: string | null; cancellationSource: string | null; createdAt: string;
}
interface IntegrationError {
  id: string; stage: string; talabatOrderId: string | null; message: string;
  retryCount: number; status: "OPEN" | "RETRYING" | "RESOLVED"; createdAt: string;
}
interface ProductMapping { id: string; branchId: string; talabatItemId: string; menuItemId: string | null; variantId: string | null; }
interface DashboardSummary {
  connectionStatus: "NOT_CONFIGURED" | "CONFIGURED_UNVERIFIED";
  ordersToday: { total: number; imported: number; mappingError: number; failed: number; canceled: number };
  openIntegrationErrors: number;
}
interface PaymentOverrideRow {
  talabatOrderId: string; adjustmentRequestId: string; status: string; amountDelta: number; decidedAt: string | null;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "استُلم", MAPPING_ERROR: "خطأ ربط", IMPORTED: "اتسجّل", FAILED: "فشل", CANCELED: "اتلغى",
};
const ORDER_STATUS_TONES: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  RECEIVED: "neutral", MAPPING_ERROR: "warning", IMPORTED: "success", FAILED: "danger", CANCELED: "danger",
};

const TABS = [
  { key: "dashboard", label: "لوحة التحكم" },
  { key: "orders", label: "أوردرات Talabat" },
  { key: "errors", label: "أخطاء التكامل" },
  { key: "mapping", label: "الربط" },
  { key: "payment-control", label: "Payment Control" },
];

export function TalabatPage() {
  const [tab, setTab] = useState("dashboard");
  const queryClient = useQueryClient();

  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const paymentMethodsQuery = useQuery({
    queryKey: ["payment-control", "payment-methods"],
    queryFn: () => apiRequest<PaymentMethod[]>("/payment-control/payment-methods"),
  });

  const [dashboardBranchId, setDashboardBranchId] = useState("");
  const dashboardQuery = useQuery({
    queryKey: ["talabat", "dashboard-summary", dashboardBranchId],
    queryFn: () => apiRequest<DashboardSummary>(dashboardBranchId ? `/talabat/dashboard-summary?branchId=${dashboardBranchId}` : "/talabat/dashboard-summary"),
    enabled: tab === "dashboard",
  });

  const ordersQuery = useQuery({
    queryKey: ["talabat", "orders"],
    queryFn: () => apiRequest<TalabatOrderRow[]>("/talabat/orders"),
    enabled: tab === "orders",
  });

  const errorsQuery = useQuery({
    queryKey: ["talabat", "integration-errors"],
    queryFn: () => apiRequest<IntegrationError[]>("/talabat/integration-errors"),
    enabled: tab === "errors",
  });

  const retryError = useMutation({
    mutationFn: (id: string) => apiRequest(`/talabat/integration-errors/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["talabat", "integration-errors"] });
      queryClient.invalidateQueries({ queryKey: ["talabat", "orders"] });
    },
  });

  const [mappingBranchId, setMappingBranchId] = useState("");
  const mappingsQuery = useQuery({
    queryKey: ["talabat", "product-mapping", mappingBranchId],
    queryFn: () => apiRequest<ProductMapping[]>(`/talabat/product-mapping?branchId=${mappingBranchId}`),
    enabled: tab === "mapping" && Boolean(mappingBranchId),
  });

  const [mappingForm, setMappingForm] = useState({ talabatItemId: "", menuItemId: "", variantId: "" });
  const [mappingError, setMappingError] = useState<string | null>(null);
  const createMapping = useMutation({
    mutationFn: () =>
      apiRequest("/talabat/product-mapping", {
        method: "POST",
        body: { branchId: mappingBranchId, ...mappingForm },
      }),
    onSuccess: () => {
      setMappingForm({ talabatItemId: "", menuItemId: "", variantId: "" });
      setMappingError(null);
      queryClient.invalidateQueries({ queryKey: ["talabat", "product-mapping"] });
    },
    onError: (err) => setMappingError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const linkBranch = useMutation({
    mutationFn: ({ branchId, talabatBranchId }: { branchId: string; talabatBranchId: string }) =>
      apiRequest(`/branches/${branchId}`, { method: "PATCH", body: { talabatBranchId: talabatBranchId || null } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branches"] }),
  });

  const linkPaymentMethod = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      apiRequest(`/payment-control/payment-methods/${id}/talabat-code`, { method: "PATCH", body: { talabatPaymentCode: code || null } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payment-control", "payment-methods"] }),
  });

  const paymentOverridesQuery = useQuery({
    queryKey: ["talabat", "payment-control-report"],
    queryFn: () => apiRequest<PaymentOverrideRow[]>("/talabat/payment-control-report"),
    enabled: tab === "payment-control",
  });

  return (
    <div>
      <PageHeader title="تكامل Talabat" description="مزامنة أوردرات Talabat، متابعة أخطاء الربط، وإدارة الربط بين الفروع/طرق الدفع/الأصناف" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "dashboard" && (
        <div className="space-y-4">
          <Field label="الفرع">
            <Select value={dashboardBranchId} onChange={(e) => setDashboardBranchId(e.target.value)}>
              <option value="">كل الفروع</option>
              {branchesQuery.data?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>

          {dashboardQuery.data && (
            <>
              <Card>
                <CardBody className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">حالة الاتصال بـTalabat API</span>
                  <Badge tone={dashboardQuery.data.connectionStatus === "CONFIGURED_UNVERIFIED" ? "warning" : "neutral"}>
                    {dashboardQuery.data.connectionStatus === "CONFIGURED_UNVERIFIED" ? "متصل (غير مؤكد)" : "غير مفعّل"}
                  </Badge>
                </CardBody>
              </Card>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {[
                  { label: "إجمالي اليوم", value: dashboardQuery.data.ordersToday.total },
                  { label: "اتسجّل", value: dashboardQuery.data.ordersToday.imported },
                  { label: "خطأ ربط", value: dashboardQuery.data.ordersToday.mappingError },
                  { label: "فشل", value: dashboardQuery.data.ordersToday.failed },
                  { label: "اتلغى", value: dashboardQuery.data.ordersToday.canceled },
                ].map((tile) => (
                  <Card key={tile.label}>
                    <CardBody className="text-center">
                      <p className="text-2xl font-bold text-slate-900">{tile.value}</p>
                      <p className="mt-1 text-xs text-slate-500">{tile.label}</p>
                    </CardBody>
                  </Card>
                ))}
              </div>

              <Card>
                <CardBody className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">أخطاء تكامل مفتوحة</span>
                  <Badge tone={dashboardQuery.data.openIntegrationErrors > 0 ? "danger" : "success"}>
                    {dashboardQuery.data.openIntegrationErrors}
                  </Badge>
                </CardBody>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === "orders" && (
        <Card>
          <CardBody>
            <Table>
              <THead>
                <TR>
                  <TH>معرّف Talabat</TH>
                  <TH>الحالة</TH>
                  <TH>سبب الخطأ</TH>
                  <TH>مصدر الإلغاء</TH>
                  <TH>التاريخ</TH>
                </TR>
              </THead>
              <TBody>
                {ordersQuery.data?.map((o) => (
                  <TR key={o.id}>
                    <TD className="font-mono text-xs">{o.talabatOrderId}</TD>
                    <TD><Badge tone={ORDER_STATUS_TONES[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge></TD>
                    <TD>{o.errorReason ?? "-"}</TD>
                    <TD>{o.cancellationSource ?? "-"}</TD>
                    <TD>{new Date(o.createdAt).toLocaleString("ar-EG")}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {ordersQuery.data?.length === 0 && <EmptyState>مفيش أوردرات Talabat لسه</EmptyState>}
          </CardBody>
        </Card>
      )}

      {tab === "errors" && (
        <Card>
          <CardBody>
            <Table>
              <THead>
                <TR>
                  <TH>المرحلة</TH>
                  <TH>معرّف Talabat</TH>
                  <TH>الرسالة</TH>
                  <TH>الحالة</TH>
                  <TH>عدد المحاولات</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {errorsQuery.data?.map((e) => (
                  <TR key={e.id}>
                    <TD>{e.stage}</TD>
                    <TD className="font-mono text-xs">{e.talabatOrderId ?? "-"}</TD>
                    <TD>{e.message}</TD>
                    <TD>
                      <Badge tone={e.status === "RESOLVED" ? "success" : e.status === "RETRYING" ? "warning" : "danger"}>
                        {e.status === "RESOLVED" ? "اتحل" : e.status === "RETRYING" ? "بيتحاول تاني" : "مفتوح"}
                      </Badge>
                    </TD>
                    <TD>{e.retryCount}</TD>
                    <TD>
                      {e.status !== "RESOLVED" && e.stage === "SYNC" && (
                        <Button variant="secondary" onClick={() => retryError.mutate(e.id)} disabled={retryError.isPending}>
                          إعادة محاولة
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {errorsQuery.data?.length === 0 && <EmptyState>مفيش أخطاء تكامل</EmptyState>}
          </CardBody>
        </Card>
      )}

      {tab === "mapping" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>ربط الفروع وطرق الدفع بـTalabat</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">الفروع</p>
                <div className="space-y-2">
                  {branchesQuery.data?.map((b) => (
                    <div key={b.id} className="flex items-center gap-2">
                      <span className="w-40 shrink-0 text-sm text-slate-600">{b.name}</span>
                      <Input
                        defaultValue={b.talabatBranchId ?? ""}
                        placeholder="معرّف الفرع عند Talabat"
                        onBlur={(e) => linkBranch.mutate({ branchId: b.id, talabatBranchId: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">طرق الدفع</p>
                <div className="space-y-2">
                  {paymentMethodsQuery.data?.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <span className="w-40 shrink-0 text-sm text-slate-600">{m.name}</span>
                      <Input
                        defaultValue={m.talabatPaymentCode ?? ""}
                        placeholder="كود الدفع عند Talabat"
                        onBlur={(e) => linkPaymentMethod.mutate({ id: m.id, code: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>ربط الأصناف</CardTitle></CardHeader>
            <CardBody className="space-y-4">
              <Field label="الفرع">
                <Select value={mappingBranchId} onChange={(e) => setMappingBranchId(e.target.value)}>
                  <option value="">اختر فرع</option>
                  {branchesQuery.data?.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </Field>

              {mappingBranchId && (
                <>
                  <Table>
                    <THead>
                      <TR>
                        <TH>معرّف صنف Talabat</TH>
                        <TH>معرّف الصنف</TH>
                        <TH>معرّف الحجم/العرض</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {mappingsQuery.data?.map((m) => (
                        <TR key={m.id}>
                          <TD className="font-mono text-xs">{m.talabatItemId}</TD>
                          <TD className="font-mono text-xs">{m.menuItemId}</TD>
                          <TD className="font-mono text-xs">{m.variantId}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  {mappingsQuery.data?.length === 0 && <EmptyState>مفيش ربط أصناف لسه للفرع ده</EmptyState>}

                  <form
                    className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      createMapping.mutate();
                    }}
                  >
                    <Field label="معرّف صنف Talabat">
                      <Input
                        value={mappingForm.talabatItemId}
                        onChange={(e) => setMappingForm({ ...mappingForm, talabatItemId: e.target.value })}
                        required
                      />
                    </Field>
                    <Field label="معرّف الصنف (menuItemId)">
                      <Input
                        value={mappingForm.menuItemId}
                        onChange={(e) => setMappingForm({ ...mappingForm, menuItemId: e.target.value })}
                        required
                      />
                    </Field>
                    <Field label="معرّف الحجم/العرض (variantId)">
                      <Input
                        value={mappingForm.variantId}
                        onChange={(e) => setMappingForm({ ...mappingForm, variantId: e.target.value })}
                        required
                      />
                    </Field>
                    {mappingError && <p className="text-sm text-red-600 sm:col-span-3">{mappingError}</p>}
                    <div className="sm:col-span-3">
                      <Button type="submit" disabled={createMapping.isPending}>
                        {createMapping.isPending ? "جاري الحفظ..." : "حفظ الربط"}
                      </Button>
                    </div>
                  </form>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "payment-control" && (
        <Card>
          <CardBody>
            <Table>
              <THead>
                <TR>
                  <TH>معرّف Talabat</TH>
                  <TH>حالة الطلب</TH>
                  <TH>فرق المبلغ</TH>
                  <TH>تاريخ القرار</TH>
                </TR>
              </THead>
              <TBody>
                {paymentOverridesQuery.data?.map((r) => (
                  <TR key={r.adjustmentRequestId}>
                    <TD className="font-mono text-xs">{r.talabatOrderId}</TD>
                    <TD>{r.status}</TD>
                    <TD>{r.amountDelta}</TD>
                    <TD>{r.decidedAt ? new Date(r.decidedAt).toLocaleString("ar-EG") : "-"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {paymentOverridesQuery.data?.length === 0 && <EmptyState>مفيش محاولات تعديل دفع لأوردرات Talabat</EmptyState>}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
