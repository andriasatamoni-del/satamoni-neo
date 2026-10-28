import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../../shared/api/client";
import { Badge } from "../../../shared/ui/Badge";
import { Button } from "../../../shared/ui/Button";
import { Field, Input, Select } from "../../../shared/ui/Field";
import { errorMessage } from "../../../shared/api/errorMessage";
import { formatPrice } from "../posLabels";
import { CASH_ENTRY_TYPE_LABELS, SHIFT_QUERY_KEYS, type CashDrawerEntry, type CashEntryType } from "./shiftTypes";
import { ShiftSection } from "./ShiftSection";

export function CashDrawerEntriesSection({ shiftId }: { shiftId: string }) {
  const queryClient = useQueryClient();
  const [entryType, setEntryType] = useState<CashEntryType>("EXPENSE");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  const entriesQuery = useQuery({
    queryKey: SHIFT_QUERY_KEYS.cashDrawerEntries(shiftId),
    queryFn: () => apiRequest<CashDrawerEntry[]>(`/shifts/${shiftId}/cash-drawer-entries`),
  });

  const addEntry = useMutation({
    mutationFn: () =>
      apiRequest(`/shifts/${shiftId}/cash-drawer-entries`, { method: "POST", body: { entryType, label, amount: Number(amount) } }),
    onSuccess: () => {
      setLabel("");
      setAmount("");
      queryClient.invalidateQueries({ queryKey: SHIFT_QUERY_KEYS.cashDrawerEntries(shiftId) });
      queryClient.invalidateQueries({ queryKey: SHIFT_QUERY_KEYS.preview(shiftId) });
    },
  });

  const entries = entriesQuery.data ?? [];
  const error = errorMessage(addEntry.error);

  return (
    <ShiftSection>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="النوع">
          <Select value={entryType} onChange={(e) => setEntryType(e.target.value as CashEntryType)} className="max-w-[130px]">
            {Object.entries(CASH_ENTRY_TYPE_LABELS).map(([value, typeLabel]) => <option key={value} value={value}>{typeLabel}</option>)}
          </Select>
        </Field>
        <Field label="البيان">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} className="max-w-[220px]" placeholder="مثال: فاتورة كهرباء" />
        </Field>
        <Field label="المبلغ">
          <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="max-w-[120px]" />
        </Field>
        <Button onClick={() => addEntry.mutate()} disabled={!label || !amount || addEntry.isPending}>
          تسجيل
        </Button>
      </div>

      {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}

      {entries.length > 0 && (
        <div className="mt-3 space-y-1">
          {entries.map((entry) => <CashDrawerEntryRow key={entry.id} entry={entry} />)}
        </div>
      )}
    </ShiftSection>
  );
}

function CashDrawerEntryRow({ entry }: { entry: CashDrawerEntry }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">
        <Badge tone={entry.entryType === "EXPENSE" ? "warning" : "info"} className="me-2">
          {CASH_ENTRY_TYPE_LABELS[entry.entryType]}
        </Badge>
        {entry.label}
      </span>
      <span className="font-semibold text-slate-800">{formatPrice(entry.amount)}</span>
    </div>
  );
}
