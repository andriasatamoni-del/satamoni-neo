import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Select, Textarea } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "../shared/ui/Table";

interface Branch {
  id: string;
  name: string;
}

interface ChecklistItem {
  code: string;
  message: string;
}

interface BranchDayStatus {
  businessDate: string;
  alreadyClosed: boolean;
  dayRecord: unknown;
  color: "RED" | "YELLOW" | "GREEN";
  redItems: ChecklistItem[];
  yellowItems: ChecklistItem[];
  canClose: boolean;
  todaySummary: { totalSales: number; orderCount: number };
}

interface BranchDayRecord {
  id: string;
  branchId: string;
  businessDate: string;
  closedBy: string;
  closedByName: string | null;
  closedAt: string;
  totalSales: number;
  orderCount: number;
  cashVarianceTotal: number;
  managerNotes: string | null;
}

const COLOR_LABEL: Record<BranchDayStatus["color"], string> = { RED: "أحمر", YELLOW: "أصفر", GREEN: "أخضر" };
const COLOR_TONE: Record<BranchDayStatus["color"], "danger" | "warning" | "success"> = {
  RED: "danger",
  YELLOW: "warning",
  GREEN: "success",
};

export function BranchDayPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [managerNotes, setManagerNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState(user?.branchId ?? "");
  const canClose = user?.role === "admin" || user?.role === "branch_manager";

  const branchesQuery = useQuery({
    queryKey: ["branches"],
    queryFn: () => apiRequest<Branch[]>("/branches"),
    enabled: !user?.branchId,
  });

  const branchId = user?.branchId ?? selectedBranchId;

  const statusQuery = useQuery({
    queryKey: ["branch-day-status", branchId],
    queryFn: () => apiRequest<BranchDayStatus>(`/branch-days/${branchId}/status`),
    enabled: !!branchId,
  });

  const historyQuery = useQuery({
    queryKey: ["branch-day-history", branchId],
    queryFn: () => apiRequest<BranchDayRecord[]>(`/branch-days/${branchId}/history`),
    enabled: !!branchId,
  });

  const closeMutation = useMutation({
    mutationFn: () => apiRequest(`/branch-days/${branchId}/close`, { method: "POST", body: { managerNotes: managerNotes || undefined } }),
    onSuccess: () => {
      setError(null);
      setManagerNotes("");
      queryClient.invalidateQueries({ queryKey: ["branch-day-status", branchId] });
      queryClient.invalidateQueries({ queryKey: ["branch-day-history", branchId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const status = statusQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader title="قفل يوم الفرع" description="Checklist أحمر/أصفر/أخضر قبل القفل، وسجل التقفيلات السابقة" />

      {!user?.branchId && (
        <Card>
          <CardBody>
            <Field label="الفرع">
              <Select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)}>
                <option value="">اختار الفرع</option>
                {branchesQuery.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>
      )}

      {!branchId && <p className="text-sm text-slate-400">اختار فرع الأول عشان تشوف حالة قفل اليوم.</p>}

      {branchId && (
      <>
      <Card>
        <CardHeader>
          <CardTitle>حالة اليوم {status ? `- ${status.businessDate}` : ""}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {statusQuery.isLoading && <p className="text-sm text-slate-400">بيتحمّل...</p>}
          {status && (
            <>
              <div className="flex items-center gap-3">
                <Badge tone={COLOR_TONE[status.color]}>{COLOR_LABEL[status.color]}</Badge>
                {status.alreadyClosed && <Badge tone="neutral">اليوم ده مقفول بالفعل</Badge>}
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-xs text-slate-400">مبيعات اليوم</p>
                  <p className="text-lg font-bold text-slate-800">{status.todaySummary.totalSales.toFixed(2)} ج.م</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-xs text-slate-400">عدد الطلبات</p>
                  <p className="text-lg font-bold text-slate-800">{status.todaySummary.orderCount}</p>
                </div>
              </div>

              {status.redItems.length > 0 && (
                <ul className="space-y-1.5 rounded-lg bg-red-50 px-4 py-3">
                  {status.redItems.map((item) => (
                    <li key={item.code} className="text-sm font-medium text-red-700">
                      • {item.message}
                    </li>
                  ))}
                </ul>
              )}
              {status.yellowItems.length > 0 && (
                <ul className="space-y-1.5 rounded-lg bg-amber-50 px-4 py-3">
                  {status.yellowItems.map((item) => (
                    <li key={item.code} className="text-sm font-medium text-amber-700">
                      • {item.message}
                    </li>
                  ))}
                </ul>
              )}

              {!status.alreadyClosed && canClose && (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <Field label="ملاحظات المدير (اختياري)">
                    <Textarea rows={2} value={managerNotes} onChange={(e) => setManagerNotes(e.target.value)} />
                  </Field>
                  {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
                  <Button onClick={() => closeMutation.mutate()} disabled={!status.canClose || closeMutation.isPending}>
                    {closeMutation.isPending ? "بيتقفل..." : "قفل يوم الفرع"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>سجل التقفيلات</CardTitle>
        </CardHeader>
        <CardBody>
          {historyQuery.data && historyQuery.data.length === 0 && <EmptyState>مفيش تقفيلات لسه</EmptyState>}
          {historyQuery.data && historyQuery.data.length > 0 && (
            <Table>
              <THead>
                <TR>
                  <TH>التاريخ</TH>
                  <TH>المبيعات</TH>
                  <TH>عدد الطلبات</TH>
                  <TH>فرق الكاش</TH>
                  <TH>اتقفل بمعرفة</TH>
                  <TH>ملاحظات</TH>
                </TR>
              </THead>
              <TBody>
                {historyQuery.data.map((day) => (
                  <TR key={day.id}>
                    <TD>{day.businessDate}</TD>
                    <TD>{day.totalSales.toFixed(2)} ج.م</TD>
                    <TD>{day.orderCount}</TD>
                    <TD>{day.cashVarianceTotal.toFixed(2)} ج.م</TD>
                    <TD>{day.closedByName ?? "-"}</TD>
                    <TD>{day.managerNotes ?? "-"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
      </>
      )}
    </div>
  );
}
