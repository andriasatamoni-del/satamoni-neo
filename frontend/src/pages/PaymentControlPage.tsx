import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../shared/api/client";

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

export function PaymentControlPage() {
  const queryClient = useQueryClient();
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

  return (
    <div style={{ maxWidth: 1000, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <p><Link to="/">← الرئيسية</Link></p>
      <h1>التحكم في المدفوعات والمطابقة</h1>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>الدفعات المقفولة</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>الطلب</th><th>الطريقة</th><th>القناة</th><th>المبلغ</th><th>وقت القفل</th>
            </tr>
          </thead>
          <tbody>
            {paymentsQuery.data?.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{p.orderId.slice(0, 8)}</td>
                <td>{KIND_LABELS[p.methodKind] ?? p.methodKind}</td>
                <td>{p.settlementChannel ?? "-"}</td>
                <td>{p.amount}</td>
                <td>{new Date(p.lockedAt).toLocaleString("ar-EG")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>طلب تعديل دفعة</h2>
        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); createAdjustment.mutate(); }}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8 }}
        >
          <select required value={adjustmentForm.paymentId} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, paymentId: e.target.value })} style={{ padding: 6 }}>
            <option value="">اختر دفعة</option>
            {paymentsQuery.data?.map((p) => <option key={p.id} value={p.id}>{p.orderId.slice(0, 8)} - {p.amount}ج</option>)}
          </select>
          <select value={adjustmentForm.proposedPaymentMethodId} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, proposedPaymentMethodId: e.target.value })} style={{ padding: 6 }}>
            <option value="">نفس الطريقة (تصحيح مبلغ بس)</option>
            {methodsQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input required type="number" placeholder="المبلغ المقترح" value={adjustmentForm.proposedAmount} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, proposedAmount: e.target.value })} style={{ padding: 6 }} />
          <input placeholder="السبب" value={adjustmentForm.reason} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })} style={{ padding: 6 }} />
          <button type="submit" disabled={createAdjustment.isPending}>طلب</button>
        </form>
        {adjustmentError && <p style={{ color: "crimson" }}>{adjustmentError}</p>}

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>الدفعة</th><th>المبلغ المقترح</th><th>الفرق</th><th>السبب</th><th>الحالة</th><th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {requestsQuery.data?.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{r.paymentId.slice(0, 8)}</td>
                <td>{r.proposedAmount}</td>
                <td>{r.amountDelta}</td>
                <td>{r.reason ?? "-"}</td>
                <td>{STATUS_LABELS[r.status] ?? r.status}</td>
                <td>
                  {r.status === "PENDING" && (
                    <>
                      <button onClick={() => decideAdjustment.mutate({ id: r.id, action: "approve" })} disabled={decideAdjustment.isPending}>اعتماد</button>{" "}
                      <button onClick={() => decideAdjustment.mutate({ id: r.id, action: "reject" })} disabled={decideAdjustment.isPending}>رفض</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>مطابقة كشوف الحساب الخارجية</h2>
        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); createRecord.mutate(); }}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 12 }}
        >
          <select value={recordForm.source} onChange={(e) => setRecordForm({ ...recordForm, source: e.target.value })} style={{ padding: 6 }}>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input required type="number" placeholder="المبلغ" value={recordForm.externalAmount} onChange={(e) => setRecordForm({ ...recordForm, externalAmount: e.target.value })} style={{ padding: 6 }} />
          <input required type="date" value={recordForm.externalDate} onChange={(e) => setRecordForm({ ...recordForm, externalDate: e.target.value })} style={{ padding: 6 }} />
          <input placeholder="مرجع خارجي" value={recordForm.externalReference} onChange={(e) => setRecordForm({ ...recordForm, externalReference: e.target.value })} style={{ padding: 6 }} />
          <button type="submit" disabled={createRecord.isPending}>تسجيل</button>
        </form>
        <button onClick={() => autoMatch.mutate()} disabled={autoMatch.isPending} style={{ marginBottom: 12 }}>
          مطابقة تلقائية (إنستاباي/أورانج كاش)
        </button>
        {autoMatch.data && <p>اتطابق: {autoMatch.data.matched} | فضل غير متطابق: {autoMatch.data.leftUnmatched}</p>}

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>المصدر</th><th>المرجع</th><th>المبلغ</th><th>التاريخ</th><th>الحالة</th><th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {recordsQuery.data?.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{SOURCE_LABELS[r.source] ?? r.source}</td>
                <td>{r.externalReference ?? "-"}</td>
                <td>{r.externalAmount}</td>
                <td>{new Date(r.externalDate).toLocaleDateString("ar-EG")}</td>
                <td>{MATCH_STATUS_LABELS[r.matchStatus] ?? r.matchStatus}</td>
                <td>
                  {r.matchStatus === "UNMATCHED" && (
                    <>
                      <select
                        value={matchPaymentId[r.id] ?? ""}
                        onChange={(e) => setMatchPaymentId({ ...matchPaymentId, [r.id]: e.target.value })}
                      >
                        <option value="">اختر دفعة</option>
                        {paymentsQuery.data?.map((p) => <option key={p.id} value={p.id}>{p.orderId.slice(0, 8)} - {p.amount}ج</option>)}
                      </select>{" "}
                      <button
                        disabled={!matchPaymentId[r.id] || matchRecord.isPending}
                        onClick={() => matchRecord.mutate({ id: r.id, paymentId: matchPaymentId[r.id] })}
                      >
                        مطابقة
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>الاستثناءات ونقاط المخاطر</h2>
        {exceptionsQuery.data?.length === 0 && <p>مفيش استثناءات حاليًا.</p>}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>الطلب</th><th>القناة</th><th>المبلغ</th><th>السبب</th><th>مستوى الخطورة</th>
            </tr>
          </thead>
          <tbody>
            {exceptionsQuery.data?.map((e) => (
              <tr key={e.paymentId} style={{ borderBottom: "1px solid #eee" }}>
                <td>{e.orderId.slice(0, 8)}</td>
                <td>{e.settlementChannel}</td>
                <td>{e.amount}</td>
                <td>{e.reason}</td>
                <td>{e.riskLevel} ({e.riskScore})</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
