import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../shared/api/client";
import { useCan } from "../../shared/auth/AuthContext";
import { PERMISSION } from "../../shared/auth/permissions";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { TBody, TD, TH, THead, TR, Table } from "../../shared/ui/Table";
import { Pagination } from "../../shared/ui/Pagination";
import { usePaginatedQuery } from "../../shared/api/usePaginatedQuery";
import { useListState } from "../../shared/ui/useListState";

interface Shift {
  id: string;
  userId: string;
  openedAt: string;
  openingCash: number;
  actualCash: number | null;
  expectedCash: number | null;
  cashVariance: number | null;
}

// بتظهر بس للي عنده shifts.view_branch (مدير فرع/محاسب/أدمن)، وأزرار المراجعة لـshifts.review.
// من غير الصلاحية المكوّن مش بيظهر ومفيش طلب بيتبعت؛ لو الطلب فشل برضه بيختفي بهدوء.
export function ShiftReviewPanel() {
  const queryClient = useQueryClient();
  const allowed = useCan();
  const canSee = allowed(PERMISSION.SHIFTS_VIEW_BRANCH);
  const canReview = allowed(PERMISSION.SHIFTS_REVIEW);
  const shiftsList = useListState([] as const, { prefix: "shifts." });
  const shiftsPageQuery = usePaginatedQuery<Shift>(["shifts", "pending-review"], "/shifts", { ...shiftsList.params, status: "PENDING_REVIEW" }, { retry: false, enabled: canSee });

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "acknowledge" }) =>
      apiRequest(`/shifts/${id}/review`, { method: "POST", body: { decision } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts", "pending-review"] });
      queryClient.invalidateQueries({ queryKey: ["accounting", "journal-entries"] });
    },
  });

  if (!canSee || shiftsPageQuery.isError || !shiftsPageQuery.data || shiftsPageQuery.data.total === 0) return null;

  return (
    <Card className="mb-6 border-amber-300">
      <CardHeader>
        <CardTitle>شيفتات محتاجة مراجعة ({shiftsPageQuery.data.total})</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        <Table>
          <THead>
            <TR><TH>وقت الفتح</TH><TH>الافتتاحي</TH><TH>الفعلي</TH><TH>المتوقع</TH><TH>الفرق</TH><TH>إجراء</TH></TR>
          </THead>
          <TBody>
            {(shiftsPageQuery.data?.items ?? []).map((s) => (
              <TR key={s.id}>
                <TD>{new Date(s.openedAt).toLocaleString("ar-EG")}</TD>
                <TD>{s.openingCash}ج</TD>
                <TD>{s.actualCash}ج</TD>
                <TD>{s.expectedCash}ج</TD>
                <TD className="font-bold text-red-600">{s.cashVariance}ج</TD>
                <TD>
                  {canReview && (
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => review.mutate({ id: s.id, decision: "approve" })} disabled={review.isPending}>اعتماد</Button>
                      <Button size="sm" variant="secondary" onClick={() => review.mutate({ id: s.id, decision: "acknowledge" })} disabled={review.isPending}>إقرار</Button>
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {shiftsPageQuery.data && (
          <Pagination total={shiftsPageQuery.data.total} limit={shiftsPageQuery.data.limit} offset={shiftsPageQuery.data.offset} onPageChange={shiftsList.setPage} isFetching={shiftsPageQuery.isFetching} />
        )}
      </CardBody>
    </Card>
  );
}
