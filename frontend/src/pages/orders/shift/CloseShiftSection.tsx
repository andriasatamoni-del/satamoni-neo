import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import { Field, Input } from "../../../shared/ui/Field";
import { errorMessage } from "../errorMessage";
import { formatPrice } from "../posLabels";
import { SHIFT_QUERY_KEYS, type ShiftPreview } from "./shiftTypes";
import { ShiftSection } from "./ShiftSection";

export function CloseShiftSection({ shiftId, onClosed }: { shiftId: string; onClosed: () => void }) {
  const queryClient = useQueryClient();
  const [actualCash, setActualCash] = useState("");

  const previewQuery = useQuery({
    queryKey: SHIFT_QUERY_KEYS.preview(shiftId),
    queryFn: () => apiRequest<ShiftPreview>(`/shifts/${shiftId}/preview`),
    refetchInterval: 5000,
  });

  const closeShift = useMutation({
    mutationFn: () => apiRequest(`/shifts/${shiftId}/close`, { method: "POST", body: { actualCash: Number(actualCash) } }),
    onSuccess: () => {
      onClosed();
      queryClient.invalidateQueries({ queryKey: SHIFT_QUERY_KEYS.current });
    },
  });

  const error = errorMessage(closeShift.error);

  return (
    <ShiftSection>
      {previewQuery.data && <ShiftPreviewStats preview={previewQuery.data} />}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="الكاش الفعلي في الدرج">
          <Input type="number" min="0" value={actualCash} onChange={(e) => setActualCash(e.target.value)} className="max-w-[160px]" />
        </Field>
        <Button onClick={() => closeShift.mutate()} disabled={!actualCash || closeShift.isPending}>
          تأكيد القفل
        </Button>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </ShiftSection>
  );
}

function ShiftPreviewStats({ preview }: { preview: ShiftPreview }) {
  const cashOut = preview.cashExpensesTotal + preview.cashPurchasesTotal;
  return (
    <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <PreviewStat label="مبيعات كاش" value={formatPrice(preview.cashSales)} />
      <PreviewStat label="مبيعات كارت" value={formatPrice(preview.cardSales)} />
      <PreviewStat label="مصروفات/مشتريات" value={`-${formatPrice(cashOut)}`} valueClassName="text-red-700" />
      <PreviewStat label="الكاش المتوقع" value={formatPrice(preview.expectedCash)} valueClassName="text-brand-700" />
    </div>
  );
}

function PreviewStat({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-bold ${valueClassName}`}>{value}</p>
    </div>
  );
}
