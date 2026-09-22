import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select, Textarea } from "../shared/ui/Field";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { StatusBadge } from "../shared/ui/Badge";

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

interface Branch {
  id: string;
  name: string;
}

interface FollowupQueueRow {
  orderId: string;
  branchId: string;
  branchName: string;
  customerName: string | null;
  customerPhone: string | null;
  addressDetails: string | null;
  total: number;
  deliveredAt: string;
  lastCallResult: string | null;
  lastNotes: string | null;
  lastCalledAt: string | null;
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

  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const [queueBranchId, setQueueBranchId] = useState("");
  const followupQueueQuery = useQuery({
    queryKey: ["crm", "followup-queue", queueBranchId],
    queryFn: () => apiRequest<FollowupQueueRow[]>(`/crm/followup-queue?branchId=${queueBranchId}`),
    enabled: !!queueBranchId,
  });
  const quickFollowup = useMutation({
    mutationFn: (input: { orderId: string; customerPhone: string; callResult: string }) =>
      apiRequest("/crm/followups", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "followup-queue"] }),
  });

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

  const complaints = complaintsQuery.data ?? [];

  return (
    <div>
      <PageHeader title="متابعة العملاء والشكاوى" description="سجّل مكالمات المتابعة وتابع الشكاوى المفتوحة" />

      <Card className="mb-6">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>طابور المتابعة ({followupQueueQuery.data?.length ?? 0})</CardTitle>
          <Select className="w-auto" value={queueBranchId} onChange={(e) => setQueueBranchId(e.target.value)}>
            <option value="">اختر فرع</option>
            {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </CardHeader>
        <CardBody className="p-0">
          {!queueBranchId && <EmptyState>اختر فرع عشان تشوف طلبات محتاجة مكالمة متابعة</EmptyState>}
          {queueBranchId && (
            <Table>
              <THead>
                <TR>
                  <TH>العميل</TH>
                  <TH>التليفون</TH>
                  <TH>العنوان</TH>
                  <TH>القيمة</TH>
                  <TH>آخر محاولة</TH>
                  <TH>إجراء</TH>
                </TR>
              </THead>
              <TBody>
                {followupQueueQuery.data?.map((row) => (
                  <TR key={row.orderId}>
                    <TD className="font-semibold text-slate-900">{row.customerName ?? "-"}</TD>
                    <TD>{row.customerPhone ?? "-"}</TD>
                    <TD className="max-w-xs truncate">{row.addressDetails ?? "-"}</TD>
                    <TD>{row.total.toFixed(2)} ج.م</TD>
                    <TD>{row.lastCallResult === "no_answer" ? "محاولش يرد" : "لسه ما اتصلناش"}</TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          disabled={quickFollowup.isPending || !row.customerPhone}
                          onClick={() => quickFollowup.mutate({ orderId: row.orderId, customerPhone: row.customerPhone!, callResult: "answered" })}
                        >
                          رد ✅
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={quickFollowup.isPending || !row.customerPhone}
                          onClick={() => quickFollowup.mutate({ orderId: row.orderId, customerPhone: row.customerPhone!, callResult: "no_answer" })}
                        >
                          محاولش يرد
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          {queueBranchId && followupQueueQuery.data?.length === 0 && <EmptyState>مفيش طلبات محتاجة متابعة دلوقتي</EmptyState>}
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>تسجيل مكالمة متابعة</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleFollowupSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="رقم الأوردر (اختياري)">
                <Input
                  type="number"
                  value={followupForm.legacyOrderId}
                  onChange={(e) => setFollowupForm({ ...followupForm, legacyOrderId: e.target.value })}
                />
              </Field>
              <Field label="رقم تليفون العميل">
                <Input
                  required
                  value={followupForm.customerPhone}
                  onChange={(e) => setFollowupForm({ ...followupForm, customerPhone: e.target.value })}
                />
              </Field>
              <Field label="نتيجة الاتصال">
                <Select
                  value={followupForm.callResult}
                  onChange={(e) => setFollowupForm({ ...followupForm, callResult: e.target.value })}
                >
                  {CALL_RESULTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
              </Field>
              <Field label="تقييم الرضا (اختياري)">
                <Select
                  value={followupForm.satisfactionRating}
                  onChange={(e) => setFollowupForm({ ...followupForm, satisfactionRating: e.target.value })}
                >
                  <option value="">—</option>
                  {SATISFACTION_RATINGS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="ملاحظات">
              <Textarea
                rows={2}
                value={followupForm.notes}
                onChange={(e) => setFollowupForm({ ...followupForm, notes: e.target.value })}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={followupForm.hasComplaint}
                onChange={(e) => setFollowupForm({ ...followupForm, hasComplaint: e.target.checked })}
              />
              فيه شكوى مرتبطة بالمكالمة دي
            </label>

            {followupForm.hasComplaint && (
              <div className="grid grid-cols-1 gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                <Field label="نوع الشكوى">
                  <Select
                    value={followupForm.category}
                    onChange={(e) => setFollowupForm({ ...followupForm, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </Select>
                </Field>
                <Field label="وصف الشكوى">
                  <Input
                    value={followupForm.description}
                    onChange={(e) => setFollowupForm({ ...followupForm, description: e.target.value })}
                  />
                </Field>
              </div>
            )}

            {followupError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{followupError}</p>}
            {followupMessage && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{followupMessage}</p>}

            <Button type="submit" disabled={recordFollowup.isPending}>
              {recordFollowup.isPending ? "بيتسجّل..." : "تسجيل المتابعة"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>الشكاوى ({complaints.length})</CardTitle>
          <Select className="w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">كل الحالات</option>
            <option value="open">مفتوحة</option>
            <option value="in_progress">جاري الحل</option>
            <option value="resolved">اتحلت</option>
          </Select>
        </CardHeader>
        <CardBody className="p-0">
          {complaintsQuery.isLoading && <p className="px-5 py-4 text-sm text-slate-400">بيتحمّل...</p>}
          {complaintsQuery.isError && <p className="px-5 py-4 text-sm text-red-600">حصل خطأ في تحميل الشكاوى</p>}
          <Table>
            <THead>
              <TR>
                <TH>القناة</TH>
                <TH>التليفون</TH>
                <TH>النوع</TH>
                <TH>الوصف</TH>
                <TH>الحالة</TH>
                <TH>إجراء</TH>
              </TR>
            </THead>
            <TBody>
              {complaints.map((c) => (
                <ComplaintRow
                  key={c.id}
                  complaint={c}
                  onUpdate={(status, resolutionNotes) => updateStatus.mutate({ id: c.id, status, resolutionNotes })}
                />
              ))}
            </TBody>
          </Table>
          {complaints.length === 0 && !complaintsQuery.isLoading && <EmptyState>مفيش شكاوى</EmptyState>}
        </CardBody>
      </Card>
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
    <TR>
      <TD>{complaint.channel === "whatsapp" ? "واتساب" : "تليفون"}</TD>
      <TD>{complaint.customerPhone}</TD>
      <TD>{CATEGORIES.find((c) => c.value === complaint.category)?.label ?? complaint.category}</TD>
      <TD className="max-w-xs truncate">{complaint.description ?? "—"}</TD>
      <TD><StatusBadge status={STATUS_LABELS[complaint.status] ?? complaint.status} /></TD>
      <TD>
        <div className="flex items-center gap-2">
          <Select className="w-auto" value={complaint.status} onChange={(e) => onUpdate(e.target.value, undefined)}>
            <option value="open">مفتوحة</option>
            <option value="in_progress">جاري الحل</option>
            <option value="resolved">اتحلت</option>
          </Select>
          <Input
            className="w-40"
            placeholder="ملاحظة الحل"
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            onBlur={() => onUpdate(undefined, resolutionNotes)}
          />
        </div>
      </TD>
    </TR>
  );
}
