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

interface Employee { id: string; name: string; department: string | null; jobTitle: string | null; baseSalary: number; wageType: string; status: string; }
interface PayrollRunEmployeeLine { employeeId: string; employeeName: string; grossPay: number; advances: number; penalties: number; bonuses: number; netPay: number; }
interface PayrollRun {
  id: string; year: number; month: number; status: string; totalNetPay: number;
  employees: PayrollRunEmployeeLine[]; cancellationReason: string | null;
}
interface LeaveRequest {
  id: string; employeeId: string; leaveType: string; startDate: string; endDate: string;
  days: number; reason: string | null; status: string; createdAt: string;
}
interface PayrollAdjustment {
  id: string; employeeId: string; entryDate: string; adjustmentType: string; amount: number;
  notes: string | null; status: string; createdBy: string | null; createdAt: string;
  cancelledBy: string | null; cancelledAt: string | null; cancellationReason: string | null;
}

const STATUS_LABELS: Record<string, string> = { active: "فعّال", suspended: "موقوف", terminated: "منتهي الخدمة" };
const RUN_STATUS_LABELS: Record<string, string> = { DRAFT: "مسودة", APPROVED: "معتمدة", CANCELLED: "ملغاة" };
const LEAVE_STATUS_LABELS: Record<string, string> = { PENDING: "قيد المراجعة", APPROVED: "معتمد", REJECTED: "مرفوض", CANCELLED: "ملغى" };
const ADJUSTMENT_TYPE_LABELS: Record<string, string> = { advance: "سلفة", penalty: "جزاء", bonus: "مكافأة" };
const ADJUSTMENT_STATUS_LABELS: Record<string, string> = { ACTIVE: "فعّال", CANCELLED: "ملغى" };

const TABS = [
  { key: "employees", label: "الموظفين والرواتب" },
  { key: "leave", label: "طلبات الإجازة" },
  { key: "adjustments", label: "سلف وجزاءات ومكافآت" },
];

export function HrPayrollPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("employees");
  const employeesQuery = useQuery({ queryKey: ["hr", "employees"], queryFn: () => apiRequest<Employee[]>("/hr/employees") });
  const payrollRunsQuery = useQuery({ queryKey: ["hr", "payroll-runs"], queryFn: () => apiRequest<PayrollRun[]>("/hr/payroll-runs") });
  const leaveRequestsQuery = useQuery({ queryKey: ["hr", "leave-requests"], queryFn: () => apiRequest<LeaveRequest[]>("/hr/leave-requests") });
  const adjustmentsQuery = useQuery({ queryKey: ["hr", "adjustments"], queryFn: () => apiRequest<PayrollAdjustment[]>("/hr/adjustments") });

  const reviewLeaveRequest = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) =>
      apiRequest(`/hr/leave-requests/${id}/review`, { method: "POST", body: { decision } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr", "leave-requests"] }),
  });

  const [employeeForm, setEmployeeForm] = useState({ name: "", department: "", baseSalary: "" });
  const createEmployee = useMutation({
    mutationFn: () =>
      apiRequest("/hr/employees", {
        method: "POST",
        body: { name: employeeForm.name, department: employeeForm.department || undefined, baseSalary: Number(employeeForm.baseSalary) || undefined },
      }),
    onSuccess: () => {
      setEmployeeForm({ name: "", department: "", baseSalary: "" });
      queryClient.invalidateQueries({ queryKey: ["hr", "employees"] });
    },
  });

  const [runForm, setRunForm] = useState({ year: String(new Date().getFullYear()), month: String(new Date().getMonth() + 1) });
  const [lines, setLines] = useState<{ employeeId: string; grossPay: string; advances: string; penalties: string; bonuses: string }[]>([
    { employeeId: "", grossPay: "", advances: "", penalties: "", bonuses: "" },
  ]);
  const [runError, setRunError] = useState<string | null>(null);
  const createRun = useMutation({
    mutationFn: () =>
      apiRequest("/hr/payroll-runs", {
        method: "POST",
        body: {
          year: Number(runForm.year),
          month: Number(runForm.month),
          employees: lines
            .filter((l) => l.employeeId && l.grossPay)
            .map((l) => ({
              employeeId: l.employeeId,
              grossPay: Number(l.grossPay),
              advances: Number(l.advances) || 0,
              penalties: Number(l.penalties) || 0,
              bonuses: Number(l.bonuses) || 0,
            })),
        },
      }),
    onSuccess: () => {
      setLines([{ employeeId: "", grossPay: "", advances: "", penalties: "", bonuses: "" }]);
      setRunError(null);
      queryClient.invalidateQueries({ queryKey: ["hr", "payroll-runs"] });
    },
    onError: (err) => setRunError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const approveRun = useMutation({
    mutationFn: (id: string) => apiRequest(`/hr/payroll-runs/${id}/approve`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr", "payroll-runs"] }),
  });
  const cancelRun = useMutation({
    mutationFn: (id: string) => apiRequest(`/hr/payroll-runs/${id}/cancel`, { method: "POST", body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr", "payroll-runs"] }),
  });
  const deleteDraftRun = useMutation({
    mutationFn: (id: string) => apiRequest(`/hr/payroll-runs/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hr", "payroll-runs"] }),
  });

  function updateLine(index: number, patch: Partial<(typeof lines)[number]>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  const [adjustmentForm, setAdjustmentForm] = useState({
    employeeId: "", entryDate: new Date().toISOString().slice(0, 10), adjustmentType: "advance", amount: "", notes: "",
  });
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const registerAdjustment = useMutation({
    mutationFn: () =>
      apiRequest("/hr/adjustments", {
        method: "POST",
        body: {
          employeeId: adjustmentForm.employeeId,
          entryDate: adjustmentForm.entryDate,
          adjustmentType: adjustmentForm.adjustmentType,
          amount: Number(adjustmentForm.amount),
          notes: adjustmentForm.notes || undefined,
        },
      }),
    onSuccess: () => {
      setAdjustmentForm({ employeeId: "", entryDate: new Date().toISOString().slice(0, 10), adjustmentType: "advance", amount: "", notes: "" });
      setAdjustmentError(null);
      queryClient.invalidateQueries({ queryKey: ["hr", "adjustments"] });
    },
    onError: (err) => setAdjustmentError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const [cancelAdjustmentReason, setCancelAdjustmentReason] = useState<Record<string, string>>({});
  const [cancelAdjustmentError, setCancelAdjustmentError] = useState<string | null>(null);
  const cancelAdjustment = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest(`/hr/adjustments/${id}/cancel`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      setCancelAdjustmentError(null);
      queryClient.invalidateQueries({ queryKey: ["hr", "adjustments"] });
    },
    onError: (err) => setCancelAdjustmentError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const employees = employeesQuery.data ?? [];
  const payrollRuns = payrollRunsQuery.data ?? [];
  const leaveRequests = leaveRequestsQuery.data ?? [];
  const adjustments = adjustmentsQuery.data ?? [];

  return (
    <div>
      <PageHeader title="الموارد البشرية والرواتب" description="الموظفين وقوائم الرواتب الشهرية" />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "employees" && (
      <>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>إضافة موظف</CardTitle></CardHeader>
          <CardBody>
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); createEmployee.mutate(); }} className="space-y-4">
              <Field label="اسم الموظف">
                <Input required value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="القسم (اختياري)">
                  <Input value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })} />
                </Field>
                <Field label="الراتب الأساسي">
                  <Input type="number" value={employeeForm.baseSalary} onChange={(e) => setEmployeeForm({ ...employeeForm, baseSalary: e.target.value })} />
                </Field>
              </div>
              <Button type="submit" disabled={createEmployee.isPending}>إضافة</Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>الموظفين ({employees.length})</CardTitle></CardHeader>
          <CardBody className="max-h-72 overflow-y-auto p-0">
            <Table>
              <THead>
                <TR><TH>الاسم</TH><TH>القسم</TH><TH>الراتب</TH><TH>الحالة</TH></TR>
              </THead>
              <TBody>
                {employees.map((e) => (
                  <TR key={e.id}>
                    <TD className="font-semibold text-slate-900">{e.name}</TD>
                    <TD>{e.department ?? "-"}</TD>
                    <TD>{e.baseSalary}ج</TD>
                    <TD><StatusBadge status={STATUS_LABELS[e.status] ?? e.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>قائمة رواتب جديدة</CardTitle></CardHeader>
        <CardBody>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); createRun.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:max-w-xs">
              <Field label="السنة">
                <Input required type="number" value={runForm.year} onChange={(e) => setRunForm({ ...runForm, year: e.target.value })} />
              </Field>
              <Field label="الشهر">
                <Input required type="number" min="1" max="12" value={runForm.month} onChange={(e) => setRunForm({ ...runForm, month: e.target.value })} />
              </Field>
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                  <Select value={line.employeeId} onChange={(e) => updateLine(i, { employeeId: e.target.value })}>
                    <option value="">اختر موظف</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </Select>
                  <Input type="number" placeholder="الراتب الإجمالي" value={line.grossPay} onChange={(e) => updateLine(i, { grossPay: e.target.value })} />
                  <Input type="number" placeholder="سلف" value={line.advances} onChange={(e) => updateLine(i, { advances: e.target.value })} />
                  <Input type="number" placeholder="خصومات" value={line.penalties} onChange={(e) => updateLine(i, { penalties: e.target.value })} />
                  <Input type="number" placeholder="مكافآت" value={line.bonuses} onChange={(e) => updateLine(i, { bonuses: e.target.value })} />
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLines((prev) => [...prev, { employeeId: "", grossPay: "", advances: "", penalties: "", bonuses: "" }])}
            >
              + موظف
            </Button>

            {runError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{runError}</p>}

            <div>
              <Button type="submit" disabled={createRun.isPending}>تسجيل القائمة</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>قوائم الرواتب ({payrollRuns.length})</CardTitle></CardHeader>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR><TH>الشهر</TH><TH>الموظفين</TH><TH>إجمالي صافي الرواتب</TH><TH>الحالة</TH><TH>إجراء</TH></TR>
            </THead>
            <TBody>
              {payrollRuns.map((run) => (
                <TR key={run.id}>
                  <TD className="font-semibold text-slate-900">{run.month}/{run.year}</TD>
                  <TD className="max-w-sm truncate">{run.employees.map((e) => `${e.employeeName} (${e.netPay})`).join("، ") || "-"}</TD>
                  <TD className="font-bold text-slate-900">{run.totalNetPay}ج</TD>
                  <TD><StatusBadge status={RUN_STATUS_LABELS[run.status] ?? run.status} /></TD>
                  <TD>
                    <div className="flex gap-1.5">
                      {run.status === "DRAFT" && (
                        <>
                          <Button size="sm" onClick={() => approveRun.mutate(run.id)} disabled={approveRun.isPending}>اعتماد</Button>
                          <Button size="sm" variant="danger" onClick={() => deleteDraftRun.mutate(run.id)} disabled={deleteDraftRun.isPending}>حذف</Button>
                        </>
                      )}
                      {run.status === "APPROVED" && (
                        <Button size="sm" variant="danger" onClick={() => cancelRun.mutate(run.id)} disabled={cancelRun.isPending}>إلغاء</Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {payrollRuns.length === 0 && <EmptyState>مفيش قوائم رواتب لسه</EmptyState>}
        </CardBody>
      </Card>
      </>
      )}

      {tab === "leave" && (
        <Card>
          <CardHeader><CardTitle>طلبات الإجازة ({leaveRequests.length})</CardTitle></CardHeader>
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR><TH>الموظف</TH><TH>النوع</TH><TH>من</TH><TH>إلى</TH><TH>الأيام</TH><TH>الحالة</TH><TH>إجراء</TH></TR>
              </THead>
              <TBody>
                {leaveRequests.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-semibold text-slate-900">
                      {employees.find((e) => e.id === r.employeeId)?.name ?? r.employeeId}
                    </TD>
                    <TD>{r.leaveType}</TD>
                    <TD>{r.startDate.slice(0, 10)}</TD>
                    <TD>{r.endDate.slice(0, 10)}</TD>
                    <TD>{r.days}</TD>
                    <TD><StatusBadge status={LEAVE_STATUS_LABELS[r.status] ?? r.status} /></TD>
                    <TD>
                      {r.status === "PENDING" && (
                        <div className="flex gap-1.5">
                          <Button size="sm" onClick={() => reviewLeaveRequest.mutate({ id: r.id, decision: "approve" })} disabled={reviewLeaveRequest.isPending}>
                            اعتماد
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => reviewLeaveRequest.mutate({ id: r.id, decision: "reject" })} disabled={reviewLeaveRequest.isPending}>
                            رفض
                          </Button>
                        </div>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {leaveRequests.length === 0 && <EmptyState>مفيش طلبات إجازة لسه</EmptyState>}
          </CardBody>
        </Card>
      )}

      {tab === "adjustments" && (
        <>
          <Card className="mb-6">
            <CardHeader><CardTitle>تسجيل سلفة / جزاء / مكافأة</CardTitle></CardHeader>
            <CardBody>
              <form
                onSubmit={(e: FormEvent) => { e.preventDefault(); registerAdjustment.mutate(); }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-5"
              >
                <Field label="الموظف">
                  <Select required value={adjustmentForm.employeeId} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, employeeId: e.target.value })}>
                    <option value="">اختر موظف</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </Select>
                </Field>
                <Field label="التاريخ">
                  <Input required type="date" value={adjustmentForm.entryDate} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, entryDate: e.target.value })} />
                </Field>
                <Field label="النوع">
                  <Select value={adjustmentForm.adjustmentType} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, adjustmentType: e.target.value })}>
                    <option value="advance">سلفة</option>
                    <option value="penalty">جزاء</option>
                    <option value="bonus">مكافأة</option>
                  </Select>
                </Field>
                <Field label="المبلغ">
                  <Input required type="number" min="0" step="0.01" value={adjustmentForm.amount} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, amount: e.target.value })} />
                </Field>
                <Field label="ملاحظات (اختياري)">
                  <Input value={adjustmentForm.notes} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, notes: e.target.value })} />
                </Field>
                <div className="sm:col-span-5">
                  {adjustmentError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{adjustmentError}</p>}
                  <Button type="submit" disabled={registerAdjustment.isPending}>تسجيل</Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>سجل السلف والجزاءات والمكافآت ({adjustments.length})</CardTitle></CardHeader>
            <CardBody className="p-0">
              {cancelAdjustmentError && <p className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{cancelAdjustmentError}</p>}
              <Table>
                <THead>
                  <TR><TH>الموظف</TH><TH>التاريخ</TH><TH>النوع</TH><TH>المبلغ</TH><TH>ملاحظات</TH><TH>الحالة</TH><TH>إجراء</TH></TR>
                </THead>
                <TBody>
                  {adjustments.map((a) => (
                    <TR key={a.id}>
                      <TD className="font-semibold text-slate-900">
                        {employees.find((e) => e.id === a.employeeId)?.name ?? a.employeeId}
                      </TD>
                      <TD>{a.entryDate.slice(0, 10)}</TD>
                      <TD>{ADJUSTMENT_TYPE_LABELS[a.adjustmentType] ?? a.adjustmentType}</TD>
                      <TD className="font-bold text-slate-900">{a.amount}ج</TD>
                      <TD>{a.notes ?? "-"}</TD>
                      <TD>
                        <StatusBadge status={ADJUSTMENT_STATUS_LABELS[a.status] ?? a.status} />
                        {a.status === "CANCELLED" && a.cancellationReason && (
                          <div className="mt-1 text-xs text-slate-500">{a.cancellationReason}</div>
                        )}
                      </TD>
                      <TD>
                        {a.status === "ACTIVE" && (
                          <div className="flex items-center gap-1.5">
                            <Input
                              placeholder="سبب الإلغاء"
                              className="w-36"
                              value={cancelAdjustmentReason[a.id] ?? ""}
                              onChange={(e) => setCancelAdjustmentReason({ ...cancelAdjustmentReason, [a.id]: e.target.value })}
                            />
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => cancelAdjustment.mutate({ id: a.id, reason: cancelAdjustmentReason[a.id] ?? "" })}
                              disabled={cancelAdjustment.isPending}
                            >
                              إلغاء
                            </Button>
                          </div>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {adjustments.length === 0 && <EmptyState>مفيش سلف أو جزاءات أو مكافآت مسجلة لسه</EmptyState>}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
