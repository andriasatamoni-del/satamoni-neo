import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../shared/api/client";

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

  return (
    <div style={{ maxWidth: 1000, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <p><Link to="/">← الرئيسية</Link></p>
      <h1>الموارد البشرية والرواتب</h1>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>إضافة موظف</h2>
        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); createEmployee.mutate(); }}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8 }}
        >
          <input required placeholder="اسم الموظف" value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} style={{ padding: 6 }} />
          <input placeholder="القسم (اختياري)" value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })} style={{ padding: 6 }} />
          <input type="number" placeholder="الراتب الأساسي" value={employeeForm.baseSalary} onChange={(e) => setEmployeeForm({ ...employeeForm, baseSalary: e.target.value })} style={{ padding: 6 }} />
          <button type="submit" disabled={createEmployee.isPending}>إضافة</button>
        </form>
      </section>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>الموظفين</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>الاسم</th><th>القسم</th><th>الراتب الأساسي</th><th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {employeesQuery.data?.map((e) => (
              <tr key={e.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{e.name}</td>
                <td>{e.department ?? "-"}</td>
                <td>{e.baseSalary}</td>
                <td>{STATUS_LABELS[e.status] ?? e.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>قائمة رواتب جديدة</h2>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); createRun.mutate(); }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input required type="number" placeholder="السنة" value={runForm.year} onChange={(e) => setRunForm({ ...runForm, year: e.target.value })} style={{ padding: 6 }} />
            <input required type="number" min="1" max="12" placeholder="الشهر" value={runForm.month} onChange={(e) => setRunForm({ ...runForm, month: e.target.value })} style={{ padding: 6 }} />
          </div>
          {lines.map((line, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <select value={line.employeeId} onChange={(e) => updateLine(i, { employeeId: e.target.value })} style={{ padding: 6 }}>
                <option value="">اختر موظف</option>
                {employeesQuery.data?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <input type="number" placeholder="الراتب الإجمالي" value={line.grossPay} onChange={(e) => updateLine(i, { grossPay: e.target.value })} style={{ padding: 6 }} />
              <input type="number" placeholder="سلف" value={line.advances} onChange={(e) => updateLine(i, { advances: e.target.value })} style={{ padding: 6 }} />
              <input type="number" placeholder="خصومات" value={line.penalties} onChange={(e) => updateLine(i, { penalties: e.target.value })} style={{ padding: 6 }} />
              <input type="number" placeholder="مكافآت" value={line.bonuses} onChange={(e) => updateLine(i, { bonuses: e.target.value })} style={{ padding: 6 }} />
            </div>
          ))}
          <button type="button" onClick={() => setLines((prev) => [...prev, { employeeId: "", grossPay: "", advances: "", penalties: "", bonuses: "" }])} style={{ marginBottom: 8 }}>
            + موظف
          </button>
          {runError && <p style={{ color: "crimson" }}>{runError}</p>}
          <div>
            <button type="submit" disabled={createRun.isPending}>تسجيل القائمة</button>
          </div>
        </form>
      </section>

      <section>
        <h2>قوائم الرواتب</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>الشهر</th><th>الموظفين</th><th>إجمالي صافي الرواتب</th><th>الحالة</th><th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {payrollRunsQuery.data?.map((run) => (
              <tr key={run.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{run.month}/{run.year}</td>
                <td>{run.employees.map((e) => `${e.employeeName} (${e.netPay})`).join("، ") || "-"}</td>
                <td>{run.totalNetPay}</td>
                <td>{RUN_STATUS_LABELS[run.status] ?? run.status}</td>
                <td>
                  {run.status === "DRAFT" && (
                    <>
                      <button onClick={() => approveRun.mutate(run.id)} disabled={approveRun.isPending}>اعتماد</button>{" "}
                      <button onClick={() => deleteDraftRun.mutate(run.id)} disabled={deleteDraftRun.isPending}>حذف</button>
                    </>
                  )}
                  {run.status === "APPROVED" && (
                    <button onClick={() => cancelRun.mutate(run.id)} disabled={cancelRun.isPending}>إلغاء</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
