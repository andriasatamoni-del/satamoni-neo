import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { StatusBadge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

interface Employee { id: string; name: string; department: string | null; jobTitle: string | null; baseSalary: number; wageType: string; status: string; }
interface PayrollRunEmployeeLine { employeeId: string; employeeName: string; grossPay: number; advances: number; penalties: number; bonuses: number; netPay: number; }
interface PayrollRun {
  id: string; year: number; month: number; status: string; totalNetPay: number;
  employees: PayrollRunEmployeeLine[]; cancellationReason: string | null;
}

const STATUS_LABELS: Record<string, string> = { active: "فعّال", suspended: "موقوف", terminated: "منتهي الخدمة" };
const RUN_STATUS_LABELS: Record<string, string> = { DRAFT: "مسودة", APPROVED: "معتمدة", CANCELLED: "ملغاة" };

export function HrPayrollPage() {
  const queryClient = useQueryClient();
  const employeesQuery = useQuery({ queryKey: ["hr", "employees"], queryFn: () => apiRequest<Employee[]>("/hr/employees") });
  const payrollRunsQuery = useQuery({ queryKey: ["hr", "payroll-runs"], queryFn: () => apiRequest<PayrollRun[]>("/hr/payroll-runs") });

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

  const employees = employeesQuery.data ?? [];
  const payrollRuns = payrollRunsQuery.data ?? [];

  return (
    <div>
      <PageHeader title="الموارد البشرية والرواتب" description="الموظفين وقوائم الرواتب الشهرية" />

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
    </div>
  );
}
