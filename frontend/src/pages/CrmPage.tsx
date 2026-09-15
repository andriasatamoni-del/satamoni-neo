import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../shared/api/client";

interface Complaint {
  id: string;
  channel: "phone_followup" | "whatsapp";
  legacyOrderId: number | null;
  customerPhone: string;
  category: string;
  description: string | null;
  status: "open" | "in_progress" | "resolved";
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

const CALL_RESULTS = [
  { value: "answered", label: "اتصل ورد" },
  { value: "no_answer", label: "ملحقش يرد" },
  { value: "no_answer_after_3_tries", label: "ملحقش يرد بعد 3 محاولات" },
];
const SATISFACTION_RATINGS = [
  { value: "excellent", label: "ممتاز" },
  { value: "good", label: "كويس" },
  { value: "average", label: "متوسط" },
  { value: "bad", label: "سيء" },
];
const CATEGORIES = [
  { value: "late_order", label: "تأخير" },
  { value: "wrong_item", label: "صنف غلط" },
  { value: "quality", label: "جودة" },
  { value: "other", label: "تاني" },
];
const STATUS_LABELS: Record<string, string> = { open: "مفتوحة", in_progress: "جاري الحل", resolved: "اتحلت" };

export function CrmPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");

  const complaintsQuery = useQuery({
    queryKey: ["crm", "complaints", statusFilter],
    queryFn: () => apiRequest<Complaint[]>(`/crm/complaints${statusFilter ? `?status=${statusFilter}` : ""}`),
  });

  const updateStatus = useMutation({
    mutationFn: (input: { id: string; status?: string; resolutionNotes?: string }) =>
      apiRequest(`/crm/complaints/${input.id}`, {
        method: "PATCH",
        body: { status: input.status, resolutionNotes: input.resolutionNotes },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "complaints"] }),
  });

  const [followupForm, setFollowupForm] = useState({
    legacyOrderId: "",
    customerPhone: "",
    callResult: "answered",
    satisfactionRating: "",
    notes: "",
    hasComplaint: false,
    category: "other",
    description: "",
  });
  const [followupMessage, setFollowupMessage] = useState<string | null>(null);
  const [followupError, setFollowupError] = useState<string | null>(null);

  const recordFollowup = useMutation({
    mutationFn: () =>
      apiRequest("/crm/followups", {
        method: "POST",
        body: {
          legacyOrderId: followupForm.legacyOrderId ? Number(followupForm.legacyOrderId) : undefined,
          customerPhone: followupForm.customerPhone,
          callResult: followupForm.callResult,
          satisfactionRating: followupForm.satisfactionRating || undefined,
          notes: followupForm.notes || undefined,
          hasComplaint: followupForm.hasComplaint,
          complaint: followupForm.hasComplaint
            ? { category: followupForm.category, description: followupForm.description || undefined }
            : undefined,
        },
      }),
    onSuccess: () => {
      setFollowupMessage("اتسجّلت المتابعة بنجاح");
      setFollowupError(null);
      setFollowupForm({
        legacyOrderId: "", customerPhone: "", callResult: "answered", satisfactionRating: "",
        notes: "", hasComplaint: false, category: "other", description: "",
      });
      queryClient.invalidateQueries({ queryKey: ["crm", "complaints"] });
    },
    onError: (err) => {
      setFollowupError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع");
      setFollowupMessage(null);
    },
  });

  function handleFollowupSubmit(e: FormEvent) {
    e.preventDefault();
    recordFollowup.mutate();
  }

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <p><Link to="/">← الرئيسية</Link></p>
      <h1>متابعة العملاء والشكاوى (CRM)</h1>

      <section style={{ marginBottom: 32, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>تسجيل مكالمة متابعة</h2>
        <form onSubmit={handleFollowupSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              رقم الأوردر (اختياري)
              <input
                type="number"
                value={followupForm.legacyOrderId}
                onChange={(e) => setFollowupForm({ ...followupForm, legacyOrderId: e.target.value })}
                style={{ display: "block", width: "100%", padding: 6 }}
              />
            </label>
            <label>
              رقم تليفون العميل
              <input
                required
                value={followupForm.customerPhone}
                onChange={(e) => setFollowupForm({ ...followupForm, customerPhone: e.target.value })}
                style={{ display: "block", width: "100%", padding: 6 }}
              />
            </label>
            <label>
              نتيجة الاتصال
              <select
                value={followupForm.callResult}
                onChange={(e) => setFollowupForm({ ...followupForm, callResult: e.target.value })}
                style={{ display: "block", width: "100%", padding: 6 }}
              >
                {CALL_RESULTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label>
              تقييم الرضا (اختياري)
              <select
                value={followupForm.satisfactionRating}
                onChange={(e) => setFollowupForm({ ...followupForm, satisfactionRating: e.target.value })}
                style={{ display: "block", width: "100%", padding: 6 }}
              >
                <option value="">—</option>
                {SATISFACTION_RATINGS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            ملاحظات
            <textarea
              value={followupForm.notes}
              onChange={(e) => setFollowupForm({ ...followupForm, notes: e.target.value })}
              style={{ display: "block", width: "100%", padding: 6 }}
            />
          </label>
          <label style={{ display: "block", marginTop: 12 }}>
            <input
              type="checkbox"
              checked={followupForm.hasComplaint}
              onChange={(e) => setFollowupForm({ ...followupForm, hasComplaint: e.target.checked })}
            />{" "}
            فيه شكوى مرتبطة بالمكالمة دي
          </label>
          {followupForm.hasComplaint && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <label>
                نوع الشكوى
                <select
                  value={followupForm.category}
                  onChange={(e) => setFollowupForm({ ...followupForm, category: e.target.value })}
                  style={{ display: "block", width: "100%", padding: 6 }}
                >
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label>
                وصف الشكوى
                <input
                  value={followupForm.description}
                  onChange={(e) => setFollowupForm({ ...followupForm, description: e.target.value })}
                  style={{ display: "block", width: "100%", padding: 6 }}
                />
              </label>
            </div>
          )}
          {followupError && <p style={{ color: "crimson" }}>{followupError}</p>}
          {followupMessage && <p style={{ color: "green" }}>{followupMessage}</p>}
          <button type="submit" disabled={recordFollowup.isPending} style={{ padding: "8px 16px", marginTop: 12 }}>
            {recordFollowup.isPending ? "بيتسجّل..." : "تسجيل المتابعة"}
          </button>
        </form>
      </section>

      <section>
        <h2>الشكاوى</h2>
        <div style={{ marginBottom: 12 }}>
          <label>
            فلترة بالحالة:{" "}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">الكل</option>
              <option value="open">مفتوحة</option>
              <option value="in_progress">جاري الحل</option>
              <option value="resolved">اتحلت</option>
            </select>
          </label>
        </div>

        {complaintsQuery.isLoading && <p>بيتحمّل...</p>}
        {complaintsQuery.isError && <p style={{ color: "crimson" }}>حصل خطأ في تحميل الشكاوى</p>}
        {complaintsQuery.data && complaintsQuery.data.length === 0 && <p>مفيش شكاوى.</p>}

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>القناة</th>
              <th>التليفون</th>
              <th>النوع</th>
              <th>الوصف</th>
              <th>الحالة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {complaintsQuery.data?.map((c) => (
              <ComplaintRow
                key={c.id}
                complaint={c}
                onUpdate={(status, resolutionNotes) => updateStatus.mutate({ id: c.id, status, resolutionNotes })}
              />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ComplaintRow({
  complaint,
  onUpdate,
}: {
  complaint: Complaint;
  onUpdate: (status?: string, resolutionNotes?: string) => void;
}) {
  const [resolutionNotes, setResolutionNotes] = useState(complaint.resolutionNotes ?? "");

  return (
    <tr style={{ borderBottom: "1px solid #eee" }}>
      <td>{complaint.channel === "whatsapp" ? "واتساب" : "تليفون"}</td>
      <td>{complaint.customerPhone}</td>
      <td>{CATEGORIES.find((c) => c.value === complaint.category)?.label ?? complaint.category}</td>
      <td>{complaint.description ?? "—"}</td>
      <td>{STATUS_LABELS[complaint.status] ?? complaint.status}</td>
      <td>
        <select value={complaint.status} onChange={(e) => onUpdate(e.target.value, undefined)}>
          <option value="open">مفتوحة</option>
          <option value="in_progress">جاري الحل</option>
          <option value="resolved">اتحلت</option>
        </select>
        <input
          placeholder="ملاحظة الحل"
          value={resolutionNotes}
          onChange={(e) => setResolutionNotes(e.target.value)}
          onBlur={() => onUpdate(undefined, resolutionNotes)}
          style={{ marginInlineStart: 8, padding: 4 }}
        />
      </td>
    </tr>
  );
}
