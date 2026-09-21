import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../../shared/api/client";
import { useAuth } from "../../shared/auth/AuthContext";
import { Card, CardBody } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { Field, Input, Select } from "../../shared/ui/Field";
import { Badge } from "../../shared/ui/Badge";

interface Shift {
  id: string;
  branchId: string;
  status: string;
  openingCash: number;
  cashVariance: number | null;
  varianceStatus: string;
}
interface ShiftPreview {
  cashSales: number;
  cardSales: number;
  otherSales: number;
  orderCount: number;
  openingCash: number;
  expectedCash: number;
  cashExpensesTotal: number;
  cashPurchasesTotal: number;
}
interface CashDrawerEntry {
  id: string;
  entryType: "EXPENSE" | "PURCHASE";
  amount: number;
  label: string;
  notes: string | null;
  createdAt: string;
}

const VARIANCE_LABELS: Record<string, string> = {
  NONE: "بدون فرق", PENDING_REVIEW: "محتاج مراجعة", APPROVED: "اتعتمد", ACKNOWLEDGED: "اتّقر",
};

const CASH_ENTRY_TYPE_LABELS: Record<string, string> = { EXPENSE: "مصروف", PURCHASE: "مشترى" };

export function ShiftBanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [openingCash, setOpeningCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [showCashEntry, setShowCashEntry] = useState(false);
  const [entryType, setEntryType] = useState<"EXPENSE" | "PURCHASE">("EXPENSE");
  const [entryLabel, setEntryLabel] = useState("");
  const [entryAmount, setEntryAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const currentShiftQuery = useQuery({
    queryKey: ["shifts", "current"],
    queryFn: () => apiRequest<Shift | null>("/shifts/current"),
  });
  const shift = currentShiftQuery.data;

  const previewQuery = useQuery({
    queryKey: ["shifts", shift?.id, "preview"],
    queryFn: () => apiRequest<ShiftPreview>(`/shifts/${shift!.id}/preview`),
    enabled: !!shift && showClose,
    refetchInterval: showClose ? 5000 : false,
  });

  const cashDrawerEntriesQuery = useQuery({
    queryKey: ["shifts", shift?.id, "cash-drawer-entries"],
    queryFn: () => apiRequest<CashDrawerEntry[]>(`/shifts/${shift!.id}/cash-drawer-entries`),
    enabled: !!shift,
  });

  const openShift = useMutation({
    mutationFn: () =>
      apiRequest("/shifts/open", { method: "POST", body: { openingCash: Number(openingCash), branchId: user?.branchId ?? undefined } }),
    onSuccess: () => {
      setError(null);
      setOpeningCash("");
      queryClient.invalidateQueries({ queryKey: ["shifts", "current"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const closeShift = useMutation({
    mutationFn: () => apiRequest(`/shifts/${shift!.id}/close`, { method: "POST", body: { actualCash: Number(actualCash) } }),
    onSuccess: () => {
      setError(null);
      setActualCash("");
      setShowClose(false);
      queryClient.invalidateQueries({ queryKey: ["shifts", "current"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  const addCashEntry = useMutation({
    mutationFn: () =>
      apiRequest(`/shifts/${shift!.id}/cash-drawer-entries`, {
        method: "POST",
        body: { entryType, label: entryLabel, amount: Number(entryAmount) },
      }),
    onSuccess: () => {
      setError(null);
      setEntryLabel("");
      setEntryAmount("");
      queryClient.invalidateQueries({ queryKey: ["shifts", shift?.id, "cash-drawer-entries"] });
      queryClient.invalidateQueries({ queryKey: ["shifts", shift?.id, "preview"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  if (currentShiftQuery.isLoading) return null;

  if (!shift) {
    return (
      <Card className="mb-6 border-amber-200 bg-amber-50">
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <p className="mb-2 text-sm font-bold text-amber-900">لازم تفتح شيفت قبل ما تسجّل أي طلب</p>
            <Field label="رصيد الدرج الافتتاحي">
              <Input type="number" min="0" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className="max-w-[160px]" />
            </Field>
          </div>
          <Button onClick={() => openShift.mutate()} disabled={!openingCash || openShift.isPending}>
            فتح شيفت
          </Button>
          {error && <p className="w-full text-sm font-medium text-red-700">{error}</p>}
        </CardBody>
      </Card>
    );
  }

  const entries = cashDrawerEntriesQuery.data ?? [];

  return (
    <Card className="mb-6 border-emerald-200 bg-emerald-50">
      <CardBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge tone="success">شيفت شغال</Badge>
            <p className="text-sm font-semibold text-slate-700">رصيد الافتتاح: {shift.openingCash}ج</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowCashEntry((v) => !v)}>
              {showCashEntry ? "إلغاء" : "تسجيل مصروف/مشترى"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowClose((v) => !v)}>
              {showClose ? "إلغاء" : "قفل الشيفت"}
            </Button>
          </div>
        </div>

        {showCashEntry && (
          <div className="mt-4 border-t border-emerald-200 pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="النوع">
                <Select value={entryType} onChange={(e) => setEntryType(e.target.value as "EXPENSE" | "PURCHASE")} className="max-w-[130px]">
                  <option value="EXPENSE">مصروف</option>
                  <option value="PURCHASE">مشترى</option>
                </Select>
              </Field>
              <Field label="البيان">
                <Input value={entryLabel} onChange={(e) => setEntryLabel(e.target.value)} className="max-w-[220px]" placeholder="مثال: فاتورة كهرباء" />
              </Field>
              <Field label="المبلغ">
                <Input type="number" min="0.01" step="0.01" value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} className="max-w-[120px]" />
              </Field>
              <Button onClick={() => addCashEntry.mutate()} disabled={!entryLabel || !entryAmount || addCashEntry.isPending}>
                تسجيل
              </Button>
            </div>

            {entries.length > 0 && (
              <div className="mt-3 space-y-1">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      <Badge tone={e.entryType === "EXPENSE" ? "warning" : "info"} className="me-2">
                        {CASH_ENTRY_TYPE_LABELS[e.entryType]}
                      </Badge>
                      {e.label}
                    </span>
                    <span className="font-semibold text-slate-800">{e.amount}ج</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showClose && (
          <div className="mt-4 border-t border-emerald-200 pt-4">
            {previewQuery.data && (
              <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><p className="text-xs text-slate-500">مبيعات كاش</p><p className="font-bold">{previewQuery.data.cashSales}ج</p></div>
                <div><p className="text-xs text-slate-500">مبيعات كارت</p><p className="font-bold">{previewQuery.data.cardSales}ج</p></div>
                <div><p className="text-xs text-slate-500">مصروفات/مشتريات</p><p className="font-bold text-red-700">-{previewQuery.data.cashExpensesTotal + previewQuery.data.cashPurchasesTotal}ج</p></div>
                <div><p className="text-xs text-slate-500">الكاش المتوقع</p><p className="font-bold text-brand-700">{previewQuery.data.expectedCash}ج</p></div>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <Field label="الكاش الفعلي في الدرج">
                <Input type="number" min="0" value={actualCash} onChange={(e) => setActualCash(e.target.value)} className="max-w-[160px]" />
              </Field>
              <Button onClick={() => closeShift.mutate()} disabled={!actualCash || closeShift.isPending}>
                تأكيد القفل
              </Button>
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}

        {shift.varianceStatus !== "NONE" && (
          <p className="mt-2 text-xs font-semibold text-amber-700">{VARIANCE_LABELS[shift.varianceStatus]}</p>
        )}
      </CardBody>
    </Card>
  );
}
