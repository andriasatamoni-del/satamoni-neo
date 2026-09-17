import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select, Textarea } from "../shared/ui/Field";
import { Badge, StatusBadge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Tabs } from "../shared/ui/Tabs";

interface Branch { id: string; name: string; }
interface Driver { id: string; name: string; status: string; branchId: string; }
interface Order { id: string; orderType: string; total: number; status: string; }
interface Assignment { id: string; orderId: string; driverId: string; branchId: string; status: string; collectedAmount: number | null; settlementId: string | null; }
interface DriverSettlement {
  id: string; driverId: string; branchId: string; settledAt: string; orderCount: number;
  codExpected: number; codCollected: number; expectedHandover: number; actualHandover: number;
  handoverVariance: number; varianceStatus: "NONE" | "PENDING_REVIEW" | "ACKNOWLEDGED" | "APPROVED";
  varianceReviewNotes: string | null; bonusTotal: number; notes: string | null;
}
interface DriverAttendanceShift {
  id: string; driverId: string; branchId: string; status: "ACTIVE" | "CLOSED";
  checkedInAt: string; checkedOutAt: string | null; hourlyRate: number;
  hoursWorked: number | null; wageAmount: number | null; bonusTotal: number | null; totalPay: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "متحوّل", OUT_FOR_DELIVERY: "في الطريق", DELIVERED: "اتسلّم", FAILED: "فشل", RETURNED: "اترجّع",
};

const TABS = [
  { key: "assignments", label: "التكليفات" },
  { key: "settlements", label: "تسويات كاش السائقين" },
  { key: "shifts", label: "شيفتات الحضور" },
];

const VARIANCE_STATUS_LABELS: Record<string, string> = {
  NONE: "مفيش فرق", PENDING_REVIEW: "محتاج مراجعة", ACKNOWLEDGED: "اتراجع", APPROVED: "اتاعتمد",
};
const VARIANCE_STATUS_TONES: Record<string, "success" | "warning" | "brand" | "info" | "danger" | "neutral"> = {
  NONE: "success", PENDING_REVIEW: "warning", ACKNOWLEDGED: "info", APPROVED: "brand",
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function DeliveryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("assignments");
  const canReview = user?.role === "admin" || user?.role === "accountant" || user?.role === "branch_manager";

  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const driversQuery = useQuery({ queryKey: ["delivery", "drivers"], queryFn: () => apiRequest<Driver[]>("/delivery/drivers") });
  const ordersQuery = useQuery({ queryKey: ["orders"], queryFn: () => apiRequest<Order[]>("/orders") });
  const assignmentsQuery = useQuery({ queryKey: ["delivery", "assignments"], queryFn: () => apiRequest<Assignment[]>("/delivery/assignments") });
  const settlementsQuery = useQuery({ queryKey: ["delivery", "settlements"], queryFn: () => apiRequest<DriverSettlement[]>("/delivery/settlements") });
  const shiftsQuery = useQuery({ queryKey: ["delivery", "attendance-shifts"], queryFn: () => apiRequest<DriverAttendanceShift[]>("/delivery/attendance-shifts") });

  const [driverName, setDriverName] = useState("");
  const [driverBranch, setDriverBranch] = useState("");
  const createDriver = useMutation({
    mutationFn: () => apiRequest("/delivery/drivers", { method: "POST", body: { name: driverName, branchId: driverBranch } }),
    onSuccess: () => {
      setDriverName("");
      queryClient.invalidateQueries({ queryKey: ["delivery", "drivers"] });
    },
  });

  const [assignForm, setAssignForm] = useState({ orderId: "", driverId: "" });
  const [assignError, setAssignError] = useState<string | null>(null);
  const createAssignment = useMutation({
    mutationFn: () => apiRequest("/delivery/assignments", { method: "POST", body: assignForm }),
    onSuccess: () => {
      setAssignError(null);
      queryClient.invalidateQueries({ queryKey: ["delivery", "assignments"] });
    },
    onError: (err) => setAssignError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const [collectedAmounts, setCollectedAmounts] = useState<Record<string, string>>({});
  const advanceStatus = useMutation({
    mutationFn: ({ id, status, collectedAmount }: { id: string; status: string; collectedAmount?: number }) =>
      apiRequest(`/delivery/assignments/${id}/status`, { method: "PATCH", body: { status, ...(collectedAmount !== undefined ? { collectedAmount } : {}) } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery", "assignments"] }),
  });

  // --- تسويات كاش السائقين ---
  const [settlementForm, setSettlementForm] = useState({ driverId: "", branchId: "", actualHandover: "", notes: "" });
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const createSettlement = useMutation({
    mutationFn: () =>
      apiRequest("/delivery/settlements", {
        method: "POST",
        body: {
          driverId: settlementForm.driverId, branchId: settlementForm.branchId,
          actualHandover: Number(settlementForm.actualHandover), notes: settlementForm.notes || undefined,
        },
      }),
    onSuccess: () => {
      setSettlementForm({ driverId: "", branchId: "", actualHandover: "", notes: "" });
      setSettlementError(null);
      queryClient.invalidateQueries({ queryKey: ["delivery", "settlements"] });
      queryClient.invalidateQueries({ queryKey: ["delivery", "assignments"] });
    },
    onError: (err) => setSettlementError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const reviewSettlement = useMutation({
    mutationFn: ({ id, decision, notes }: { id: string; decision: "approve" | "acknowledge"; notes?: string }) =>
      apiRequest(`/delivery/settlements/${id}/review`, { method: "POST", body: { decision, notes } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery", "settlements"] }),
  });

  // --- شيفتات الحضور ---
  const [checkInForm, setCheckInForm] = useState({ driverId: "", branchId: "" });
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const checkIn = useMutation({
    mutationFn: () => apiRequest("/delivery/attendance-shifts/check-in", { method: "POST", body: checkInForm }),
    onSuccess: () => {
      setCheckInForm({ driverId: "", branchId: "" });
      setCheckInError(null);
      queryClient.invalidateQueries({ queryKey: ["delivery", "attendance-shifts"] });
    },
    onError: (err) => setCheckInError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });
  const checkOut = useMutation({
    mutationFn: (id: string) => apiRequest(`/delivery/attendance-shifts/${id}/check-out`, { method: "POST", body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery", "attendance-shifts"] }),
  });

  function nextStatus(status: string): string | null {
    if (status === "ASSIGNED") return "OUT_FOR_DELIVERY";
    if (status === "OUT_FOR_DELIVERY") return "DELIVERED";
    return null;
  }

  const driverName_ = (id: string) => driversQuery.data?.find((d) => d.id === id)?.name ?? id;
  const branchName = (id: string) => branchesQuery.data?.find((b) => b.id === id)?.name ?? id;
  const assignments = assignmentsQuery.data ?? [];
  const settlements = settlementsQuery.data ?? [];
  const shifts = shiftsQuery.data ?? [];

  return (
    <div>
      <PageHeader title="التوصيل والسائقين" description="السائقين، تكليفات التوصيل، تسويات الكاش، وشيفتات الحضور" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "assignments" && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>إضافة سائق</CardTitle>
              </CardHeader>
              <CardBody>
                <form onSubmit={(e: FormEvent) => { e.preventDefault(); createDriver.mutate(); }} className="space-y-4">
                  <Field label="اسم السائق">
                    <Input required value={driverName} onChange={(e) => setDriverName(e.target.value)} />
                  </Field>
                  <Field label="الفرع">
                    <Select required value={driverBranch} onChange={(e) => setDriverBranch(e.target.value)}>
                      <option value="">اختر فرع</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                  <Button type="submit" disabled={createDriver.isPending}>إضافة</Button>
                </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>تحويل طلب لسائق</CardTitle>
              </CardHeader>
              <CardBody>
                <form onSubmit={(e: FormEvent) => { e.preventDefault(); createAssignment.mutate(); }} className="space-y-4">
                  <Field label="طلب الدليفري">
                    <Select required value={assignForm.orderId} onChange={(e) => setAssignForm({ ...assignForm, orderId: e.target.value })}>
                      <option value="">اختر طلب دليفري</option>
                      {ordersQuery.data?.filter((o) => o.orderType === "delivery").map((o) => (
                        <option key={o.id} value={o.id}>{o.id.slice(0, 8)} - {o.total}ج</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="السائق">
                    <Select required value={assignForm.driverId} onChange={(e) => setAssignForm({ ...assignForm, driverId: e.target.value })}>
                      <option value="">اختر سائق</option>
                      {driversQuery.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </Select>
                  </Field>
                  {assignError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{assignError}</p>}
                  <Button type="submit" disabled={createAssignment.isPending}>تحويل</Button>
                </form>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>تكليفات التوصيل ({assignments.length})</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>الطلب</TH><TH>السائق</TH><TH>الحالة</TH><TH>المحصّل</TH><TH>إجراء</TH>
                  </TR>
                </THead>
                <TBody>
                  {assignments.map((a) => {
                    const next = nextStatus(a.status);
                    return (
                      <TR key={a.id}>
                        <TD className="font-mono text-xs">{a.orderId.slice(0, 8)}</TD>
                        <TD>{driverName_(a.driverId)}</TD>
                        <TD><StatusBadge status={STATUS_LABELS[a.status] ?? a.status} /></TD>
                        <TD>{a.collectedAmount !== null ? `${fmt(a.collectedAmount)}ج` : "-"}</TD>
                        <TD>
                          {next === "DELIVERED" && (
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="المبلغ المحصّل"
                                type="number"
                                className="w-28"
                                value={collectedAmounts[a.id] ?? ""}
                                onChange={(e) => setCollectedAmounts({ ...collectedAmounts, [a.id]: e.target.value })}
                              />
                              <Button
                                size="sm" variant="secondary"
                                onClick={() => advanceStatus.mutate({
                                  id: a.id, status: next,
                                  collectedAmount: collectedAmounts[a.id] ? Number(collectedAmounts[a.id]) : undefined,
                                })}
                                disabled={advanceStatus.isPending}
                              >
                                {STATUS_LABELS[next]}
                              </Button>
                            </div>
                          )}
                          {next && next !== "DELIVERED" && (
                            <Button size="sm" variant="secondary" onClick={() => advanceStatus.mutate({ id: a.id, status: next })} disabled={advanceStatus.isPending}>
                              {STATUS_LABELS[next]}
                            </Button>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              {assignments.length === 0 && <EmptyState>مفيش تكليفات توصيل لسه</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}

      {tab === "settlements" && (
        <>
          <Card className="mb-6">
            <CardHeader><CardTitle>تسوية كاش سائق</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); createSettlement.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="السائق">
                    <Select required value={settlementForm.driverId} onChange={(e) => setSettlementForm({ ...settlementForm, driverId: e.target.value })}>
                      <option value="">اختر سائق</option>
                      {driversQuery.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="الفرع">
                    <Select required value={settlementForm.branchId} onChange={(e) => setSettlementForm({ ...settlementForm, branchId: e.target.value })}>
                      <option value="">اختر فرع</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="المبلغ اللي سلّمه السائق فعليًا">
                    <Input required type="number" min="0" value={settlementForm.actualHandover} onChange={(e) => setSettlementForm({ ...settlementForm, actualHandover: e.target.value })} />
                  </Field>
                </div>
                <Field label="ملاحظات (اختياري)">
                  <Textarea value={settlementForm.notes} onChange={(e) => setSettlementForm({ ...settlementForm, notes: e.target.value })} />
                </Field>
                {settlementError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{settlementError}</p>}
                <Button type="submit" disabled={createSettlement.isPending}>{createSettlement.isPending ? "بيتسجّل..." : "تسجيل التسوية"}</Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>تسويات الكاش ({settlements.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>السائق</TH><TH>الفرع</TH><TH>عدد الطلبات</TH><TH>المتوقع تسليمه</TH><TH>الفعلي</TH><TH>الفرق</TH><TH>البونص</TH><TH>حالة الفرق</TH><TH>إجراء</TH>
                  </TR>
                </THead>
                <TBody>
                  {settlements.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-semibold text-slate-900">{driverName_(s.driverId)}</TD>
                      <TD>{branchName(s.branchId)}</TD>
                      <TD>{s.orderCount}</TD>
                      <TD>{fmt(s.expectedHandover)}ج</TD>
                      <TD>{fmt(s.actualHandover)}ج</TD>
                      <TD className={s.handoverVariance !== 0 ? "font-bold text-amber-600" : ""}>{fmt(s.handoverVariance)}ج</TD>
                      <TD>{fmt(s.bonusTotal)}ج</TD>
                      <TD><Badge tone={VARIANCE_STATUS_TONES[s.varianceStatus]}>{VARIANCE_STATUS_LABELS[s.varianceStatus]}</Badge></TD>
                      <TD>
                        {canReview && s.varianceStatus === "PENDING_REVIEW" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              placeholder="ملاحظات (اختياري)"
                              className="w-32"
                              value={reviewNotes[s.id] ?? ""}
                              onChange={(e) => setReviewNotes({ ...reviewNotes, [s.id]: e.target.value })}
                            />
                            <Button size="sm" onClick={() => reviewSettlement.mutate({ id: s.id, decision: "approve", notes: reviewNotes[s.id] })} disabled={reviewSettlement.isPending}>
                              اعتماد
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => reviewSettlement.mutate({ id: s.id, decision: "acknowledge", notes: reviewNotes[s.id] })} disabled={reviewSettlement.isPending}>
                              تسجيل علم فقط
                            </Button>
                          </div>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {settlements.length === 0 && <EmptyState>مفيش تسويات كاش لسه</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}

      {tab === "shifts" && (
        <>
          <Card className="mb-6">
            <CardHeader><CardTitle>تسجيل دخول سائق (بداية شيفت حضور)</CardTitle></CardHeader>
            <CardBody>
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); checkIn.mutate(); }} className="flex flex-wrap items-end gap-4">
                <div className="max-w-xs flex-1">
                  <Field label="السائق">
                    <Select required value={checkInForm.driverId} onChange={(e) => setCheckInForm({ ...checkInForm, driverId: e.target.value })}>
                      <option value="">اختر سائق</option>
                      {driversQuery.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="max-w-xs flex-1">
                  <Field label="الفرع">
                    <Select required value={checkInForm.branchId} onChange={(e) => setCheckInForm({ ...checkInForm, branchId: e.target.value })}>
                      <option value="">اختر فرع</option>
                      {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                </div>
                <Button type="submit" disabled={checkIn.isPending}>تسجيل دخول</Button>
              </form>
              {checkInError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{checkInError}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>شيفتات الحضور ({shifts.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>السائق</TH><TH>الفرع</TH><TH>الحالة</TH><TH>ساعات العمل</TH><TH>الأجر</TH><TH>البونص</TH><TH>الإجمالي</TH><TH>إجراء</TH>
                  </TR>
                </THead>
                <TBody>
                  {shifts.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-semibold text-slate-900">{driverName_(s.driverId)}</TD>
                      <TD>{branchName(s.branchId)}</TD>
                      <TD><Badge tone={s.status === "ACTIVE" ? "success" : "neutral"}>{s.status === "ACTIVE" ? "شغال" : "مقفول"}</Badge></TD>
                      <TD>{s.hoursWorked ?? "-"}</TD>
                      <TD>{s.wageAmount !== null ? `${fmt(s.wageAmount)}ج` : "-"}</TD>
                      <TD>{s.bonusTotal !== null ? `${fmt(s.bonusTotal)}ج` : "-"}</TD>
                      <TD className="font-bold">{s.totalPay !== null ? `${fmt(s.totalPay)}ج` : "-"}</TD>
                      <TD>
                        {s.status === "ACTIVE" && (
                          <Button size="sm" variant="secondary" onClick={() => checkOut.mutate(s.id)} disabled={checkOut.isPending}>إنهاء الشيفت</Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {shifts.length === 0 && <EmptyState>مفيش شيفتات حضور لسه</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
