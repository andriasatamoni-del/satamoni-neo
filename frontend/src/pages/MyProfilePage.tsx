import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { StatusBadge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";
import { Tabs } from "../shared/ui/Tabs";

interface EmployeeProfile {
  id: string;
  name: string;
  department: string | null;
  jobTitle: string | null;
  baseSalary: number;
  wageType: string;
  status: string;
}

interface Payslip {
  payrollRunId: string;
  year: number;
  month: number;
  approvedAt: string | null;
  grossPay: number;
  advances: number;
  penalties: number;
  bonuses: number;
  netPay: number;
}

interface LeaveRequest {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
  reviewNotes: string | null;
  createdAt: string;
}

interface AttendanceShift {
  id: string;
  branchId: string;
  status: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  hoursWorked: number | null;
  notes: string | null;
}

interface Branch {
  id: string;
  name: string;
}

const TABS = [
  { key: "profile", label: "البروفايل" },
  { key: "payslips", label: "قسائم الراتب" },
  { key: "leave", label: "طلبات الإجازة" },
  { key: "attendance", label: "الحضور" },
];

const LEAVE_STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد المراجعة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
  CANCELLED: "ملغى",
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function MyProfilePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("profile");

  const profileQuery = useQuery({
    queryKey: ["hr", "self", "profile"],
    queryFn: () => apiRequest<EmployeeProfile>("/hr/self/profile"),
    retry: false,
  });

  const notLinked = profileQuery.isError && profileQuery.error instanceof ApiError && profileQuery.error.status === 404;

  const payslipsQuery = useQuery({
    queryKey: ["hr", "self", "payslips"],
    queryFn: () => apiRequest<Payslip[]>("/hr/self/payslips"),
    enabled: !notLinked,
  });

  const leaveRequestsQuery = useQuery({
    queryKey: ["hr", "self", "leave-requests"],
    queryFn: () => apiRequest<LeaveRequest[]>("/hr/self/leave-requests"),
    enabled: !notLinked,
  });

  const attendanceQuery = useQuery({
    queryKey: ["hr", "self", "attendance"],
    queryFn: () => apiRequest<AttendanceShift[]>("/hr/self/attendance"),
    enabled: !notLinked,
  });

  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });

  const [leaveForm, setLeaveForm] = useState({ leaveType: "", startDate: "", endDate: "", reason: "" });
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const createLeaveRequest = useMutation({
    mutationFn: () =>
      apiRequest("/hr/self/leave-requests", {
        method: "POST",
        body: {
          leaveType: leaveForm.leaveType,
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          reason: leaveForm.reason || undefined,
        },
      }),
    onSuccess: () => {
      setLeaveForm({ leaveType: "", startDate: "", endDate: "", reason: "" });
      setLeaveError(null);
      queryClient.invalidateQueries({ queryKey: ["hr", "self", "leave-requests"] });
    },
    onError: (err) => setLeaveError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const cancelLeaveRequest = useMutation({
    mutationFn: (id: string) => apiRequest(`/hr/self/leave-requests/${id}/cancel`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr", "self", "leave-requests"] }),
  });

  const [checkInBranchId, setCheckInBranchId] = useState("");
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const checkIn = useMutation({
    mutationFn: () => apiRequest("/hr/self/attendance/check-in", { method: "POST", body: { branchId: checkInBranchId } }),
    onSuccess: () => {
      setAttendanceError(null);
      queryClient.invalidateQueries({ queryKey: ["hr", "self", "attendance"] });
    },
    onError: (err) => setAttendanceError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const checkOut = useMutation({
    mutationFn: (shiftId: string) => apiRequest(`/hr/self/attendance/${shiftId}/check-out`, { method: "POST", body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr", "self", "attendance"] }),
  });

  function handleLeaveSubmit(e: FormEvent) {
    e.preventDefault();
    createLeaveRequest.mutate();
  }

  function handleCheckInSubmit(e: FormEvent) {
    e.preventDefault();
    checkIn.mutate();
  }

  const profile = profileQuery.data;
  const payslips = payslipsQuery.data ?? [];
  const leaveRequests = leaveRequestsQuery.data ?? [];
  const attendanceShifts = attendanceQuery.data ?? [];
  const activeShift = attendanceShifts.find((s) => s.status === "ACTIVE");

  return (
    <div>
      <PageHeader title="بياناتي" description="بروفايلك وقسائم راتبك وطلبات الإجازة والحضور بتاعك" />

      {notLinked ? (
        <Card>
          <CardBody>
            <EmptyState>الحساب ده مش مربوط بملف موظف - كلّم الأدمن لو محتاج توصل لبياناتك</EmptyState>
          </CardBody>
        </Card>
      ) : (
        <>
          <Tabs tabs={TABS} active={tab} onChange={setTab} />

          {tab === "profile" && profile && (
            <Card>
              <CardHeader>
                <CardTitle>{profile.name}</CardTitle>
              </CardHeader>
              <CardBody>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold text-slate-500">القسم</dt>
                    <dd className="text-sm text-slate-900">{profile.department ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-slate-500">المسمى الوظيفي</dt>
                    <dd className="text-sm text-slate-900">{profile.jobTitle ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-slate-500">الراتب الأساسي</dt>
                    <dd className="text-sm text-slate-900">{fmt(profile.baseSalary)}ج</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-slate-500">الحالة</dt>
                    <dd><StatusBadge status={profile.status === "active" ? "فعّال" : profile.status === "suspended" ? "موقوف" : "منتهي الخدمة"} /></dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          )}

          {tab === "payslips" && (
            <Card>
              <CardHeader>
                <CardTitle>قسائم الراتب ({payslips.length})</CardTitle>
              </CardHeader>
              <CardBody className="p-0">
                <Table>
                  <THead>
                    <TR><TH>الشهر</TH><TH>الإجمالي</TH><TH>سلف</TH><TH>خصومات</TH><TH>مكافآت</TH><TH>الصافي</TH></TR>
                  </THead>
                  <TBody>
                    {payslips.map((p) => (
                      <TR key={p.payrollRunId}>
                        <TD className="font-semibold text-slate-900">{p.month}/{p.year}</TD>
                        <TD>{fmt(p.grossPay)}</TD>
                        <TD>{fmt(p.advances)}</TD>
                        <TD>{fmt(p.penalties)}</TD>
                        <TD>{fmt(p.bonuses)}</TD>
                        <TD className="font-bold text-slate-900">{fmt(p.netPay)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {payslips.length === 0 && <EmptyState>مفيش قسائم راتب معتمدة لسه</EmptyState>}
              </CardBody>
            </Card>
          )}

          {tab === "leave" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>طلب إجازة جديد</CardTitle>
                </CardHeader>
                <CardBody>
                  <form onSubmit={handleLeaveSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <Field label="نوع الإجازة">
                        <Input required value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })} placeholder="سنوية / مرضية" />
                      </Field>
                      <Field label="من">
                        <Input required type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} />
                      </Field>
                      <Field label="إلى">
                        <Input required type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="السبب (اختياري)">
                      <Input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
                    </Field>
                    {leaveError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{leaveError}</p>}
                    <Button type="submit" disabled={createLeaveRequest.isPending}>إرسال الطلب</Button>
                  </form>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>طلباتي ({leaveRequests.length})</CardTitle>
                </CardHeader>
                <CardBody className="p-0">
                  <Table>
                    <THead>
                      <TR><TH>النوع</TH><TH>من</TH><TH>إلى</TH><TH>الأيام</TH><TH>الحالة</TH><TH></TH></TR>
                    </THead>
                    <TBody>
                      {leaveRequests.map((r) => (
                        <TR key={r.id}>
                          <TD className="font-semibold text-slate-900">{r.leaveType}</TD>
                          <TD>{r.startDate.slice(0, 10)}</TD>
                          <TD>{r.endDate.slice(0, 10)}</TD>
                          <TD>{r.days}</TD>
                          <TD><StatusBadge status={LEAVE_STATUS_LABELS[r.status] ?? r.status} /></TD>
                          <TD>
                            {r.status === "PENDING" && (
                              <Button size="sm" variant="danger" onClick={() => cancelLeaveRequest.mutate(r.id)} disabled={cancelLeaveRequest.isPending}>
                                إلغاء
                              </Button>
                            )}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  {leaveRequests.length === 0 && <EmptyState>مفيش طلبات إجازة لسه</EmptyState>}
                </CardBody>
              </Card>
            </div>
          )}

          {tab === "attendance" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>تسجيل حضور</CardTitle>
                </CardHeader>
                <CardBody>
                  {activeShift ? (
                    <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3">
                      <span className="text-sm font-semibold text-emerald-700">
                        شغال من {new Date(activeShift.checkedInAt).toLocaleString("en-US")}
                      </span>
                      <Button size="sm" onClick={() => checkOut.mutate(activeShift.id)} disabled={checkOut.isPending}>
                        تسجيل انصراف
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleCheckInSubmit} className="flex flex-wrap items-end gap-3">
                      <Field label="الفرع">
                        <Select required value={checkInBranchId} onChange={(e) => setCheckInBranchId(e.target.value)}>
                          <option value="">اختر فرع</option>
                          {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                      </Field>
                      <Button type="submit" disabled={checkIn.isPending}>تسجيل حضور</Button>
                    </form>
                  )}
                  {attendanceError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{attendanceError}</p>}
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>سجل الحضور ({attendanceShifts.length})</CardTitle>
                </CardHeader>
                <CardBody className="p-0">
                  <Table>
                    <THead>
                      <TR><TH>الدخول</TH><TH>الخروج</TH><TH>ساعات العمل</TH><TH>الحالة</TH></TR>
                    </THead>
                    <TBody>
                      {attendanceShifts.map((s) => (
                        <TR key={s.id}>
                          <TD>{new Date(s.checkedInAt).toLocaleString("en-US")}</TD>
                          <TD>{s.checkedOutAt ? new Date(s.checkedOutAt).toLocaleString("en-US") : "-"}</TD>
                          <TD>{s.hoursWorked != null ? fmt(s.hoursWorked) : "-"}</TD>
                          <TD><StatusBadge status={s.status === "ACTIVE" ? "شغال" : "مقفول"} /></TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  {attendanceShifts.length === 0 && <EmptyState>مفيش سجل حضور لسه</EmptyState>}
                </CardBody>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
