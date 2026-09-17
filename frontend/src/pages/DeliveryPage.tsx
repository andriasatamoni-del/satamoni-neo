import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input, Select } from "../shared/ui/Field";
import { StatusBadge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

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

  const assignments = assignmentsQuery.data ?? [];

  return (
    <div>
      <PageHeader title="التوصيل والسائقين" description="السائقين وتكليفات التوصيل" />

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
                <TH>الطلب</TH><TH>السائق</TH><TH>الحالة</TH><TH>إجراء</TH>
              </TR>
            </THead>
            <TBody>
              {assignments.map((a) => {
                const next = nextStatus(a.status);
                return (
                  <TR key={a.id}>
                    <TD className="font-mono text-xs">{a.orderId.slice(0, 8)}</TD>
                    <TD>{driversQuery.data?.find((d) => d.id === a.driverId)?.name ?? a.driverId}</TD>
                    <TD><StatusBadge status={STATUS_LABELS[a.status] ?? a.status} /></TD>
                    <TD>
                      {next && (
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
    </div>
  );
}
