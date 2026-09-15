import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../shared/api/client";

interface Branch { id: string; name: string; }
interface Driver { id: string; name: string; status: string; branchId: string; }
interface Order { id: string; orderType: string; total: number; status: string; }
interface Assignment { id: string; orderId: string; driverId: string; status: string; }

const STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "متحوّل", OUT_FOR_DELIVERY: "في الطريق", DELIVERED: "اتسلّم", FAILED: "فشل", RETURNED: "اترجّع",
};

export function DeliveryPage() {
  const queryClient = useQueryClient();
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });
  const driversQuery = useQuery({ queryKey: ["delivery", "drivers"], queryFn: () => apiRequest<Driver[]>("/delivery/drivers") });
  const ordersQuery = useQuery({ queryKey: ["orders"], queryFn: () => apiRequest<Order[]>("/orders") });
  const assignmentsQuery = useQuery({ queryKey: ["delivery", "assignments"], queryFn: () => apiRequest<Assignment[]>("/delivery/assignments") });

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

  const advanceStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest(`/delivery/assignments/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delivery", "assignments"] }),
  });

  function nextStatus(status: string): string | null {
    if (status === "ASSIGNED") return "OUT_FOR_DELIVERY";
    if (status === "OUT_FOR_DELIVERY") return "DELIVERED";
    return null;
  }

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <p><Link to="/">← الرئيسية</Link></p>
      <h1>التوصيل والسائقين</h1>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>إضافة سائق</h2>
        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); createDriver.mutate(); }}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}
        >
          <input required placeholder="اسم السائق" value={driverName} onChange={(e) => setDriverName(e.target.value)} style={{ padding: 6 }} />
          <select required value={driverBranch} onChange={(e) => setDriverBranch(e.target.value)} style={{ padding: 6 }}>
            <option value="">اختر فرع</option>
            {branchesQuery.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button type="submit" disabled={createDriver.isPending}>إضافة</button>
        </form>
      </section>

      <section style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>تحويل طلب لسائق</h2>
        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); createAssignment.mutate(); }}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}
        >
          <select required value={assignForm.orderId} onChange={(e) => setAssignForm({ ...assignForm, orderId: e.target.value })} style={{ padding: 6 }}>
            <option value="">اختر طلب دليفري</option>
            {ordersQuery.data?.filter((o) => o.orderType === "delivery").map((o) => (
              <option key={o.id} value={o.id}>{o.id.slice(0, 8)} - {o.total}ج</option>
            ))}
          </select>
          <select required value={assignForm.driverId} onChange={(e) => setAssignForm({ ...assignForm, driverId: e.target.value })} style={{ padding: 6 }}>
            <option value="">اختر سائق</option>
            {driversQuery.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button type="submit" disabled={createAssignment.isPending}>تحويل</button>
        </form>
        {assignError && <p style={{ color: "crimson" }}>{assignError}</p>}
      </section>

      <section>
        <h2>تكليفات التوصيل</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "right", borderBottom: "1px solid #ccc" }}>
              <th>الطلب</th><th>السائق</th><th>الحالة</th><th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {assignmentsQuery.data?.map((a) => {
              const next = nextStatus(a.status);
              return (
                <tr key={a.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td>{a.orderId.slice(0, 8)}</td>
                  <td>{driversQuery.data?.find((d) => d.id === a.driverId)?.name ?? a.driverId}</td>
                  <td>{STATUS_LABELS[a.status] ?? a.status}</td>
                  <td>
                    {next && (
                      <button onClick={() => advanceStatus.mutate({ id: a.id, status: next })} disabled={advanceStatus.isPending}>
                        {STATUS_LABELS[next]}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
