import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { Badge, StatusBadge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Tabs } from "../shared/ui/Tabs";

interface PaymentMethod { id: string; name: string; kind: string; settlementChannel: string | null; isActive: boolean; }
interface Payment { id: string; orderId: string; branchId: string; methodKind: string; settlementChannel: string | null; amount: number; lockedAt: string; }
interface AdjustmentRequest {
  id: string; paymentId: string; reason: string | null; proposedPaymentMethodId: string | null;
  proposedAmount: number; amountDelta: number; status: string; requestedAt: string; decidedAt: string | null;
}
interface ReconciliationRecord {
  id: string; branchId: string | null; source: string; externalReference: string | null;
  externalAmount: number; externalDate: string; matchedPaymentId: string | null; matchStatus: string; notes: string | null;
}
interface PaymentException {
  paymentId: string; orderId: string; settlementChannel: string; amount: number; lockedAt: string;
  riskScore: number; riskLevel: string; reason: string;
}

const KIND_LABELS: Record<string, string> = { cash: "كاش", card_or_wallet: "كارت/محفظة", credit: "آجل" };
const SOURCE_LABELS: Record<string, string> = {
  talabat_statement: "كشف طلبات", visa_settlement: "تسوية فيزا", instapay: "إنستاباي", orange_cash: "أورانج كاش",
};
const STATUS_LABELS: Record<string, string> = { PENDING: "معلّق", APPROVED: "معتمد", REJECTED: "مرفوض" };
const MATCH_STATUS_LABELS: Record<string, string> = { UNMATCHED: "غير متطابق", MATCHED: "متطابق", IGNORED: "متجاهل" };

const TABS = [
  { key: "payments", label: "الدفعات المقفولة" },
  { key: "adjustments", label: "طلبات التعديل" },
  { key: "reconciliation", label: "المطابقة" },
  { key: "exceptions", label: "الاستثناءات" },
];

export function PaymentControlPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("payments");
  const methodsQuery = useQuery({ queryKey: ["payment-control", "methods"], queryFn: () => apiRequest<PaymentMethod[]>("/payment-control/payment-methods") });
  const paymentsQuery = useQuery({ queryKey: ["payment-control", "payments"], queryFn: () => apiRequest<Payment[]>("/payment-control/payments") });
  const requestsQuery = useQuery({ queryKey: ["payment-control", "requests"], queryFn: () => apiRequest<AdjustmentRequest[]>("/payment-control/adjustment-requests") });
  const recordsQuery = useQuery({ queryKey: ["payment-control", "records"], queryFn: () => apiRequest<ReconciliationRecord[]>("/payment-control/reconciliation-records") });
  const exceptionsQuery = useQuery({ queryKey: ["payment-control", "exceptions"], queryFn: () => apiRequest<PaymentException[]>("/payment-control/exceptions") });

  const [adjustmentForm, setAdjustmentForm] = useState({ paymentId: "", proposedPaymentMethodId: "", proposedAmount: "", reason: "" });
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const createAdjustment = useMutation({
    mutationFn: () =>
      apiRequest("/payment-control/adjustment-requests", {
        method: "POST",
        body: {
          paymentId: adjustmentForm.paymentId,
          proposedPaymentMethodId: adjustmentForm.proposedPaymentMethodId || undefined,
          proposedAmount: Number(adjustmentForm.proposedAmount),
          reason: adjustmentForm.reason || undefined,
        },
      }),
    onSuccess: () => {
      setAdjustmentForm({ paymentId: "", proposedPaymentMethodId: "", proposedAmount: "", reason: "" });
      setAdjustmentError(null);
      queryClient.invalidateQueries({ queryKey: ["payment-control", "requests"] });
    },
    onError: (err) => setAdjustmentError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const decideAdjustment = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      apiRequest(`/payment-control/adjustment-requests/${id}/${action}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-control", "requests"] });
      queryClient.invalidateQueries({ queryKey: ["payment-control", "payments"] });
    },
  });

  const [recordForm, setRecordForm] = useState({ source: "talabat_statement", externalAmount: "", externalDate: "", externalReference: "" });
  const createRecord = useMutation({
    mutationFn: () =>
      apiRequest("/payment-control/reconciliation-records", {
        method: "POST",
        body: {
          source: recordForm.source,
          externalAmount: Number(recordForm.externalAmount),
          externalDate: recordForm.externalDate,
          externalReference: recordForm.externalReference || undefined,
        },
      }),
    onSuccess: () => {
      setRecordForm({ source: "talabat_statement", externalAmount: "", externalDate: "", externalReference: "" });
      queryClient.invalidateQueries({ queryKey: ["payment-control", "records"] });
    },
  });

  const [matchPaymentId, setMatchPaymentId] = useState<Record<string, string>>({});
  const matchRecord = useMutation({
    mutationFn: ({ id, paymentId }: { id: string; paymentId: string }) =>
      apiRequest(`/payment-control/reconciliation-records/${id}/match`, { method: "PATCH", body: { paymentId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payment-control", "records"] }),
  });

  const autoMatch = useMutation({
    mutationFn: () => apiRequest<{ matched: number; leftUnmatched: number }>("/payment-control/reconciliation-records/match-auto", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payment-control", "records"] }),
  });

  const payments = paymentsQuery.data ?? [];
  const requests = requestsQuery.data ?? [];
  const records = recordsQuery.data ?? [];
  const exceptions = exceptionsQuery.data ?? [];

  return (
    <div>
      <PageHeader title="التحكم في المدفوعات والمطابقة" description="الدفعات، طلبات التعديل، والمطابقة مع كشوف الحساب" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "payments" && (
        <Card>
          <CardHeader><CardTitle>الدفعات المقفولة ({payments.length})</CardTitle></CardHeader>
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR><TH>الطلب</TH><TH>الطريقة</TH><TH>القناة</TH><TH>المبلغ</TH><TH>وقت القفل</TH></TR>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs">{p.orderId.slice(0, 8)}</TD>
                    <TD>{KIND_LABELS[p.methodKind] ?? p.methodKind}</TD>
                    <TD>{p.settlementChannel ?? "-"}</TD>
                    <TD className="font-bold text-slate-900">{p.amount}ج</TD>
                    <TD>{new Date(p.lockedAt).toLocaleString("ar-EG")}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {payments.length === 0 && <EmptyState>مفيش دفعات لسه</EmptyState>}
          </CardBody>
        </Card>
      )}

      {tab === "adjustments" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>طلب تعديل دفعة</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); createAdjustment.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="الدفعة">
                    <Select required value={adjustmentForm.paymentId} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, paymentId: e.target.value })}>
                      <option value="">اختر دفعة</option>
                      {payments.map((p) => <option key={p.id} value={p.id}>{p.orderId.slice(0, 8)} - {p.amount}ج</option>)}
                    </Select>
                  </Field>
                  <Field label="الطريقة المقترحة">
                    <Select value={adjustmentForm.proposedPaymentMethodId} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, proposedPaymentMethodId: e.target.value })}>
                      <option value="">نفس الطريقة (تصحيح مبلغ بس)</option>
                      {methodsQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="المبلغ المقترح">
                    <Input required type="number" value={adjustmentForm.proposedAmount} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, proposedAmount: e.target.value })} />
                  </Field>
                  <Field label="السبب">
                    <Input value={adjustmentForm.reason} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })} />
                  </Field>
                </div>
                {adjustmentError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{adjustmentError}</p>}
                <Button type="submit" disabled={createAdjustment.isPending}>طلب</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>الطلبات ({requests.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR><TH>الدفعة</TH><TH>المبلغ المقترح</TH><TH>الفرق</TH><TH>السبب</TH><TH>الحالة</TH><TH>إجراء</TH></TR>
                </THead>
                <TBody>
                  {requests.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-mono text-xs">{r.paymentId.slice(0, 8)}</TD>
                      <TD>{r.proposedAmount}ج</TD>
                      <TD>{r.amountDelta}ج</TD>
                      <TD>{r.reason ?? "-"}</TD>
                      <TD><StatusBadge status={STATUS_LABELS[r.status] ?? r.status} /></TD>
                      <TD>
                        {r.status === "PENDING" && (
                          <div className="flex gap-1.5">
                            <Button size="sm" onClick={() => decideAdjustment.mutate({ id: r.id, action: "approve" })} disabled={decideAdjustment.isPending}>اعتماد</Button>
                            <Button size="sm" variant="danger" onClick={() => decideAdjustment.mutate({ id: r.id, action: "reject" })} disabled={decideAdjustment.isPending}>رفض</Button>
                          </div>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {requests.length === 0 && <EmptyState>مفيش طلبات تعديل لسه</EmptyState>}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "reconciliation" && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>تسجيل سطر مطابقة</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); createRecord.mutate(); }} className="mb-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="المصدر">
                    <Select value={recordForm.source} onChange={(e) => setRecordForm({ ...recordForm, source: e.target.value })}>
                      {Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Select>
                  </Field>
                  <Field label="المبلغ">
                    <Input required type="number" value={recordForm.externalAmount} onChange={(e) => setRecordForm({ ...recordForm, externalAmount: e.target.value })} />
                  </Field>
                  <Field label="التاريخ">
                    <Input required type="date" value={recordForm.externalDate} onChange={(e) => setRecordForm({ ...recordForm, externalDate: e.target.value })} />
                  </Field>
                  <Field label="مرجع خارجي">
                    <Input value={recordForm.externalReference} onChange={(e) => setRecordForm({ ...recordForm, externalReference: e.target.value })} />
                  </Field>
                </div>
                <Button type="submit" disabled={createRecord.isPending}>تسجيل</Button>
              </form>
              <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
                <Button variant="secondary" onClick={() => autoMatch.mutate()} disabled={autoMatch.isPending}>
                  مطابقة تلقائية (إنستاباي/أورانج كاش)
                </Button>
                {autoMatch.data && (
                  <span className="text-sm text-slate-600">
                    اتطابق: <strong>{autoMatch.data.matched}</strong> | فضل غير متطابق: <strong>{autoMatch.data.leftUnmatched}</strong>
                  </span>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>سطور المطابقة ({records.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR><TH>المصدر</TH><TH>المرجع</TH><TH>المبلغ</TH><TH>التاريخ</TH><TH>الحالة</TH><TH>إجراء</TH></TR>
                </THead>
                <TBody>
                  {records.map((r) => (
                    <TR key={r.id}>
                      <TD>{SOURCE_LABELS[r.source] ?? r.source}</TD>
                      <TD>{r.externalReference ?? "-"}</TD>
                      <TD>{r.externalAmount}ج</TD>
                      <TD>{new Date(r.externalDate).toLocaleDateString("ar-EG")}</TD>
                      <TD><StatusBadge status={MATCH_STATUS_LABELS[r.matchStatus] ?? r.matchStatus} /></TD>
                      <TD>
                        {r.matchStatus === "UNMATCHED" && (
                          <div className="flex items-center gap-2">
                            <Select
                              className="w-auto"
                              value={matchPaymentId[r.id] ?? ""}
                              onChange={(e) => setMatchPaymentId({ ...matchPaymentId, [r.id]: e.target.value })}
                            >
                              <option value="">اختر دفعة</option>
                              {payments.map((p) => <option key={p.id} value={p.id}>{p.orderId.slice(0, 8)} - {p.amount}ج</option>)}
                            </Select>
                            <Button
                              size="sm"
                              disabled={!matchPaymentId[r.id] || matchRecord.isPending}
                              onClick={() => matchRecord.mutate({ id: r.id, paymentId: matchPaymentId[r.id] })}
                            >
                              مطابقة
                            </Button>
                          </div>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {records.length === 0 && <EmptyState>مفيش سطور مطابقة لسه</EmptyState>}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "exceptions" && (
        <Card>
          <CardHeader><CardTitle>الاستثناءات ونقاط المخاطر ({exceptions.length})</CardTitle></CardHeader>
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR><TH>الطلب</TH><TH>القناة</TH><TH>المبلغ</TH><TH>السبب</TH><TH>مستوى الخطورة</TH></TR>
              </THead>
              <TBody>
                {exceptions.map((e) => (
                  <TR key={e.paymentId}>
                    <TD className="font-mono text-xs">{e.orderId.slice(0, 8)}</TD>
                    <TD>{e.settlementChannel}</TD>
                    <TD>{e.amount}ج</TD>
                    <TD>{e.reason}</TD>
                    <TD><Badge tone={e.riskLevel === "high" ? "danger" : e.riskLevel === "medium" ? "warning" : "neutral"}>{e.riskLevel} ({e.riskScore})</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {exceptions.length === 0 && <EmptyState>مفيش استثناءات حاليًا</EmptyState>}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
