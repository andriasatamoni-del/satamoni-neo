import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";

interface Shift {
  id: string;
  userId: string;
  openedAt: string;
  openingCash: number;
  actualCash: number | null;
  expectedCash: number | null;
  cashVariance: number | null;
}

// بتظهر بس للأدوار اللي عندها shifts.view_branch (مدير فرع/محاسب/أدمن) - لو المستخدم مالوش الصلاحية
// دي، الـAPI بيرجّع 403 والاستعلام بيفشل بهدوء فمكوّن مايظهرش خالص (مفيش داعي لفحص صلاحيات هنا كمان)
export function ShiftReviewPanel() {
  const queryClient = useQueryClient();
  const shiftsQuery = useQuery({
    queryKey: ["shifts", "pending-review"],
    queryFn: () => apiRequest<Shift[]>("/shifts?status=PENDING_REVIEW"),
    retry: false,
  });

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "acknowledge" }) =>
      apiRequest(`/shifts/${id}/review`, { method: "POST", body: { decision } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts", "pending-review"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "journal-entries"] });
    },
  });

  if (shiftsQuery.isError || !shiftsQuery.data || shiftsQuery.data.length === 0) return null;

  return (
    <Card className="mb-6 border-amber-300">
      <CardHeader>
        <CardTitle>شيفتات محتاجة مراجعة ({shiftsQuery.data.length})</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        <Table>
          <THead>
            <TR><TH>وقت الفتح</TH><TH>الافتتاحي</TH><TH>الفعلي</TH><TH>المتوقع</TH><TH>الفرق</TH><TH>إجراء</TH></TR>
          </THead>
          <TBody>
            {shiftsQuery.data.map((s) => (
              <TR key={s.id}>
                <TD>{new Date(s.openedAt).toLocaleString("ar-EG")}</TD>
                <TD>{s.openingCash}ج</TD>
                <TD>{s.actualCash}ج</TD>
                <TD>{s.expectedCash}ج</TD>
                <TD className="font-bold text-red-600">{s.cashVariance}ج</TD>
                <TD>
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => review.mutate({ id: s.id, decision: "approve" })} disabled={review.isPending}>اعتماد</Button>
                    <Button size="sm" variant="secondary" onClick={() => review.mutate({ id: s.id, decision: "acknowledge" })} disabled={review.isPending}>إقرار</Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {shiftsQuery.data.length === 0 && <EmptyState>مفيش شيفتات محتاجة مراجعة</EmptyState>}
      </CardBody>
    </Card>
  );
}
